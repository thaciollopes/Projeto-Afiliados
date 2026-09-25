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
import { lojaBase } from './affiliateLinkService.js';
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

const ENCURTADORES = /(^|\/\/)(meli\.la|s\.shopee\.com\.br|shope\.ee|shp\.ee|[a-z]{2}\.shp\.ee|amzn\.to|a\.co)\/|mercadolivre\.com\/sec\//i;

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

  const esperado = idEsperado(loja);
  let encontrados = idsNoTexto(loja, url);
  let destino = url;

  if (!encontrados.length && ENCURTADORES.test(url)) {
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
export function conferenciaAtual(produto) {
  const url = produto?.url_final;
  if (!url || !MARCADORES[lojaBase(produto.marketplace)]) return null;
  const registro = linkCheckRepository.findOne({ url });
  if (!registro) return null;
  // Falha de rede não é resultado: confere de novo na próxima vez.
  if (registro.confere === null && !registro.destino) return null;
  if ((registro.id_esperado || null) !== (idEsperado(produto.marketplace) || null)) return null;
  return registro;
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
    .list({ filters: { status: 'ativo' }, limit: 1000 })
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
    if (precisaRede && ENCURTADORES.test(produto.url_final) && i < produtos.length - 1) {
      await new Promise((ok) => setTimeout(ok, PAUSA_MS));
    }
  }
  resumo.problemas = resumo.problemas.slice(0, 30);
  return resumo;
}
