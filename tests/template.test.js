/**
 * O motor de template precisa "esconder" sozinho o que não existe:
 * sem cupom, sem linha de cupom; sem desconto, sem "de/por".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, buildContext, DEFAULT_TEMPLATE_BODY } from '../src/core/services/templateService.js';
import { calculatePricing } from '../src/core/services/pricingService.js';

const emDias = (d) => new Date(Date.now() + d * 86400000).toISOString();

function montar({ product, promotion = null, coupon = null }) {
  const pricing = calculatePricing({ product, promotion, coupon });
  const contexto = buildContext({ product, pricing, promotion, coupon });
  return renderTemplate(DEFAULT_TEMPLATE_BODY, contexto);
}

test('com cupom: a linha do cupom aparece com o código', () => {
  const texto = montar({
    product: { titulo_original: 'Perfume X', preco_atual: 159.9, preco_anterior: 199.9, url_original: 'https://x' },
    coupon: { codigo: 'PERFUME20', tipo: 'valor_fixo', valor_desconto: 20, status: 'ativo', data_fim: emDias(5) },
  });

  assert.match(texto, /PERFUME20/);
  assert.match(texto, /R\$\s?139,90/);
  assert.match(texto, /R\$\s?199,90/);
});

test('sem cupom: a linha do cupom some completamente', () => {
  const texto = montar({
    product: { titulo_original: 'Perfume X', preco_atual: 159.9, preco_anterior: 199.9, url_original: 'https://x' },
  });

  assert.doesNotMatch(texto, /Cupom/i);
  assert.doesNotMatch(texto, /Desconto do cupom/i);
});

test('sem preço anterior: não aparece o "De:"', () => {
  const texto = montar({ product: { titulo_original: 'Item', preco_atual: 49.9, url_original: 'https://x' } });

  assert.doesNotMatch(texto, /De:/);
  assert.match(texto, /R\$\s?49,90/);
});

test('nenhuma variável fica solta no texto final', () => {
  const texto = montar({ product: { titulo_original: 'Item', preco_atual: 10, url_original: 'https://x' } });
  assert.doesNotMatch(texto, /\{[a-z_]+\}/);
});

test('bloco condicional [[se:cupom]] respeita a ausência do cupom', () => {
  const corpo = 'Produto: {titulo}\n[[se:cupom]]Use o cupom {cupom}[[/se]]\nLink: {link}';
  const contexto = { titulo: 'Item', cupom: '', link: 'https://x' };

  const semCupom = renderTemplate(corpo, contexto);
  const comCupom = renderTemplate(corpo, { ...contexto, cupom: 'ABC10' });

  assert.doesNotMatch(semCupom, /cupom/i);
  assert.match(comCupom, /ABC10/);
});

test('linha fixa (sem variável) nunca é removida', () => {
  const texto = renderTemplate('🔥 OFERTA\n{titulo}\n{cupom}', { titulo: 'Item', cupom: '' });

  assert.match(texto, /OFERTA/);
  assert.match(texto, /Item/);
  assert.doesNotMatch(texto, /\{cupom\}/);
});

test('linha com duas variáveis some só quando as duas estão vazias', () => {
  const corpo = '⭐ {avaliacao} | 🛒 {vendas} vendidos';

  assert.equal(renderTemplate(corpo, { avaliacao: '', vendas: '' }), '');
  assert.match(renderTemplate(corpo, { avaliacao: '4.8', vendas: '' }), /4\.8/);
});

test('frete grátis entra no texto quando existe', () => {
  const texto = montar({
    product: { titulo_original: 'Item', preco_atual: 100, frete_gratis: true, url_original: 'https://x' },
  });
  assert.match(texto, /Frete gratis/);
});

test('título de publicação tem prioridade sobre o original', () => {
  const contexto = buildContext({
    product: { titulo_original: 'TITULO CRU DA LOJA 100ML ORIGINAL', titulo_publicacao: 'Perfume floral 100ml' },
    pricing: {},
  });
  assert.equal(contexto.titulo, 'Perfume floral 100ml');
});

test('selo de menor preço aparece só quando o serviço manda; senão a linha some', () => {
  const corpo = '{titulo}\n📉 {menor_preco}\n{link}';
  const com = renderTemplate(corpo, buildContext({
    product: { titulo_original: 'Fone', url_final: 'https://x' },
    extras: { menor_preco: 'Menor preço que registramos em 30 dias' },
  }));
  assert.match(com, /📉 Menor preço que registramos em 30 dias/);

  const sem = renderTemplate(corpo, buildContext({ product: { titulo_original: 'Fone', url_final: 'https://x' } }));
  assert.doesNotMatch(sem, /📉/);
});

test('oferta do ML "com Cupom": destaque com o valor do ML e aviso de validade, perto do preço', () => {
  const comCupomMl = { titulo_original: 'Perfume', preco_atual: 100, preco_cupom_loja: 79.9, tags: ['ofertas-ml', 'cupom-ml'] };
  const texto = renderTemplate(DEFAULT_TEMPLATE_BODY, buildContext({ product: comCupomMl, pricing: calculatePricing({ product: comCupomMl }) }));
  assert.match(texto, /COM CUPOM DO MERCADO LIVRE: R\$\s?79,90/);
  assert.match(texto, /tem validade e pode acabar/);
  assert.match(texto, /Por: R\$\s?100,00/, 'o preço do post continua o sem cupom');
  const linhas = texto.split('\n');
  assert.equal(linhas.findIndex((l) => /COM CUPOM/.test(l)), linhas.findIndex((l) => /Por:/.test(l)) + 1, 'logo abaixo do preço');

  const semValor = { ...comCupomMl, preco_cupom_loja: null };
  const t2 = renderTemplate(DEFAULT_TEMPLATE_BODY, buildContext({ product: semValor, pricing: calculatePricing({ product: semValor }) }));
  assert.match(t2, /TEM CUPOM NO MERCADO LIVRE/);

  const semTag = { titulo_original: 'Perfume', preco_atual: 100, tags: ['ofertas-ml'] };
  const outro = renderTemplate(DEFAULT_TEMPLATE_BODY, buildContext({ product: semTag, pricing: calculatePricing({ product: semTag }) }));
  assert.doesNotMatch(outro, /cupom/i);
});

test('modelo padrão: sem quantidade vendida não sai "🛒  vendidos" sozinho', () => {
  const p = { titulo_original: 'Colônia', preco_atual: 65.99, avaliacao: 4.6 };
  const texto = renderTemplate(DEFAULT_TEMPLATE_BODY, buildContext({ product: p, pricing: calculatePricing({ product: p }) }));
  assert.match(texto, /Nota 4\.6/);
  assert.doesNotMatch(texto, /vendidos/);
});
