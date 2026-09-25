/**
 * Adaptador de loja: busca usando o SEU cookie (quando a loja deixa) e diz com
 * todas as letras quando a loja não deixa. Não há API oficial por trás.
 *
 * Realidade medida (não suposição):
 *   - Amazon: a página de busca responde por HTTP simples, com ou sem cookie;
 *     bloqueia se receber rajada do mesmo IP — por isso intervalo e cache;
 *   - Mercado Livre: a busca cai em captcha, mas as páginas de OFERTAS
 *     respondem — ver mercadolivreOfertas.js;
 *   - Shopee / Magalu: barram busca automatizada (página vazia ou recusa).
 *     Os produtos entram pela extensão, com você navegando.
 */
import { MarketplaceAdapter } from './base.js';
import { LOJAS } from './lojas.js';
import { cookiesDaSessao } from '../../core/services/sessaoLojaService.js';
import { logger } from '../../core/utils/logger.js';
import { extrairOfertasML, urlOfertas, casaComTermo } from './mercadolivreOfertas.js';

const log = logger.child('loja');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const PAUSA_ENTRE_PAGINAS_MS = 1200;

const ultimoAcesso = new Map();
const cache = new Map();

const BLOQUEIOS = [
  { padrao: /captcha|digite os caracteres|complete esta etapa/i, motivo: 'a loja pediu CAPTCHA' },
  { padrao: /account-verification|acesse.{0,10}sua conta/i, motivo: 'a sessão não foi aceita (expirou?)' },
  { padrao: /algo deu errado|acesso negado|access denied/i, motivo: 'a loja recusou o acesso' },
];

export class LojaAdapter extends MarketplaceAdapter {
  constructor(loja, { intervaloSegundos = 20, cacheMinutos = 20 } = {}) {
    super({
      nome: loja.id,
      rotulo: loja.nome,
      implementado: loja.busca,
      motivo: loja.busca ? '' : `${loja.nome} não deixa o sistema buscar sozinho. ${loja.comoEntramProdutos}`,
      docs: loja.painel,
    });
    this.loja = loja;
    this.intervaloMs = intervaloSegundos * 1000;
    this.cacheMs = cacheMinutos * 60000;
  }

  async status() {
    const sessao = cookiesDaSessao(this.loja.id);
    return {
      ...(await super.status()),
      busca: this.loja.busca,
      com_sessao: Boolean(sessao?.length),
      total_cookies: sessao?.length || 0,
    };
  }

  cabecalhoCookie() {
    return (cookiesDaSessao(this.loja.id) || []).map((c) => `${c.name}=${c.value}`).join('; ');
  }

  async respeitarIntervalo(aoProgredir) {
    const anterior = ultimoAcesso.get(this.nome) || 0;
    const faltam = this.intervaloMs - (Date.now() - anterior);
    if (faltam > 0) {
      aoProgredir?.({ etapa: 'aguardando', espera_segundos: Math.ceil(faltam / 1000) });
      await new Promise((r) => setTimeout(r, faltam));
    }
    ultimoAcesso.set(this.nome, Date.now());
  }

  async search(filtros = {}) {
    if (!this.implementado) throw new Error(this.motivo);
    if (this.loja.modoBusca === 'ofertas') return this.buscarOfertas(filtros);

    const termo = String(filtros.termo || '').trim();
    if (!termo) throw new Error('Informe a palavra-chave da busca.');
    const limite = Number(filtros.limite) || 20;

    const chave = `${this.nome}:${termo.toLowerCase()}`;
    const guardado = cache.get(chave);
    if (guardado && Date.now() - guardado.em < this.cacheMs) return guardado.produtos.slice(0, limite);

    const avisar = filtros.aoProgredir;
    await this.respeitarIntervalo(avisar);
    avisar?.({ etapa: 'lendo', pagina: 1, total_paginas: 1 });
    const html = await this.baixar(this.loja.buscaUrl(termo));

    const produtos = extrairAmazon(html).map((p) => this.normalize(p));
    if (!produtos.length) {
      throw new Error(`${this.rotulo} respondeu, mas não achei produtos na página (layout mudou?).`);
    }

    cache.set(chave, { em: Date.now(), produtos });
    log.info(`${this.rotulo}: ${produtos.length} produtos para "${termo}"`);
    return produtos.slice(0, limite);
  }

  /**
   * Mercado Livre: varre as páginas de ofertas (da categoria escolhida) e
   * filtra pelo título. Cada página fica em cache; entre uma e outra há pausa.
   */
  async buscarOfertas(filtros) {
    const termo = String(filtros.termo || '').trim();
    const limite = Number(filtros.limite) || 20;
    const categoria = String(filtros.categoria_loja || '').trim();
    const maxPaginas = Math.min(Number(filtros.paginas) || (termo ? 8 : 2), 15);
    const precoMax = Number(filtros.precoMax ?? filtros.preco_max) || null;
    const descontoMin = Number(filtros.descontoMin ?? filtros.desconto_min) || null;

    const avisar = filtros.aoProgredir;
    const cacheado = (pg) => {
      const c = cache.get(urlOfertas(categoria, pg));
      return c && Date.now() - c.em < this.cacheMs;
    };
    // Tudo em cache não toca na loja: não precisa esperar o intervalo.
    if (!cacheado(1)) await this.respeitarIntervalo(avisar);

    const achados = [];
    const vistos = new Set();
    let lidos = 0;

    for (let pagina = 1; pagina <= maxPaginas && achados.length < limite; pagina += 1) {
      const url = urlOfertas(categoria, pagina);
      avisar?.({ etapa: 'lendo', pagina, total_paginas: maxPaginas, lidos, achados: achados.length });
      let produtos = cache.get(url);
      if (!produtos || Date.now() - produtos.em >= this.cacheMs) {
        if (pagina > 1) await new Promise((r) => setTimeout(r, PAUSA_ENTRE_PAGINAS_MS));
        const html = await this.baixar(url);
        produtos = { em: Date.now(), lista: extrairOfertasML(html) };
        cache.set(url, produtos);
      }
      if (!produtos.lista.length) break; // acabaram as páginas
      lidos += produtos.lista.length;

      for (const p of produtos.lista) {
        if (vistos.has(p.external_id) || (termo && !casaComTermo(p.titulo, termo))) continue;
        if (precoMax && p.preco > precoMax) continue;
        if (descontoMin && (!p.preco_anterior || (1 - p.preco / p.preco_anterior) * 100 < descontoMin)) continue;
        vistos.add(p.external_id);
        achados.push(this.normalize(p));
      }
    }

    if (!lidos) throw new Error(`${this.rotulo}: a página de ofertas veio sem produtos (layout mudou?).`);
    log.info(`${this.rotulo}: ${achados.length} ofertas para "${termo || '(todas)'}" em ${lidos} lidas`);
    return achados.slice(0, limite);
  }

