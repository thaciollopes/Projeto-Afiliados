/**
 * Motor de precos: produto + promocao + cupom -> preco final.
 *
 * Regra de ouro: aqui nada e inventado. Se o dado nao existe, o campo volta
 * null e o template simplesmente nao mostra aquela linha. A IA nunca toca
 * nestes numeros (ver integrations/ai/guards.js).
 *
 * Cascata:
 *   preco_normal (de)  ->  preco_promocional (por)  ->  cupom  ->  preco_final
 */
import { round2, percentOff } from '../utils/money.js';
import { isExpired, isNotStarted } from '../utils/dates.js';

/** Um cupom so entra na conta se passar por todas estas checagens. */
export function validateCoupon(coupon, { product = null, precoBase = null, reference = new Date() } = {}) {
  if (!coupon) return { valido: false, motivo: 'sem_cupom' };
  if (coupon.status === 'pausado') return { valido: false, motivo: 'cupom_pausado' };
  if (coupon.status === 'expirado') return { valido: false, motivo: 'cupom_expirado' };
  if (isNotStarted(coupon.data_inicio, reference)) return { valido: false, motivo: 'cupom_nao_comecou' };
  if (isExpired(coupon.data_fim, reference)) return { valido: false, motivo: 'cupom_expirado' };

  if (coupon.limite_uso && Number(coupon.usos || 0) >= Number(coupon.limite_uso)) {
    return { valido: false, motivo: 'cupom_esgotado' };
  }

  if (precoBase !== null && coupon.valor_minimo && precoBase < Number(coupon.valor_minimo)) {
    return { valido: false, motivo: 'valor_minimo_nao_atingido' };
  }

  const produtos = Array.isArray(coupon.produtos_aplicaveis) ? coupon.produtos_aplicaveis : [];
  if (produtos.length > 0 && product && !produtos.includes(product.id)) {
    return { valido: false, motivo: 'produto_fora_do_cupom' };
  }

  const categorias = Array.isArray(coupon.categorias_aplicaveis) ? coupon.categorias_aplicaveis : [];
  if (categorias.length > 0 && product) {
    const alvo = [product.categoria, product.subcategoria, product.nicho]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase());
    const bate = categorias.some((c) => alvo.includes(String(c).toLowerCase()));
    if (!bate) return { valido: false, motivo: 'categoria_fora_do_cupom' };
  }

  if (coupon.marketplace && product?.marketplace &&
      String(coupon.marketplace).toLowerCase() !== String(product.marketplace).toLowerCase()) {
    return { valido: false, motivo: 'marketplace_diferente' };
  }

  return { valido: true, motivo: null };
}

/** Quanto este cupom tira de `precoBase`. Frete gratis nao mexe no preco. */
export function couponDiscount(coupon, precoBase) {
  if (!coupon || precoBase === null || precoBase === undefined) return 0;
  const valor = Number(coupon.valor_desconto || 0);

  if (coupon.tipo === 'frete_gratis') return 0;

  if (coupon.tipo === 'percentual') {
    let desconto = round2((precoBase * valor) / 100);
    if (coupon.desconto_maximo) desconto = Math.min(desconto, Number(coupon.desconto_maximo));
    return round2(Math.min(desconto, precoBase));
  }

  if (coupon.tipo === 'valor_fixo') return round2(Math.min(valor, precoBase));

  return 0;
}

/**
 * @returns {{
 *   valido:boolean, motivos:string[],
 *   preco_normal:number|null, preco_promocional:number|null, preco_base:number|null,
 *   preco_final:number|null, desconto_valor:number|null, desconto_percentual:number|null,
 *   desconto_cupom:number|null, cupom:object|null, frete_gratis:boolean,
 *   tem_desconto:boolean, tem_cupom:boolean, tem_promocao:boolean, moeda:string
 * }}
 */
