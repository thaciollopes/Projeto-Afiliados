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

test.after(() => {
  closeDb();
  for (const sufixo of ['', '-wal', '-shm']) {
    const arquivo = `${arquivoTeste}${sufixo}`;
    if (fs.existsSync(arquivo)) { try { fs.rmSync(arquivo); } catch { /* windows pode segurar */ } }
  }
});
