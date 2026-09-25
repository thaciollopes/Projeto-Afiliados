/**
 * Teste de ponta a ponta do fluxo de publicação, em banco temporário:
 * produto -> fila -> envio (dry run) -> histórico -> duplicado.
 *
 * O banco fica em storage/cache/teste-*.db e é apagado no fim.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arquivoTeste = path.join(os.tmpdir(), `afiliados-teste-${Date.now()}.db`);
process.env.DB_FILE = arquivoTeste;
process.env.DRY_RUN = 'true';
process.env.WORKER_ENABLED = 'false';
process.env.WHATSAPP_PROVIDER = 'mock';
process.env.AI_PROVIDER = 'mock';

// Import dinâmico: o config precisa ler as variáveis acima antes de carregar.
const { getDb, closeDb } = await import('../src/core/db/index.js');
const repos = await import('../src/core/repositories/index.js');
const publicacoes = await import('../src/core/services/publicationService.js');
const campanhas = await import('../src/core/services/campaignService.js');
const produtos = await import('../src/core/services/productService.js');
const { TEMPLATES_PADRAO } = await import('../src/core/services/templateService.js');
const { config } = await import('../src/config/index.js');
const { seloMenorPreco } = await import('../src/core/services/historicoPrecoService.js');
const { importarPlanilhaEnviada, importProductsFromExcel } = await import('../src/core/services/excelService.js');
const { default: ExcelJS } = await import('exceljs');

getDb();

const template = repos.templateRepository.create({ ...TEMPLATES_PADRAO[0], ativo: true, padrao: true });

const produto = produtos.createProduct({
  marketplace: 'demo',
  external_id: 'T-1',
  titulo_original: 'Perfume de teste 100ml',
  categoria: 'Perfumaria',
  preco_atual: 159.9,
  preco_anterior: 199.9,
  url_original: 'https://exemplo.demo/produto/T-1',
  url_afiliado: 'https://exemplo.demo/produto/T-1?aff=abc',
  imagem_principal: '/assets/sem-imagem.svg',
  quantidade_vendas: 500,
  avaliacao: 4.7,
});

const canal = repos.channelRepository.create({
  nome: 'Grupo de teste',
  identificador: '1203630000@g.us',
  tipo: 'grupo', status: 'ativo',
  hora_inicio: '00:00', hora_fim: '23:59',
  intervalo_minutos: 1, limite_diario: 50,
});

test('derive calcula desconto e score ao cadastrar', () => {
  assert.equal(produto.desconto_percentual, 20);
  assert.ok(produto.score > 0);
  assert.equal(produto.url_final, produto.url_afiliado);
});

test('preview monta a mensagem e não bloqueia produto válido', async () => {
  const post = await publicacoes.buildPublication({ product_id: produto.id });

  assert.equal(post.pode_publicar, true);
  assert.deepEqual(post.bloqueios, []);
  assert.match(post.mensagem, /Perfume de teste/);
  assert.equal(post.precos.preco_final, 159.9);
});

test('produto indisponível é bloqueado antes de ir para a fila', async () => {
  const indisponivel = produtos.createProduct({
    marketplace: 'demo', external_id: 'T-2', titulo_original: 'Item fora de estoque',
    preco_atual: 50, url_original: 'https://x', disponibilidade: 'indisponivel',
  });

  const post = await publicacoes.buildPublication({ product_id: indisponivel.id });
  assert.equal(post.pode_publicar, false);
  assert.ok(post.bloqueios.includes('Produto indisponivel'));

  await assert.rejects(
    () => publicacoes.enqueue({ product_id: indisponivel.id, channel_id: canal.id }),
    /bloqueada/i,
  );
});

test('fila: enfileira, processa em dry run e registra histórico', async () => {
  const pub = await publicacoes.enqueue({
    product_id: produto.id, channel_id: canal.id, template_id: template.id,
  });
  assert.equal(pub.status, 'aguardando');

  const resultado = await publicacoes.processQueue({ limite: 5 });
  assert.equal(resultado.enviadas, 1);

  const enviada = repos.publicationRepository.findById(pub.id);
  assert.equal(enviada.status, 'enviado');
  assert.ok(enviada.enviado_em);
  assert.equal(enviada.dry_run, true);
  assert.equal(enviada.preco_final_publicado, 159.9);

  const atualizado = repos.productRepository.findById(produto.id);
  assert.ok(atualizado.data_ultima_publicacao, 'produto deve guardar a data da última publicação');
});

test('duplicado: mesmo produto no mesmo grupo é recusado dentro da janela', async () => {
  await assert.rejects(
    () => publicacoes.enqueue({ product_id: produto.id, channel_id: canal.id, nao_repetir_dias: 7 }),
    /ja publicado/i,
  );

  assert.equal(publicacoes.isDuplicate(produto.id, canal.id, 7), true);
  assert.equal(publicacoes.isDuplicate(produto.id, canal.id, 0), false);
});

test('janela do canal fecha fora do horário configurado', () => {
  const fechado = repos.channelRepository.create({
    nome: 'Fechado', identificador: '999@g.us', status: 'ativo',
    hora_inicio: '03:00', hora_fim: '03:01', intervalo_minutos: 30, limite_diario: 10,
  });

  const janela = publicacoes.channelWindowOpen(fechado, new Date('2026-01-01T12:00:00-03:00'));
  assert.equal(janela.aberto, false);
  assert.equal(janela.motivo, 'fora_do_horario');
});

test('campanha seleciona produtos e enfileira respeitando o dedupe', async () => {
  for (let i = 3; i <= 6; i += 1) {
    produtos.createProduct({
      marketplace: 'demo', external_id: `T-${i}`, titulo_original: `Produto ${i}`,
      categoria: 'Perfumaria', preco_atual: 40 + i, preco_anterior: 80 + i,
      url_original: `https://exemplo.demo/${i}`, quantidade_vendas: 100 * i,
    });
  }

  const campanha = campanhas.createCampaign({
    nome: 'Campanha de teste', modo: 'automatica', status: 'ativa',
    template_id: template.id, filtros: { categoria: 'Perfumaria', ordenacao: 'vendas' },
    intervalo_minutos: 1, nao_repetir_dias: 7, canais: [canal.id],
  });

  const r = await campanhas.runCampaign(campanha, { forcar: true });
  assert.equal(r.enfileiradas, 1, 'uma publicação por canal, por rodada');

  const fila = repos.publicationRepository.list({ filters: { status: 'aguardando' } });
  assert.equal(fila.length, 1);
  assert.notEqual(fila[0].product_id, produto.id, 'não repete o produto já publicado');
});

test('retry: publicação com erro volta para a fila zerando as tentativas', () => {
  const comErro = repos.publicationRepository.create({
    channel_id: canal.id, product_id: produto.id, mensagem: 'teste',
    status: 'erro', tentativas: 2, erro: 'falha simulada',
  });

  const reposta = publicacoes.retryPublication(comErro.id);
  assert.equal(reposta.status, 'aguardando');
  assert.equal(reposta.tentativas, 0);
  assert.equal(reposta.erro, null);
});

test('estatísticas refletem o que aconteceu', () => {
  const stats = publicacoes.publicationStats();
  assert.ok(stats.enviadas >= 1);
  assert.ok(stats.total >= 2);
});

/** Cancela o que sobrou na fila dos testes anteriores: cada teste abaixo começa limpo. */
function limparFila() {
  for (const pub of repos.publicationRepository.list({ filters: { status: ['aguardando', 'erro', 'enviando'] }, limit: 500 })) {
    repos.publicationRepository.update(pub.id, { status: 'cancelado' });
  }
}

