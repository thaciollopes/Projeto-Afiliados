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
const { importProducts, expireStaleProducts, deleteProduct } = await import('../src/core/services/productService.js');
const { linkParaCanal } = await import('../src/core/services/linkPorCanalService.js');
const { criarCanal, removerCanal } = await import('../src/core/services/canalService.js');
const { configuracoesSemSegredo, salvarAjustes } = await import('../src/core/services/configuracaoService.js');
const { createBackup } = await import('../src/core/services/maintenanceService.js');
const { firstSteps } = await import('../src/core/services/onboardingService.js');
const { lerMensagemDoWebhook } = await import('../src/integrations/whatsapp/wahaProvider.js');
const { LOJAS } = await import('../src/integrations/marketplaces/lojas.js');
const { enforceFactualText } = await import('../src/integrations/ai/guards.js');
const { saveCleanupSettings, cleanupSettings } = await import('../src/core/services/maintenanceService.js');
const { createPromotion } = await import('../src/core/services/promotionService.js');
const { resumoSessao } = await import('../src/core/services/sessaoLojaService.js');

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

test('fila: 200 erros definitivos antigos não impedem o post novo de sair', async () => {
  const canal = repos.channelRepository.create({
    nome: 'Fila cheia', identificador: '9@g.us', status: 'ativo', hora_inicio: '00:00', hora_fim: '23:59', limite_diario: 1000,
  });
  const produto = repos.productRepository.create({ marketplace: 'demo', titulo_original: 'Y', preco_atual: 10, status: 'ativo' });
  const antigo = new Date(Date.now() - 86400000).toISOString();
  const db = getDb();
  db.exec('BEGIN');
  for (let i = 0; i < 210; i += 1) {
    repos.publicationRepository.create({
      channel_id: canal.id, product_id: produto.id, mensagem: 'velha', status: 'erro',
      tentativas: publicacoes.MAX_TENTATIVAS, dry_run: true, agendado_para: antigo,
    });
  }
  db.exec('COMMIT');
  const nova = repos.publicationRepository.create({
    channel_id: canal.id, product_id: produto.id, mensagem: 'nova', status: 'aguardando',
    tentativas: 0, dry_run: true, agendado_para: new Date(Date.now() - 1000).toISOString(),
  });
  await publicacoes.processQueue({ limite: 50 });
  assert.equal(repos.publicationRepository.findById(nova.id).status, 'enviado');
});

test('produto apagado logo depois de entrar na fila não sai no grupo', async () => {
  const canal = repos.channelRepository.create({
    nome: 'Apagado', identificador: '8@g.us', status: 'ativo', hora_inicio: '00:00', hora_fim: '23:59', limite_diario: 100,
  });
  const produto = repos.productRepository.create({ marketplace: 'demo', titulo_original: 'Z', preco_atual: 10, status: 'ativo' });
  const pub = repos.publicationRepository.create({
    channel_id: canal.id, product_id: produto.id, mensagem: 'oferta', status: 'aguardando',
    tentativas: 0, dry_run: true, agendado_para: new Date(Date.now() - 1000).toISOString(),
  });
  repos.productRepository.remove(produto.id); // sem passar pelo deleteProduct: a checagem no envio segura sozinha
  await publicacoes.sendPublication(repos.publicationRepository.findById(pub.id), canal);
  assert.notEqual(repos.publicationRepository.findById(pub.id).status, 'enviado');
});

test('apagar produto cancela o post na fila e leva junto a promoção dele', () => {
  const canal = repos.channelRepository.create({ nome: 'P', identificador: '7@g.us', status: 'ativo' });
  const produto = repos.productRepository.create({ marketplace: 'demo', titulo_original: 'W', preco_atual: 50, status: 'ativo' });
  const promo = createPromotion({ nome: 'Promo W', product_id: produto.id, preco_normal: 50, preco_promocional: 40 });
  const pub = repos.publicationRepository.create({ channel_id: canal.id, product_id: produto.id, mensagem: 'x', status: 'aguardando', tentativas: 0 });
  deleteProduct(produto.id);
  assert.equal(repos.publicationRepository.findById(pub.id).status, 'cancelado');
  assert.equal(repos.promotionRepository.findById(promo.id), null);
});

test('apagar grupo tira ele das campanhas e cancela os posts pendentes', () => {
  const canal = repos.channelRepository.create({ nome: 'Some', identificador: '6@g.us', status: 'ativo' });
  const campanha = repos.campaignRepository.create({ nome: 'C', status: 'pausada', modo: 'manual' });
  repos.campaignTargetRepository.create({ campaign_id: campanha.id, channel_id: canal.id, ativo: true });
  const pub = repos.publicationRepository.create({ channel_id: canal.id, mensagem: 'x', status: 'aguardando', tentativas: 0 });
  const r = removerCanal(canal.id);
  assert.equal(r.posts_cancelados, 1);
  assert.equal(repos.campaignTargetRepository.count({ channel_id: canal.id }), 0);
  assert.equal(repos.publicationRepository.findById(pub.id).status, 'cancelado');
});

