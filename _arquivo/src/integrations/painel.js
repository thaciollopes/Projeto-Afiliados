/**
 * Coletor por PAINEL DE AFILIADO — busca usando a sua própria sessão logada.
 *
 * Por que existe: a Open API da Shopee leva de 5 a 15 dias de aprovação manual,
 * e o Mercado Livre exige app + autorização. Enquanto isso, o painel de afiliado
 * que você já acessa no navegador consulta os mesmos produtos — com a sua tag
 * de afiliado já embutida nos links.
 *
 * Como funciona, sem adivinhação: você abre o painel, faz a busca que quer,
 * copia a requisição no DevTools (F12 → Network → botão direito → Copy as cURL)
 * e cola aqui. O sistema aprende a repetir aquela chamada trocando só a palavra
 * buscada. Quando o painel mudar o endpoint, você recaptura e cola de novo —
 * sem precisar mexer em código.
 *
 * CUIDADOS, porque isto é a sua sessão de verdade:
 *   - o cookie é credencial: quem tiver ele entra na sua conta de afiliado.
 *     Fica guardado só no banco local e NUNCA é devolvido inteiro para a tela.
 *   - a sessão expira (dias/semanas). Quando expirar, o sistema avisa em vez de
 *     devolver lista vazia — é só recapturar.
 *   - automação costuma contrariar os termos de uso do programa de afiliados.
 *     O intervalo mínimo entre buscas existe para manter o uso parecido com o
 *     de uma pessoa navegando.
 */
import { settingRepository } from '../../core/repositories/index.js';
import { MarketplaceAdapter } from './base.js';
import { logger } from '../../core/utils/logger.js';

const log = logger.child('painel');

const PREFIXO = 'painel_';
const ultimoAcesso = new Map();

/** Resposta que, na prática, significa "sua sessão caiu". */
const SINAIS_DE_SESSAO_MORTA = [
  /"?error"?\s*:\s*"?(401|403|10020|unauthor)/i,
  /not.{0,10}logged|login.{0,10}required|unauthorized|forbidden/i,
  /sessão expirada|session.{0,10}expired/i,
];

/**
 * Converte um comando cURL (copiado do DevTools) em algo executável.
 * Entende as formas que Chrome, Firefox e Edge geram: -H, -b, --data-raw,
 * --data-binary, -X, aspas simples e duplas, quebras com \ e ^.
 */
export function parseCurl(comando) {
  const texto = String(comando || '')
    .replace(/\r/g, '')
    .replace(/\\\n/g, ' ')      // continuação de linha bash
    .replace(/\^\n/g, ' ')      // continuação de linha cmd
    .replace(/\s+/g, ' ')
    .trim();

  if (!/^curl\b/i.test(texto)) {
    throw new Error('Isso não parece um comando cURL. Copie com "Copy as cURL" no DevTools.');
  }

  const partes = dividirRespeitandoAspas(texto);
  const resultado = { url: '', metodo: 'GET', headers: {}, cookie: '', body: null };

  for (let i = 1; i < partes.length; i += 1) {
    const parte = partes[i];
    const proximo = () => desaspar(partes[++i] || '');

    if (parte === '-X' || parte === '--request') {
      resultado.metodo = proximo().toUpperCase();
    } else if (parte === '-H' || parte === '--header') {
      const cabecalho = proximo();
      const divisor = cabecalho.indexOf(':');
      if (divisor > 0) {
        const nome = cabecalho.slice(0, divisor).trim();
        const valor = cabecalho.slice(divisor + 1).trim();
        if (nome.toLowerCase() === 'cookie') resultado.cookie = valor;
        else resultado.headers[nome] = valor;
      }
    } else if (parte === '-b' || parte === '--cookie') {
      resultado.cookie = proximo();
    } else if (['--data-raw', '--data', '-d', '--data-binary', '--data-urlencode'].includes(parte)) {
      resultado.body = proximo();
      if (resultado.metodo === 'GET') resultado.metodo = 'POST';
    } else if (parte === '--compressed' || parte.startsWith('-')) {
      // flags sem valor (--compressed, --location, -s...) não interessam aqui
    } else if (!resultado.url) {
      resultado.url = desaspar(parte);
    }
  }

  if (!resultado.url) throw new Error('Não encontrei a URL dentro do cURL colado.');
  if (!resultado.cookie) {
    throw new Error('O cURL veio sem cookie de sessão — copie a requisição estando logado no painel.');
  }
  return resultado;
}

