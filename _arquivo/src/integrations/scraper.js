/**
 * Coletor por navegação (scraping) — o "segundo jeito" de trazer produtos,
 * para lojas que não dão API ou enquanto a credencial não sai.
 *
 * COMO ISTO SE COMPORTA NA VIDA REAL (medido, não suposto):
 *   - Amazon BR ....... devolveu 48 produtos na 1ª tentativa e bloqueou na 4ª
 *                       ("Algo deu errado") por repetição do mesmo IP.
 *   - Mercado Livre ... redireciona para /account-verification e exige login.
 *   - Shopee .......... carrega a casca da página; a lista não renderiza e a
 *                       página se recarrega sozinha (anti-bot).
 *   - Magazine Luiza .. "Não é possível acessar a página".
 *
 * Por isso este adapter é construído em torno de três freios, que são o que
 * separa "funciona hoje" de "funciona semana que vem":
 *   1. intervalo mínimo entre requisições ao mesmo domínio (o que causou o
 *      bloqueio no teste foi justamente a rajada);
 *   2. cache do resultado, para não repetir a mesma busca;
 *   3. detecção de bloqueio: se a página virou login/captcha/erro, o adapter
 *      diz isso em voz alta em vez de devolver lista vazia fingindo normalidade.
 *
 * Nenhum dado é inventado: bloqueou, o sistema avisa e não grava nada.
 */
import { MarketplaceAdapter } from './base.js';
import { cookiesDaSessao } from '../../core/services/sessaoLojaService.js';
import { logger } from '../../core/utils/logger.js';

const log = logger.child('scraper');

/** Último acesso por domínio, para respeitar o intervalo mínimo. */
const ultimoAcesso = new Map();
/** Cache simples em memória: chave da busca -> { em, produtos }. */
const cache = new Map();

const UA_PADRAO = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Sinais de que a loja barrou a navegação em vez de mostrar produtos. */
const SINAIS_DE_BLOQUEIO = [
  { padrao: /captcha\/wall|complete esta etapa|complete e ta etapa/i, motivo: 'a loja pediu CAPTCHA (detectou automação)' },
  { padrao: /account-verification|para continuar.{0,20}acesse.{0,10}sua conta/i, motivo: 'a loja exigiu login' },
  { padrao: /captcha|não sou um robô|digite os caracteres/i, motivo: 'a loja pediu captcha' },
  { padrao: /algo deu errado|não é possível acessar|acesso negado|access denied/i, motivo: 'a loja recusou o acesso' },
  { padrao: /unusual traffic|tráfego incomum|blocked/i, motivo: 'a loja detectou tráfego automatizado' },
];

/**
 * Receita = tudo que o adapter precisa saber sobre uma loja.
 * Acrescentar uma loja nova é acrescentar um objeto aqui — sem código.
 */
