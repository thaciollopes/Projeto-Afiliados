/**
 * Ajustes gerais guardados na tabela `settings`.
 *
 * A mesma tabela guarda o cookie das lojas (`sessao_loja_*`), que é senha.
 * Por isso nada aqui devolve a tabela crua: a leitura tira os segredos e a
 * gravação só aceita as chaves que o painel de fato edita — senão qualquer
 * chamada à API poderia ler o cookie ou trocá-lo pelo de outra conta.
 */
import { settingRepository } from '../repositories/index.js';
import { badRequest } from '../utils/errors.js';

const CHAVE_SECRETA = /^sessao_loja_|token|senha|segredo|secret|pkce|cookie/i;

/** Chaves que o painel pode gravar por PUT /sistema/config. */
const EDITAVEIS = new Set(['score_weights']);

export function configuracoesSemSegredo() {
  return Object.fromEntries(Object.entries(settingRepository.all() || {})
    .filter(([chave]) => !CHAVE_SECRETA.test(chave)));
}

export function salvarAjustes(patch = {}) {
  const recusadas = Object.keys(patch).filter((chave) => !EDITAVEIS.has(chave));
  if (recusadas.length) {
    throw badRequest(`Estas configurações não podem ser alteradas por aqui: ${recusadas.join(', ')}`);
  }
  const salvos = {};
  for (const [chave, valor] of Object.entries(patch)) salvos[chave] = settingRepository.set(chave, valor);
  return salvos;
}
