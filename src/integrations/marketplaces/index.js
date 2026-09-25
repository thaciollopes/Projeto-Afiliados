/**
 * Registro de lojas. Uma entrada por loja do catálogo (`lojas.js`) — sem API
 * oficial, sem loja de demonstração. Loja que não deixa buscar se declara
 * `implementado: false` e a tela explica como os produtos entram nela.
 */
import { LojaAdapter } from './cookie.js';
import { listaDeLojas } from './lojas.js';

const adapters = new Map();

for (const loja of listaDeLojas()) {
  adapters.set(loja.id, new LojaAdapter(loja));
}

export function getMarketplace(nome) {
  return adapters.get(String(nome || '').toLowerCase()) || null;
}

export function listMarketplaces() {
  return [...adapters.values()].map((a) => ({
    nome: a.nome,
    rotulo: a.rotulo,
    implementado: a.implementado,
    motivo: a.motivo,
    docs: a.docs,
    categorias: a.loja.categorias || null,
  }));
}

export async function marketplacesStatus() {
  return Promise.all([...adapters.values()].map((a) => a.status()));
}

/** Busca nas lojas pedidas (ou em todas que buscam); erro em uma não derruba as outras. */
export async function searchAll(nomes, filtros) {
  const pedidos = nomes?.length ? nomes : [...adapters.values()].filter((a) => a.implementado).map((a) => a.nome);
  const alvos = pedidos.map((n) => getMarketplace(n)).filter(Boolean);
  const resultados = await Promise.allSettled(alvos.map((a) => a.search(filtros)));
  const produtos = [];
  const erros = [];
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') produtos.push(...r.value);
    else erros.push({ marketplace: alvos[i].nome, erro: r.reason?.message || String(r.reason) });
  });
  return { produtos, erros };
}