export const RECEITAS = {
  amazon: {
    rotulo: 'Amazon (navegação)',
    busca: (termo) => `https://www.amazon.com.br/s?k=${encodeURIComponent(termo)}`,
    cartao: '[data-component-type="s-search-result"]',
    campos: {
      external_id: { atributo: 'data-asin' },
      titulo: { seletor: 'h2, [data-cy="title-recipe"] a span, .a-size-base-plus' },
      preco: { seletor: '.a-price .a-offscreen', numero: true },
      preco_anterior: { seletor: '.a-price.a-text-price .a-offscreen', numero: true },
      imagem: { seletor: 'img.s-image', propriedade: 'src' },
      url: { seletor: 'a.a-link-normal[href*="/dp/"], h2 a', propriedade: 'href' },
      avaliacao: { seletor: '.a-icon-alt', numero: true },
    },
    observacao: 'Funcionou nos testes, mas bloqueia depois de poucas buscas seguidas.',
  },

  mercadolivre: {
    rotulo: 'Mercado Livre (navegação)',
    busca: (termo) => `https://lista.mercadolivre.com.br/${encodeURIComponent(termo).replace(/%20/g, '-')}`,
    cartao: '.ui-search-result, .poly-card',
    campos: {
      titulo: { seletor: '.poly-component__title, .ui-search-item__title' },
      preco: { seletor: '.andes-money-amount__fraction', numero: true },
      preco_anterior: { seletor: 's .andes-money-amount__fraction', numero: true },
      imagem: { seletor: 'img', propriedade: 'src' },
      url: { seletor: 'a', propriedade: 'href' },
    },
    observacao: 'Sem sessão: exige login. COM a sua sessão: reconhece o login e cai em CAPTCHA '
      + '(/captcha/wall/logged). Para o ML, o caminho que funciona é a API oficial.',
  },

  shopee: {
    rotulo: 'Shopee (navegação)',
    busca: (termo) => `https://shopee.com.br/search?keyword=${encodeURIComponent(termo)}`,
    cartao: '[data-sqe="item"], li.col-xs-2-4',
    esperarMs: 9000,
    campos: {
      titulo: { seletor: '[data-sqe="name"] div, .line-clamp-2' },
      preco: { seletor: '.text-shopee-primary, [class*="price"]', numero: true },
      imagem: { seletor: 'img', propriedade: 'src' },
      url: { seletor: 'a', propriedade: 'href' },
    },
    observacao: 'Nos testes a lista não renderizou para automação. Use a API de afiliados.',
  },

  magalu: {
    rotulo: 'Magazine Luiza (navegação)',
    busca: (termo) => `https://www.magazineluiza.com.br/busca/${encodeURIComponent(termo).replace(/%20/g, '+')}/`,
    cartao: '[data-testid="product-card-container"]',
    campos: {
      titulo: { seletor: '[data-testid="product-title"]' },
      preco: { seletor: '[data-testid="price-value"]', numero: true },
      preco_anterior: { seletor: '[data-testid="price-original"]', numero: true },
      imagem: { seletor: 'img', propriedade: 'src' },
      url: { seletor: 'a', propriedade: 'href' },
    },
    observacao: 'Nos testes recusou o acesso.',
  },
};

export class ScraperAdapter extends MarketplaceAdapter {
  /**
   * @param {string} loja chave em RECEITAS
   * @param {{baseUrl:string, token:string, intervaloSegundos:number, cacheMinutos:number}} config
   */
  constructor(loja, config = {}) {
    const receita = RECEITAS[loja];
    const ligado = Boolean(config.baseUrl);
    super({
      nome: `${loja}-web`,
      rotulo: receita?.rotulo || `${loja} (navegação)`,
      implementado: ligado && Boolean(receita),
      motivo: !receita
        ? `Não existe receita de navegação para "${loja}".`
        : ligado ? '' : 'Navegador headless desligado (SCRAPER_ENABLED=false ou BROWSERLESS_URL vazio).',
      docs: '',
    });
    this.loja = loja;
    this.receita = receita;
    this.baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
    this.token = config.token || '';
    this.intervaloMs = (Number(config.intervaloSegundos) || 30) * 1000;
    this.cacheMs = (Number(config.cacheMinutos) || 30) * 60000;
  }

  async status() {
    // `oficial: false` sempre: o painel precisa distinguir a fonte mesmo com
    // o coletor desligado, senao a navegacao se passa por API oficial na tela.
    const base = { ...(await super.status()), oficial: false, observacao: this.receita?.observacao || '' };
    if (!this.implementado) return base;
    try {
      const res = await fetch(`${this.baseUrl}/json/version?token=${encodeURIComponent(this.token)}`, {
        signal: AbortSignal.timeout(8000),
      });
      const sessao = cookiesDaSessao(this.loja);
      return {
        ...base,
        online: res.ok,
        oficial: false,
        com_sessao: Boolean(sessao?.length),
        observacao: sessao?.length
          ? `Usando a sua sessão (${sessao.length} cookies) — o navegador entra logado.`
          : this.receita.observacao,
        motivo: res.ok ? '' : `Navegador headless não respondeu (HTTP ${res.status}).`,
      };
    } catch (err) {
      return { ...base, online: false, oficial: false, motivo: `Navegador headless fora do ar: ${err.message}` };
    }
  }

