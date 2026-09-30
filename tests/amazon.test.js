/**
 * Amazon: lista de links/ASINs e Creators API (simulada — nada sai para a rede).
 * Banco temporário — não toca nos seus dados.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arquivoTeste = path.join(os.tmpdir(), `afiliados-amazon-${Date.now()}.db`);
process.env.DB_FILE = arquivoTeste;
process.env.WORKER_ENABLED = 'false';

const { getDb, closeDb } = await import('../src/core/db/index.js');
const repos = await import('../src/core/repositories/index.js');
const amazon = await import('../src/core/services/amazonService.js');
const { itemParaProduto } = await import('../src/integrations/marketplaces/amazonCreatorsApi.js');
const { salvarTagDaLoja } = await import('../src/core/services/lojaService.js');
const { LOJAS } = await import('../src/integrations/marketplaces/lojas.js');

getDb();

const ITEM = {
  asin: 'B0CX23V2ZK',
  detailPageURL: 'https://www.amazon.com.br/dp/B0CX23V2ZK?tag=minhatag-20',
  itemInfo: { title: { displayValue: 'Fone Bluetooth XYZ' } },
  images: { primary: { large: { url: 'https://m.media-amazon.com/images/I/abc.jpg' } } },
  offersV2: { listings: [{ price: { money: { amount: 99.9 }, savings: { money: { amount: 50 } } } }] },
  customerReviews: { starRating: { value: 4.6 }, count: 1200 },
};

const fetchOriginal = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = fetchOriginal; });

test('lista: pega ASIN de links, de ASIN solto e separa links curtos; ignora texto', () => {
  const r = amazon.extrairDaLista(`
    https://www.amazon.com.br/Fone-Bluetooth/dp/B0CX23V2ZK/ref=sr_1_3?keywords=fone
    https://www.amazon.com.br/gp/product/B08N5WRWNW?th=1
    B0DDDDDDDD
    titulo,preco,Bluetooth1
    https://amzn.to/3AbCdEf
    https://www.amazon.com.br/dp/B0CX23V2ZK
  `);
  assert.deepEqual(r.asins, ['B0CX23V2ZK', 'B08N5WRWNW', 'B0DDDDDDDD']);
  assert.deepEqual(r.curtos, ['https://amzn.to/3AbCdEf']);
});

test('lista sem produto da Amazon é recusada', () => {
  assert.throws(() => amazon.iniciarListaAmazon('nada aqui'), /Não achei nenhum produto/);
});

test('item da Creators API vira produto: link com tag, "De" pela economia informada', () => {
  const p = itemParaProduto(ITEM);
  assert.equal(p.external_id, 'B0CX23V2ZK');
  assert.equal(p.preco, 99.9);
  assert.equal(p.preco_anterior, 149.9);
  assert.equal(p.url_afiliado, 'https://www.amazon.com.br/dp/B0CX23V2ZK?tag=minhatag-20');
  assert.equal(p.imagem, 'https://m.media-amazon.com/images/I/abc.jpg');
});

test('item sem preço não entra (não inventa)', () => {
  assert.equal(itemParaProduto({ ...ITEM, offersV2: { listings: [] } }), null);
});

test('Creators API: não salva sem a tag e não salva credencial recusada', async () => {
  await assert.rejects(() => amazon.salvarAmazonApi({ credential_id: 'abc', secret: 's', versao: '3.1' }), /tag de associado/);

  salvarTagDaLoja(LOJAS.amazon, 'minhatag-20');
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'invalid_client' }) });
  const r = await amazon.salvarAmazonApi({ credential_id: 'abc', secret: 'errado', versao: '3.1' });
  assert.equal(r.teste.ok, false);
  assert.equal(amazon.credenciaisAmazon(), null);
});

test('lista com a API: importa em lote, com tag e foto; o que não veio vira falha explicada', async () => {
  const chamadas = [];
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({ url: String(url), opcoes });
    if (String(url).includes('/auth/o2/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
    }
    if (String(url).endsWith('/searchItems')) {
      return { ok: true, status: 200, json: async () => ({ searchResult: { items: [ITEM] } }) };
    }
    return { ok: true, status: 200, json: async () => ({ itemsResult: { items: [ITEM] } }) };
  };

  const salvo = await amazon.salvarAmazonApi({ credential_id: 'amzn1.cred.1234', secret: 'segredo', versao: '3.1' });
  assert.equal(salvo.teste.ok, true);
  assert.ok(!JSON.stringify(salvo).includes('segredo'));

  const t = amazon.iniciarListaAmazon('https://www.amazon.com.br/dp/B0CX23V2ZK\nB0ZZZZZZZZ');
  assert.equal(t.modo, 'api');
  for (let i = 0; i < 50 && !amazon.lerTrabalhoLista(t.id).fim; i += 1) await new Promise((r) => setTimeout(r, 10));

  const fim = amazon.lerTrabalhoLista(t.id);
  assert.equal(fim.importados, 1);
  assert.equal(fim.falhas.length, 1);
  assert.equal(fim.falhas[0].item, 'B0ZZZZZZZZ');

  const getItems = chamadas.find((c) => c.url.endsWith('/getItems'));
  const corpo = JSON.parse(getItems.opcoes.body);
  assert.deepEqual(corpo.itemIds, ['B0CX23V2ZK', 'B0ZZZZZZZZ']);
  assert.equal(corpo.partnerTag, 'minhatag-20');
  assert.equal(getItems.opcoes.headers['x-marketplace'], 'www.amazon.com.br');
  assert.equal(getItems.opcoes.headers.Authorization, 'Bearer tok', 'credencial 3.x: sem "Version"');

  const produto = repos.productRepository.findOne({ marketplace: 'amazon', external_id: 'B0CX23V2ZK' });
  assert.match(produto.url_final, /tag=minhatag-20/);
  assert.equal(produto.imagem_principal, 'https://m.media-amazon.com/images/I/abc.jpg');
  assert.equal(produto.desconto_percentual, 33);
});

test.after(() => {
  globalThis.fetch = fetchOriginal;
  closeDb();
  fs.rmSync(arquivoTeste, { force: true });
});
