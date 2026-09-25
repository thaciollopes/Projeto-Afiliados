/**
 * Lojas cujo link de afiliado é gerado pela SUA sessão (cookie): Mercado Livre
 * (meli.la) e Shopee (s.shopee.com.br). Um lugar só para a fila, a importação
 * e a tela LOJAS perguntarem "esse produto precisa virar link de afiliado?".
 */
import * as mercadoLivre from './mercadoLivreLinkService.js';
import * as shopee from './shopeeLinkService.js';
import { cookiesDaSessao } from './sessaoLojaService.js';
import { lojaBase } from './affiliateLinkService.js';
import { badRequest } from '../utils/errors.js';

const CONVERSORES = { mercadolivre: mercadoLivre, shopee };

function conversorDa(marketplace) {
  const loja = lojaBase(String(marketplace || '').replace(/-cookie$/i, ''));
  return { loja, conversor: CONVERSORES[loja] || null };
}

export function lojaConverteLinkPorCookie(marketplace) {
  return Boolean(conversorDa(marketplace).conversor);
}

export function jaEhLinkDeAfiliado(marketplace, url) {
  const { conversor } = conversorDa(marketplace);
  return conversor ? conversor.jaEhLinkDeAfiliado(url) : false;
}

/** Produto da loja, sem link de afiliado ainda, e com cookie salvo para gerar. */
export function podeConverter(produto) {
  const { loja, conversor } = conversorDa(produto?.marketplace);
  return Boolean(conversor
    && !conversor.jaEhLinkDeAfiliado(produto.url_final)
    && cookiesDaSessao(loja)?.length);
}

export async function converterProdutosDaLoja(loja, opcoes = {}) {
  const { conversor } = conversorDa(loja);
  if (!conversor) throw badRequest(`A loja "${loja}" não gera link pelo cookie.`);
  return conversor.converterProdutos(opcoes);
}

export async function converterLinkAvulso(loja, url) {
  const { conversor } = conversorDa(loja);
  if (!conversor) throw badRequest(`A loja "${loja}" não gera link pelo cookie.`);
  const r = await conversor.converterLinks([url]);
  const item = r.resultados[0];
  if (!item) return { ok: false, original: url, link: null, erro: 'isso não é link de produto desta loja' };
  return {
    ok: Boolean(item.link),
    original: url,
    link: item.link || null,
    erro: item.erro || null,
    tag: r.tag || null,
    affiliate_id: item.affiliate_id || null,
  };
}

/** Converte, na importação, os produtos das lojas por cookie que tiverem sessão. */
export async function converterImportados(produtos = []) {
  const lojas = [...new Set(produtos.map((p) => conversorDa(p.marketplace).loja))]
    .filter((loja) => CONVERSORES[loja] && cookiesDaSessao(loja)?.length);

  const resultado = {};
  for (const loja of lojas) {
    resultado[loja] = await CONVERSORES[loja].converterProdutos().catch((e) => ({ erro: e.message }));
  }
  return resultado;
}