  /** Espera o tempo que faltar para respeitar o intervalo mínimo do domínio. */
  async respeitarIntervalo() {
    const anterior = ultimoAcesso.get(this.loja) || 0;
    const faltam = this.intervaloMs - (Date.now() - anterior);
    if (faltam > 0) {
      log.debug(`Aguardando ${Math.ceil(faltam / 1000)}s antes de acessar ${this.loja} de novo`);
      await new Promise((r) => setTimeout(r, faltam));
    }
    ultimoAcesso.set(this.loja, Date.now());
  }

  async search(filtros = {}) {
    if (!this.implementado) throw new Error(this.motivo);

    const termo = String(filtros.termo || '').trim();
    if (!termo) throw new Error('A navegação precisa de uma palavra-chave para buscar.');

    const chave = `${this.loja}:${termo}`;
    const guardado = cache.get(chave);
    if (guardado && Date.now() - guardado.em < this.cacheMs) {
      log.debug(`Cache de "${termo}" em ${this.loja} (${guardado.produtos.length} produtos)`);
      return guardado.produtos.slice(0, Number(filtros.limite) || 20);
    }

    await this.respeitarIntervalo();

    const bruto = await this.executar(this.receita.busca(termo));

    if (bruto.bloqueio) {
      const temSessao = Boolean(cookiesDaSessao(this.loja)?.length);
      throw new Error(
        `${this.rotulo}: ${bruto.bloqueio}. `
        + (temSessao
          ? 'Sua sessão pode ter expirado — capture os cookies de novo em Lojas conectadas.'
          : 'Cole os cookies da sua sessão em Lojas conectadas: com você logado, a loja costuma liberar.'),
      );
    }
    if (!bruto.produtos.length) {
      throw new Error(
        `${this.rotulo} não devolveu nenhum produto. A loja pode ter mudado o layout `
        + '(a receita de seletores precisa ser ajustada) ou bloqueado a navegação.',
      );
    }

    const produtos = bruto.produtos
      .filter((p) => p.titulo && Number.isFinite(p.preco))
      .map((p) => this.normalize({
        external_id: p.external_id || gerarId(p.url || p.titulo),
        titulo: p.titulo,
        descricao: '',
        imagem: p.imagem,
        imagens: p.imagem ? [p.imagem] : [],
        url: p.url,
        preco: p.preco,
        // Descarta "de/por" implausível: acima de 5x costuma ser preço de outro
        // item que caiu no mesmo cartão, e isso viraria um desconto mentiroso no post.
        preco_anterior: plausivel(p.preco_anterior, p.preco) ? p.preco_anterior : null,
        moeda: 'BRL',
        avaliacao: p.avaliacao && p.avaliacao <= 5 ? p.avaliacao : null,
        vendas: null,
        disponibilidade: 'disponivel',
        tags: ['navegacao'],
      }));

    cache.set(chave, { em: Date.now(), produtos });
    log.info(`${this.rotulo}: ${produtos.length} produtos coletados para "${termo}"`);

    return produtos.slice(0, Number(filtros.limite) || 20);
  }

  async getProduct(externalId) {
    const encontrados = await this.search({ termo: String(externalId), limite: 20 });
    return encontrados.find((p) => String(p.external_id) === String(externalId)) || null;
  }

