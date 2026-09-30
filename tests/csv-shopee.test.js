/**
 * CSV do "Obter link em massa" da Shopee: o arquivo baixado de la sobe direto,
 * sem editar coluna. Banco temporário — não toca nos seus dados.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arquivoTeste = path.join(os.tmpdir(), `afiliados-csv-${Date.now()}.db`);
process.env.DB_FILE = arquivoTeste;
process.env.WORKER_ENABLED = 'false';

const { getDb, closeDb } = await import('../src/core/db/index.js');
const repos = await import('../src/core/repositories/index.js');
const { importarPlanilhaEnviada, lerCsv } = await import('../src/core/services/excelService.js');

getDb();

const base64 = (texto) => Buffer.from(texto, 'utf8').toString('base64');

test('CSV da Shopee em inglês: produto, preço, vendas e link de afiliado entram', async () => {
  const csv = '﻿Item Id,Item Name,Price,Sales,Shop Name,Commission Rate,Commission,Product Link,Offer Link\n'
    + '22912345678,"Jogo de Lençol Casal 4 peças, 400 fios",R$ 49.90,10mil+,Loja Casa,10%,R$ 4.99,https://shopee.com.br/product/123/22912345678,https://s.shopee.com.br/AbCdEf123\n'
    + '22998765432,Organizador de Panelas,"R$ 29,90",350,Casa Top,12%,R$ 3.59,https://shopee.com.br/product/456/22998765432,https://s.shopee.com.br/XyZ987\n';

  const r = await importarPlanilhaEnviada(base64(csv), 'ofertas.csv');
  assert.equal(r.lidos, 2);
  assert.equal(r.criados, 2);

  const lencol = repos.productRepository.findOne({ external_id: '22912345678' });
  assert.equal(lencol.marketplace, 'shopee');
  assert.equal(lencol.titulo_original, 'Jogo de Lençol Casal 4 peças, 400 fios');
  assert.equal(lencol.preco_atual, 49.9);
  assert.equal(lencol.quantidade_vendas, 10000);
  assert.equal(lencol.url_afiliado, 'https://s.shopee.com.br/AbCdEf123');
  assert.match(lencol.observacoes, /Comissao: 10%/);

  const panela = repos.productRepository.findOne({ external_id: '22998765432' });
  assert.equal(panela.preco_atual, 29.9);
});

test('CSV em português com ponto e vírgula (Excel pt-BR) também entra', async () => {
  const csv = 'ID do item;Nome do item;Preço;Vendas;Nome da loja;Taxa de comissão;Link do produto;Link da oferta\r\n'
    + '1111;Kit Calcinha 5 unidades;19,90;1,2mil;Moda Já;8%;https://shopee.com.br/product/9/1111;https://s.shopee.com.br/KitCal\r\n';

  const r = await importarPlanilhaEnviada(base64(csv), 'lista.CSV');
  assert.equal(r.criados, 1);
  const kit = repos.productRepository.findOne({ external_id: '1111' });
  assert.equal(kit.preco_atual, 19.9);
  assert.equal(kit.quantidade_vendas, 1200);
  assert.equal(kit.url_afiliado, 'https://s.shopee.com.br/KitCal');
});

test('subir a mesma lista de novo atualiza, não duplica', async () => {
  const csv = 'Item Id,Item Name,Price,Offer Link\n1111,Kit Calcinha 5 unidades,17.90,https://s.shopee.com.br/KitCal\n';
  const r = await importarPlanilhaEnviada(base64(csv), 'lista.csv');
  assert.equal(r.criados, 0);
  assert.equal(r.atualizados, 1);
  assert.equal(repos.productRepository.findOne({ external_id: '1111' }).preco_atual, 17.9);
});

test('leitor de CSV: aspas com vírgula e aspas escapadas dentro', () => {
  const linhas = lerCsv('a,b\n"x, y","diz ""oi"""\n');
  assert.deepEqual(linhas, [['a', 'b'], ['x, y', 'diz "oi"']]);
});

test('arquivo que não é .csv nem .xlsx é recusado', async () => {
  await assert.rejects(() => importarPlanilhaEnviada(base64('x'), 'lista.txt'), /xlsx ou \.csv/);
});

test.after(() => {
  closeDb();
  fs.rmSync(arquivoTeste, { force: true });
});
