/**
 * API de afiliados da Shopee: assinatura, conversão da oferta, busca e
 * importação direta. A Shopee é simulada (fetch falso) — nada sai para a rede.
 * Banco temporário — não toca nos seus dados.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arquivoTeste = path.join(os.tmpdir(), `afiliados-shopee-api-${Date.now()}.db`);
process.env.DB_FILE = arquivoTeste;
process.env.WORKER_ENABLED = 'false';

const { getDb, closeDb } = await import('../src/core/db/index.js');
const repos = await import('../src/core/repositories/index.js');
const shopeeApi = await import('../src/integrations/marketplaces/shopeeApi.js');
const servico = await import('../src/core/services/shopeeApiService.js');
const { getMarketplace } = await import('../src/integrations/marketplaces/index.js');

getDb();

const OFERTA = {
  itemId: 22912345678,
  productName: 'Jogo de Lençol Casal 400 fios',
  commissionRate: '0.12',
  commission: '5.99',
  price: '49.9',
  priceMin: '49.9',
  priceMax: '59.9',
  priceDiscountRate: 50,
  sales: 10234,
  ratingStar: '4.8',
  imageUrl: 'https://cf.shopee.com.br/file/abc',
  shopName: 'Loja Casa',
  productLink: 'https://shopee.com.br/product/123/22912345678',
  offerLink: 'https://s.shopee.com.br/AbCdEf123',
};

let chamadas = [];
const fetchOriginal = globalThis.fetch;
function shopeeFalsa(resposta) {
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return { ok: true, status: 200, json: async () => resposta };
  };
}

test.afterEach(() => { globalThis.fetch = fetchOriginal; chamadas = []; });

test('assinatura segue a doc: sha256(AppID + Timestamp + corpo + Senha)', () => {
  const esperado = crypto.createHash('sha256').update('123451700000000{"a":1}segredo').digest('hex');
  assert.equal(shopeeApi.assinar({ appId: '12345', senha: 'segredo', corpo: '{"a":1}', timestamp: 1700000000 }), esperado);
});

test('chamada vai com o cabeçalho SHA256 e o corpo assinado é o enviado', async () => {
  shopeeFalsa({ data: { productOfferV2: { nodes: [OFERTA], pageInfo: { hasNextPage: false } } } });
  await shopeeApi.buscarOfertas({ app_id: '12345', senha: 'segredo' }, { termo: 'lençol' });

  const { url, opcoes } = chamadas[0];
  assert.equal(url, shopeeApi.SHOPEE_API_URL);
  const m = opcoes.headers.Authorization.match(/^SHA256 Credential=12345, Timestamp=(\d+), Signature=([a-f0-9]{64})$/);
  assert.ok(m, opcoes.headers.Authorization);
  assert.equal(m[2], shopeeApi.assinar({ appId: '12345', senha: 'segredo', corpo: opcoes.body, timestamp: m[1] }));
  assert.equal(JSON.parse(opcoes.body).variables.keyword, 'lençol');
});

test('oferta vira produto: link de afiliado, comissão e "De" pela taxa da Shopee', () => {
  const p = shopeeApi.ofertaParaProduto(OFERTA);
  assert.equal(p.external_id, '22912345678');
  assert.equal(p.preco, 49.9);
  assert.equal(p.preco_anterior, 99.8);
  assert.equal(p.url_afiliado, 'https://s.shopee.com.br/AbCdEf123');
  assert.equal(p.comissao_percentual, 12);
  assert.equal(p.vendas, 10234);
});

test('sem taxa de desconto, não inventa preço "De"', () => {
  assert.equal(shopeeApi.ofertaParaProduto({ ...OFERTA, priceDiscountRate: 0 }).preco_anterior, null);
});

test('erro de credencial vira mensagem em português', async () => {
  shopeeFalsa({ errors: [{ message: 'error', extensions: { code: 10020, message: 'Invalid Signature' } }] });
  await assert.rejects(
    () => shopeeApi.buscarOfertas({ app_id: '12345', senha: 'x' }, {}),
    /AppID ou Senha recusados/,
  );
});

test('sem API configurada, a Shopee continua "pela extensão/CSV"', () => {
  assert.equal(getMarketplace('shopee').implementado, false);
  assert.equal(servico.resumoShopeeApi().configurada, false);
});

test('credencial recusada pela Shopee não é gravada', async () => {
  shopeeFalsa({ errors: [{ message: 'error', extensions: { code: 10020 } }] });
  const r = await servico.salvarShopeeApi({ app_id: '1234567890', senha: 'errada' });
  assert.equal(r.teste.ok, false);
  assert.equal(servico.credenciaisShopee(), null);
});

test('salvar credencial testa na hora e a tela nunca recebe a Senha', async () => {
  shopeeFalsa({ data: { productOfferV2: { nodes: [OFERTA], pageInfo: { hasNextPage: false } } } });
  const r = await servico.salvarShopeeApi({ app_id: '1234567890', senha: 'segredo-forte' });
  assert.equal(r.teste.ok, true);
  assert.equal(r.configurada, true);
  assert.equal(r.app_id, '••••••7890');
  assert.ok(!JSON.stringify(r).includes('segredo-forte'));
  assert.equal(getMarketplace('shopee').implementado, true, 'com API, a Shopee passa a buscar');
});

test('importar ofertas grava na base com link, imagem e comissão; filtra comissão mínima', async () => {
  shopeeFalsa({
    data: {
      productOfferV2: {
        nodes: [OFERTA, { ...OFERTA, itemId: 999, productName: 'Paga pouco', commissionRate: '0.03' }],
        pageInfo: { hasNextPage: false },
      },
    },
  });
  const r = await servico.importarOfertasShopee({ termo: 'lençol', quantidade: 10, comissao_min: 10 });
  assert.equal(r.lidos, 1);
  assert.equal(r.criados, 1);

  const p = repos.productRepository.findOne({ marketplace: 'shopee', external_id: '22912345678' });
  assert.equal(p.url_afiliado, 'https://s.shopee.com.br/AbCdEf123');
  assert.equal(p.imagem_principal, 'https://cf.shopee.com.br/file/abc');
  assert.equal(p.desconto_percentual, 50);
  assert.match(p.observacoes, /Comissao: 12%/);
  assert.equal(repos.productRepository.findOne({ marketplace: 'shopee', external_id: '999' }), null);
});

test('Senha em branco ao salvar de novo mantém a atual', async () => {
  shopeeFalsa({ data: { productOfferV2: { nodes: [], pageInfo: { hasNextPage: false } } } });
  await servico.salvarShopeeApi({ app_id: '1234567890', senha: '' });
  assert.equal(servico.credenciaisShopee().senha, 'segredo-forte');
});

test.after(() => {
  globalThis.fetch = fetchOriginal;
  closeDb();
  fs.rmSync(arquivoTeste, { force: true });
});
