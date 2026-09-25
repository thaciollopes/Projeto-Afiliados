/**
 * Conversão de link do Mercado Livre em link de afiliado (meli.la/...),
 * usando a sua sessão — o mesmo mecanismo das plataformas de afiliado.
 *
 * O Mercado Livre não tem API oficial de afiliados. O que existe é a própria
 * página do painel ("linkbuilder"), que chama um endpoint com a sua sessão.
 * Este serviço faz a mesma chamada que aquela página faz quando você clica em
 * "Gerar link": cookie da sessão + token CSRF (vem do cookie `_csrf`).
 * Fonte técnica: projetos open source que documentam o mesmo fluxo.
 *
 * Cuidados que valem mais que velocidade:
 *   - lotes pequenos e pausa entre eles: é uma conta de verdade, e rajada é o
 *     que faz a loja desconfiar;
 *   - link que a loja recusa (propaganda, página de lista, formato antigo /p/)
 *     volta como "não elegível" — o produto fica sem conversão, e o aviso de
 *     SEM COMISSÃO continua aparecendo no preview, em vez de fingir que deu;
 *   - sessão expirada é dita com todas as letras.
 */
import { cookiesDaSessao } from './sessaoLojaService.js';
import { productRepository, affiliateRepository } from '../repositories/index.js';
import { logger } from '../utils/logger.js';
import { badRequest } from '../utils/errors.js';

const log = logger.child('ml-links');

const ENDPOINT = 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Tamanho do lote e pausa: conservador de propósito. */
const LOTE = 10;
const PAUSA_MS = 1500;

/** Link que já é de afiliado do ML não é convertido de novo. */
export function jaEhLinkDeAfiliado(url) {
  return /meli\.la\/|mercadolivre\.com\/sec\//i.test(String(url || ''));
}

export function ehLinkDoMercadoLivre(url) {
  return /mercadolivre\.com\.br|mercadolibre\.com/i.test(String(url || '')) && !jaEhLinkDeAfiliado(url);
}

/**
 * A sua tag de afiliado do ML. Ordem: o que você cadastrou em Afiliados →
 * o apelido da conta que vem no cookie `orgnickp` (é o padrão do ML).
 */
export function tagDeAfiliado() {
  const programa = affiliateRepository
    .list({ limit: 100 })
    .find((a) => a.marketplace === 'mercadolivre' && a.identificador);
  if (programa?.identificador) return programa.identificador;

  const apelido = (cookiesDaSessao('mercadolivre') || []).find((c) => c.name === 'orgnickp');
  return apelido?.value || null;
}

function montarSessao() {
  const cookies = cookiesDaSessao('mercadolivre');
  if (!cookies?.length) {
    throw badRequest('Cole o cookie do Mercado Livre em LOJAS → Mercado Livre.');
  }
  const csrf = cookies.find((c) => c.name === '_csrf')?.value;
  if (!csrf) {
    throw badRequest(
      'O cookie colado não tem o "_csrf". Exporte de novo com o Cookie Editor estando na '
      + 'página do painel de afiliados (mercadolivre.com.br/afiliados/linkbuilder).',
    );
  }
  return { cabecalho: cookies.map((c) => `${c.name}=${c.value}`).join('; '), csrf };
}

/**
 * Converte até N links de uma vez.
 * @returns {Promise<Map<string, {link:string|null, erro:string|null}>>}
 */
async function converterLote(urls, tag, sessao) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      cookie: sessao.cabecalho,
      origin: 'https://www.mercadolivre.com.br',
      referer: 'https://www.mercadolivre.com.br/afiliados/linkbuilder',
      'user-agent': UA,
      'x-csrf-token': sessao.csrf,
    },
    body: JSON.stringify({ urls, tag }),
    signal: AbortSignal.timeout(30000),
  });

  const texto = await res.text();

  if (res.status === 401 || res.status === 403) {
    throw badRequest(
      `O Mercado Livre recusou a sessão (HTTP ${res.status}). O cookie expirou — `
      + 'faça login de novo, exporte e cole em LOJAS → Mercado Livre.',
    );
  }
  if (/captcha\/wall|account-verification/i.test(res.url)) {
    throw badRequest('O Mercado Livre pediu verificação (captcha). Espere alguns minutos e tente de novo.');
  }

  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw badRequest(`Resposta inesperada do Mercado Livre (HTTP ${res.status}): ${texto.slice(0, 120)}`);
  }

  const resultado = new Map();
  // A resposta traz um item por URL; os formatos variam um pouco entre versões.
  const itens = dados.urls || dados.links || dados.results || (Array.isArray(dados) ? dados : [dados]);

  for (const [indice, url] of urls.entries()) {
    const item = itens.find((i) => i?.url === url || i?.original_url === url || i?.long_url === url)
      || itens[indice]
      || {};
    const link = item.short_url || item.shortUrl || item.link || null;
    const erro = link ? null : (item.error_code === 111 || /111/.test(String(item.error_code))
      ? 'link não elegível (propaganda, lista ou formato antigo)'
      : item.message || item.error || `sem link na resposta (HTTP ${res.status})`);
    resultado.set(url, { link, erro });
  }
  return resultado;
}

/**
 * Converte uma lista de links. Aceita qualquer quantidade; faz em lotes.
 * @returns {Promise<{convertidos:number, falhas:number, resultados:Array}>}
 */
export async function converterLinks(urls = []) {
  const alvos = [...new Set(urls.filter(ehLinkDoMercadoLivre))];
  if (!alvos.length) return { convertidos: 0, falhas: 0, resultados: [] };

  const tag = tagDeAfiliado();
  if (!tag) {
    throw badRequest('Falta a sua tag de afiliado do Mercado Livre (em LOJAS → Mercado Livre).');
  }
  const sessao = montarSessao();

  const resultados = [];
  for (let i = 0; i < alvos.length; i += LOTE) {
    const lote = alvos.slice(i, i + LOTE);
    const mapa = await converterLote(lote, tag, sessao);
    for (const url of lote) resultados.push({ url, ...mapa.get(url) });
    if (i + LOTE < alvos.length) await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  const convertidos = resultados.filter((r) => r.link).length;
  log.info(`Mercado Livre: ${convertidos} de ${resultados.length} links convertidos`, { tag });
  return { convertidos, falhas: resultados.length - convertidos, resultados, tag };
}

/**
 * Converte os produtos do ML que ainda estão sem link de afiliado e grava.
 * @param {{ids?:string[], limite?:number}} opcoes
 */
export async function converterProdutos({ ids = null, limite = 200 } = {}) {
  const candidatos = (ids?.length
    ? productRepository.findByIds(ids)
    : productRepository.list({ filters: { marketplace: ['mercadolivre', 'mercadolivre-web', 'mercadolivre-cookie'] }, limit: limite }))
    .filter((p) => !jaEhLinkDeAfiliado(p.url_final) && ehLinkDoMercadoLivre(p.url_original));

  if (!candidatos.length) {
    return { convertidos: 0, falhas: 0, pendentes: 0, mensagem: 'Nenhum produto do Mercado Livre sem link de afiliado.' };
  }

  const porUrl = new Map(candidatos.map((p) => [p.url_original, p]));
  const { resultados, tag } = await converterLinks([...porUrl.keys()]);

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

  return { convertidos, falhas: erros.length, tag, erros: erros.slice(0, 20) };
}
