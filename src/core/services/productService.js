/**
 * Produtos: cadastro, importacao de marketplace, score, preco e limpeza.
 */
import {
  productRepository, priceHistoryRepository, alertRepository, settingRepository,
} from '../repositories/index.js';
import { calculateScore, DEFAULT_SCORE_WEIGHTS } from './pricingService.js';
import { searchAll, getMarketplace } from '../../integrations/marketplaces/index.js';
import { buildAffiliateUrl } from './affiliateLinkService.js';
import { iniciarProgresso, concluirProgresso } from './progressoBuscaService.js';
import { percentOff, round2 } from '../utils/money.js';
import { nowIso, daysAgoIso } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { notFound, badRequest } from '../utils/errors.js';

const log = logger.child('produtos');

export function scoreWeights() {
  return { ...DEFAULT_SCORE_WEIGHTS, ...(settingRepository.get('score_weights') || {}) };
}

/** Preenche desconto e score a partir dos precos; usado em todo create/update. */
export function derive(product) {
  const atual = Number(product.preco_atual);
  const anterior = Number(product.preco_anterior);
  const out = { ...product };

  if (Number.isFinite(atual) && Number.isFinite(anterior) && anterior > atual) {
    out.desconto_percentual = percentOff(anterior, atual);
    out.desconto_valor = round2(anterior - atual);
  } else {
    out.desconto_percentual = 0;
    out.desconto_valor = 0;
  }

  // A etiqueta de afiliado entra aqui: vale para produto vindo de API, de
  // navegacao, do painel, de planilha ou cadastrado na mao.
  const link = buildAffiliateUrl(out);
  if (link.aplicado && link.url) out.url_afiliado = link.url;
  out.url_final = out.url_afiliado || out.url_original || null;

  out.score = calculateScore(out, scoreWeights());
  return out;
}

export function listProducts(options = {}) {
  return productRepository.findAll(options);
}

export function getProduct(id) {
  const produto = productRepository.findById(id);
  if (!produto) throw notFound('Produto');
  return produto;
}

export function createProduct(data) {
  if (!data.titulo_original) throw badRequest('titulo_original e obrigatorio');
  if (!data.marketplace) throw badRequest('marketplace e obrigatorio');
  const produto = derive({
    data_coleta: nowIso(),
    data_atualizacao: nowIso(),
    status: 'ativo',
    origem: 'manual',
    ...data,
  });
  return productRepository.create(produto);
}

export function updateProduct(id, patch) {
  const atual = getProduct(id);
  const mudouPreco = patch.preco_atual !== undefined && Number(patch.preco_atual) !== Number(atual.preco_atual);

  if (mudouPreco) registrarMudancaPreco(atual, Number(patch.preco_atual), 'edicao_manual');

  const produto = derive({ ...atual, ...patch, data_atualizacao: nowIso() });
  return productRepository.update(id, produto);
}

export function deleteProduct(id) {
  getProduct(id);
  return productRepository.remove(id);
}

function registrarMudancaPreco(produto, precoNovo, origem) {
  const anterior = Number(produto.preco_atual);
  if (!Number.isFinite(anterior) || !Number.isFinite(precoNovo)) return;

  const variacao = anterior > 0 ? round2(((precoNovo - anterior) / anterior) * 100) : 0;
  priceHistoryRepository.create({
    product_id: produto.id,
    preco_anterior: anterior,
    preco_novo: precoNovo,
    variacao,
    origem,
  });

  if (Math.abs(variacao) >= 10) {
    alertRepository.create({
      tipo: 'preco_mudou',
      titulo: `Preco mudou ${variacao > 0 ? '+' : ''}${variacao}%`,
      detalhe: `${produto.titulo_original}: de ${anterior} para ${precoNovo}`,
      referencia_id: produto.id,
      severidade: variacao > 0 ? 'alerta' : 'info',
    });
  }
}

/**
 * Busca em marketplaces (sem gravar nada).
 * @returns {Promise<{produtos:object[], erros:object[]}>}
 */
