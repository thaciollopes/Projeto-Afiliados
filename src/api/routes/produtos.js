import { Router } from 'express';
import { asyncHandler, queryOptions } from '../middleware/index.js';
import {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
  searchMarketplaces, importProducts, refreshProduct, recalculateScores, productStats,
} from '../../core/services/productService.js';
import { queryProducts } from '../../core/services/campaignService.js';
import { couponsForProduct } from '../../core/services/couponService.js';
import { activePromotionFor } from '../../core/services/promotionService.js';
import { calculatePricing } from '../../core/services/pricingService.js';
import { generate } from '../../integrations/ai/index.js';
import { converterProdutos } from '../../core/services/mercadoLivreLinkService.js';
import { cookiesDaSessao } from '../../core/services/sessaoLojaService.js';
import { listMarketplaces } from '../../integrations/marketplaces/index.js';
import { lerProgresso } from '../../core/services/progressoBuscaService.js';

export const produtosRouter = Router();

produtosRouter.get('/', asyncHandler(async (req, res) => {
  const filtros = {};
  for (const campo of ['marketplace', 'categoria', 'subcategoria', 'nicho', 'status', 'disponibilidade', 'origem']) {
    if (req.query[campo]) filtros[campo] = req.query[campo];
  }
  if (req.query.preco_min) filtros.preco_atual = { gte: Number(req.query.preco_min) };
  if (req.query.preco_max) {
    filtros.preco_atual = { ...(filtros.preco_atual || {}), lte: Number(req.query.preco_max) };
  }
  if (req.query.desconto_min) filtros.desconto_percentual = { gte: Number(req.query.desconto_min) };
  if (req.query.avaliacao_min) filtros.avaliacao = { gte: Number(req.query.avaliacao_min) };

  res.json(listProducts(queryOptions(req, filtros)));
}));

produtosRouter.get('/estatisticas', asyncHandler(async (_req, res) => {
  res.json(productStats());
}));

produtosRouter.get('/marketplaces', asyncHandler(async (_req, res) => {
  res.json(listMarketplaces());
}));

/** Filtro avancado (mesma engine que as campanhas usam). */
produtosRouter.post('/filtrar', asyncHandler(async (req, res) => {
  const limite = Math.min(Number(req.body.limite) || 50, 500);
  res.json({ rows: queryProducts(req.body.filtros || req.body, limite) });
}));

/** Andamento de uma busca em curso (barra de progresso da tela). */
produtosRouter.get('/buscar/progresso/:id', asyncHandler(async (req, res) => {
  res.json(lerProgresso(req.params.id) || { etapa: 'desconhecida', fim: false });
}));

/** Busca nos marketplaces (nao grava nada). */
produtosRouter.post('/buscar', asyncHandler(async (req, res) => {
  res.json(await searchMarketplaces(req.body || {}));
}));

/** Grava os produtos escolhidos na busca. */
produtosRouter.post('/importar', asyncHandler(async (req, res) => {
  const produtos = req.body.produtos || [];
  const resultado = importProducts(produtos, req.body.origem || 'busca');

  // Produto do ML entra ja com link de afiliado, se houver sessao salva.
  // Falha aqui nao desfaz a importacao: o produto fica com o aviso de comissao.
  let conversao = null;
  const temMl = produtos.some((p) => String(p.marketplace || '').startsWith('mercadolivre'));
  if (temMl && cookiesDaSessao('mercadolivre')?.length) {
    conversao = await converterProdutos().catch((e) => ({ erro: e.message }));
  }
  res.status(201).json({ ...resultado, conversao_ml: conversao });
}));

produtosRouter.post('/recalcular-score', asyncHandler(async (_req, res) => {
  res.json(recalculateScores());
}));

produtosRouter.get('/:id', asyncHandler(async (req, res) => {
  const produto = getProduct(req.params.id);
  const promocao = activePromotionFor(produto.id);
  const cupons = couponsForProduct(produto);
  const precos = calculatePricing({ product: produto, promotion: promocao, coupon: cupons[0]?.cupom || null });
  res.json({ ...produto, promocao, cupons, precos });
}));

produtosRouter.post('/', asyncHandler(async (req, res) => {
  res.status(201).json(createProduct(req.body));
}));

produtosRouter.put('/:id', asyncHandler(async (req, res) => {
  res.json(updateProduct(req.params.id, req.body));
}));

produtosRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ removido: deleteProduct(req.params.id) });
}));

produtosRouter.post('/:id/atualizar', asyncHandler(async (req, res) => {
  res.json(await refreshProduct(req.params.id));
}));

/** MELHORAR COM IA: devolve o texto sugerido; quem salva e o usuario. */
produtosRouter.post('/:id/melhorar-ia', asyncHandler(async (req, res) => {
  const produto = getProduct(req.params.id);
  const promocao = activePromotionFor(produto.id);
  const precos = calculatePricing({ product: produto, promotion: promocao });
  const resultado = await generate({
    tarefa: req.body.tarefa || 'titulo',
    product: produto,
    pricing: precos,
    instrucao: req.body.instrucao || '',
    texto: req.body.texto || '',
  });
  res.json({
    ...resultado,
    original: req.body.tarefa === 'descricao' ? produto.descricao_original : produto.titulo_original,
    sugestao: resultado.texto,
  });
}));
