/**
 * "Converter no privado": você manda um link de produto para o número de
 * divulgação e recebe de volta o post pronto, com o SEU link de afiliado.
 *
 * Serve para o achado da rua — oferta que você viu num grupo, no app da loja,
 * num link curto de outra pessoa — virar post seu em segundos, pelo celular.
 *
 * Regras que valem mais que conveniência:
 *   - só responde a números autorizados; o resto é ignorado em silêncio
 *     (senão qualquer um usaria o seu número como conversor);
 *   - link curto de outra pessoa é aberto até o produto, e o rastreio dela é
 *     descartado antes de gerar o seu;
 *   - preço só se o produto estiver cadastrado. Fora do cadastro, a resposta
 *     traz o link e diz que não há preço — nunca um preço adivinhado.
 */
import { config } from '../../config/index.js';
import { productRepository } from '../repositories/index.js';
import { buildAffiliateUrl, lojaDaUrl } from './affiliateLinkService.js';
import { converterLinks as converterMl } from './mercadoLivreLinkService.js';
import { converterLinks as converterShopee, linkLimpo as linkLimpoShopee } from './shopeeLinkService.js';
import { seguirLink, verificarLink } from './verificacaoLinkService.js';
import { buildPublication } from './publicationService.js';
import { getWhatsAppProvider } from '../../integrations/whatsapp/index.js';
import { logger } from '../utils/logger.js';

const log = logger.child('conversor-privado');

const MAX_LINKS_POR_MENSAGEM = 3;
const ENCURTADOR = /(^|\/\/)(meli\.la|s\.shopee\.com\.br|shope\.ee|shp\.ee|[a-z]{2}\.shp\.ee|amzn\.to|a\.co)\//i;

/** Mensagens já tratadas: a WAHA reenvia o webhook se demorar a responder. */
const jaTratadas = new Set();

