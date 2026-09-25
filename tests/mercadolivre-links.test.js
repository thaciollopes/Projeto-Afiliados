/**
 * Conversão de link do Mercado Livre (meli.la) pela sessão.
 * Sem rede: aqui se testa a regra. A chamada real foi validada à parte e
 * devolveu https://meli.la/18qrG5t para um produto de verdade.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  jaEhLinkDeAfiliado, ehLinkDoMercadoLivre, converterLinks,
} from '../src/core/services/mercadoLivreLinkService.js';

test('meli.la e /sec/ já são link de afiliado — não converte de novo', () => {
  assert.equal(jaEhLinkDeAfiliado('https://meli.la/18qrG5t'), true);
  assert.equal(jaEhLinkDeAfiliado('https://mercadolivre.com/sec/ABC123'), true);
  assert.equal(jaEhLinkDeAfiliado('https://produto.mercadolivre.com.br/MLB-123'), false);
});

test('só link do Mercado Livre entra na conversão', () => {
  assert.equal(ehLinkDoMercadoLivre('https://produto.mercadolivre.com.br/MLB-4293674477-capa'), true);
  assert.equal(ehLinkDoMercadoLivre('https://www.amazon.com.br/dp/B0TESTE'), false);
  assert.equal(ehLinkDoMercadoLivre('https://meli.la/18qrG5t'), false, 'já convertido');
});

test('lista sem link do ML não faz chamada nenhuma', async () => {
  const r = await converterLinks(['https://www.amazon.com.br/dp/B0X', 'https://meli.la/abc']);
  assert.equal(r.convertidos, 0);
  assert.equal(r.resultados.length, 0);
});

test('meli.la conta como link com comissão no resto do sistema', async () => {
  const { previewLink } = await import('../src/core/services/affiliateLinkService.js');
  const r = previewLink('mercadolivre', 'https://meli.la/18qrG5t');
  assert.equal(r.aplicado, true);
  assert.equal(r.final, 'https://meli.la/18qrG5t', 'nunca reescreve o link de afiliado');
});
