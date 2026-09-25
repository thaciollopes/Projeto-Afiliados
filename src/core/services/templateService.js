/**
 * Motor de templates da publicacao.
 *
 * Tres recursos, nesta ordem:
 *   1. blocos condicionais explicitos:  [[se:cupom]] ... [[/se]]
 *   2. substituicao de variaveis:       {titulo}, {preco_final}, ...
 *   3. faxina automatica: linha cujas variaveis ficaram TODAS vazias some.
 *      E por isso que "se nao houver cupom, a linha do cupom nao aparece"
 *      funciona mesmo em templates escritos sem nenhum [[se:]].
 */
import { formatMoney } from '../utils/money.js';
import { formatDateTimeBR } from '../utils/dates.js';

export const VARIAVEIS_DISPONIVEIS = [
  { nome: 'titulo', descricao: 'Titulo do produto (usa o titulo de publicacao se existir)' },
  { nome: 'descricao', descricao: 'Descricao do produto' },
  { nome: 'preco', descricao: 'Preco atual (sem cupom)' },
  { nome: 'preco_anterior', descricao: 'Preco "de" riscado' },
  { nome: 'preco_promocional', descricao: 'Preco da promocao' },
  { nome: 'preco_final', descricao: 'Preco final (ja com cupom)' },
  { nome: 'desconto', descricao: 'Desconto em % (ex.: 25%)' },
  { nome: 'desconto_valor', descricao: 'Desconto em R$' },
  { nome: 'cupom', descricao: 'Codigo do cupom' },
  { nome: 'desconto_cupom', descricao: 'Quanto o cupom abate em R$' },
  { nome: 'avaliacao', descricao: 'Nota do produto' },
  { nome: 'vendas', descricao: 'Quantidade vendida' },
  { nome: 'link', descricao: 'Link de afiliado (cai no original se nao houver)' },
  { nome: 'imagem', descricao: 'URL da imagem principal' },
  { nome: 'marketplace', descricao: 'Nome do marketplace' },
  { nome: 'categoria', descricao: 'Categoria do produto' },
  { nome: 'validade', descricao: 'Ate quando vale a promocao/cupom' },
  { nome: 'frete', descricao: 'Texto de frete (ex.: Frete gratis)' },
  { nome: 'menor_preco', descricao: 'Selo "Menor preco que registramos em 30 dias" (so com historico que prove)' },
];

/** Monta o dicionario de variaveis a partir do produto + calculo de preco. */
export function buildContext({
  product = {}, pricing = {}, promotion = null, coupon = null, extras = {},
} = {}) {
  const moeda = pricing.moeda || product.moeda || 'BRL';
  const money = (v) => (v === null || v === undefined ? '' : formatMoney(v, moeda));
  const cupom = pricing.cupom || (pricing.tem_cupom ? coupon : null);

  const validade = promotion?.data_fim || cupom?.data_fim || null;

  return {
    titulo: product.titulo_publicacao || product.titulo_original || '',
    descricao: product.descricao_publicacao || product.descricao_original || '',
    preco: money(pricing.preco_base ?? product.preco_atual ?? null),
    preco_anterior: money(pricing.preco_normal),
    preco_promocional: money(pricing.preco_promocional),
    preco_final: money(pricing.preco_final),
    desconto: pricing.desconto_percentual ? `${pricing.desconto_percentual}%` : '',
    desconto_valor: money(pricing.desconto_valor),
    cupom: cupom?.codigo || '',
    desconto_cupom: money(pricing.desconto_cupom),
    avaliacao: product.avaliacao ? `${Number(product.avaliacao).toFixed(1)}` : '',
    vendas: product.quantidade_vendas ? String(product.quantidade_vendas) : '',
    link: product.url_final || product.url_afiliado || product.url_original || '',
    imagem: product.imagem_principal || '',
    marketplace: product.marketplace || '',
    categoria: product.categoria || '',
    validade: validade ? formatDateTimeBR(validade) : '',
    frete: pricing.frete_gratis ? 'Frete gratis' : '',
    menor_preco: extras.menor_preco || '',
  };
}

/** Aplica o template. Retorna o texto pronto para o WhatsApp. */
export function renderTemplate(corpo, context) {
  if (!corpo) return '';
  let texto = String(corpo);

  texto = resolveConditionalBlocks(texto, context);
  texto = replaceVariables(texto, context);
  texto = dropEmptyVariableLines(texto, corpo, context);
  texto = tidy(texto);

  return texto;
}

/** Atalho: produto + preco -> mensagem final. */
export function renderPublication({
  template, product, pricing, promotion, coupon, extras,
}) {
  const context = buildContext({ product, pricing, promotion, coupon, extras });
  const corpo = template?.corpo || DEFAULT_TEMPLATE_BODY;
  return { mensagem: renderTemplate(corpo, context), context };
}

