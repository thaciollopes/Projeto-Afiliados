/**
 * Progresso das buscas nas lojas, para a barra da tela "Procurar produtos".
 *
 * A busca do Mercado Livre lê várias páginas (~20 s sem cache). Em vez de
 * streaming, a tela manda um `busca_id` junto e pergunta o andamento a cada
 * meio segundo — simples e funciona atrás de qualquer proxy.
 */
const buscas = new Map();
const VALIDADE_MS = 5 * 60000;

export function iniciarProgresso(id) {
  if (!id) return null;
  limparVelhas();
  const estado = { etapa: 'iniciando', pagina: 0, total_paginas: 0, lidos: 0, achados: 0, fim: false, em: Date.now() };
  buscas.set(String(id), estado);
  return (parcial) => Object.assign(estado, parcial, { em: Date.now() });
}

export function lerProgresso(id) {
  return buscas.get(String(id)) || null;
}

export function concluirProgresso(id) {
  const estado = buscas.get(String(id));
  if (estado) Object.assign(estado, { etapa: 'pronto', fim: true, em: Date.now() });
}

function limparVelhas() {
  const agora = Date.now();
  for (const [id, estado] of buscas) {
    if (agora - estado.em > VALIDADE_MS) buscas.delete(id);
  }
}