function pubNaFila(extra = {}) {
  return repos.publicationRepository.create({
    channel_id: canal.id, product_id: produto.id, mensagem: 'Oferta de teste com link',
    status: 'aguardando', tentativas: 0, dry_run: true, agendado_para: new Date(Date.now() - 1000).toISOString(),
    ...extra,
  });
}

test('worker e n8n processando juntos não postam duplicado', async () => {
  limparFila();
  const pub = pubNaFila();

  const [a, b] = await Promise.all([
    publicacoes.processQueue({ limite: 5 }),
    publicacoes.processQueue({ limite: 5 }),
  ]);
  assert.equal(a.enviadas + b.enviadas, 1, 'a mesma publicação sai uma vez só');
  assert.equal(repos.publicationRepository.findById(pub.id).status, 'enviado');
});

test('botão "enviar" em publicação já enviada não manda de novo', async () => {
  limparFila();
  const pub = pubNaFila({ status: 'enviado' });
  const r = await publicacoes.sendPublication(pub);
  assert.equal(r.ok, false);
  assert.equal(r.ignorada, true);
});

test('envio de verdade: pausa sorteada entre um post e outro (anti-bloqueio)', async () => {
  limparFila();
  const dryRunOriginal = config.runtime.dryRun;
  const pausaOriginal = { ...config.envio };
  config.runtime.dryRun = false;
  config.envio.pausaMinSegundos = 60;
  config.envio.pausaMaxSegundos = 60;
  publicacoes.zerarPausaEntreEnvios();
  try {
    const outroCanal = repos.channelRepository.create({
      nome: 'Grupo 2', identificador: '222@g.us', status: 'ativo',
      hora_inicio: '00:00', hora_fim: '23:59', intervalo_minutos: 1, limite_diario: 100,
    });
    pubNaFila({ dry_run: false });
    pubNaFila({ dry_run: false, channel_id: outroCanal.id });

    const r = await publicacoes.processQueue({ limite: 10 });
    assert.equal(r.enviadas, 1, 'só um envio real por vez');
    assert.ok(r.detalhes.some((d) => d.motivo === 'pausa_entre_envios'));

    const pausa = publicacoes.sortearPausaMs();
    assert.equal(pausa, 60000);
  } finally {
    config.runtime.dryRun = dryRunOriginal;
    Object.assign(config.envio, pausaOriginal);
    publicacoes.zerarPausaEntreEnvios();
    limparFila();
  }
});

