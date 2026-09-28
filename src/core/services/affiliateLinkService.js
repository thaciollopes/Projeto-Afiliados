/**
 * Link de afiliado: pega o link cru do produto e devolve o SEU link, com a sua
 * etiqueta. É o que transforma divulgação em comissão.
 *
 * Roda para todo produto que entra no sistema, não importa a origem (busca por
 * API, navegação, painel, cadastro manual, planilha) — o ponto de integração é
 * o `derive()` do productService.
 *
 * Duas regras que valem mais que o resto:
 *   1. Link que já vem com rastreio (Shopee `offerLink`, link encurtado do
 *      painel) NÃO é reescrito. Mexer nele quebraria a atribuição da comissão.
 *   2. Sem programa cadastrado, o link original é mantido intacto — a oferta
 *      sai sem comissão em vez de sair quebrada.
 */
import { affiliateRepository } from '../repositories/index.js';
import { logger } from '../utils/logger.js';

const log = logger.child('afiliado');

/** De qual loja é este link (produto, link curto ou de afiliado) — pelo host. */
export function lojaDaUrl(url) {
  const host = hostDe(url);
  if (!host) return null;
  const de = (...dominios) => dominios.some((d) => noDominio(host, d));
  if (de('mercadolivre.com.br', 'mercadolivre.com', 'mercadolibre.com', 'meli.la')) return 'mercadolivre';
  if (de('shopee.com.br', 'shope.ee', 'shp.ee')) return 'shopee';
  if (de('amazon.com.br', 'amazon.com', 'amzn.to', 'a.co')) return 'amazon';
  if (de('magazineluiza.com.br', 'magazinevoce.com.br')) return 'magalu';
  return null;
}

/**
 * Domínios das lojas. É a lista do que o servidor pode ABRIR (conferir link,
 * seguir encurtador): sem ela, um "link" apontando para a rede interna faria
 * o servidor buscar endereços que ninguém de fora deveria alcançar.
 */
const DOMINIOS_DAS_LOJAS = [
  'mercadolivre.com.br', 'mercadolivre.com', 'mercadolibre.com', 'meli.la',
  'shopee.com.br', 'shope.ee', 'shp.ee',
  'amazon.com.br', 'amazon.com', 'amzn.to', 'a.co',
  'magazineluiza.com.br', 'magazinevoce.com.br',
];

/** Encurtadores que o sistema abre para descobrir o produto/ID de destino. */
const ENCURTADORES = ['meli.la', 's.shopee.com.br', 'shope.ee', 'shp.ee', 'amzn.to', 'a.co'];

