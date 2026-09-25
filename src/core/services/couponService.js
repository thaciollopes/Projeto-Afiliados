/**
 * Cupons proprios e de marketplace: cadastro, validacao e expiracao automatica.
 */
import { couponRepository, alertRepository, productRepository } from '../repositories/index.js';
import { validateCoupon, couponDiscount } from './pricingService.js';
import { isExpired, isNotStarted, nowIso } from '../utils/dates.js';
import { notFound, badRequest } from '../utils/errors.js';

const TIPOS = ['percentual', 'valor_fixo', 'frete_gratis', 'outro'];

export function listCoupons(options = {}) {
  return couponRepository.findAll(options);
}

export function getCoupon(id) {
  const cupom = couponRepository.findById(id);
  if (!cupom) throw notFound('Cupom');
  return cupom;
}

export function createCoupon(data) {
  if (!data.codigo) throw badRequest('codigo e obrigatorio');
  if (data.tipo && !TIPOS.includes(data.tipo)) throw badRequest(`tipo deve ser um de: ${TIPOS.join(', ')}`);
  if (['percentual', 'valor_fixo'].includes(data.tipo || 'percentual') && !data.valor_desconto) {
    throw badRequest('valor_desconto e obrigatorio para cupom percentual ou de valor fixo');
  }
  return couponRepository.create({
    status: 'ativo',
    origem: 'proprio',
    tipo: 'percentual',
    usos: 0,
    produtos_aplicaveis: [],
    categorias_aplicaveis: [],
    ...data,
    codigo: String(data.codigo).trim().toUpperCase(),
  });
}

export function updateCoupon(id, patch) {
  getCoupon(id);
  const dados = { ...patch };
  if (dados.codigo) dados.codigo = String(dados.codigo).trim().toUpperCase();
  return couponRepository.update(id, dados);
}

export function deleteCoupon(id) {
  getCoupon(id);
  return couponRepository.remove(id);
}

/** Estado real do cupom agora (independente do campo status gravado). */
export function couponState(cupom, reference = new Date()) {
  if (cupom.status === 'pausado') return 'pausada';
  if (isExpired(cupom.data_fim, reference)) return 'expirado';
  if (isNotStarted(cupom.data_inicio, reference)) return 'programado';
  if (cupom.limite_uso && Number(cupom.usos || 0) >= Number(cupom.limite_uso)) return 'esgotado';
  return 'ativo';
}

/** Cupons validos para um produto, do melhor desconto para o pior. */
export function couponsForProduct(product, reference = new Date()) {
  const candidatos = couponRepository.list({ filters: { status: 'ativo' }, limit: 500 });
  const precoBase = Number(product.preco_atual);

  return candidatos
    .map((cupom) => {
      const check = validateCoupon(cupom, { product, precoBase, reference });
      return { cupom, valido: check.valido, motivo: check.motivo, desconto: check.valido ? couponDiscount(cupom, precoBase) : 0 };
    })
    .filter((c) => c.valido)
    .sort((a, b) => b.desconto - a.desconto);
}

/** Melhor cupom aplicavel (usado pelas campanhas de cupom). */
export function bestCouponFor(product, reference = new Date()) {
  return couponsForProduct(product, reference)[0]?.cupom || null;
}

export function registerUse(id) {
  const cupom = getCoupon(id);
  return couponRepository.update(id, { usos: Number(cupom.usos || 0) + 1 });
}

/** Roda no worker: marca expirados e abre alerta de "expira hoje". */
export function expireCoupons(reference = new Date()) {
  const ativos = couponRepository.list({ filters: { status: 'ativo' }, limit: 1000 });
  let expirados = 0;
  let alertas = 0;

  for (const cupom of ativos) {
    if (isExpired(cupom.data_fim, reference)) {
      couponRepository.update(cupom.id, { status: 'expirado' });
      alertRepository.create({
        tipo: 'cupom_expirado',
        titulo: `Cupom ${cupom.codigo} expirou`,
        detalhe: `Valido ate ${cupom.data_fim}`,
        referencia_id: cupom.id,
        severidade: 'alerta',
      });
      expirados += 1;
      continue;
    }

    if (cupom.data_fim) {
      const horas = (new Date(cupom.data_fim).getTime() - reference.getTime()) / 3600000;
      if (horas > 0 && horas <= 24) {
        const jaAvisado = alertRepository.findOne({ tipo: 'cupom_expirando', referencia_id: cupom.id, lido: 0 });
        if (!jaAvisado) {
          alertRepository.create({
            tipo: 'cupom_expirando',
            titulo: `Cupom ${cupom.codigo} expira em ${Math.round(horas)}h`,
            detalhe: cupom.nome || '',
            referencia_id: cupom.id,
            severidade: 'atencao',
          });
          alertas += 1;
        }
      }
    }
  }

  return { expirados, alertas, em: nowIso() };
}

export function couponStats() {
  return {
    total: couponRepository.count(),
    ativos: couponRepository.count({ status: 'ativo' }),
    expirados: couponRepository.count({ status: 'expirado' }),
    pausados: couponRepository.count({ status: 'pausado' }),
  };
}

/** Quantos produtos cadastrados casam com as regras deste cupom. */
export function couponReach(id) {
  const cupom = getCoupon(id);
  const produtos = productRepository.list({ filters: { status: 'ativo' }, limit: 1000 });
  const validos = produtos.filter((p) => validateCoupon(cupom, { product: p, precoBase: Number(p.preco_atual) }).valido);
  return { total: produtos.length, aplicaveis: validos.length, produtos: validos.slice(0, 50) };
}
