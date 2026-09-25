/**
 * Tela LOJAS: salvar a tag grava no cadastro de afiliados e troca o link dos
 * produtos na hora. Banco temporário — não toca nos seus dados.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arquivoTeste = path.join(os.tmpdir(), `afiliados-lojas-${Date.now()}.db`);
process.env.DB_FILE = arquivoTeste;
process.env.WORKER_ENABLED = 'false';

const { getDb, closeDb } = await import('../src/core/db/index.js');
const repos = await import('../src/core/repositories/index.js');
const { tagDaLoja, salvarTagDaLoja } = await import('../src/core/services/lojaService.js');
const { importProducts } = await import('../src/core/services/productService.js');
const { LOJAS } = await import('../src/integrations/marketplaces/lojas.js');

getDb();

test('tag da Amazon entra nos links dos produtos já cadastrados', () => {
  importProducts([{
    marketplace: 'amazon', external_id: 'B07SSMCZ7Z', titulo_original: 'Granado 230ml',
    preco_atual: 65.99, url_original: 'https://www.amazon.com.br/dp/B07SSMCZ7Z',
  }], 'busca');

  const r = salvarTagDaLoja(LOJAS.amazon, 'minhatag-20');
  assert.equal(r.atualizados, 1);
  assert.equal(tagDaLoja('amazon'), 'minhatag-20');

  const produto = repos.productRepository.findOne({ external_id: 'B07SSMCZ7Z' });
  assert.equal(produto.url_final, 'https://www.amazon.com.br/dp/B07SSMCZ7Z?tag=minhatag-20');
});

test('salvar de novo troca a tag, sem criar um segundo cadastro', () => {
  salvarTagDaLoja(LOJAS.amazon, 'outratag-20');
  const programas = repos.affiliateRepository.list({ limit: 50 }).filter((p) => p.marketplace === 'amazon');
  assert.equal(programas.length, 1);

  const produto = repos.productRepository.findOne({ external_id: 'B07SSMCZ7Z' });
  assert.match(produto.url_final, /tag=outratag-20$/);
});

test('tag vazia apaga a tag', () => {
  salvarTagDaLoja(LOJAS.amazon, '   ');
  assert.equal(tagDaLoja('amazon'), null);
});

test.after(() => {
  closeDb();
  for (const sufixo of ['', '-wal', '-shm']) fs.rmSync(`${arquivoTeste}${sufixo}`, { force: true });
});