function dividirRespeitandoAspas(texto) {
  const partes = [];
  let atual = '';
  let aspas = null;

  for (const caractere of texto) {
    if (aspas) {
      if (caractere === aspas) aspas = null;
      else atual += caractere;
    } else if (caractere === '"' || caractere === "'") {
      aspas = caractere;
    } else if (caractere === ' ') {
      if (atual) { partes.push(atual); atual = ''; }
    } else {
      atual += caractere;
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

const desaspar = (t) => String(t).replace(/^['"]|['"]$/g, '');

// ------------------------------------------------------- configuração --

/**
 * @typedef {object} ConfigPainel
 * @property {string} curl            requisição copiada do DevTools
 * @property {string} termo_original  a palavra que você buscou ao capturar
 * @property {string} caminho_lista   onde estão os produtos na resposta (ex.: "data.list")
 * @property {object} campos          {titulo, preco, ...} -> chave no JSON da loja
 * @property {number} intervalo_segundos
 */

export function salvarConfigPainel(loja, config) {
  const requisicao = parseCurl(config.curl);
  if (!config.termo_original) {
    throw new Error('Informe a palavra que você buscou no painel ao capturar (ex.: "perfume").');
  }
  settingRepository.set(`${PREFIXO}${loja}`, {
    ...config,
    requisicao,
    atualizado_em: new Date().toISOString(),
  });
  log.info(`Painel de ${loja} configurado`, { url: requisicao.url.split('?')[0] });
  return lerConfigPainel(loja, { comSegredo: false });
}

/** Sem `comSegredo`, cookie e headers de autenticação saem mascarados. */
export function lerConfigPainel(loja, { comSegredo = false } = {}) {
  const guardado = settingRepository.get(`${PREFIXO}${loja}`);
  if (!guardado) return null;
  if (comSegredo) return guardado;

  return {
    ...guardado,
    curl: '(guardado)',
    requisicao: {
      url: guardado.requisicao.url,
      metodo: guardado.requisicao.metodo,
      cookie: mascarar(guardado.requisicao.cookie),
      headers: Object.fromEntries(
        Object.entries(guardado.requisicao.headers).map(([k, v]) => [
          k, /auth|token|key/i.test(k) ? mascarar(v) : v,
        ]),
      ),
    },
  };
}

export function removerConfigPainel(loja) {
  return settingRepository.remove(`${PREFIXO}${loja}`);
}

function mascarar(valor) {
  const texto = String(valor || '');
  if (texto.length <= 12) return '••••';
  return `${texto.slice(0, 6)}••••${texto.slice(-4)} (${texto.length} caracteres)`;
}

// ------------------------------------------------------------ adapter --

export class PainelAdapter extends MarketplaceAdapter {
  constructor(loja, rotulo) {
    const config = settingRepository.get(`${PREFIXO}${loja}`);
    super({
      nome: `${loja}-painel`,
      rotulo: `${rotulo} (painel de afiliado)`,
      implementado: Boolean(config?.requisicao?.url),
      motivo: config
        ? ''
        : 'Cole aqui a requisição do seu painel de afiliado (F12 → Network → Copy as cURL).',
      docs: '',
    });
    this.loja = loja;
    this.config = config;
  }

  /** Relê a configuração: ela muda pela tela, sem reiniciar o servidor. */
  recarregar() {
    this.config = settingRepository.get(`${PREFIXO}${this.loja}`);
    this.implementado = Boolean(this.config?.requisicao?.url);
    if (this.implementado) this.motivo = '';
    return this.config;
  }

  async status() {
    this.recarregar();
    const base = { ...(await super.status()), oficial: false };
    if (!this.implementado) return base;

    return {
      ...base,
      online: true,
      capturado_em: this.config.atualizado_em,
      endpoint: String(this.config.requisicao.url).split('?')[0],
      observacao: 'Usa a sua sessão do painel. Quando expirar, recapture o cURL.',
    };
  }

  async respeitarIntervalo() {
    const intervalo = (Number(this.config?.intervalo_segundos) || 20) * 1000;
    const anterior = ultimoAcesso.get(this.loja) || 0;
    const faltam = intervalo - (Date.now() - anterior);
    if (faltam > 0) await new Promise((r) => setTimeout(r, faltam));
    ultimoAcesso.set(this.loja, Date.now());
  }

  async search(filtros = {}) {
    this.recarregar();
    if (!this.implementado) throw new Error(this.motivo);

    const termo = String(filtros.termo || '').trim();
    if (!termo) throw new Error('Informe a palavra-chave da busca.');

    await this.respeitarIntervalo();

    const { requisicao, termo_original: original } = this.config;
    const trocar = (texto) => String(texto).split(original).join(encodeURIComponent(termo));

    const resposta = await fetch(trocar(requisicao.url), {
      method: requisicao.metodo,
      headers: {
        ...requisicao.headers,
        cookie: requisicao.cookie,
      },
      body: requisicao.body ? trocar(requisicao.body) : undefined,
      signal: AbortSignal.timeout(30000),
    });

    const texto = await resposta.text();

    if (resposta.status === 401 || resposta.status === 403) {
      throw new Error(
        `${this.rotulo}: sua sessão do painel expirou (HTTP ${resposta.status}). `
        + 'Entre no painel de novo, recapture o cURL e cole aqui.',
      );
    }
    if (!resposta.ok) {
      throw new Error(`${this.rotulo}: HTTP ${resposta.status} — ${texto.slice(0, 150)}`);
    }
    if (SINAIS_DE_SESSAO_MORTA.some((s) => s.test(texto.slice(0, 500)))) {
      throw new Error(`${this.rotulo}: a resposta indica sessão expirada. Recapture o cURL.`);
    }

    let dados;
    try {
      dados = JSON.parse(texto);
    } catch {
      throw new Error(
        `${this.rotulo}: a resposta não é JSON. Capture a requisição que devolve os produtos `
        + '(na aba Network, filtre por Fetch/XHR).',
      );
    }

    const lista = extrairLista(dados, this.config.caminho_lista);
    if (!Array.isArray(lista)) {
      throw new Error(
        `${this.rotulo}: não achei a lista de produtos em "${this.config.caminho_lista}". `
        + `A resposta começa com: ${JSON.stringify(dados).slice(0, 120)}`,
      );
    }

    const produtos = lista
      .map((item) => this.mapear(item))
      .filter((p) => p.titulo && Number.isFinite(p.preco));

    log.info(`${this.rotulo}: ${produtos.length} produtos para "${termo}"`);
    return produtos.slice(0, Number(filtros.limite) || 20).map((p) => this.normalize(p));
  }

  async getProduct(externalId) {
    const achados = await this.search({ termo: String(externalId), limite: 20 });
    return achados.find((p) => String(p.external_id) === String(externalId)) || null;
  }

  /** Aplica o mapa de campos que o usuário montou na tela. */
  mapear(item) {
    const campos = this.config.campos || {};
    const pegar = (chave) => (chave ? valorNoCaminho(item, chave) : null);

    const preco = numero(pegar(campos.preco));
    const precoAnterior = numero(pegar(campos.preco_anterior));

    return {
      external_id: String(pegar(campos.external_id) ?? ''),
      titulo: texto(pegar(campos.titulo)),
      descricao: texto(pegar(campos.descricao)),
      imagem: texto(pegar(campos.imagem)) || null,
      imagens: [],
      // O link do painel já vem com a sua tag de afiliado.
      url: texto(pegar(campos.url)) || null,
      preco,
      preco_anterior: precoAnterior && precoAnterior > preco ? precoAnterior : null,
      moeda: 'BRL',
      avaliacao: limitar(numero(pegar(campos.avaliacao)), 0, 5),
      vendas: numero(pegar(campos.vendas)),
      disponibilidade: 'disponivel',
      tags: ['painel'],
    };
  }
}

/** "data.items" ou "data.0.list" — caminho com pontos, aceitando índice. */
function valorNoCaminho(objeto, caminho) {
  return String(caminho).split('.').reduce((atual, chave) => {
    if (atual === null || atual === undefined) return null;
    return atual[chave];
  }, objeto);
}

function extrairLista(dados, caminho) {
  if (caminho) return valorNoCaminho(dados, caminho);
  // Sem caminho informado, procura o primeiro array de objetos na resposta.
  const fila = [dados];
  while (fila.length) {
    const atual = fila.shift();
    if (Array.isArray(atual) && atual.length && typeof atual[0] === 'object') return atual;
    if (atual && typeof atual === 'object') fila.push(...Object.values(atual));
  }
  return null;
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const achado = String(valor).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+(?:\.\d+)?/);
  if (!achado) return null;
  let cru = achado[0];
  if (cru.includes(',')) cru = cru.replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(cru);
  return Number.isFinite(n) ? n : null;
}

const texto = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const limitar = (n, min, max) => (n === null ? null : Math.min(Math.max(n, min), max));

/** Painéis que a tela oferece de cara; qualquer outro entra do mesmo jeito. */
export const PAINEIS = {
  shopee: 'Shopee',
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
  aliexpress: 'AliExpress',
  awin: 'Awin',
};
