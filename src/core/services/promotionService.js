/**
 * Promocoes: manuais (cadastradas por voce) ou vindas do marketplace.
 * Desconto NUNCA e obrigatorio: um produto pode ser divulgado pelo preco normal.
 */
import { promotionRepository, productRepository, alertRepository } from '../repositories/index.js';
import { calculatePricing } from './pricingService.js';
import { couponRepository } from '../repositories/index.js';
import { isExpired, isNotStarted, nowIso } from '../utils/dates.js';
import { round2, percentOff } from '../utils/money.js';
import { notFound, badRequest } from '../utils/errors.js';

export function listPromotions(options = {}) {
  return promotionRepository.findAll(options);
}

export function getPromotion(id) {
  const promo = promotionRepository.findById(id);
  if (!promo) throw notFound('Promocao');
  return promo;
}

/** Junta promocao + produto + cupom e calcula tudo (usado na tela e no post). */
export function expandPromotion(promotion) {
  const product = promotion.product_id ? productRepository.findById(promotion.product_id) : null;
  const coupon = promotion.coupon_id ? couponRepository.findById(promotion.coupon_id) : null;
  const pricing = calculatePricing({ product, promotion, coupon });
  return { ...promotion, produto: product, cupom: coupon, precos: pricing, estado: promotionState(promotion) };
}

export function createPromotion(data) {
  if (!data.nome) throw badRequest('nome e obrigatorio');

  const produto = data.product_id ? productRepository.findById(data.product_id) : null;
  if (data.product_id && !produto) throw notFound('Produto da promocao');

  const precoNormal = numero(data.preco_normal) ?? numero(produto?.preco_anterior) ?? numero(produto?.preco_atual);
  const precoPromo = numero(data.preco_promocional);

  if (precoNormal !== null && precoPromo !== null && precoPromo > precoNormal) {
    throw badRequest('preco_promocional nao pode ser maior que preco_normal');
  }

  return promotionRepository.create({
    status: 'ativa',
    origem: 'manual',
    ...data,
    marketplace: data.marketplace || produto?.marketplace || null,
    categoria: data.categoria || produto?.categoria || null,
    preco_normal: precoNormal,
    preco_promocional: precoPromo,
    desconto_percentual: numero(data.desconto_percentual)
      ?? (precoNormal && precoPromo ? percentOff(precoNormal, precoPromo) : null),
    desconto_valor: numero(data.desconto_valor)
      ?? (precoNormal && precoPromo ? round2(precoNormal - precoPromo) : null),
  });
}

export function updatePromotion(id, patch) {
  getPromotion(id);
  return promotionRepository.update(id, patch);
}

export function deletePromotion(id) {
  getPromotion(id);
  return promotionRepository.remove(id);
}

export function promotionState(promotion, reference = new Date()) {
  if (promotion.status === 'pausada') return 'pausada';
  if (isExpired(promotion.data_fim, reference)) return 'expirada';
  if (isNotStarted(promotion.data_inicio, reference)) return 'programada';
  return 'ativa';
}

/** Promocao valida do produto agora (a mais recente, se houver mais de uma). */
export function activePromotionFor(productId, reference = new Date()) {
  const promos = promotionRepository.list({
    filters: { product_id: productId, status: 'ativa' },
    sort: 'criado_em DESC',
    limit: 20,
  });
  return promos.find((p) => promotionState(p, reference) === 'ativa') || null;
}

/** Worker: expira o que venceu e avisa o que esta perto de vencer. */
export function expirePromotions(reference = new Date()) {
  const ativas = promotionRepository.list({ filters: { status: 'ativa' }, limit: 1000 });
  let expiradas = 0;
  let alertas = 0;

  for (const promo of ativas) {
    if (isExpired(promo.data_fim, reference)) {
      promotionRepository.update(promo.id, { status: 'expirada' });
      expiradas += 1;
      continue;
    }
    if (promo.data_fim) {
      const horas = (new Date(promo.data_fim).getTime() - reference.getTime()) / 3600000;
      if (horas > 0 && horas <= 2) {
        const jaAvisado = alertRepository.findOne({ tipo: 'promocao_expirando', referencia_id: promo.id, lido: 0 });
        if (!jaAvisado) {
          alertRepository.create({
            tipo: 'promocao_expirando',
            titulo: `Promocao "${promo.nome}" expira em ${Math.max(1, Math.round(horas))}h`,
            detalhe: promo.marketplace || '',
            referencia_id: promo.id,
            severidade: 'atencao',
          });
          alertas += 1;
        }
      }
    }
  }
  return { expiradas, alertas, em: nowIso() };
}

export function promotionStats() {
  return {
    total: promotionRepository.count(),
    ativas: promotionRepository.count({ status: 'ativa' }),
    expiradas: promotionRepository.count({ status: 'expirada' }),
    pausadas: promotionRepository.count({ status: 'pausada' }),
    programadas: promotionRepository.count({ status: 'programada' }),
  };
}

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