  /** Abre a página no navegador headless e extrai pela receita. */
  async executar(url) {
    // Com a sua sessão, o navegador entra logado — é isso que faz o Mercado
    // Livre parar de mandar para a tela de verificação de conta.
    const cookies = cookiesDaSessao(this.loja);
    const script = montarScript(url, this.receita, cookies);

    const res = await fetch(`${this.baseUrl}/function?token=${encodeURIComponent(this.token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/javascript' },
      body: script,
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => '');
      throw new Error(`Navegador headless HTTP ${res.status}: ${detalhe.slice(0, 160)}`);
    }

    const envelope = await res.json();
    const dados = typeof envelope.data === 'string' ? JSON.parse(envelope.data) : envelope.data;

    const bloqueio = SINAIS_DE_BLOQUEIO.find((s) => s.padrao.test(dados.texto || ''))?.motivo
      || (dados.titulo && /algo deu errado|erro/i.test(dados.titulo) ? 'a loja recusou o acesso' : null);

    return { produtos: dados.produtos || [], bloqueio, titulo: dados.titulo };
  }
}

/** O script roda dentro do navegador; por isso vai como texto. */
function montarScript(url, receita, cookies = null) {
  const espera = Number(receita.esperarMs) || 4000;
  const comSessao = Array.isArray(cookies) && cookies.length > 0;

  return `export default async function ({ page }) {
  await page.setUserAgent(${JSON.stringify(UA_PADRAO)});
  await page.setViewport({ width: 1366, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
${comSessao ? `  try { await page.setCookie(...${JSON.stringify(cookies)}); } catch (e) { /* cookie invalido nao derruba a busca */ }` : ''}

  const saida = { produtos: [], titulo: '', texto: '' };
  try {
    await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, ${espera}));
    saida.titulo = await page.title();
    saida.texto = await page.evaluate(() => document.body.innerText.replace(/\\s+/g, ' ').slice(0, 400));
    saida.produtos = await page.evaluate((receita) => {
      const limpar = (t) => (t || '').replace(/\\s+/g, ' ').trim();
      /**
       * Pega o PRIMEIRO número do texto, não os dígitos todos grudados:
       * "4,6 de 5 estrelas" é 4.6 — juntar tudo daria 4,65.
       */
      const numero = (t) => {
        const achado = limpar(t).match(/\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?|\\d+(?:\\.\\d+)?/);
        if (!achado) return null;
        let cru = achado[0];
        // Formato br: vírgula é decimal, ponto é separador de milhar.
        if (cru.includes(',')) cru = cru.replace(/\\./g, '').replace(',', '.');
        const n = Number.parseFloat(cru);
        return Number.isFinite(n) ? n : null;
      };
      return [...document.querySelectorAll(receita.cartao)].map((cartao) => {
        const item = {};
        for (const [campo, regra] of Object.entries(receita.campos)) {
          if (regra.atributo) { item[campo] = cartao.getAttribute(regra.atributo); continue; }
          const alvo = cartao.querySelector(regra.seletor);
          if (!alvo) { item[campo] = null; continue; }
          const valor = regra.propriedade ? alvo[regra.propriedade] : alvo.textContent;
          item[campo] = regra.numero ? numero(valor) : limpar(valor);
        }
        return item;
      });
    }, ${JSON.stringify({ cartao: receita.cartao, campos: receita.campos })});
  } catch (e) {
    saida.texto = 'ERRO: ' + e.message;
  }
  return { data: JSON.stringify(saida), type: 'application/json' };
}`;
}

/**
 * O "de" só entra se fizer sentido: maior que o preço atual e no máximo 5x.
 * Coleta por navegação erra card às vezes; melhor perder um desconto real do
 * que publicar um desconto que não existe.
 */
function plausivel(anterior, atual) {
  const de = Number(anterior);
  const por = Number(atual);
  if (!Number.isFinite(de) || !Number.isFinite(por) || por <= 0) return false;
  return de > por && de <= por * 5;
}

/** Loja sem id no cartão: derivamos um estável a partir da URL. */
function gerarId(base) {
  let hash = 0;
  const texto = String(base);
  for (let i = 0; i < texto.length; i += 1) {
    hash = ((hash << 5) - hash + texto.charCodeAt(i)) | 0;
  }
  return `web${Math.abs(hash)}`;
}

export function limparCacheScraper() {
  cache.clear();
  ultimoAcesso.clear();
}