test('produto arquivado não é publicado', async () => {
  const produto = repos.productRepository.create({
    marketplace: 'amazon', titulo_original: 'Arquivado', preco_atual: 10, status: 'arquivado',
    url_original: 'https://www.amazon.com.br/dp/B0ARQUIVO1',
  });
  const post = await publicacoes.buildPublication({ product_id: produto.id });
  assert.ok(post.bloqueios.includes('Produto arquivado'));
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

// ----------------------------------------------------------- segunda rodada --

const FATOS = { precos_permitidos: [49.9], percentuais_permitidos: [20], cupom_permitido: 'BEMVINDO', avaliacao: 4.8, vendas: 1500 };

test('trava da IA: "cupom abaixo" não é código de cupom e a frase fica inteira', () => {
  for (const frase of ['Use o cupom abaixo e economize', 'Aproveite o codigo promocional da loja', 'CUPOM DE DESCONTO liberado']) {
    const r = enforceFactualText(frase, FATOS);
    assert.equal(r.texto, frase);
    assert.equal(r.limpo, true);
  }
  assert.equal(enforceFactualText('cupom PROMO10 vale', FATOS).limpo, false);
  assert.equal(enforceFactualText('cupom BEMVINDO vale', FATOS).limpo, true);
});

test('trava da IA: preço sem "R$" também é conferido', () => {
  assert.equal(enforceFactualText('Por apenas 39,90 reais!', FATOS).texto, 'Por apenas !');
  assert.equal(enforceFactualText('Por 1.299,00 no pix', FATOS).limpo, false);
  assert.equal(enforceFactualText('Por apenas 49,90 reais!', FATOS).limpo, true);
  assert.equal(enforceFactualText('Kit com 3 unidades, 2 anos de garantia', FATOS).limpo, true);
});

test('trava da IA: nota e vendas inventadas saem; as verdadeiras ficam', () => {
  assert.equal(enforceFactualText('4,8 estrelas e mais de 1 mil vendidos', FATOS).limpo, true);
  const r = enforceFactualText('Nota 4.9 e mais de 10 mil vendidos', FATOS);
  assert.equal(r.violacoes.length, 2);
  assert.equal(enforceFactualText('nota 5', { ...FATOS, avaliacao: null }).limpo, false);
});

test('limpeza: prazo negativo é recusado (apagava todo o histórico) e valor ruim salvo antes desliga a regra', () => {
  const antes = repos.settingRepository.get('limpeza');
  try {
    assert.throws(() => saveCleanupSettings({ logs_dias: -1 }), /numero de dias/);
    assert.throws(() => saveCleanupSettings({ logs_dias: 'abc' }), /numero de dias/);
    saveCleanupSettings({ logs_dias: 10, chave_estranha: 1 });
    assert.equal(cleanupSettings().logs_dias, 10);
    assert.equal('chave_estranha' in repos.settingRepository.get('limpeza'), false);

    repos.settingRepository.set('limpeza', { logs_dias: -3, publicacoes_dias: 'x' });
    assert.equal(cleanupSettings().logs_dias, 0);
    assert.equal(cleanupSettings().publicacoes_dias, 0);
  } finally {
    if (antes) repos.settingRepository.set('limpeza', antes); else repos.settingRepository.remove('limpeza');
  }
});

test('listAll: registros com o mesmo criado_em não somem nem repetem na virada de página', () => {
  const mesmoInstante = '2020-01-01T00:00:00.000Z';
  const db = getDb();
  const inserir = db.prepare('INSERT INTO logs (id, level, service, message, timestamp, criado_em) VALUES (?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  for (let i = 0; i < 1500; i += 1) inserir.run(`log_empate_${i}`, 'info', 'teste-empate', 'x', mesmoInstante, mesmoInstante);
  db.exec('COMMIT');
  const todos = repos.logRepository.listAll({ filters: { service: 'teste-empate' }, sort: 'criado_em DESC' });
  assert.equal(new Set(todos.map((l) => l.id)).size, 1500);
});

test('prévia do template usa a promoção ativa, como o post de verdade', async () => {
  const produto = repos.productRepository.create({
    titulo_original: 'Produto da previa', marketplace: 'amazon', preco_atual: 100, status: 'ativo',
    url_original: 'https://www.amazon.com.br/dp/B0PREVIA01', external_id: 'B0PREVIA01',
  });
  createPromotion({ nome: 'Promo previa', product_id: produto.id, preco_normal: 100, preco_promocional: 70 });
  const previa = publicacoes.previaDoTemplate('{preco_final}', { product_id: produto.id });
  const post = await publicacoes.buildPublication({ product_id: produto.id, template_id: null });
  assert.equal(previa.precos.preco_final, 70);
  assert.equal(previa.precos.preco_final, post.precos.preco_final);
});

test('cookie: falta o cookie da sessão -> recusa ao salvar; telemetria de 15 min não marca "expirado"', () => {
  assert.throws(
    () => salvarSessao('shopee', JSON.stringify([{ name: 'outro', value: 'x' }]), { obrigatorios: ['SPC_EC'] }),
    /Faltou o cookie "SPC_EC"/,
  );
  const agora = Date.now() / 1000;
  salvarSessao('magalu', JSON.stringify([
    { name: '_dd_s', value: 'x', expirationDate: agora + 900 },
    { name: 'sessao', value: 'y', expirationDate: agora + 30 * 86400 },
  ]));
  const resumo = resumoSessao('magalu');
  assert.equal(resumo.expirou, false);
  assert.ok(new Date(resumo.expira_em) > new Date(Date.now() + 86400000));
});

test.after(() => {
  globalThis.fetch = fetchOriginal;
  closeDb();
  for (const sufixo of ['', '-wal', '-shm']) fs.rmSync(`${arquivoTeste}${sufixo}`, { force: true });
  fs.rmSync(process.env.BACKUP_DIR, { recursive: true, force: true });
});