export function calculatePricing({ product = null, promotion = null, coupon = null, reference = new Date() } = {}) {
  const motivos = [];

  const precoPromocional = firstNumber([
    promotion?.preco_promocional,
    promotion ? null : undefined,
  ]);
  const precoProduto = firstNumber([product?.preco_atual]);

  // Preco que o cliente paga antes do cupom
  const precoBase = precoPromocional ?? precoProduto ?? null;

  // Preco "de" (riscado): so existe se for maior que a base
  const precoNormalBruto = firstNumber([
    promotion?.preco_normal,
    product?.preco_anterior,
  ]);
  const precoNormal = precoNormalBruto !== null && precoBase !== null && precoNormalBruto > precoBase
    ? round2(precoNormalBruto)
    : null;

  if (precoBase === null) motivos.push('sem_preco');
  if (precoBase !== null && precoBase <= 0) motivos.push('preco_invalido');

  // Promocao vencida/nao iniciada nao entra
  let promocaoValida = Boolean(promotion);
  if (promotion) {
    if (promotion.status === 'pausada') { promocaoValida = false; motivos.push('promocao_pausada'); }
    if (isExpired(promotion.data_fim, reference)) { promocaoValida = false; motivos.push('promocao_expirada'); }
    if (isNotStarted(promotion.data_inicio, reference)) { promocaoValida = false; motivos.push('promocao_nao_comecou'); }
  }

  const check = coupon ? validateCoupon(coupon, { product, precoBase, reference }) : { valido: false, motivo: null };
  if (coupon && !check.valido) motivos.push(check.motivo);

  const cupomAtivo = check.valido ? coupon : null;
  const descontoCupom = cupomAtivo ? couponDiscount(cupomAtivo, precoBase) : 0;

  const precoFinal = precoBase === null ? null : round2(Math.max(precoBase - descontoCupom, 0));

  const descontoValor = precoNormal !== null && precoFinal !== null
    ? round2(precoNormal - precoFinal)
    : (descontoCupom > 0 ? descontoCupom : null);

  const descontoPercentual = precoNormal !== null && precoFinal !== null
    ? percentOff(precoNormal, precoFinal)
    : null;

  const freteGratis = Boolean(
    promotion?.frete_gratis || product?.frete_gratis || cupomAtivo?.tipo === 'frete_gratis',
  );

  return {
    valido: precoBase !== null && precoBase > 0,
    motivos,
    preco_normal: precoNormal,
    preco_promocional: promocaoValida && precoPromocional !== null ? round2(precoPromocional) : null,
    preco_base: precoBase === null ? null : round2(precoBase),
    preco_final: precoFinal,
    desconto_valor: descontoValor && descontoValor > 0 ? descontoValor : null,
    desconto_percentual: descontoPercentual && descontoPercentual > 0 ? descontoPercentual : null,
    desconto_cupom: descontoCupom > 0 ? descontoCupom : null,
    cupom: cupomAtivo,
    frete_gratis: freteGratis,
    tem_desconto: Boolean(precoNormal !== null && precoFinal !== null && precoNormal > precoFinal),
    tem_cupom: Boolean(cupomAtivo),
    tem_promocao: Boolean(promocaoValida && precoPromocional !== null),
    moeda: product?.moeda || 'BRL',
  };
}

/**
 * Score configurável usado para ordenar produtos.
 * Pesos ficam em settings (SISTEMA > Configuracoes), nada hardcoded na regra.
 */
export const DEFAULT_SCORE_WEIGHTS = {
  vendas: 0.3,
  avaliacao: 0.2,
  desconto: 0.3,
  novidade: 0.1,
  preco: 0.1,
};

export function calculateScore(product, weights = DEFAULT_SCORE_WEIGHTS) {
  const w = { ...DEFAULT_SCORE_WEIGHTS, ...(weights || {}) };

  const vendas = Math.min(Number(product.quantidade_vendas || 0) / 1000, 1);
  const avaliacao = Math.min(Number(product.avaliacao || 0) / 5, 1);
  const desconto = Math.min(Number(product.desconto_percentual || 0) / 70, 1);

  const coletaMs = product.data_coleta ? Date.parse(product.data_coleta) : NaN;
  const idadeDias = Number.isFinite(coletaMs) ? (Date.now() - coletaMs) / 86400000 : 30;
  const novidade = Math.max(0, 1 - idadeDias / 30);

  const preco = Number(product.preco_atual || 0);
  const precoScore = preco > 0 ? Math.max(0, 1 - Math.min(preco, 500) / 500) : 0;

  const total =
    vendas * w.vendas +
    avaliacao * w.avaliacao +
    desconto * w.desconto +
    novidade * w.novidade +
    precoScore * w.preco;

  return round2(Math.max(0, Math.min(total, 1)) * 100);
}

function firstNumber(values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
