/**
 * Canais: "digitando" no WhatsApp, Telegram, validação do cadastro e o link
 * da Shopee com o sub ID de cada grupo. Sem rede (fetch trocado) e em banco
 * temporário.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arquivoTeste = path.join(os.tmpdir(), `afiliados-canais-${Date.now()}.db`);
process.env.DB_FILE = arquivoTeste;
process.env.DRY_RUN = 'true';
process.env.WORKER_ENABLED = 'false';
process.env.WHATSAPP_PROVIDER = 'mock';
process.env.AI_PROVIDER = 'mock';

const { getDb, closeDb } = await import('../src/core/db/index.js');
const repos = await import('../src/core/repositories/index.js');
const { WahaProvider, tempoDigitando } = await import('../src/integrations/whatsapp/wahaProvider.js');
const { TelegramProvider, whatsappParaHtml } = await import('../src/integrations/telegram/telegramProvider.js');
const { criarCanal, atualizarCanal } = await import('../src/core/services/canalService.js');
const { linkParaCanal, subIdDoCanal } = await import('../src/core/services/linkPorCanalService.js');
const { salvarSessao } = await import('../src/core/services/sessaoLojaService.js');
const { salvarTagDaLoja } = await import('../src/core/services/lojaService.js');
const { importProducts } = await import('../src/core/services/productService.js');
const { buildPublication } = await import('../src/core/services/publicationService.js');
const { TEMPLATES_PADRAO } = await import('../src/core/services/templateService.js');
const { LOJAS } = await import('../src/integrations/marketplaces/lojas.js');

getDb();
repos.templateRepository.create({ ...TEMPLATES_PADRAO[0], ativo: true, padrao: true });

const fetchOriginal = globalThis.fetch;
function trocarFetch(responder) {
  const chamadas = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    chamadas.push({ url: String(url), corpo: opcoes.body ? JSON.parse(opcoes.body) : null });
    return responder(String(url), opcoes);
  };
  return chamadas;
}
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status });
test.afterEach(() => { globalThis.fetch = fetchOriginal; });

// ------------------------------------------------------ digitando (WAHA) ---

test('WhatsApp: mostra "digitando" antes de enviar', async () => {
  const chamadas = trocarFetch(() => json({ id: 'msg1' }));
  const waha = new WahaProvider({ baseUrl: 'http://waha', session: 'default' });
  let esperou = 0;
  waha.esperar = async (ms) => { esperou = ms; };

  await waha.sendMessage({ chatId: '123@g.us', texto: 'Oferta boa' });
  assert.deepEqual(chamadas.map((c) => new URL(c.url).pathname), ['/api/startTyping', '/api/stopTyping', '/api/sendText']);
  assert.ok(esperou >= 2000 && esperou <= 6000);
});

test('WhatsApp: canal (@newsletter) não tem "digitando"; falha no digitando não impede o envio', async () => {
  let chamadas = trocarFetch(() => json({ id: 'msg1' }));
  const waha = new WahaProvider({ baseUrl: 'http://waha' });
  waha.esperar = async () => {};
  await waha.sendMessage({ chatId: '999@newsletter', texto: 'Oferta' });
  assert.deepEqual(chamadas.map((c) => new URL(c.url).pathname), ['/api/sendText']);

  chamadas = trocarFetch((url) => (url.includes('Typing') ? json({ message: 'nao suportado' }, 501) : json({ id: 'ok' })));
  const r = await waha.sendMessage({ chatId: '123@g.us', texto: 'Oferta' });
  assert.equal(r.id, 'ok');
});

test('tempo de "digitando" fica entre 2 e 6 segundos', () => {
  assert.equal(tempoDigitando(''), 2000);
  assert.equal(tempoDigitando('x'.repeat(10000)), 6000);
});

// ----------------------------------------------------------- Telegram ---

test('Telegram: formatação do WhatsApp vira HTML (e o resto é escapado)', () => {
  assert.equal(whatsappParaHtml('*OFERTA* ~R$ 10~ <b>'), '<b>OFERTA</b> <s>R$ 10</s> &lt;b&gt;');
  assert.equal(whatsappParaHtml('link https://x.com/a_b_c'), 'link https://x.com/a_b_c', 'URL com _ fica intacta');
});

test('Telegram: foto com legenda; se a foto falhar, vai só o texto', async () => {
  const chamadas = [];
  const tg = new TelegramProvider({
    token: 'TOKEN',
    fetchImpl: async (url, opcoes) => {
      chamadas.push({ metodo: url.split('/').pop(), corpo: JSON.parse(opcoes.body) });
      if (url.endsWith('/sendPhoto')) return json({ ok: false, description: 'wrong file' });
      return json({ ok: true, result: { message_id: 42 } });
    },
  });
  const r = await tg.sendMessage({ chatId: '@meucanal', texto: '*Fone* por R$ 99', imagem: 'https://img/x.jpg' });
  assert.deepEqual(chamadas.map((c) => c.metodo), ['sendPhoto', 'sendMessage']);
  assert.equal(chamadas[1].corpo.parse_mode, 'HTML');
  assert.equal(chamadas[1].corpo.text, '<b>Fone</b> por R$ 99');
  assert.equal(r.id, '42');
});

test('Telegram sem token diz o que falta', async () => {
  const st = await new TelegramProvider({ token: '' }).status();
  assert.equal(st.online, false);
  assert.match(st.erro, /TELEGRAM_BOT_TOKEN/);
});

// ------------------------------------------------ cadastro de canais ---

test('canal do Telegram com identificador inválido é recusado na entrada', () => {
  assert.throws(() => criarCanal({ nome: 'X', identificador: 'meu canal', provider: 'telegram' }), /Telegram/);
  const ok = criarCanal({ nome: 'Canal TG', identificador: '@ofertasdothiago', provider: 'telegram' });
  assert.equal(ok.provider, 'telegram');
  assert.throws(() => criarCanal({ nome: 'X', identificador: '1@g.us', provider: 'sms' }), /não existe/);
});

test('sub ID: só letras e números; vazio nasce do nome e fica gravado', () => {
  const canal = criarCanal({ nome: 'Ofertas Relâmpago #1', identificador: '111@g.us' });
  assert.equal(subIdDoCanal(canal), 'OfertasRelampago1');
  assert.equal(repos.channelRepository.findById(canal.id).sub_id, 'OfertasRelampago1', 'gravado: renomear o grupo não divide o relatório');

  const editado = atualizarCanal(canal.id, { sub_id: 'grupo vip!' });
  assert.equal(editado.sub_id, 'grupovip');
});

// ------------------------------------------- Shopee: link por grupo ---

test('Shopee: cada grupo ganha o seu link com sub ID, gerado uma vez só', async () => {
  salvarSessao('shopee', JSON.stringify([{ name: 'SPC_EC', value: 's', domain: '.shopee.com.br' }]));
  salvarTagDaLoja(LOJAS.shopee, '18300000001');
  importProducts([{
    marketplace: 'shopee', external_id: 'i.1.2', titulo_original: 'Fone Shopee', preco_atual: 50,
    url_original: 'https://shopee.com.br/Fone-i.1.2', url_afiliado: 'https://s.shopee.com.br/NORMAL',
  }], 'extensao');
  const produto = repos.productRepository.findOne({ external_id: 'i.1.2' });
  const grupo = criarCanal({ nome: 'Grupo VIP', identificador: '222@g.us' });

  const chamadas = trocarFetch(() => json({
    data: { batchCustomLink: [{ shortLink: 'https://s.shopee.com.br/VIP', longLink: 'https://s.shopee.com.br/an_redir?affiliate_id=18300000001&sub_id=GrupoVIP', failCode: 0 }] },
  }));

  assert.equal(await linkParaCanal(produto, grupo), 'https://s.shopee.com.br/VIP');
  assert.deepEqual(chamadas[0].corpo.variables.linkParams[0].advancedLinkParams, { subId1: 'GrupoVIP' });

  assert.equal(await linkParaCanal(produto, grupo), 'https://s.shopee.com.br/VIP');
  assert.equal(chamadas.length, 1, 'segunda vez vem do banco, sem chamar a Shopee');
});

test('Shopee: o post do grupo sai com o link do grupo; o produto guarda o link normal', async () => {
  const produto = repos.productRepository.findOne({ external_id: 'i.1.2' });
  const grupo = repos.channelRepository.findOne({ identificador: '222@g.us' });
  // Conferência do link normal (s.shopee/NORMAL): responde com o seu ID.
  trocarFetch(() => new Response(null, { status: 302, headers: { location: 'https://shopee.com.br/p?utm_source=an_18300000001' } }));

  const post = await buildPublication({ product_id: produto.id, channel_id: grupo.id });
  assert.match(post.mensagem, /s\.shopee\.com\.br\/VIP/);
  assert.equal(post.link_canal.sub_id, 'GrupoVIP');
  assert.equal(repos.productRepository.findById(produto.id).url_final, 'https://s.shopee.com.br/NORMAL');
});

test('Shopee: link com sub ID de outra conta não é usado', async () => {
  const produto = repos.productRepository.findOne({ external_id: 'i.1.2' });
  const outro = criarCanal({ nome: 'Grupo Dois', identificador: '333@g.us' });
  trocarFetch(() => json({
    data: { batchCustomLink: [{ shortLink: 'https://s.shopee.com.br/ALHEIO', longLink: 'https://s.shopee.com.br/an_redir?affiliate_id=999', failCode: 0 }] },
  }));
  assert.equal(await linkParaCanal(produto, outro), null);
});

test.after(() => {
  globalThis.fetch = fetchOriginal;
  closeDb();
  for (const sufixo of ['', '-wal', '-shm']) fs.rmSync(`${arquivoTeste}${sufixo}`, { force: true });
});