export async function searchMarketplaces(filtros = {}) {
  const nomes = filtros.marketplaces?.length ? filtros.marketplaces : null;
  const aoProgredir = iniciarProgresso(filtros.busca_id);
  let resultado;
  try {
    resultado = await searchAll(nomes, { ...filtros, aoProgredir });
  } finally {
    concluirProgresso(filtros.busca_id);
  }
  const { produtos, erros } = resultado;

  const enriquecidos = produtos.map((p) => {
    const derivado = derive({ ...p, data_coleta: nowIso() });
    const existente = p.external_id
      ? productRepository.findOne({ marketplace: p.marketplace, external_id: p.external_id })
      : null;
    return { ...derivado, ja_cadastrado: Boolean(existente), id_cadastrado: existente?.id || null };
  });

  return { produtos: enriquecidos, erros };
}

/** Grava os produtos encontrados (upsert por marketplace+external_id). */
export function importProducts(produtos = [], origem = 'busca') {
  let criados = 0;
  let atualizados = 0;

  for (const bruto of produtos) {
    if (!bruto?.titulo_original || !bruto?.marketplace) continue;

    const existente = bruto.external_id
      ? productRepository.findOne({ marketplace: bruto.marketplace, external_id: bruto.external_id })
      : null;

    if (existente && Number(bruto.preco_atual) !== Number(existente.preco_atual)) {
      registrarMudancaPreco(existente, Number(bruto.preco_atual), origem);
    }

    const dados = derive({
      ...bruto,
      data_atualizacao: nowIso(),
      data_coleta: existente?.data_coleta || bruto.data_coleta || nowIso(),
      origem,
      status: existente?.status || 'ativo',
    });
    delete dados.ja_cadastrado;
    delete dados.id_cadastrado;
    delete dados.id;

    const { created } = productRepository.upsertBy(
      { marketplace: dados.marketplace, external_id: dados.external_id },
      dados,
    );
    if (created) criados += 1; else atualizados += 1;
  }

  log.info(`Importacao concluida: ${criados} novos, ${atualizados} atualizados`, { origem });
  return { criados, atualizados, total: criados + atualizados };
}

/** Recoleta o produto no marketplace de origem e atualiza preco/disponibilidade. */
export async function refreshProduct(id) {
  const produto = getProduct(id);
  const adapter = getMarketplace(produto.marketplace);
  if (!adapter || !adapter.implementado) {
    throw badRequest(`${produto.marketplace} nao deixa atualizar automaticamente; atualize pela extensao ou manualmente.`);
  }

  const atualizado = await adapter.getProduct(produto.external_id);
  if (!atualizado) {
    productRepository.update(id, { disponibilidade: 'indisponivel', data_atualizacao: nowIso() });
    return { atualizado: false, motivo: 'produto_nao_encontrado' };
  }

  if (Number(atualizado.preco_atual) !== Number(produto.preco_atual)) {
    registrarMudancaPreco(produto, Number(atualizado.preco_atual), 'refresh');
  }

  const dados = derive({ ...produto, ...atualizado, data_atualizacao: nowIso() });
  return { atualizado: true, produto: productRepository.update(id, dados) };
}

/** Recalcula o score de todos (usado quando os pesos mudam). */
export function recalculateScores() {
  const pesos = scoreWeights();
  const todos = productRepository.list({ limit: 1000 });
  for (const produto of todos) {
    productRepository.update(produto.id, { score: calculateScore(produto, pesos) });
  }
  return { total: todos.length };
}

export function productStats() {
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    total: productRepository.count(),
    ativos: productRepository.count({ status: 'ativo' }),
    pausados: productRepository.count({ status: 'pausado' }),
    expirados: productRepository.count({ status: 'expirado' }),
    indisponiveis: productRepository.count({ disponibilidade: 'indisponivel' }),
    coletados_hoje: productRepository.count({ data_coleta: { gte: `${hoje}T00:00:00.000Z` } }),
    nunca_publicados: productRepository.count({ data_ultima_publicacao: null }),
  };
}

/** Marca como expirado o que ficou parado tempo demais sem atualizacao. */
export function expireStaleProducts(dias = 30) {
  const limite = daysAgoIso(dias);
  const antigos = productRepository.list({
    filters: { status: 'ativo', data_atualizacao: { lt: limite } },
    limit: 1000,
  });
  for (const produto of antigos) {
    productRepository.update(produto.id, { status: 'expirado' });
  }
  return { expirados: antigos.length, dias };
}
