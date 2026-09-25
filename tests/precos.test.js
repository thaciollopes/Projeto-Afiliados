/**
 * O que estes testes protegem: o preço que vai para o grupo.
 * Se algum deles quebrar, alguém publica valor errado — é o pior bug possível aqui.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePricing, validateCoupon, couponDiscount, calculateScore,
} from '../src/core/services/pricingService.js';

const emDias = (d) => new Date(Date.now() + d * 86400000).toISOString();

const produto = {
  id: 'prd_1', marketplace: 'demo', categoria: 'Perfumaria',
  preco_atual: 159.9, preco_anterior: 199.9, moeda: 'BRL',
};

test('cascata completa: de 199,90 -> promo 159,90 -> cupom R$20 -> final 139,90', () => {
  const promocao = { preco_normal: 199.9, preco_promocional: 159.9, status: 'ativa', data_fim: emDias(5) };
  const cupom = {
    codigo: 'PERFUME20', tipo: 'valor_fixo', valor_desconto: 20, valor_minimo: 100,
    status: 'ativo', data_fim: emDias(10), categorias_aplicaveis: ['Perfumaria'], produtos_aplicaveis: [],
  };

  const r = calculatePricing({ product: produto, promotion: promocao, coupon: cupom });

  assert.equal(r.preco_normal, 199.9);
  assert.equal(r.preco_promocional, 159.9);
  assert.equal(r.desconto_cupom, 20);
  assert.equal(r.preco_final, 139.9);
  assert.equal(r.desconto_percentual, 30);
  assert.equal(r.tem_cupom, true);
  assert.equal(r.valido, true);
});

test('produto sem promoção e sem cupom mostra só o preço atual', () => {
  const r = calculatePricing({ product: { preco_atual: 49.9 } });

  assert.equal(r.preco_final, 49.9);
  assert.equal(r.preco_normal, null);
  assert.equal(r.desconto_percentual, null);
  assert.equal(r.tem_desconto, false);
  assert.equal(r.tem_cupom, false);
});

test('cupom expirado não entra na conta e vira motivo registrado', () => {
  const cupom = { codigo: 'VELHO', tipo: 'percentual', valor_desconto: 50, status: 'ativo', data_fim: emDias(-1) };
  const r = calculatePricing({ product: produto, coupon: cupom });

  assert.equal(r.tem_cupom, false);
  assert.equal(r.desconto_cupom, null);
  assert.equal(r.preco_final, 159.9);
  assert.ok(r.motivos.includes('cupom_expirado'));
});

test('promoção vencida não é usada como preço', () => {
  const promocao = { preco_normal: 199.9, preco_promocional: 99.9, status: 'ativa', data_fim: emDias(-2) };
  const r = calculatePricing({ product: produto, promotion: promocao });

  assert.ok(r.motivos.includes('promocao_expirada'));
  assert.equal(r.tem_promocao, false);
});

test('cupom percentual respeita o teto de desconto', () => {
  const cupom = { tipo: 'percentual', valor_desconto: 50, desconto_maximo: 30 };
  assert.equal(couponDiscount(cupom, 200), 30);
});

test('cupom de valor fixo nunca deixa o preço negativo', () => {
  const cupom = { tipo: 'valor_fixo', valor_desconto: 500 };
  const r = calculatePricing({ product: { preco_atual: 100 }, coupon: { ...cupom, status: 'ativo' } });
  assert.equal(r.preco_final, 0);
});

test('frete grátis não muda o preço, só liga a flag', () => {
  const cupom = { codigo: 'FRETE', tipo: 'frete_gratis', status: 'ativo' };
  const r = calculatePricing({ product: { preco_atual: 80 }, coupon: cupom });

  assert.equal(r.preco_final, 80);
  assert.equal(r.frete_gratis, true);
});

test('compra mínima bloqueia o cupom', () => {
  const cupom = { tipo: 'valor_fixo', valor_desconto: 30, valor_minimo: 150, status: 'ativo' };
  const check = validateCoupon(cupom, { precoBase: 100 });

  assert.equal(check.valido, false);
  assert.equal(check.motivo, 'valor_minimo_nao_atingido');
});

test('cupom de outra categoria não é aplicado', () => {
  const cupom = { tipo: 'percentual', valor_desconto: 10, status: 'ativo', categorias_aplicaveis: ['Eletronicos'] };
  const check = validateCoupon(cupom, { product: produto, precoBase: 159.9 });

  assert.equal(check.valido, false);
  assert.equal(check.motivo, 'categoria_fora_do_cupom');
});

test('cupom restrito a produtos específicos só vale para eles', () => {
  const cupom = { tipo: 'valor_fixo', valor_desconto: 10, status: 'ativo', produtos_aplicaveis: ['prd_999'] };
  assert.equal(validateCoupon(cupom, { product: produto }).valido, false);
  assert.equal(validateCoupon(cupom, { product: { ...produto, id: 'prd_999' } }).valido, true);
});

test('cupom esgotado não entra', () => {
  const cupom = { tipo: 'valor_fixo', valor_desconto: 10, status: 'ativo', limite_uso: 5, usos: 5 };
  assert.equal(validateCoupon(cupom).motivo, 'cupom_esgotado');
});

test('produto sem preço é marcado como inválido (nunca publica)', () => {
  const r = calculatePricing({ product: { titulo_original: 'sem preço' } });

  assert.equal(r.valido, false);
  assert.ok(r.motivos.includes('sem_preco'));
});

test('preço "de" menor que o "por" não vira desconto falso', () => {
  const r = calculatePricing({ product: { preco_atual: 100, preco_anterior: 90 } });

  assert.equal(r.preco_normal, null);
  assert.equal(r.tem_desconto, false);
});

test('score fica entre 0 e 100 e premia venda + desconto', () => {
  const fraco = calculateScore({ quantidade_vendas: 0, avaliacao: 1, desconto_percentual: 0, preco_atual: 490 });
  const forte = calculateScore({ quantidade_vendas: 2000, avaliacao: 5, desconto_percentual: 60, preco_atual: 50, data_coleta: new Date().toISOString() });

  assert.ok(forte > fraco);
  assert.ok(forte <= 100 && fraco >= 0);
});
