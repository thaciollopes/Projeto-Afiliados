/**
 * Credenciais da API de afiliados da Shopee (AppID + Senha) e o que o sistema
 * faz com elas: buscar ofertas e importar direto para a base.
 *
 * TRATAMENTO DE SEGREDO — a Senha e como a do banco:
 *   - fica so no banco local (settings), nunca no .env nem no git;
 *   - a tela recebe apenas se esta configurada e o AppID mascarado.
 */
import { settingRepository } from '../repositories/index.js';
import { buscarOfertas, gerarLinkCurto } from '../../integrations/marketplaces/shopeeApi.js';
import { importProducts } from './productService.js';
import { getMarketplace } from '../../integrations/marketplaces/index.js';
import { badRequest } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const log = logger.child('shopee-api');
const CHAVE = 'shopee_api';

export function credenciaisShopee() {
  const c = settingRepository.get(CHAVE);
  return c?.app_id && c?.senha ? c : null;
}

export function resumoShopeeApi() {
  const c = settingRepository.get(CHAVE);
  if (!c?.app_id) return { configurada: false };
  const id = String(c.app_id);
  return {
    configurada: Boolean(c.senha),
    app_id: id.length > 4 ? `${'•'.repeat(id.length - 4)}${id.slice(-4)}` : id,
    salvo_em: c.salvo_em || null,
    testado_em: c.testado_em || null,
    status: c.status || 'nao_testado',
  };
}

/**
 * Salva e ja testa com uma busca pequena: credencial errada aparece na hora,
 * nao no meio de uma campanha. Senha em branco mantem a que ja estava.
 */
export async function salvarShopeeApi({ app_id: appId, senha } = {}, opcoes = {}) {
  const id = String(appId || '').trim();
  if (!/^\d{5,}$/.test(id)) throw badRequest('AppID invalido: e o numero que aparece em Open API no painel de afiliados.');
  const anterior = settingRepository.get(CHAVE);
  const segredo = String(senha || '').trim() || (anterior?.app_id === id ? anterior?.senha : '');
  if (!segredo) throw badRequest('Informe a Senha (secret) da API.');

  const credenciais = { app_id: id, senha: segredo };
  const teste = await testarShopeeApi(credenciais, opcoes);
  // Recusada nao e gravada: senao a Shopee ficaria "com API" e toda busca falharia.
  if (!teste.ok) return { ...resumoShopeeApi(), teste };
  settingRepository.set(CHAVE, {
    ...credenciais,
    salvo_em: new Date().toISOString(),
    testado_em: new Date().toISOString(),
    status: 'ok',
  });
  return { ...resumoShopeeApi(), teste };
}

export function removerShopeeApi() {
  settingRepository.remove(CHAVE);
  return resumoShopeeApi();
}

export async function testarShopeeApi(credenciais = credenciaisShopee(), opcoes = {}) {
  try {
    const { nodes } = await buscarOfertas(credenciais, { termo: 'perfume', limite: 3 }, opcoes);
    return {
      ok: true,
      encontrados: nodes.length,
      exemplos: nodes.map((n) => ({ titulo: n.productName, preco: n.priceMin ?? n.price, link: n.offerLink })),
    };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/**
 * Busca na API e grava direto na base (o "subir a lista" do Divulga Links,
 * sem arquivo). Serve para o botao da tela e para o n8n agendar todo dia.
 */
export async function importarOfertasShopee({
  termo = '', ordenacao = 'vendas', quantidade = 50, comissao_min: comissaoMin = 0,
} = {}) {
  if (!credenciaisShopee()) throw badRequest('Configure o AppID e a Senha da API da Shopee em LOJAS.');
  const adapter = getMarketplace('shopee');
  const total = Math.min(Math.max(1, Number(quantidade) || 50), 200);

  const achados = [];
  for (let pagina = 1; achados.length < total && pagina <= 10; pagina += 1) {
    const lote = await adapter.search({ termo, ordenacao, limite: 50, pagina });
    achados.push(...lote.filter((p) => !comissaoMin || (p.comissao_percentual ?? 0) >= Number(comissaoMin)));
    if (lote.length < 50) break;
  }

  const produtos = achados.slice(0, total).map(({ comissao_percentual: _c, ...p }) => p);
  const resultado = importProducts(produtos, 'shopee-api');
  log.info(`Shopee API: ${produtos.length} ofertas importadas para "${termo || '(todas)'}"`);
  const { ids: _ids, ...resumo } = resultado;
  return { ...resumo, lidos: produtos.length };
}

/** Link curto pela API (alternativa ao cookie) — sub IDs identificam o grupo. */
export async function linkCurtoPelaApi(url, subIds = []) {
  const credenciais = credenciaisShopee();
  if (!credenciais) throw badRequest('API da Shopee nao configurada.');
  return gerarLinkCurto(credenciais, url, subIds);
}