export function extrairLinks(texto) {
  return [...String(texto || '').matchAll(/https?:\/\/[^\s<>"']+/gi)]
    .map((m) => m[0].replace(/[).,!?]+$/, ''))
    .slice(0, MAX_LINKS_POR_MENSAGEM);
}

/** Mantido com este nome: é como o resto deste arquivo (e os testes) chamam. */
export const lojaDoLink = lojaDaUrl;

/** Só os dígitos, para comparar "5511 99999-9999" com "5511999999999@c.us". */
function digitos(texto) {
  return String(texto || '').replace(/\D/g, '');
}

export function remetenteAutorizado(de, autorizados = config.whatsapp.autorizados) {
  const id = String(de || '').toLowerCase();
  return autorizados.some((a) => {
    const alvo = String(a).toLowerCase();
    // Aceita o id inteiro (ex.: "123@lid", que o log mostra) ou o número.
    return alvo === id || (digitos(alvo) && digitos(alvo) === digitos(id.split('@')[0]));
  });
}

/**
 * Link da loja sem o rastreio de ninguém. Link curto é aberto até o produto.
 * O rastreio alheio (matt_word, sp_atk, tag=...) fica para trás.
 */
export async function linkDoProduto(url, loja) {
  let destino = url;
  if (ENCURTADOR.test(url)) destino = (await seguirLink(url)).destino;

  if (loja === 'shopee') return linkLimpoShopee(destino);
  if (loja === 'amazon') {
    const asin = destino.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1];
    return asin ? `https://www.amazon.com.br/dp/${asin}` : destino.split('?')[0];
  }
  return destino.split(/[?#]/)[0];
}

async function gerarLinkDeAfiliado(loja, urlProduto) {
  if (loja === 'mercadolivre') {
    const r = await converterMl([urlProduto]);
    return { link: r.resultados[0]?.link || null, erro: r.resultados[0]?.erro || null };
  }
  if (loja === 'shopee') {
    const r = await converterShopee([urlProduto]);
    return { link: r.resultados[0]?.link || null, erro: r.resultados[0]?.erro || null };
  }
  if (loja === 'amazon') {
    const r = buildAffiliateUrl({ marketplace: 'amazon', url_original: urlProduto });
    return r.aplicado ? { link: r.url, erro: null } : { link: null, erro: r.motivo };
  }
  return { link: null, erro: 'essa loja não gera link pelo sistema (use o link da sua loja no painel dela)' };
}

/** Id do produto dentro da URL, no formato que a loja usa no cadastro. */
export function idNaUrl(url) {
  const u = String(url || '');
  const ml = u.match(/MLB-?(\d{6,})/i);
  if (ml) return `MLB${ml[1]}`;
  const asin = u.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (asin) return asin[1].toUpperCase();
  const shopee = u.match(/product\/(\d+)\/(\d+)/) || u.match(/-i\.(\d+)\.(\d+)/);
  if (shopee) return `${shopee[1]}.${shopee[2]}`;
  return null;
}

/** O produto já está na base? (mesmo id da loja, ou a mesma página sem rastreio) */
function produtoCadastrado(urlProduto, loja) {
  const semRastreio = (u) => String(u || '').split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  const id = idNaUrl(urlProduto);
  const normalizar = (x) => String(x || '').replace(/-/g, '').toUpperCase();
  return productRepository
    .list({ filters: { status: 'ativo' }, limit: 5000 })
    .filter((p) => lojaDoLink(p.url_original) === loja || String(p.marketplace).startsWith(loja))
    .find((p) => (id && normalizar(p.external_id).endsWith(normalizar(id)))
      || semRastreio(p.url_original) === semRastreio(urlProduto)) || null;
}

/** Monta a resposta para UM link. Nunca lança: erro vira texto na resposta. */
export async function responderLink(url) {
  const loja = lojaDoLink(url);
  if (!loja) return `❔ Não reconheci a loja deste link:\n${url}`;

  try {
    const urlProduto = await linkDoProduto(url, loja);
    const { link, erro } = await gerarLinkDeAfiliado(loja, urlProduto);
    if (!link) return `⚠️ Não consegui gerar o seu link (${loja}): ${erro}`;

    const conferencia = await verificarLink(loja, link).catch(() => null);
    const selo = conferencia?.confere === true
      ? '✅ seu ID conferido'
      : conferencia?.confere === false ? `❌ ${conferencia.motivo}` : '⚠️ ID não conferido';
    if (conferencia?.confere === false) {
      return `❌ O link gerado NÃO é da sua conta (${conferencia.motivo}). Confira o cookie e a tag em LOJAS.`;
    }

    const produto = produtoCadastrado(urlProduto, loja);
    if (produto) {
      // Produto na base: post completo, com o preço do cadastro.
      if (!/meli\.la|s\.shopee|tag=/.test(produto.url_final || '')) {
        productRepository.update(produto.id, { url_afiliado: link, url_final: link });
      }
      const post = await buildPublication({ product_id: produto.id });
      return `${post.mensagem}\n\n— ${selo}`;
    }

    return [
      `🔗 Seu link (${loja}): ${link}`,
      selo,
      '',
      'Este produto não está cadastrado, então o post vai sem preço — o sistema não inventa preço.',
      'Para o post completo, capture pela extensão ou cadastre em PRODUTOS.',
    ].join('\n');
  } catch (err) {
    log.warn(`Falha ao converter ${url}: ${err.message}`);
    return `⚠️ Não consegui converter este link: ${err.message}`;
  }
}

/**
 * Mensagem recebida no WhatsApp -> resposta no privado.
 * @param {{id:string, de:string, texto:string, deMim:boolean, privada:boolean}} mensagem
 * @returns {Promise<{respondida:boolean, motivo?:string, resposta?:string}>}
 */
export async function tratarMensagemRecebida(mensagem, { enviar = null } = {}) {
  if (!mensagem || mensagem.deMim || !mensagem.privada) return { respondida: false, motivo: 'fora_do_privado' };
  if (mensagem.id && jaTratadas.has(mensagem.id)) return { respondida: false, motivo: 'repetida' };
  if (!remetenteAutorizado(mensagem.de)) {
    // Registra o id: é o que você copia para WHATSAPP_NUMEROS_AUTORIZADOS.
    log.info(`Mensagem ignorada: ${mensagem.de} não está em WHATSAPP_NUMEROS_AUTORIZADOS`);
    return { respondida: false, motivo: 'nao_autorizado' };
  }

  const links = extrairLinks(mensagem.texto);
  if (!links.length) return { respondida: false, motivo: 'sem_link' };

  if (mensagem.id) {
    jaTratadas.add(mensagem.id);
    if (jaTratadas.size > 500) jaTratadas.delete(jaTratadas.values().next().value);
  }

  const partes = [];
  for (const url of links) partes.push(await responderLink(url));
  const resposta = partes.join('\n\n━━━━━━━━━━\n\n');

  // Respeita o modo simulação como o resto do sistema: nada sai no WhatsApp.
  if (config.runtime.dryRun && !enviar) {
    log.info(`[DRY RUN] Resposta não enviada para ${mensagem.de}`, { caracteres: resposta.length });
    return { respondida: false, motivo: 'dry_run', resposta };
  }

  const envio = enviar || ((texto) => getWhatsAppProvider().sendMessage({ chatId: mensagem.de, texto }));
  await envio(resposta);
  return { respondida: true, resposta };
}
