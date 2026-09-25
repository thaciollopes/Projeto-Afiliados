/**
 * Rotas de cadastro simples: categorias, cupons, promocoes, templates,
 * afiliados e pesquisas salvas.
 */
import { Router } from 'express';
import { asyncHandler, queryOptions } from '../middleware/index.js';
import {
  categoryRepository, templateRepository, affiliateRepository, savedSearchRepository,
} from '../../core/repositories/index.js';
import {
  listCoupons, getCoupon, createCoupon, updateCoupon, deleteCoupon, couponReach, couponState,
} from '../../core/services/couponService.js';
import {
  listPromotions, getPromotion, createPromotion, updatePromotion, deletePromotion, expandPromotion,
} from '../../core/services/promotionService.js';
import { renderTemplate, buildContext, VARIAVEIS_DISPONIVEIS } from '../../core/services/templateService.js';
import { calculatePricing } from '../../core/services/pricingService.js';
import { productRepository, couponRepository } from '../../core/repositories/index.js';
import { getMarketplace, listMarketplaces } from '../../integrations/marketplaces/index.js';
import { slugify } from '../../core/utils/id.js';
import { mask } from '../../config/index.js';
import { previewLink, reaplicarEmTodos } from '../../core/services/affiliateLinkService.js';
import { notFound, badRequest } from '../../core/utils/errors.js';
import { nowIso } from '../../core/utils/dates.js';

// ------------------------------------------------------------ categorias --

export const categoriasRouter = Router();

categoriasRouter.get('/', asyncHandler(async (req, res) => {
  res.json(categoryRepository.findAll(queryOptions(req)));
}));

categoriasRouter.post('/', asyncHandler(async (req, res) => {
  if (!req.body.nome) throw badRequest('nome e obrigatorio');
  res.status(201).json(categoryRepository.create({
    ativo: true, ...req.body, slug: req.body.slug || slugify(req.body.nome),
  }));
}));

categoriasRouter.put('/:id', asyncHandler(async (req, res) => {
  if (!categoryRepository.findById(req.params.id)) throw notFound('Categoria');
  res.json(categoryRepository.update(req.params.id, req.body));
}));

categoriasRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ removido: categoryRepository.remove(req.params.id) });
}));

// ---------------------------------------------------------------- cupons --

export const cuponsRouter = Router();

cuponsRouter.get('/', asyncHandler(async (req, res) => {
  const filtros = {};
  for (const campo of ['status', 'marketplace', 'tipo', 'origem']) {
    if (req.query[campo]) filtros[campo] = req.query[campo];
  }
  const resultado = listCoupons(queryOptions(req, filtros));
  resultado.rows = resultado.rows.map((c) => ({ ...c, estado: couponState(c) }));
  res.json(resultado);
}));

cuponsRouter.get('/:id', asyncHandler(async (req, res) => {
  const cupom = getCoupon(req.params.id);
  res.json({ ...cupom, estado: couponState(cupom) });
}));

cuponsRouter.get('/:id/alcance', asyncHandler(async (req, res) => {
  res.json(couponReach(req.params.id));
}));

cuponsRouter.post('/', asyncHandler(async (req, res) => {
  res.status(201).json(createCoupon(req.body));
}));

cuponsRouter.put('/:id', asyncHandler(async (req, res) => {
  res.json(updateCoupon(req.params.id, req.body));
}));

cuponsRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ removido: deleteCoupon(req.params.id) });
}));

// ------------------------------------------------------------- promocoes --

export const promocoesRouter = Router();

promocoesRouter.get('/', asyncHandler(async (req, res) => {
  const filtros = {};
  for (const campo of ['status', 'marketplace', 'categoria', 'product_id']) {
    if (req.query[campo]) filtros[campo] = req.query[campo];
  }
  const resultado = listPromotions(queryOptions(req, filtros));
  resultado.rows = resultado.rows.map(expandPromotion);
  res.json(resultado);
}));

promocoesRouter.get('/:id', asyncHandler(async (req, res) => {
  res.json(expandPromotion(getPromotion(req.params.id)));
}));

promocoesRouter.post('/', asyncHandler(async (req, res) => {
  res.status(201).json(expandPromotion(createPromotion(req.body)));
}));

promocoesRouter.put('/:id', asyncHandler(async (req, res) => {
  res.json(expandPromotion(updatePromotion(req.params.id, req.body)));
}));

promocoesRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ removido: deletePromotion(req.params.id) });
}));

// ------------------------------------------------------------- templates --

export const templatesRouter = Router();

templatesRouter.get('/variaveis', asyncHandler(async (_req, res) => {
  res.json(VARIAVEIS_DISPONIVEIS);
}));

templatesRouter.get('/', asyncHandler(async (req, res) => {
  res.json(templateRepository.findAll(queryOptions(req)));
}));

templatesRouter.get('/:id', asyncHandler(async (req, res) => {
  const template = templateRepository.findById(req.params.id);
  if (!template) throw notFound('Template');
  res.json(template);
}));

templatesRouter.post('/', asyncHandler(async (req, res) => {
  if (!req.body.nome || !req.body.corpo) throw badRequest('nome e corpo sao obrigatorios');
  if (req.body.padrao) desmarcarPadrao();
  res.status(201).json(templateRepository.create({ ativo: true, ...req.body }));
}));

