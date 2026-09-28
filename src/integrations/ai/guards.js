/**
 * Trava de seguranca da IA.
 *
 * A IA aqui so mexe em TEXTO (titulo, descricao, chamada). Preco, desconto,
 * cupom e avaliacao sao calculados pelo pricingService e injetados pelo
 * template. Se mesmo assim o modelo inventar um numero, este guard derruba.
 */

// Valor em dinheiro com "R$", com centavos ("49,90") ou seguido de "reais":
// o modelo escreve preco dos tres jeitos, e so o "R$" nao basta.
const MOEDA_REGEX = /R\$\s*\d[\d.]*(?:,\d{1,2})?|\b\d[\d.]*(?:,\d{1,2})?\s*reais\b|\b\d[\d.]*,\d{2}\b/gi;
const PERCENTUAL_REGEX = /\d{1,3}\s*%/g;
const CUPOM_REGEX = /\b(?:cupom|coupon|codigo|code)\b[:\s-]*([A-Za-z0-9][A-Za-z0-9_-]{2,20})/gi;
const NOTA_REGEX = /\b(?:nota\s*)?([0-5](?:[.,]\d)?)\s*(?:estrelas?|★)|\bnota\s*([0-5](?:[.,]\d)?)\b/gi;
const VENDAS_REGEX = /\b(\d[\d.]*)\s*(mil\s*)?(?:vendid[oa]s|vendas|unidades vendidas)\b/gi;

// Palavras em caixa alta que aparecem depois de "cupom" sem serem codigo.
const NAO_E_CODIGO = new Set(['DESCONTO', 'PROMOCIONAL', 'EXCLUSIVO', 'ABAIXO', 'ESPECIAL', 'DA', 'DE', 'DO', 'NA', 'NO', 'LOJA']);

/** Fatos que o modelo pode repetir. Qualquer coisa fora disso e invencao. */
export function buildFactSheet({ product = {}, pricing = {} } = {}) {
  return {
    titulo: product.titulo_original || '',
    categoria: product.categoria || '',
    marketplace: product.marketplace || '',
    precos_permitidos: [
      pricing.preco_normal, pricing.preco_promocional, pricing.preco_base,
      pricing.preco_final, pricing.desconto_valor, pricing.desconto_cupom,
    ].filter((v) => v !== null && v !== undefined),
    percentuais_permitidos: [pricing.desconto_percentual].filter(Boolean),
    cupom_permitido: pricing.cupom?.codigo || null,
    avaliacao: product.avaliacao ?? null,
    vendas: product.quantidade_vendas ?? null,
  };
}

function normalizeMoney(str) {
  return Number(String(str).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
}

/**
 * @returns {{texto:string, violacoes:string[], limpo:boolean}}
 * `texto` ja vem com as invencoes removidas; `violacoes` explica o que saiu.
 */
export function enforceFactualText(texto, fatos) {
  const violacoes = [];
  if (!texto) return { texto: '', violacoes, limpo: true };

  let saida = String(texto);
  const remover = (trecho, motivo) => {
    violacoes.push(`${motivo}: ${trecho.trim()}`);
    saida = saida.replace(trecho, '');
  };

  const permitidos = new Set((fatos.precos_permitidos || []).map((v) => Number(v).toFixed(2)));
  for (const match of saida.match(MOEDA_REGEX) || []) {
    const valor = normalizeMoney(match);
    if (!Number.isFinite(valor)) continue;
    if (!permitidos.has(valor.toFixed(2))) remover(match, 'preco inventado');
  }

  const percentuaisOk = new Set((fatos.percentuais_permitidos || []).map((v) => String(Math.round(Number(v)))));
  for (const match of saida.match(PERCENTUAL_REGEX) || []) {
    const valor = String(Number.parseInt(match, 10));
    if (!percentuaisOk.has(valor)) remover(match, 'desconto inventado');
  }

  // Codigo de cupom e escrito em caixa alta. "Use o cupom abaixo" nao e codigo,
  // e apagar "cupom abaixo" estragava a frase.
  for (const match of [...saida.matchAll(CUPOM_REGEX)]) {
    const codigo = match[1];
    if (codigo !== codigo.toUpperCase() || NAO_E_CODIGO.has(codigo)) continue;
    if (!fatos.cupom_permitido || codigo !== String(fatos.cupom_permitido).toUpperCase()) {
      remover(match[0], 'cupom inventado');
    }
  }

  const nota = fatos.avaliacao === null || fatos.avaliacao === undefined ? null : Number(fatos.avaliacao);
  for (const match of [...saida.matchAll(NOTA_REGEX)]) {
    const valor = Number(String(match[1] || match[2]).replace(',', '.'));
    if (nota === null || Math.abs(valor - nota) > 0.05) remover(match[0], 'avaliacao inventada');
  }

  const vendas = fatos.vendas ? Number(fatos.vendas) : null;
  for (const match of [...saida.matchAll(VENDAS_REGEX)]) {
    const numero = Number(match[1].replace(/\./g, '')) * (match[2] ? 1000 : 1);
    // "mais de 1 mil vendidos" com 1.500 vendas e verdade; so passa do real que nao.
    if (vendas === null || numero > vendas) remover(match[0], 'vendas inventadas');
  }

  saida = saida.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return { texto: saida, violacoes, limpo: violacoes.length === 0 };
}

/** Instrucoes fixas enviadas ao modelo em toda chamada. */
export const SYSTEM_PROMPT = [
  'Voce escreve textos curtos de divulgacao de ofertas para grupos de WhatsApp em portugues do Brasil.',
  '',
  'REGRAS ABSOLUTAS:',
  '- NUNCA invente preco, desconto, percentual, cupom, avaliacao, quantidade de vendas, prazo ou caracteristica do produto.',
  '- Use SOMENTE os dados fornecidos. Se um dado nao foi fornecido, nao mencione esse assunto.',
  '- NAO escreva valores em R$ nem percentuais: o sistema insere os precos depois, sozinho.',
  '- Nao prometa resultado, nao use termo medico, nao use superlativo falso ("o melhor do mundo").',
  '- Texto curto, direto, com no maximo 2 emojis, sem hashtag exagerada.',
  '- Responda APENAS com o texto final, sem explicacao e sem aspas.',
].join('\n');