function hostDe(url) {
  try {
    const u = new URL(String(url || ''));
    return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

const noDominio = (host, dominio) => host === dominio || host.endsWith(`.${dominio}`);

/** O link é de uma loja conhecida (pelo HOST, não por texto no meio da URL). */
export function ehUrlDeLoja(url) {
  const host = hostDe(url);
  return Boolean(host && DOMINIOS_DAS_LOJAS.some((d) => noDominio(host, d)));
}

/** Link curto de loja (meli.la, s.shopee, amzn.to...) — precisa abrir para saber o destino. */
export function ehEncurtador(url) {
  const host = hostDe(url);
  if (!host) return false;
  if (ENCURTADORES.some((d) => noDominio(host, d))) return true;
  return noDominio(host, 'mercadolivre.com') && /^\/sec\//.test(new URL(url).pathname);
}

/** "amazon-web" e "shopee-painel" são fontes da mesma loja: amazon, shopee. */
export function lojaBase(marketplace) {
  return String(marketplace || '').replace(/-(web|painel|api)$/i, '').toLowerCase();
}

/**
 * Encurtadores dos programas de afiliado: o link já carrega rastreio e
 * reescrever atrapalha. Um lugar só — esta lista existia copiada em quatro
 * arquivos e as cópias já não batiam. (a.co fica de fora: é o "compartilhar"
 * comum da Amazon, sem tag.)
 */
const HOSTS_DE_AFILIADO = ['meli.la', 's.shopee.com.br', 'shope.ee', 'shp.ee', 'amzn.to', 's.click.aliexpress.com', 'awin1.com'];

export function ehLinkDeAfiliadoCurto(url) {
  const host = hostDe(url);
  if (!host) return false;
  if (HOSTS_DE_AFILIADO.some((d) => noDominio(host, d))) return true;
  return noDominio(host, 'mercadolivre.com') && /^\/sec\//.test(new URL(url).pathname);
}

/**
 * Como cada loja marca o afiliado, quando o usuário não define o parâmetro.
 * `null` = a loja NÃO aceita parâmetro na URL.
 */
const PARAMETRO_PADRAO = {
  amazon: 'tag',
  aliexpress: 'aff_trace_key',
  magalu: 'partner_id',
  mercadolivre: null,
  shopee: null,
};

/**
 * Lojas onde parâmetro na URL NÃO gera comissão — só vale o link gerado no
 * painel de afiliado delas.
 *
 * Isto não é preciosismo: a documentação do Mercado Livre é explícita ("sem o
 * código de rastreamento, as vendas não são atribuídas a você"). Publicar um
 * link cru dessas lojas é trabalhar de graça, e é pior do que não publicar,
 * porque parece que está tudo certo.
 */
const EXIGEM_LINK_DO_PAINEL = {
  mercadolivre: 'O Mercado Livre só paga comissão no link meli.la gerado pelo painel. '
    + 'Cole o cookie em LOJAS → Mercado Livre.',
  shopee: 'A Shopee só paga comissão no link s.shopee.com.br gerado pelo painel. '
    + 'Cole o cookie em LOJAS → Shopee.',
};

/**
 * @param {{marketplace:string, url_original?:string, url_afiliado?:string}} produto
 * @returns {{url:string|null, aplicado:boolean, motivo:string}}
 */
export function buildAffiliateUrl(produto) {
  const original = produto.url_afiliado || produto.url_original;
  if (!original) return { url: null, aplicado: false, motivo: 'produto sem link' };

  // Vale para qualquer campo: o offerLink da Shopee, por exemplo, costuma
  // chegar como url_original quando vem do painel.
  if (ehLinkDeAfiliadoCurto(original)) {
    return { url: original, aplicado: true, motivo: 'link já vem com o seu rastreio da loja' };
  }

  const loja = lojaBase(produto.marketplace);

  // Loja que exige link do painel: não adianta grudar parâmetro. Melhor dizer
  // a verdade ("este link não paga comissão") do que fingir que converteu.
  if (EXIGEM_LINK_DO_PAINEL[loja]) {
    return {
      url: original,
      aplicado: false,
      sem_comissao: true,
      motivo: EXIGEM_LINK_DO_PAINEL[loja],
    };
  }

  const programa = programaDa(loja);

  if (!programa) {
    return { url: original, aplicado: false, motivo: `nenhum programa de afiliado cadastrado para "${loja}"` };
  }
  if (!programa.identificador) {
    return { url: original, aplicado: false, motivo: `programa "${programa.nome}" sem ID de afiliado preenchido` };
  }

  const parametro = programa.parametro_tag || PARAMETRO_PADRAO[loja];

  if (!parametro) {
    const exige = EXIGEM_LINK_DO_PAINEL[loja];
    return {
      url: original,
      aplicado: false,
      sem_comissao: Boolean(exige),
      motivo: exige || `defina o "parâmetro na URL" do programa "${programa.nome}"`,
    };
  }

  try {
    const url = new URL(original);
    url.searchParams.set(parametro, programa.identificador);
    return { url: url.toString(), aplicado: true, motivo: `${parametro}=${programa.identificador}` };
  } catch {
    return { url: original, aplicado: false, motivo: 'link em formato inválido' };
  }
}

/**
 * O programa da loja que realmente serve para gerar link.
 *
 * A ordem importa: pode haver mais de um cadastro para a mesma loja (o de
 * exemplo que veio no seed e o seu, de verdade). Quem tem etiqueta preenchida
 * vence — senão o sistema escolheria o cadastro vazio e o link sairia sem
 * comissão, silenciosamente.
 */
function programaDa(loja) {
  const daLoja = affiliateRepository
    .list({ limit: 100 })
    .filter((p) => lojaBase(p.marketplace) === loja);

  return daLoja.find((p) => p.ativo && p.identificador)
    || daLoja.find((p) => p.identificador)
    || daLoja.find((p) => p.ativo)
    || daLoja[0]
    || null;
}

/** Para a tela: mostra como o link ficaria, sem gravar nada. */
export function previewLink(marketplace, urlOriginal) {
  const resultado = buildAffiliateUrl({ marketplace, url_original: urlOriginal });
  return {
    original: urlOriginal,
    final: resultado.url,
    aplicado: resultado.aplicado,
    sem_comissao: Boolean(resultado.sem_comissao),
    motivo: resultado.motivo,
    loja: lojaBase(marketplace),
  };
}

/** A loja exige link gerado no painel dela? (para avisos na tela e na fila) */
export function exigeLinkDoPainel(marketplace) {
  return EXIGEM_LINK_DO_PAINEL[lojaBase(marketplace)] || null;
}

/** Reaplica a etiqueta em todos os produtos — use depois de cadastrar/trocar a tag. */
export function reaplicarEmTodos(productRepository) {
  const produtos = productRepository.listAll();
  let atualizados = 0;
  const semPrograma = new Set();

  for (const produto of produtos) {
    const { url, aplicado, motivo } = buildAffiliateUrl(produto);
    if (!aplicado) {
      if (/nenhum programa/.test(motivo)) semPrograma.add(lojaBase(produto.marketplace));
      continue;
    }
    if (url && url !== produto.url_final) {
      productRepository.update(produto.id, { url_afiliado: url, url_final: url });
      atualizados += 1;
    }
  }

  log.info(`Etiqueta de afiliado reaplicada em ${atualizados} produto(s)`);
  return { atualizados, total: produtos.length, lojas_sem_programa: [...semPrograma] };
}
