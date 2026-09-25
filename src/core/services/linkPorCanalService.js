/**
 * Link de afiliado por GRUPO: o mesmo produto sai com um link diferente em
 * cada grupo, marcado com o sub ID do grupo. No relatório de comissões da
 * Shopee aparece de qual grupo veio cada venda — é assim que se descobre qual
 * grupo vale a pena manter.
 *
 * Só a Shopee aceita sub ID no link gerado pelo painel. Nas outras lojas (ou
 * sem cookie) o post usa o link normal do produto; nada quebra.
 *
 * Cada link é gerado uma vez por produto+grupo e fica em `links_canal`.
 */
import { channelRepository, linkCanalRepository } from '../repositories/index.js';
import { lojaBase } from './affiliateLinkService.js';
import { cookiesDaSessao } from './sessaoLojaService.js';
import { tagDaLoja } from './lojaService.js';
import { converterLinks, ehLinkDaShopee, normalizarSubId } from './shopeeLinkService.js';
import { logger } from '../utils/logger.js';

const log = logger.child('link-canal');

/**
 * Sub ID do grupo. Sem um definido, nasce do nome e fica gravado: se o nome
 * do grupo mudar depois, o relatório não se divide em dois.
 */
export function subIdDoCanal(canal) {
  if (!canal) return null;
  if (canal.sub_id) return canal.sub_id;
  const gerado = normalizarSubId(canal.nome);
  if (gerado && canal.id) channelRepository.update(canal.id, { sub_id: gerado });
  return gerado;
}

export function lojaUsaSubId(marketplace) {
  return lojaBase(marketplace) === 'shopee';
}

/**
 * Link do produto para este grupo, ou null (usa o link normal do produto).
 * Nunca lança: falhar aqui só significa "sem sub ID neste post".
 */
export async function linkParaCanal(produto, canal) {
  if (!produto || !canal || !lojaUsaSubId(produto.marketplace)) return null;
  if (!ehLinkDaShopee(produto.url_original) || !cookiesDaSessao('shopee')?.length) return null;

  const subId = subIdDoCanal(canal);
  if (!subId) return null;

  const guardado = linkCanalRepository.findOne({ product_id: produto.id, channel_id: canal.id });
  if (guardado && guardado.url_origem === produto.url_original && guardado.sub_id === subId) {
    return guardado.link;
  }

  try {
    const { resultados } = await converterLinks([produto.url_original], { subId });
    const item = resultados[0];
    if (!item?.link) return null;

    // Mesmo cuidado da conversão normal: link de outra conta não entra.
    const esperado = tagDaLoja('shopee');
    if (esperado && item.affiliate_id && String(item.affiliate_id) !== String(esperado)) {
      log.warn(`Link com sub ID saiu na conta ${item.affiliate_id}, e o seu ID é ${esperado}; usando o link normal`);
      return null;
    }

    linkCanalRepository.upsertBy(
      { product_id: produto.id, channel_id: canal.id },
      { sub_id: subId, url_origem: produto.url_original, link: item.link },
    );
    return item.link;
  } catch (err) {
    log.warn(`Sem sub ID neste post: ${err.message}`, { produto: produto.id, canal: canal.id });
    return null;
  }
}
