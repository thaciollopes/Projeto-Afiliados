/**
 * Conferência do link de afiliado: o ID que chega na loja é o SEU?
 *
 * "O link saiu curto" não prova nada — um meli.la ou s.shopee pode ser de
 * outra conta (cookie errado, link copiado de outro grupo, tag antiga). A
 * única prova é abrir o link como o cliente abriria e ler o rastreio que a
 * loja grava no destino:
 *
 *   Mercado Livre  matt_word=<sua tag>
 *   Shopee         affiliate_id=<seu ID>  (ou utm_source=an_<seu ID>)
 *   Amazon         tag=<sua tag>
 *
 * O resultado fica em `link_checks` por URL; a fila bloqueia o link que
 * comprovadamente é de outra conta. Quando não dá para concluir (rede,
 * loja mudou o formato), o resultado é "não conferido" — nunca "ok" chutado.
 */
import { linkCheckRepository, productRepository } from '../repositories/index.js';
import {
  lojaBase, exigeLinkDoPainel, ehUrlDeLoja, ehEncurtador, ehLinkDeAfiliadoCurto,
} from './affiliateLinkService.js';
import { tagDaLoja } from './lojaService.js';
import { tagDeAfiliado as tagDoMercadoLivre } from './mercadoLivreLinkService.js';
import { nowIso } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { badRequest } from '../utils/errors.js';

const log = logger.child('verificacao-link');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_REDIRECIONAMENTOS = 8;
const PAUSA_MS = 1000;

