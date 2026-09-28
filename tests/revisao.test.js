/**
 * Bugs achados na revisão do projeto — cada teste aqui é um bug que existiu.
 * Banco temporário, sem rede (fetch trocado).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arquivoTeste = path.join(os.tmpdir(), `afiliados-revisao-${Date.now()}.db`);
process.env.DB_FILE = arquivoTeste;
process.env.DRY_RUN = 'true';
process.env.WORKER_ENABLED = 'false';
process.env.WHATSAPP_PROVIDER = 'mock';
process.env.AI_PROVIDER = 'mock';
process.env.BACKUP_DIR = path.join(os.tmpdir(), `afiliados-revisao-bkp-${Date.now()}`);

const { getDb, closeDb } = await import('../src/core/db/index.js');
const repos = await import('../src/core/repositories/index.js');
const { config } = await import('../src/config/index.js');
const publicacoes = await import('../src/core/services/publicationService.js');
const verificacao = await import('../src/core/services/verificacaoLinkService.js');
const { ehUrlDeLoja, ehEncurtador, ehLinkDeAfiliadoCurto, lojaDaUrl } = await import('../src/core/services/affiliateLinkService.js');
const { salvarTagDaLoja } = await import('../src/core/services/lojaService.js');
const { salvarSessao } = await import('../src/core/services/sessaoLojaService.js');
const { importProducts, expireStaleProducts } = await import('../src/core/services/productService.js');
const { linkParaCanal } = await import('../src/core/services/linkPorCanalService.js');
const { criarCanal } = await import('../src/core/services/canalService.js');
const { configuracoesSemSegredo, salvarAjustes } = await import('../src/core/services/configuracaoService.js');
const { createBackup } = await import('../src/core/services/maintenanceService.js');
const { firstSteps } = await import('../src/core/services/onboardingService.js');
const { lerMensagemDoWebhook } = await import('../src/integrations/whatsapp/wahaProvider.js');
const { LOJAS } = await import('../src/integrations/marketplaces/lojas.js');

getDb();
const fetchOriginal = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = fetchOriginal; });
const json = (dados) => new Response(JSON.stringify(dados), { status: 200 });

// ------------------------------------------------------------ segurança ---

test('o servidor só abre link de loja (nada de rede interna por "//meli.la/" no meio)', async () => {
  assert.equal(ehUrlDeLoja('http://169.254.169.254/latest/?x=//meli.la/'), false);
  assert.equal(ehEncurtador('http://169.254.169.254/latest/?x=//meli.la/'), false);
  assert.equal(ehLinkDeAfiliadoCurto('https://produto.mercadolivre.com.br/x?y=//meli.la/'), false);
  assert.equal(lojaDaUrl('http://evil.com/amazon.com'), null);

  const pedidos = [];
  globalThis.fetch = async (url) => { pedidos.push(String(url)); return new Response('', { status: 200 }); };
  await assert.rejects(verificacao.verificarLink('mercadolivre', 'http://169.254.169.254/?x=//meli.la/'), /link das lojas/);
  assert.equal(pedidos.length, 0, 'nenhuma requisição para endereço interno');
});

test('redirecionamento para fora das lojas não é seguido', async () => {
  const pedidos = [];
  globalThis.fetch = async (url) => {
    pedidos.push(String(url));
    return new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/admin' } });
  };
  const r = await verificacao.seguirLink('https://meli.la/abc');
  assert.deepEqual(pedidos, ['https://meli.la/abc']);
  assert.equal(r.destino, 'http://10.0.0.5/admin');
});

test('cookie da loja não sai pela API de configurações nem no backup em JSON', () => {
  salvarSessao('mercadolivre', JSON.stringify([{ name: '_csrf', value: 'SEGREDO-DO-COOKIE', domain: '.mercadolivre.com.br' }]));
  repos.settingRepository.set('score_weights', { vendas: 0.5 });

  const publicas = configuracoesSemSegredo();
  assert.ok(publicas.score_weights);
  assert.equal(JSON.stringify(publicas).includes('SEGREDO-DO-COOKIE'), false);

  const backup = createBackup({ rotulo: 'teste' });
  assert.equal(fs.readFileSync(backup.arquivo_json, 'utf8').includes('SEGREDO-DO-COOKIE'), false);
});

test('a API de configurações não grava chave que não é do painel (ex.: trocar o cookie)', () => {
  assert.throws(() => salvarAjustes({ sessao_loja_mercadolivre: { cookies: [] } }), /não podem ser alteradas/);
  assert.ok(salvarAjustes({ score_weights: { vendas: 0.4 } }).score_weights);
});

// ------------------------------------------------------------------ fila ---

test('worker e n8n juntos não furam a pausa entre envios reais', async () => {
  const canal = repos.channelRepository.create({
    nome: 'G', identificador: '1@g.us', status: 'ativo', hora_inicio: '00:00', hora_fim: '23:59', limite_diario: 100,
  });
  const produto = repos.productRepository.create({ marketplace: 'demo', titulo_original: 'X', preco_atual: 10, status: 'ativo' });
  for (let i = 0; i < 2; i += 1) {
    repos.publicationRepository.create({
      channel_id: canal.id, product_id: produto.id, mensagem: 'oferta', status: 'aguardando',
      tentativas: 0, dry_run: false, agendado_para: new Date(Date.now() - 1000).toISOString(),
    });
  }
  const dryRun = config.runtime.dryRun;
  config.runtime.dryRun = false;
  publicacoes.zerarPausaEntreEnvios();
  try {
    const [a, b] = await Promise.all([publicacoes.processQueue(), publicacoes.processQueue()]);
    assert.equal(a.enviadas + b.enviadas, 1, 'um envio real por vez, mesmo com duas chamadas juntas');
  } finally {
    config.runtime.dryRun = dryRun;
    publicacoes.zerarPausaEntreEnvios();
  }
});

// --------------------------------------------------------------- links ---

test('mais de 1000 produtos: apagar a tag tira a tag de TODOS (não só dos 1000 mais novos)', () => {
  salvarTagDaLoja(LOJAS.amazon, 'eu-20');
  const lote = Array.from({ length: 1005 }, (_, i) => ({
    marketplace: 'amazon', external_id: `B${String(i).padStart(9, '0')}`, titulo_original: `P${i}`,
    preco_atual: 10, url_original: `https://www.amazon.com.br/dp/B${String(i).padStart(9, '0')}`,
  }));
  importProducts(lote, 'busca');
  salvarTagDaLoja(LOJAS.amazon, '');
  const comTag = repos.productRepository.count({ marketplace: 'amazon', url_final: { like: '%tag=eu-20%' } });
  assert.equal(comTag, 0);
});

test('link por grupo guardado de OUTRA conta não é reusado depois que o ID é cadastrado', async () => {
  salvarSessao('shopee', JSON.stringify([{ name: 'SPC_EC', value: 's', domain: '.shopee.com.br' }]));
  salvarTagDaLoja(LOJAS.shopee, '');
  importProducts([{
    marketplace: 'shopee', external_id: 'i.9.9', titulo_original: 'Shopee X', preco_atual: 20,
    url_original: 'https://shopee.com.br/X-i.9.9',
  }], 'extensao');
  const produto = repos.productRepository.findOne({ external_id: 'i.9.9' });
  const grupo = criarCanal({ nome: 'Grupo A', identificador: '9@g.us' });

  // Sem ID cadastrado, o link (de outra conta) é aceito e guardado.
  globalThis.fetch = async () => json({ data: { batchCustomLink: [{ shortLink: 'https://s.shopee.com.br/ALHEIO', longLink: 'https://s.shopee.com.br/an_redir?affiliate_id=999', failCode: 0 }] } });
  assert.equal(await linkParaCanal(produto, grupo), 'https://s.shopee.com.br/ALHEIO');

  // Agora com o seu ID: o guardado não vale; o novo (da sua conta) vale.
  salvarTagDaLoja(LOJAS.shopee, '18300000001');
  globalThis.fetch = async () => json({ data: { batchCustomLink: [{ shortLink: 'https://s.shopee.com.br/MEU', longLink: 'https://s.shopee.com.br/an_redir?affiliate_id=18300000001', failCode: 0 }] } });
  assert.equal(await linkParaCanal(produto, grupo), 'https://s.shopee.com.br/MEU');
});

test('produto expirado volta a valer quando a oferta reaparece', () => {
  importProducts([{ marketplace: 'amazon', external_id: 'B0VOLTA001', titulo_original: 'Volta', preco_atual: 10, url_original: 'https://www.amazon.com.br/dp/B0VOLTA001' }], 'busca');
  const p = repos.productRepository.findOne({ external_id: 'B0VOLTA001' });
  repos.productRepository.update(p.id, { status: 'expirado' });
  importProducts([{ marketplace: 'amazon', external_id: 'B0VOLTA001', titulo_original: 'Volta', preco_atual: 9, url_original: 'https://www.amazon.com.br/dp/B0VOLTA001' }], 'busca');
  assert.equal(repos.productRepository.findById(p.id).status, 'ativo');

  repos.productRepository.update(p.id, { status: 'pausado' });
  importProducts([{ marketplace: 'amazon', external_id: 'B0VOLTA001', titulo_original: 'Volta', preco_atual: 9, url_original: 'https://www.amazon.com.br/dp/B0VOLTA001' }], 'busca');
  assert.equal(repos.productRepository.findById(p.id).status, 'pausado', 'pausado foi decisão sua');
  assert.equal(expireStaleProducts(30).expirados >= 0, true);
});

test('"Comece aqui" não conta conferência velha (link trocado ou ID antigo)', async () => {
  salvarTagDaLoja(LOJAS.amazon, 'eu-20');
  repos.linkCheckRepository.upsertBy({ url: 'https://amzn.to/velho' }, {
    loja: 'amazon', confere: false, id_esperado: 'outra-20', ids_encontrados: ['x'], destino: 'https://x', motivo: 'm', verificado_em: new Date().toISOString(),
  });
  const passo = (await firstSteps()).passos.find((p) => p.id === 'conferir_links');
  assert.doesNotMatch(passo.detalhe, /OUTRA conta/);
});

test('a lista de produtos mostra a mesma situação, lendo tudo de uma vez', () => {
  const produtos = repos.productRepository.list({ limit: 20 });
  const lote = verificacao.situacoesDosLinks(produtos);
  assert.deepEqual(lote, produtos.map((p) => verificacao.situacaoDoLink(p)));
});

test('webhook: a resposta sai pela sessão da WAHA que recebeu a mensagem', () => {
  const m = lerMensagemDoWebhook({ event: 'message', session: 'divulgacao', payload: { id: 'x', from: '5511@c.us', body: 'oi' } });
  assert.equal(m.sessao, 'divulgacao');
});

test.after(() => {
  globalThis.fetch = fetchOriginal;
  closeDb();
  for (const sufixo of ['', '-wal', '-shm']) fs.rmSync(`${arquivoTeste}${sufixo}`, { force: true });
  fs.rmSync(process.env.BACKUP_DIR, { recursive: true, force: true });
});
