/**
 * Conversão de link da Shopee em link de afiliado (s.shopee.com.br/...),
 * usando a sua sessão — o mesmo esquema do Mercado Livre.
 *
 * A API oficial da Shopee (Open API) exige App ID + segredo aprovados. Sem
 * isso, o que existe é a página "Link personalizado" do painel de afiliados
 * (affiliate.shopee.com.br/offer/custom_link), que chama um endpoint GraphQL
 * com o cookie da sessão. Este serviço faz a mesma chamada.
 * Fonte técnica: projetos open source que documentam o mesmo fluxo
 * (operação `batchGetCustomLink`, até 5 links por chamada).
 *
 * Por que a conta que gera o link é a do cookie, e não a tag: a Shopee não
 * aceita "etiqueta" no pedido — o link sai no nome de quem está logado. Por
 * isso a resposta é conferida: o link longo traz `affiliate_id`, e se ele não
 * bater com o ID cadastrado em LOJAS, o sistema diz em vez de publicar.
 */
import { cookiesDaSessao } from './sessaoLojaService.js';
import { tagDaLoja } from './lojaService.js';
import { productRepository } from '../repositories/index.js';
import { logger } from '../utils/logger.js';
import { badRequest } from '../utils/errors.js';

const log = logger.child('shopee-links');

const ENDPOINT = 'https://affiliate.shopee.com.br/api/v3/gql?q=batchCustomLink';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CONSULTA = `
query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller){
  batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller){
    shortLink
    longLink
    failCode
  }
}`.trim();

/** A Shopee aceita no máximo 5 por chamada; a pausa é pela conta, não pela API. */
const LOTE = 5;
const PAUSA_MS = 1500;

const FRASES_DE_LOGIN = /not.?log|login required|no login|session expired|unauthenticated|unauthorized|authentication/i;

/** Encurtadores da própria Shopee: o link já é de afiliado (de alguém). */
export function jaEhLinkDeAfiliado(url) {
  return /(^|\/\/)(s\.shopee\.com\.br|shope\.ee|shp\.ee|[a-z]{2}\.shp\.ee)\//i.test(String(url || ''))
    || /an_redir/i.test(String(url || ''));
}

export function ehLinkDaShopee(url) {
  return /(^|\/\/|\.)shopee\.com\.br\//i.test(String(url || '')) && !jaEhLinkDeAfiliado(url);
}

/**
 * Link canônico do produto: `shopee.com.br/product/<loja>/<item>`.
 * Tira da URL o rastreio de quem mandou o link (sp_atk, utm, mmp_pid...) —
 * senão a Shopee poderia atribuir a venda a outra pessoa.
 */
export function linkLimpo(url) {
  const texto = String(url || '');
  const ids = texto.match(/-i\.(\d+)\.(\d+)/) || texto.match(/\/product\/(\d+)\/(\d+)/);
  if (ids) return `https://shopee.com.br/product/${ids[1]}/${ids[2]}`;
  try {
    const u = new URL(texto);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return texto;
  }
}

/**
 * ID de afiliado que aparece num link da Shopee. O link longo traz
 * `affiliate_id=123`; o destino final costuma trazer `utm_source=an_123`.
 */
export function idNoLink(url) {
  const texto = String(url || '');
  const direto = texto.match(/[?&]affiliate_id=(\d+)/i)?.[1];
  if (direto) return direto;
  return texto.match(/[?&](?:utm_source|mmp_pid)=an_(\d+)/i)?.[1] || null;
}

/** O ID de afiliado da Shopee que você cadastrou em LOJAS (só para conferir). */
export function tagDeAfiliado() {
  return tagDaLoja('shopee');
}

function montarSessao() {
  const cookies = cookiesDaSessao('shopee');
  if (!cookies?.length) {
    throw badRequest('Cole o cookie da Shopee em LOJAS → Shopee (logado no painel de afiliados).');
  }
  if (!cookies.some((c) => /^SPC_(EC|ST|U)$/i.test(c.name))) {
    throw badRequest(
      'O cookie colado não tem a sessão da Shopee (SPC_EC). Exporte de novo com o Cookie Editor '
      + 'estando logado em affiliate.shopee.com.br.',
    );
  }
  const csrf = cookies.find((c) => c.name === 'csrftoken')?.value || null;
  return { cabecalho: cookies.map((c) => `${c.name}=${c.value}`).join('; '), csrf };
}

function sessaoRecusada(dados) {
  if (dados?.is_login === false) return true;
  if (/^(401|403|90309999|30001|30002)$/.test(String(dados?.code ?? dados?.error ?? ''))) return true;
  return (dados?.errors || []).some((e) => FRASES_DE_LOGIN.test(String(e?.message || e)));
}