/** Onde cada loja grava o afiliado no link. */
const MARCADORES = {
  mercadolivre: [/[?&#]matt_word=([^&#"'\s<>]+)/gi],
  shopee: [/[?&]affiliate_id=(\d+)/gi, /[?&](?:utm_source|mmp_pid)=an_(\d+)/gi],
  amazon: [/[?&]tag=([^&#"'\s<>]+)/gi],
};

export function lojasConferiveis() {
  return Object.keys(MARCADORES);
}

/** O ID contra o qual o link é conferido. */
export function idEsperado(marketplace) {
  const loja = lojaBase(marketplace);
  if (loja === 'mercadolivre') return tagDoMercadoLivre();
  return MARCADORES[loja] ? tagDaLoja(loja) : null;
}

/** IDs de afiliado presentes num texto (URL ou HTML), no formato da loja. */
export function idsNoTexto(marketplace, texto) {
  const padroes = MARCADORES[lojaBase(marketplace)] || [];
  const achados = new Set();
  const alvo = String(texto || '').replace(/&amp;/g, '&');
  for (const padrao of padroes) {
    for (const m of alvo.matchAll(padrao)) {
      try { achados.add(decodeURIComponent(m[1])); } catch { achados.add(m[1]); }
    }
  }
  return [...achados];
}

/**
 * Decide se confere. Sem ID esperado ou sem ID no destino, a resposta honesta
 * é "não sei" (null) — nunca true.
 */
export function avaliar({ esperado, encontrados }) {
  if (!encontrados.length) {
    return { confere: null, motivo: 'nenhum ID de afiliado no destino do link' };
  }
  if (!esperado) {
    return { confere: null, motivo: `o link leva o ID ${encontrados.join(', ')} — cadastre o seu em LOJAS para conferir` };
  }
  const bate = encontrados.some((id) => id.toLowerCase() === String(esperado).toLowerCase());
  return bate
    ? { confere: true, motivo: `ID ${esperado} confirmado no destino` }
    : { confere: false, motivo: `o link leva o ID ${encontrados.join(', ')}, e o seu é ${esperado}` };
}

/**
 * Abre o link seguindo os redirecionamentos um a um (como o celular do
 * cliente faria) e junta todas as URLs do caminho. Se o último passo for uma
 * página com redirecionamento por script, lê o começo do HTML também.
 */
export async function seguirLink(url, { fetchImpl = fetch } = {}) {
  const caminho = [url];
  let atual = url;
  let corpo = '';

  for (let i = 0; i < MAX_REDIRECIONAMENTOS; i += 1) {
    // Só domínio de loja, a cada passo: um redirecionamento para a rede
    // interna (ou um "link" que já aponta para ela) não é buscado.
    if (!ehUrlDeLoja(atual)) break;
    const res = await fetchImpl(atual, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: 'text/html,*/*', 'accept-language': 'pt-BR,pt;q=0.9' },
      signal: AbortSignal.timeout(15000),
    });
    const destino = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && destino) {
      atual = new URL(destino, atual).toString();
      caminho.push(atual);
      continue;
    }
    corpo = (await res.text().catch(() => '')).slice(0, 200000);
    break;
  }
  return { caminho, destino: atual, corpo };
}

/**
 * Confere um link. Link completo (Amazon com ?tag=) é conferido sem rede;
 * link curto é aberto.
 */
export async function verificarLink(marketplace, url, { fetchImpl = fetch } = {}) {
  const loja = lojaBase(marketplace);
  if (!MARCADORES[loja]) throw badRequest(`Não sei conferir links da loja "${loja}".`);
  if (!url) throw badRequest('Informe o link.');
  if (!ehUrlDeLoja(url)) throw badRequest('Só dá para conferir link das lojas (Mercado Livre, Shopee, Amazon, Magalu).');

  const esperado = idEsperado(loja);
  let encontrados = idsNoTexto(loja, url);
  let destino = url;

  if (!encontrados.length && ehEncurtador(url)) {
    try {
      const percurso = await seguirLink(url, { fetchImpl });
      destino = percurso.destino;
      encontrados = idsNoTexto(loja, percurso.caminho.join(' '));
      if (!encontrados.length) encontrados = idsNoTexto(loja, percurso.corpo);
    } catch (err) {
      return guardar({
        url, loja, esperado, encontrados: [], destino: null,
        confere: null, motivo: `não consegui abrir o link: ${err.message}`,
      });
    }
  }

  return guardar({ url, loja, esperado, encontrados, destino, ...avaliar({ esperado, encontrados }) });
}

function guardar({ url, loja, esperado, encontrados, destino, confere, motivo }) {
  const dados = {
    loja,
    confere,
    id_esperado: esperado || null,
    ids_encontrados: encontrados,
    destino: destino ? String(destino).slice(0, 1000) : null,
    motivo,
    verificado_em: nowIso(),
  };
  linkCheckRepository.upsertBy({ url }, dados);
  if (confere === false) log.warn(`Link de afiliado de outra conta: ${motivo}`, { url });
  return { url, ...dados };
}

/**
 * A última conferência deste link, se ainda vale (feita contra o ID atual).
 * Síncrono: é o que a validação da fila usa.
 */
export function conferenciaAtual(produto, cache = null) {
  const url = produto?.url_final;
  if (!url || !MARCADORES[lojaBase(produto.marketplace)]) return null;
  const registro = cache ? cache.registro : linkCheckRepository.findOne({ url });
  return registroVale(registro, cache ? cache.esperado : idEsperado(produto.marketplace)) ? registro : null;
}

function registroVale(registro, esperado) {
  if (!registro) return false;
  // Falha de rede não é resultado: confere de novo na próxima vez.
  if (registro.confere === null && !registro.destino) return false;
  // Conferido contra outro ID (tag trocada depois): não vale mais.
  return (registro.id_esperado || null) === (esperado || null);
}

/** O ID esperado de cada loja, lido uma vez (evita reler cadastro/cookie por produto). */
function esperadosPorLoja() {
  const cache = new Map();
  return (marketplace) => {
    const loja = lojaBase(marketplace);
    if (!cache.has(loja)) cache.set(loja, MARCADORES[loja] ? idEsperado(loja) : null);
    return cache.get(loja);
  };
}

/**
 * Conferências que ainda valem, só dos produtos ativos (link trocado ou
 * conferido contra ID antigo não conta). É o que o "Comece aqui" mostra.
 */
export function resumoConferencias() {
  const esperadoDe = esperadosPorLoja();
  const linhas = linkCheckRepository.raw(
    `SELECT DISTINCT lc.* FROM link_checks lc
       JOIN products p ON p.url_final = lc.url
      WHERE p.status = 'ativo'`,
  );
  const validas = linhas.filter((r) => registroVale(r, esperadoDe(r.loja)));
  return {
    confirmados: validas.filter((r) => r.confere === 1).length,
    outra_conta: validas.filter((r) => r.confere === 0).length,
  };
}

/** Confere o link do produto, reaproveitando a conferência válida. */
export async function verificarProduto(produto, { forcar = false, fetchImpl = fetch } = {}) {
  if (!produto?.url_final || !MARCADORES[lojaBase(produto.marketplace)]) return null;
  if (!forcar) {
    const atual = conferenciaAtual(produto);
    if (atual) return atual;
  }
  return verificarLink(produto.marketplace, produto.url_final, { fetchImpl });
}

/** Confere em lote os produtos ativos de uma loja (com pausa entre um e outro). */
export async function verificarProdutosDaLoja(loja, { limite = 30, forcar = false, fetchImpl = fetch } = {}) {
  if (!MARCADORES[loja]) throw badRequest(`Não sei conferir links da loja "${loja}".`);
  const produtos = productRepository
    .listAll({ filters: { status: 'ativo' } })
    .filter((p) => lojaBase(p.marketplace) === loja && p.url_final)
    .slice(0, Math.min(Number(limite) || 30, 100));

  const resumo = { total: produtos.length, confere: 0, outra_conta: 0, nao_conferido: 0, problemas: [] };
  for (const [i, produto] of produtos.entries()) {
    const precisaRede = forcar || !conferenciaAtual(produto);
    const r = await verificarProduto(produto, { forcar, fetchImpl });
    if (r.confere === true) resumo.confere += 1;
    else {
      if (r.confere === false) resumo.outra_conta += 1; else resumo.nao_conferido += 1;
      resumo.problemas.push({ produto: produto.titulo_original, id: produto.id, link: produto.url_final, motivo: r.motivo });
    }
    if (precisaRede && ehEncurtador(produto.url_final) && i < produtos.length - 1) {
      await new Promise((ok) => setTimeout(ok, PAUSA_MS));
    }
  }
  resumo.problemas = resumo.problemas.slice(0, 30);
  return resumo;
}

/**
 * Situação do link de um produto, numa palavra, para a lista de produtos:
 * ver de longe o que sai com comissão, sem abrir o preview de cada um.
 * Não vai à rede — usa a última conferência guardada.
 * @returns {{tipo:'ok'|'erro'|'alerta'|'', texto:string}}
 */
export function situacaoDoLink(produto, cache = null) {
  const conferencia = conferenciaAtual(produto, cache);
  if (conferencia?.confere === true) return { tipo: 'ok', texto: 'seu ID confirmado' };
  if (conferencia?.confere === false) return { tipo: 'erro', texto: 'ID de outra conta' };

  if (exigeLinkDoPainel(produto.marketplace) && !ehLinkDeAfiliadoCurto(produto.url_final)) {
    return { tipo: 'alerta', texto: 'sem comissão' };
  }
  if (produto.url_afiliado) return { tipo: '', texto: 'link de afiliado (não conferido)' };
  return { tipo: 'alerta', texto: 'sem link de afiliado' };
}

/**
 * A situação de uma página inteira de produtos com 1 consulta de conferências
 * e 1 leitura do ID de cada loja — em vez de várias consultas por produto.
 */
export function situacoesDosLinks(produtos = []) {
  const urls = [...new Set(produtos.map((p) => p.url_final).filter(Boolean))];
  const registros = new Map();
  for (let i = 0; i < urls.length; i += 500) {
    for (const r of linkCheckRepository.list({ filters: { url: urls.slice(i, i + 500) } })) registros.set(r.url, r);
  }
  const esperadoDe = esperadosPorLoja();
  return produtos.map((p) => situacaoDoLink(p, {
    registro: registros.get(p.url_final) || null,
    esperado: esperadoDe(p.marketplace),
  }));
}
