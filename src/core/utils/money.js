/**
 * Dinheiro em centavos internamente? Nao: os marketplaces entregam decimais e
 * o volume aqui e pequeno. Usamos Number com arredondamento explicito em toda
 * operacao, que e suficiente e mantem o codigo legivel.
 */
export function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

export function formatBRL(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatMoney(value, currency = 'BRL') {
  if (currency === 'BRL') return formatBRL(value);
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency });
}

export function percentOff(from, to) {
  const a = Number(from);
  const b = Number(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b >= a) return 0;
  return Math.round(((a - b) / a) * 100);
}
