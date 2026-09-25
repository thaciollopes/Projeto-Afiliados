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

  return reaplicarEmTodos(productRepository);
}