test('publicação presa em "enviando" vira erro com alerta, sem reenviar sozinha', async () => {
  limparFila();
  const presa = pubNaFila({ status: 'enviando' });
  // atualizado_em é gravado pelo repositório; envelhece direto no banco.
  getDb().prepare('UPDATE publications SET atualizado_em = ? WHERE id = ?')
    .run(new Date(Date.now() - 3600000).toISOString(), presa.id);

  const r = await publicacoes.processQueue({ limite: 5 });
  assert.equal(r.enviadas, 0);
  const depois = repos.publicationRepository.findById(presa.id);
  assert.equal(depois.status, 'erro');
  assert.match(depois.erro, /Confira no grupo/);
  assert.equal(depois.tentativas, publicacoes.MAX_TENTATIVAS, 'não volta para a fila sozinha');
});

test('selo "menor preço": só com histórico que prove a queda', () => {
  const agora = new Date('2026-09-25T12:00:00Z');
  const diasAtras = (d) => new Date(agora.getTime() - d * 86400000).toISOString();
  const criar = (id, coleta) => repos.productRepository.create({
    marketplace: 'demo', external_id: id, titulo_original: id, preco_atual: 80, data_coleta: coleta, status: 'ativo',
  });
  const historico = (produtoId, de, para, dias) => repos.priceHistoryRepository.create({
    product_id: produtoId, preco_anterior: de, preco_novo: para, criado_em: diasAtras(dias),
  });

  const caiu = criar('SELO-1', diasAtras(20));
  historico(caiu.id, 100, 90, 10);
  historico(caiu.id, 90, 80, 2);
  assert.match(seloMenorPreco(caiu, { reference: agora }).selo, /Menor preço que registramos em 30 dias/);

  const novo = criar('SELO-2', diasAtras(3));
  historico(novo.id, 100, 80, 1);
  assert.equal(seloMenorPreco(novo, { reference: agora }), null, 'produto de 3 dias não tem histórico para provar nada');

  const subiuDepois = criar('SELO-3', diasAtras(20));
  historico(subiuDepois.id, 70, 80, 5);
  assert.equal(seloMenorPreco(subiuDepois, { reference: agora }), null, 'já esteve mais barato: não é o menor');

  const semHistorico = criar('SELO-4', diasAtras(20));
  assert.equal(seloMenorPreco(semHistorico, { reference: agora }), null, 'preço parado não é queda');
});

async function planilhaBase64(linhas) {
  const wb = new ExcelJS.Workbook();
  const aba = wb.addWorksheet('produtos');
  aba.addRow(['titulo', 'preco', 'url']);
  for (const l of linhas) aba.addRow(l);
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}

test('planilha: a segunda não sobrescreve a primeira e a loja vem do link', async () => {
  await importarPlanilhaEnviada(await planilhaBase64([['Fone A', 99.9, 'https://produto.mercadolivre.com.br/MLB-111-fone']]), 'a.xlsx');
  await importarPlanilhaEnviada(await planilhaBase64([['Mouse B', 49.9, 'https://www.amazon.com.br/dp/B0MOUSE001']]), 'b.xlsx');

  const a = repos.productRepository.findOne({ titulo_original: 'Fone A' });
  const b = repos.productRepository.findOne({ titulo_original: 'Mouse B' });
  assert.ok(a && b, 'os dois produtos continuam na base');
  assert.equal(a.marketplace, 'mercadolivre');
  assert.equal(b.marketplace, 'amazon');

  await assert.rejects(importProductsFromExcel('/etc/passwd'), /pasta storage/);
  await assert.rejects(importarPlanilhaEnviada('abc', 'virus.exe'), /\.xlsx/);
});

test.after(() => {
  closeDb();
  for (const sufixo of ['', '-wal', '-shm']) {
    const arquivo = `${arquivoTeste}${sufixo}`;
    if (fs.existsSync(arquivo)) { try { fs.rmSync(arquivo); } catch { /* windows pode segurar */ } }
  }
});