function resolveConditionalBlocks(texto, context) {
  const regex = /\[\[se:([a-z_]+)\]\]([\s\S]*?)\[\[\/se\]\]/gi;
  return texto.replace(regex, (_match, campo, conteudo) => {
    const valor = context[campo];
    return valor !== undefined && valor !== null && String(valor).trim() !== '' ? conteudo : '';
  });
}

function replaceVariables(texto, context) {
  return texto.replace(/\{([a-z_]+)\}/gi, (match, campo) => {
    const valor = context[campo.toLowerCase()];
    return valor === undefined || valor === null ? match : String(valor);
  });
}

/**
 * Remove as linhas cujas variaveis ficaram todas vazias.
 * Linha sem nenhuma variavel (texto fixo, emoji, separador) nunca e removida.
 */
function dropEmptyVariableLines(textoRenderizado, corpoOriginal, context) {
  const linhasOriginais = corpoOriginal.split('\n');
  const linhas = textoRenderizado.split('\n');

  // Quando blocos condicionais mudam a contagem de linhas, decide pela linha ja
  // renderizada: sobrou "{variavel}" nao resolvida ou ficou so pontuacao.
  const mesmaEstrutura = linhas.length === linhasOriginais.length;

  return linhas
    .filter((linha, i) => {
      const origem = mesmaEstrutura ? linhasOriginais[i] : linha;
      const variaveis = [...String(origem).matchAll(/\{([a-z_]+)\}/gi)].map((m) => m[1].toLowerCase());
      if (variaveis.length === 0) return true;
      const algumaPreenchida = variaveis.some((v) => {
        const valor = context[v];
        return valor !== undefined && valor !== null && String(valor).trim() !== '';
      });
      return algumaPreenchida;
    })
    .join('\n');
}

function tidy(texto) {
  return texto
    .replace(/\{[a-z_]+\}/gi, '')          // variavel desconhecida nao vaza pro grupo
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const DEFAULT_TEMPLATE_BODY = [
  '🔥 *OFERTA*',
  '',
  '{titulo}',
  '',
  '💰 De: ~{preco_anterior}~',
  '🔥 Por: {preco_final}',
  '📉 {menor_preco}',
  '',
  '🏷️ Cupom: *{cupom}*',
  '💸 Desconto do cupom: {desconto_cupom}',
  '',
  '🚚 {frete}',
  '⭐ {avaliacao} | 🛒 {vendas} vendidos',
  '⏰ Valido ate {validade}',
  '',
  '👉 {link}',
].join('\n');

/** Templates que o seed instala; servem de exemplo pro usuario editar. */
export const TEMPLATES_PADRAO = [
  {
    nome: 'Oferta',
    tipo: 'oferta',
    padrao: true,
    descricao: 'Formato classico de oferta com de/por e cupom.',
    corpo: DEFAULT_TEMPLATE_BODY,
  },
  {
    nome: 'Achadinho do dia',
    tipo: 'achadinho',
    descricao: 'Mais curto, foco no preco final.',
    corpo: [
      '✨ *ACHADINHO DO DIA*',
      '',
      '{titulo}',
      '',
      '💰 {preco_final}',
      '🏷️ Cupom: *{cupom}*',
      '',
      '🔥 Aproveite enquanto durar!',
      '',
      '👉 {link}',
    ].join('\n'),
  },
  {
    nome: 'So cupom',
    tipo: 'cupom',
    descricao: 'Divulgacao de cupom, sem foco no produto.',
    corpo: [
      '🏷️ *CUPOM {marketplace}*',
      '',
      '{titulo}',
      '',
      'Use o cupom: *{cupom}*',
      'Voce economiza {desconto_cupom}',
      'Fica por: {preco_final}',
      '',
      '⏰ Ate {validade}',
      '👉 {link}',
    ].join('\n'),
  },
  {
    nome: 'Simples',
    tipo: 'simples',
    descricao: 'Sem enfeite: produto, preco e link.',
    corpo: [
      '{titulo}',
      '',
      '{preco_final}',
      '',
      '{link}',
    ].join('\n'),
  },
  {
    nome: 'Oferta com desconto destacado',
    tipo: 'oferta',
    descricao: 'Mostra o percentual de desconto em destaque.',
    corpo: [
      '🚨 *{desconto} OFF* 🚨',
      '',
      '{titulo}',
      '',
      '❌ De: ~{preco_anterior}~',
      '✅ Por: *{preco_final}*',
      '💸 Voce economiza {desconto_valor}',
      '📉 {menor_preco}',
      '',
      '🏷️ Cupom: *{cupom}*',
      '🚚 {frete}',
      '',
      '👉 {link}',
    ].join('\n'),
  },
];