  async baixar(url) {
    const headers = {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    };
    const cookie = this.cabecalhoCookie();
    if (cookie) headers.cookie = cookie;

    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const html = await res.text();

    const bloqueio = BLOQUEIOS.find((b) => b.padrao.test(res.url) || b.padrao.test(html.slice(0, 6000)));
    if (bloqueio) {
      throw new Error(`${this.rotulo}: ${bloqueio.motivo}. Espere alguns minutos antes de buscar de novo.`);
    }
    if (!res.ok) throw new Error(`${this.rotulo}: HTTP ${res.status}`);
    return html;
  }

  async getProduct(externalId) {
    // Oferta do ML não dá para reconsultar por id (a busca é bloqueada):
    // melhor dizer isso do que marcar o produto como indisponível por engano.
    if (this.loja.modoBusca === 'ofertas') {
      throw new Error('O Mercado Livre não deixa reconsultar um produto; ele se atualiza quando aparece de novo nas ofertas.');
    }
    const achados = await this.search({ termo: String(externalId), limite: 20 });
    return achados.find((p) => String(p.external_id) === String(externalId)) || null;
  }
}

/**
 * Cartões da busca da Amazon. Sem parser de HTML: cada cartão começa em
 * `data-asin=... data-component-type="s-search-result"` e o trecho até o
 * próximo cartão contém título, preços, imagem e avaliação.
 */
export function extrairAmazon(html) {
  const inicio = /<div[^>]+data-asin="([A-Z0-9]{10})"[^>]*data-component-type="s-search-result"/g;
  const marcas = [...html.matchAll(inicio)];
  const produtos = [];
  const vistos = new Set();

  marcas.forEach((m, i) => {
    const asin = m[1];
    if (vistos.has(asin)) return;
    const trecho = html.slice(m.index, marcas[i + 1]?.index ?? m.index + 30000);

    // Patrocinado costuma apontar para outro produto — fora.
    if (/Patrocinado|sp_atf|sspa/i.test(trecho.slice(0, 3000)) && !/\/dp\//.test(trecho)) return;

    const titulo = limpar(
      trecho.match(/<h2[^>]*aria-label="([^"]+)"/i)?.[1]
      || trecho.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([^<]{8,})<\/span>/i)?.[1],
    ).replace(/^Anúncio patrocinado[^–-]*[–-]\s*/i, '');

    const precos = [...trecho.matchAll(/<span class="a-offscreen">\s*R\$\s*([\d.]+,\d{2})\s*<\/span>/g)]
      .map((x) => paraNumero(x[1]));
    // Só o preço riscado: o outro "a-text-price" do cartão é o preço por litro/unidade.
    const anterior = trecho.match(/data-a-strike="true"[^>]*>\s*<span class="a-offscreen">\s*R\$\s*([\d.]+,\d{2})/i)?.[1];

    const preco = precos[0];
    if (!titulo || !Number.isFinite(preco) || preco <= 0) return;

    const precoAnterior = anterior ? paraNumero(anterior) : null;
    const avaliacao = trecho.match(/(\d[,.]\d) de 5 estrelas/)?.[1];
    const qtdAvaliacoes = trecho.match(/aria-label="([\d.]+) (?:classificações|avaliações)"/i)?.[1];

    vistos.add(asin);
    produtos.push({
      external_id: asin,
      titulo,
      imagem: trecho.match(/<img[^>]+class="s-image"[^>]+src="([^"]+)"/i)?.[1]
        || trecho.match(/<img[^>]+src="([^"]+)"[^>]+class="s-image"/i)?.[1] || null,
      url: `https://www.amazon.com.br/dp/${asin}`,
      preco,
      // "De" menor ou igual ao "por" não é desconto — descartado, não inventado.
      preco_anterior: precoAnterior && precoAnterior > preco ? precoAnterior : null,
      avaliacao: avaliacao ? Number(avaliacao.replace(',', '.')) : null,
      quantidade_avaliacoes: qtdAvaliacoes ? Number(qtdAvaliacoes.replace(/\./g, '')) : null,
      disponibilidade: 'disponivel',
    });
  });

  return produtos;
}

function limpar(t) {
  return String(t || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function paraNumero(texto) {
  return Number(String(texto).replace(/\./g, '').replace(',', '.'));
}

export function limparCacheLojas() {
  cache.clear();
  ultimoAcesso.clear();
}

export { LOJAS };