async function converterLote(urls, sessao) {
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    cookie: sessao.cabecalho,
    origin: 'https://affiliate.shopee.com.br',
    referer: 'https://affiliate.shopee.com.br/offer/custom_link',
    'affiliate-program-type': '1',
    'user-agent': UA,
  };
  if (sessao.csrf) headers['x-csrftoken'] = sessao.csrf;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operationName: 'batchGetCustomLink',
      query: CONSULTA,
      variables: {
        linkParams: urls.map((originalLink) => ({ originalLink, advancedLinkParams: {} })),
        sourceCaller: 'CUSTOM_LINK_CALLER',
      },
    }),
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });

  if ([401, 403, 419, 440].includes(res.status) || (res.status >= 300 && res.status < 400)) {
    throw badRequest(
      `A Shopee recusou a sessão (HTTP ${res.status}). O cookie expirou ou a conta não é de afiliado — `
      + 'faça login no painel de afiliados, exporte e cole em LOJAS → Shopee.',
    );
  }
  if (res.status === 429) throw badRequest('A Shopee pediu para ir mais devagar (HTTP 429). Tente daqui a alguns minutos.');

  const texto = await res.text();
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw badRequest(`Resposta inesperada da Shopee (HTTP ${res.status}): ${texto.slice(0, 120)}`);
  }
  if (sessaoRecusada(dados)) {
    throw badRequest('A Shopee não reconheceu o login. Cole o cookie de novo em LOJAS → Shopee.');
  }
  const itens = dados?.data?.batchCustomLink;
  if (!Array.isArray(itens)) {
    const motivo = dados?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw badRequest(`A Shopee não devolveu os links (${motivo}).`);
  }

  // A resposta vem na mesma ordem do pedido.
  const resultado = new Map();
  urls.forEach((url, i) => {
    const item = itens[i] || {};
    const ok = Number(item.failCode) === 0 && item.shortLink;
    resultado.set(url, {
      link: ok ? item.shortLink : null,
      link_longo: item.longLink || null,
      affiliate_id: idNoLink(item.longLink),
      erro: ok ? null : `link não elegível (código ${item.failCode ?? '?'})`,
    });
  });
  return resultado;
}

/**
 * Converte uma lista de links (em lotes de 5).
 * @returns {Promise<{convertidos:number, falhas:number, resultados:Array, affiliate_id:string|null}>}
 */
export async function converterLinks(urls = []) {
  const porLimpo = new Map();
  for (const url of urls.filter(ehLinkDaShopee)) porLimpo.set(linkLimpo(url), url);
  const alvos = [...porLimpo.keys()];
  if (!alvos.length) return { convertidos: 0, falhas: 0, resultados: [], affiliate_id: null };

  const sessao = montarSessao();
  const resultados = [];
  for (let i = 0; i < alvos.length; i += LOTE) {
    const lote = alvos.slice(i, i + LOTE);
    const mapa = await converterLote(lote, sessao);
    for (const limpo of lote) resultados.push({ url: porLimpo.get(limpo), url_limpa: limpo, ...mapa.get(limpo) });
    if (i + LOTE < alvos.length) await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  const convertidos = resultados.filter((r) => r.link).length;
  const affiliateId = resultados.find((r) => r.affiliate_id)?.affiliate_id || null;
  log.info(`Shopee: ${convertidos} de ${resultados.length} links convertidos`, { affiliate_id: affiliateId });
  return { convertidos, falhas: resultados.length - convertidos, resultados, affiliate_id: affiliateId };
}

/**
 * Converte os produtos da Shopee que ainda estão sem link de afiliado e grava.
 *
 * Se o link sair com um affiliate_id diferente do cadastrado, NÃO grava:
 * o cookie é de outra conta, e publicar isso seria dar a comissão a ela.
 */
export async function converterProdutos({ ids = null, limite = 200 } = {}) {
  const candidatos = (ids?.length
    ? productRepository.findByIds(ids)
    : productRepository.list({ filters: { marketplace: ['shopee', 'shopee-web', 'shopee-painel'] }, limit: limite }))
    .filter((p) => !jaEhLinkDeAfiliado(p.url_final) && ehLinkDaShopee(p.url_original));

  if (!candidatos.length) {
    return { convertidos: 0, falhas: 0, mensagem: 'Nenhum produto da Shopee sem link de afiliado.' };
  }

  const porUrl = new Map(candidatos.map((p) => [p.url_original, p]));
  const { resultados, affiliate_id: affiliateId } = await converterLinks([...porUrl.keys()]);

  const esperado = tagDeAfiliado();
  if (esperado && affiliateId && String(esperado) !== String(affiliateId)) {
    throw badRequest(
      `O cookie da Shopee é da conta de afiliado ${affiliateId}, mas o seu ID em LOJAS é ${esperado}. `
      + 'Nada foi gravado. Confira o ID ou cole o cookie da conta certa.',
    );
  }

  let convertidos = 0;
  const erros = [];
  for (const r of resultados) {
    const produto = porUrl.get(r.url);
    if (!produto) continue;
    if (r.link) {
      productRepository.update(produto.id, { url_afiliado: r.link, url_final: r.link });
      convertidos += 1;
    } else {
      erros.push({ produto: produto.titulo_original, motivo: r.erro });
    }
  }

  return { convertidos, falhas: erros.length, affiliate_id: affiliateId, erros: erros.slice(0, 20) };
}
