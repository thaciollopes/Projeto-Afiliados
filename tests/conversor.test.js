/**
 * "Converter no privado": link recebido no WhatsApp -> post com o SEU link.
 * Sem rede (fetch trocado) e em banco temporário.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const arquivoTeste = path.join(os.tmpdir(), `afiliados-conversor-${Date.now()}.db`);
process.env.DB_FILE = arquivoTeste;
process.env.DRY_RUN = 'true';
process.env.WORKER_ENABLED = 'false';
process.env.WHATSAPP_PROVIDER = 'mock';
process.env.AI_PROVIDER = 'mock';
process.env.APP_TOKEN = 'token-do-painel';

const { getDb, closeDb } = await import('../src/core/db/index.js');
const repos = await import('../src/core/repositories/index.js');
const { config } = await import('../src/config/index.js');
const conversor = await import('../src/core/services/conversorPorMensagemService.js');
const { assinaturaWebhookValida, lerMensagemDoWebhook } = await import('../src/integrations/whatsapp/wahaProvider.js');
const { salvarTagDaLoja } = await import('../src/core/services/lojaService.js');
const { salvarSessao } = await import('../src/core/services/sessaoLojaService.js');
const { importProducts } = await import('../src/core/services/productService.js');
const { TEMPLATES_PADRAO } = await import('../src/core/services/templateService.js');
const { LOJAS } = await import('../src/integrations/marketplaces/lojas.js');
const { createApp } = await import('../src/app.js');

getDb();
repos.templateRepository.create({ ...TEMPLATES_PADRAO[0], ativo: true, padrao: true });
salvarTagDaLoja(LOJAS.amazon, 'eu-20');
config.whatsapp.autorizados = ['5511999990000'];

const fetchOriginal = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = fetchOriginal; });
const json = (dados) => new Response(JSON.stringify(dados), { status: 200 });

const mensagem = (texto, extra = {}) => ({
  id: `m${Math.random()}`, de: '5511999990000@c.us', texto, deMim: false, privada: true, ...extra,
});

test('lê links, loja e id do produto na URL', () => {
  assert.deepEqual(conversor.extrairLinks('olha isso https://amzn.to/abc. e https://x.com/y)'), ['https://amzn.to/abc', 'https://x.com/y']);
  assert.equal(conversor.lojaDoLink('https://meli.la/x'), 'mercadolivre');
  assert.equal(conversor.lojaDoLink('https://s.shopee.com.br/x'), 'shopee');
  assert.equal(conversor.idNaUrl('https://produto.mercadolivre.com.br/MLB-4293674477-capa'), 'MLB4293674477');
  assert.equal(conversor.idNaUrl('https://shopee.com.br/Fone-i.11.22?sp_atk=x'), '11.22');
});

test('só número autorizado recebe resposta; grupo e mensagem própria são ignorados', async () => {
  let enviadas = 0;
  const enviar = async () => { enviadas += 1; };
  assert.equal((await conversor.tratarMensagemRecebida(mensagem('https://amazon.com.br/dp/B000000001', { de: '5521888887777@c.us' }), { enviar })).motivo, 'nao_autorizado');
  assert.equal((await conversor.tratarMensagemRecebida(mensagem('https://amazon.com.br/dp/B000000001', { privada: false }), { enviar })).motivo, 'fora_do_privado');
  assert.equal((await conversor.tratarMensagemRecebida(mensagem('https://amazon.com.br/dp/B000000001', { deMim: true }), { enviar })).motivo, 'fora_do_privado');
  assert.equal(enviadas, 0);
  assert.equal(conversor.remetenteAutorizado('5511 99999-0000'), true);
});

test('produto fora do cadastro: devolve o link com a sua tag e diz que não há preço', async () => {
  let resposta = '';
  const r = await conversor.tratarMensagemRecebida(
    mensagem('achei isso https://www.amazon.com.br/Fone-X/dp/B0FONE1234/ref=abc?tag=outrapessoa-20'),
    { enviar: async (t) => { resposta = t; } },
  );
  assert.equal(r.respondida, true);
  assert.match(resposta, /https:\/\/www\.amazon\.com\.br\/dp\/B0FONE1234\?tag=eu-20/);
  assert.doesNotMatch(resposta, /outrapessoa/, 'a tag de quem mandou fica para trás');
  assert.match(resposta, /✅ seu ID conferido/);
  assert.match(resposta, /não inventa preço/);
  assert.doesNotMatch(resposta, /R\$/);
});

test('produto cadastrado: devolve o post completo com o preço do cadastro', async () => {
  importProducts([{
    marketplace: 'amazon', external_id: 'B0PERF0001', titulo_original: 'Perfume Cadastrado',
    preco_atual: 129.9, preco_anterior: 199.9, url_original: 'https://www.amazon.com.br/dp/B0PERF0001',
  }], 'busca');
  let resposta = '';
  await conversor.tratarMensagemRecebida(
    mensagem('https://www.amazon.com.br/dp/B0PERF0001'),
    { enviar: async (t) => { resposta = t; } },
  );
  assert.match(resposta, /Perfume Cadastrado/);
  assert.match(resposta, /129,90/);
  assert.match(resposta, /tag=eu-20/);
});

test('link curto da Shopee de outra pessoa vira o seu (sem o rastreio dela)', async () => {
  salvarSessao('shopee', JSON.stringify([{ name: 'SPC_EC', value: 's', domain: '.shopee.com.br' }]));
  salvarTagDaLoja(LOJAS.shopee, '18300000001');
  const pedidos = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    const u = String(url);
    if (u.includes('s.shopee.com.br/ALHEIO')) {
      return new Response(null, { status: 302, headers: { location: 'https://shopee.com.br/Fone-i.11.22?utm_source=an_999' } });
    }
    if (u.includes('batchCustomLink')) {
      pedidos.push(JSON.parse(opcoes.body));
      return json({ data: { batchCustomLink: [{ shortLink: 'https://s.shopee.com.br/MEU', longLink: 'https://s.shopee.com.br/an_redir?affiliate_id=18300000001', failCode: 0 }] } });
    }
    if (u.includes('s.shopee.com.br/MEU')) {
      return new Response(null, { status: 302, headers: { location: 'https://shopee.com.br/product/11/22?utm_source=an_18300000001' } });
    }
    return new Response('', { status: 200 });
  };

  let resposta = '';
  await conversor.tratarMensagemRecebida(mensagem('https://s.shopee.com.br/ALHEIO'), { enviar: async (t) => { resposta = t; } });
  assert.equal(pedidos[0].variables.linkParams[0].originalLink, 'https://shopee.com.br/product/11/22');
  assert.match(resposta, /s\.shopee\.com\.br\/MEU/);
  assert.match(resposta, /✅ seu ID conferido/);
});

test('mesma mensagem reenviada pela WAHA não gera duas respostas', async () => {
  const m = mensagem('https://www.amazon.com.br/dp/B0FONE1234');
  let enviadas = 0;
  await conversor.tratarMensagemRecebida(m, { enviar: async () => { enviadas += 1; } });
  await conversor.tratarMensagemRecebida(m, { enviar: async () => { enviadas += 1; } });
  assert.equal(enviadas, 1);
});

test('webhook: só aceita o que a SUA WAHA assinou, mesmo com o painel protegido por token', async () => {
  const corpo = JSON.stringify({ event: 'message', session: 'default', payload: { id: 'x1', from: '5511999990000@c.us', fromMe: false, body: 'oi' } });
  const assinar = (chave) => crypto.createHmac('sha512', chave).update(corpo).digest('hex');
  assert.equal(assinaturaWebhookValida(Buffer.from(corpo), assinar('segredo'), 'segredo'), true);
  assert.equal(assinaturaWebhookValida(Buffer.from(corpo), assinar('outra'), 'segredo'), false);
  assert.equal(lerMensagemDoWebhook(JSON.parse(corpo)).privada, true);
  assert.equal(lerMensagemDoWebhook({ event: 'message', payload: { from: '1203@g.us' } }).privada, false);

  const servidor = createApp().listen(0);
  const porta = servidor.address().port;
  const postar = (assinatura) => fetchOriginal(`http://127.0.0.1:${porta}/api/whatsapp/webhook`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-hmac': assinatura }, body: corpo,
  });
  try {
    config.whatsapp.webhookChave = '';
    assert.equal((await postar(assinar('segredo'))).status, 403, 'sem chave: desligado');
    config.whatsapp.webhookChave = 'segredo';
    assert.equal((await postar(assinar('errada'))).status, 401);
    assert.equal((await postar(assinar('segredo'))).status, 200);
  } finally {
    config.whatsapp.webhookChave = '';
    servidor.close();
  }
});

test.after(() => {
  globalThis.fetch = fetchOriginal;
  closeDb();
  for (const sufixo of ['', '-wal', '-shm']) fs.rmSync(`${arquivoTeste}${sufixo}`, { force: true });
});