templatesRouter.put('/:id', asyncHandler(async (req, res) => {
  if (!templateRepository.findById(req.params.id)) throw notFound('Template');
  if (req.body.padrao) desmarcarPadrao();
  res.json(templateRepository.update(req.params.id, req.body));
}));

templatesRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ removido: templateRepository.remove(req.params.id) });
}));

/** Preview ao vivo do editor de post. */
templatesRouter.post('/preview', asyncHandler(async (req, res) => {
  const { corpo, product_id, coupon_id } = req.body;
  if (!corpo) throw badRequest('corpo e obrigatorio');

  const produto = product_id
    ? productRepository.findById(product_id)
    : productRepository.findAll({ limit: 1 }).rows[0];

  if (!produto) {
    return res.json({ mensagem: renderTemplate(corpo, exemploContexto()), exemplo: true });
  }

  const cupom = coupon_id ? couponRepository.findById(coupon_id) : null;
  const precos = calculatePricing({ product: produto, coupon: cupom });
  const contexto = buildContext({ product: produto, pricing: precos, coupon: cupom });
  res.json({ mensagem: renderTemplate(corpo, contexto), contexto, precos, produto: produto.titulo_original });
}));

function desmarcarPadrao() {
  for (const t of templateRepository.list({ filters: { padrao: 1 }, limit: 50 })) {
    templateRepository.update(t.id, { padrao: false });
  }
}

function exemploContexto() {
  return {
    titulo: 'Perfume Feminino Floral 100ml', descricao: 'Exemplo de descricao.',
    preco: 'R$ 199,90', preco_anterior: 'R$ 199,90', preco_promocional: 'R$ 159,90',
    preco_final: 'R$ 139,90', desconto: '30%', desconto_valor: 'R$ 60,00',
    cupom: 'EXEMPLO20', desconto_cupom: 'R$ 20,00', avaliacao: '4.8', vendas: '1200',
    link: 'https://exemplo.com/produto', imagem: '', marketplace: 'Amazon',
    categoria: 'Perfumaria', validade: '31/12/2026 23:59', frete: 'Frete gratis',
  };
}

// ------------------------------------------------------------- afiliados --

export const afiliadosRouter = Router();

/** Nunca devolve segredo inteiro para o navegador. */
function sanitizarAfiliado(programa) {
  return { ...programa, identificador: programa.identificador ? mask(programa.identificador) : '' };
}

afiliadosRouter.get('/', asyncHandler(async (req, res) => {
  const resultado = affiliateRepository.findAll(queryOptions(req));
  resultado.rows = resultado.rows.map(sanitizarAfiliado);
  res.json(resultado);
}));

afiliadosRouter.get('/marketplaces', asyncHandler(async (_req, res) => {
  res.json(listMarketplaces());
}));

afiliadosRouter.post('/', asyncHandler(async (req, res) => {
  if (!req.body.nome || !req.body.marketplace) throw badRequest('nome e marketplace sao obrigatorios');
  res.status(201).json(sanitizarAfiliado(affiliateRepository.create({ ativo: true, ...req.body })));
}));

afiliadosRouter.put('/:id', asyncHandler(async (req, res) => {
  if (!affiliateRepository.findById(req.params.id)) throw notFound('Programa de afiliado');
  res.json(sanitizarAfiliado(affiliateRepository.update(req.params.id, req.body)));
}));

afiliadosRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ removido: affiliateRepository.remove(req.params.id) });
}));

/** Mostra como o link fica com a sua etiqueta, sem gravar nada. */
afiliadosRouter.post('/testar-link', asyncHandler(async (req, res) => {
  if (!req.body?.url) throw badRequest('Informe uma URL de produto para testar');
  res.json(previewLink(req.body.marketplace || '', req.body.url));
}));

/** Reaplica a etiqueta em todos os produtos ja cadastrados. */
afiliadosRouter.post('/reaplicar-links', asyncHandler(async (_req, res) => {
  res.json(reaplicarEmTodos(productRepository));
}));

afiliadosRouter.post('/:id/testar', asyncHandler(async (req, res) => {
  const programa = affiliateRepository.findById(req.params.id);
  if (!programa) throw notFound('Programa de afiliado');

  const adapter = getMarketplace(programa.marketplace);
  const status = adapter ? await adapter.status() : { online: false, motivo: 'Marketplace desconhecido' };

  affiliateRepository.update(programa.id, {
    status_conexao: status.implementado ? 'ok' : 'pendente',
    testado_em: nowIso(),
  });
  res.json({ ...status, testado_em: nowIso() });
}));

// -------------------------------------------------------------- pesquisas --

export const pesquisasRouter = Router();

pesquisasRouter.get('/', asyncHandler(async (req, res) => {
  res.json(savedSearchRepository.findAll(queryOptions(req)));
}));

pesquisasRouter.post('/', asyncHandler(async (req, res) => {
  if (!req.body.nome) throw badRequest('nome e obrigatorio');
  res.status(201).json(savedSearchRepository.create({ filtros: {}, quantidade: 20, ...req.body }));
}));

pesquisasRouter.put('/:id', asyncHandler(async (req, res) => {
  if (!savedSearchRepository.findById(req.params.id)) throw notFound('Pesquisa');
  res.json(savedSearchRepository.update(req.params.id, req.body));
}));

pesquisasRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ removido: savedSearchRepository.remove(req.params.id) });
}));
