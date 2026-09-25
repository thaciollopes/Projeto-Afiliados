/**
 * Tag de afiliado por loja. Mora na tabela de programas de afiliado (é lá que
 * o affiliateLinkService procura), com um cadastro por loja — a tela LOJAS
 * esconde esse detalhe: você só digita a tag.
 */
import { affiliateRepository, productRepository } from '../repositories/index.js';
import { reaplicarEmTodos, lojaBase } from './affiliateLinkService.js';

function programaDaLoja(lojaId) {
  return affiliateRepository.list({ limit: 200 }).find((p) => lojaBase(p.marketplace) === lojaId) || null;
}

export function tagDaLoja(lojaId) {
  return programaDaLoja(lojaId)?.identificador || null;
}

/** Tag vazia apaga a tag (no ML volta a valer o apelido da conta). */
export function salvarTagDaLoja(loja, tag) {
  const valor = String(tag || '').trim() || null;
  const existente = programaDaLoja(loja.id);
  const dados = {
    nome: loja.nome,
    marketplace: loja.id,
    identificador: valor,
    parametro_tag: loja.parametro || null,
    base_url: loja.site,
    ativo: true,
  };

  if (existente) affiliateRepository.update(existente.id, dados);
  else affiliateRepository.create(dados);

  const refazer = loja.id === 'mercadolivre' && (existente?.identificador || null) !== valor
    ? devolverLinksDoMercadoLivre()
    : 0;
  return { ...reaplicarEmTodos(productRepository), links_para_refazer: refazer };
}

/**
 * O meli.la carrega a tag de quando foi gerado. Trocou a tag, os links antigos
 * continuam pagando a tag velha — então eles voltam para o link cru e são
 * gerados de novo (na próxima publicação ou em "Converter todos").
 * Na Shopee não precisa: quem define a conta é o cookie, não a tag.
 */
function devolverLinksDoMercadoLivre() {
  const produtos = productRepository
    .list({ filters: { marketplace: ['mercadolivre', 'mercadolivre-web', 'mercadolivre-cookie'] }, limit: 5000 })
    .filter((p) => /meli\.la\//i.test(p.url_afiliado || '') && p.url_original);
  for (const p of produtos) {
    productRepository.update(p.id, { url_afiliado: null, url_final: p.url_original });
  }
  return produtos.length;
}
