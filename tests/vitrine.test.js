/**
 * Vitrine: o post da Amazon leva para o seu site, e só o botão do site tem o
 * link de afiliado. Sobe a vitrine numa porta livre e navega nela.
 * Banco temporário — não toca nos seus dados.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arquivoTeste = path.join(os.tmpdir(), `afiliados-vitrine-${Date.now()}.db`);
process.env.DB_FILE = arquivoTeste;
process.env.WORKER_ENABLED = 'false';
process.env.DRY_RUN = 'true';
process.env.WHATSAPP_PROVIDER = 'mock';
process.env.AI_PROVIDER = 'mock';

const { getDb, closeDb } = await import('../src/core/db/index.js');
const repos = await import('../src/core/repositories/index.js');
const produtos = await import('../src/core/services/productService.js');
const publicacoes = await import('../src/core/services/publicationService.js');
const vitrine = await import('../src/core/services/vitrineService.js');
const { createVitrineApp } = await import('../src/vitrine/app.js');
const { TEMPLATES_PADRAO } = await import('../src/core/services/templateService.js');
const { salvarTagDaLoja } = await import('../src/core/services/lojaService.js');
const { LOJAS } = await import('../src/integrations/marketplaces/lojas.js');

getDb();
repos.templateRepository.create({ ...TEMPLATES_PADRAO[0], ativo: true, padrao: true });
salvarTagDaLoja(LOJAS.amazon, 'minhatag-20');

const fone = produtos.createProduct({
  marketplace: 'amazon',
  external_id: 'B0CX23V2ZK',
  titulo_original: 'Fone <b>Bluetooth</b> XYZ',
  preco_atual: 99.9,
  preco_anterior: 149.9,
  url_original: 'https://www.amazon.com.br/dp/B0CX23V2ZK',
  imagem_principal: 'https://m.media-amazon.com/images/I/abc.jpg',
});
const codigo = vitrine.codigoDoProduto(fone);

const servidor = createVitrineApp().listen(0);
const base = `http://127.0.0.1:${servidor.address().port}`;
const abrir = (caminho) => fetch(`${base}${caminho}`, { redirect: 'manual' });

test('vitrine desligada: post sai com o link da loja e o site não mostra produto', async () => {
  const post = await publicacoes.buildPublication({ product_id: fone.id });
  assert.match(post.mensagem, /amazon\.com\.br\/dp\/B0CX23V2ZK\?tag=minhatag-20/);
  assert.ok(post.avisos.some((a) => /VITRINE/.test(a)), 'avisa que a Amazon pede o site');
  assert.equal((await abrir('/')).status, 503);
});

test('ligada sem endereço público, continua com o link da loja (nunca link que ninguém abre)', async () => {
  vitrine.salvarConfigVitrine({ ativa: true });
  const post = await publicacoes.buildPublication({ product_id: fone.id });
  assert.equal(post.link_vitrine, null);
});

test('endereço precisa ser https completo; salva com a barra no final', () => {
  assert.throws(() => vitrine.salvarConfigVitrine({ url_publica: 'loja.com' }), /inválido/);
  assert.throws(() => vitrine.salvarConfigVitrine({ url_publica: 'http://loja.com.br' }), /https/);
  const cfg = vitrine.salvarConfigVitrine({ url_publica: 'https://loja.exemplo.com.br' });
  assert.equal(cfg.url_publica, 'https://loja.exemplo.com.br/');
});

test('ligada: post da Amazon leva para o site, sem a tag no texto', async () => {
  const post = await publicacoes.buildPublication({ product_id: fone.id });
  assert.equal(post.link_vitrine, `https://loja.exemplo.com.br/p/${codigo}`);
  assert.match(post.mensagem, new RegExp(`https://loja\\.exemplo\\.com\\.br/p/${codigo}`));
  assert.doesNotMatch(post.mensagem, /tag=minhatag-20/);
  assert.equal(post.pode_publicar, true);
});

test('Shopee só usa o site com "todas as lojas" marcado', () => {
  const shopee = { id: 'prd_x', marketplace: 'shopee' };
  assert.equal(vitrine.linkDaVitrine(shopee), null);
  vitrine.salvarConfigVitrine({ usar_todas: true });
  assert.match(vitrine.linkDaVitrine(shopee), /\/p\/x$/);
  vitrine.salvarConfigVitrine({ usar_todas: false });
});

test('página do produto: foto, preço, botão para a Amazon e aviso de associado; título escapado', async () => {
  const res = await abrir(`/p/${codigo}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /R\$\s?99,90/);
  assert.match(html, new RegExp(`href="/ir/${codigo}"`));
  assert.match(html, /Como Associado da Amazon/);
  assert.match(html, /Fone &lt;b&gt;Bluetooth&lt;\/b&gt; XYZ/);
  assert.doesNotMatch(html, /tag=minhatag-20/, 'o link de afiliado não aparece na página');
});

test('"Ir para a loja" redireciona com a tag e conta o clique', async () => {
  const res = await abrir(`/ir/${codigo}`);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /amazon\.com\.br\/dp\/B0CX23V2ZK\?tag=minhatag-20/);
  assert.equal(vitrine.resumoCliques(1).total, 1);
});

test('produto pausado some da vitrine; código estranho não quebra', async () => {
  repos.productRepository.update(fone.id, { status: 'pausado' });
  assert.equal((await abrir(`/p/${codigo}`)).status, 404);
  assert.equal((await abrir('/ir/../../etc')).status, 404);
  assert.equal((await abrir(`/ir/${codigo}`)).headers.get('location'), '/');
});

test('vitrine em outro site: envia a lista, traz os cliques e nunca devolve a senha', async () => {
  repos.productRepository.update(fone.id, { status: 'ativo' });
  vitrine.salvarConfigVitrine({
    ativa: true,
    url_publica: 'https://awaydev.com.br/ofertas/',
    sync_url: 'https://awaydev.com.br/ofertas/api/sincronizar',
    sync_token: 'segredo-da-sync',
  });

  let enviado = null;
  const fetchFalso = async (url, opcoes) => {
    enviado = { url, opcoes, corpo: JSON.parse(opcoes.body) };
    return { ok: true, status: 200, json: async () => ({ ok: true, recebidos: 1, cliques: [{ codigo, em: '2026-09-30T12:00:00.000Z' }] }) };
  };
  const antes = vitrine.resumoCliques(30).total;
  const r = await vitrine.sincronizarVitrine({ fetchImpl: fetchFalso });

  assert.equal(r.ok, true);
  assert.equal(enviado.opcoes.headers.Authorization, 'Bearer segredo-da-sync');
  const p = enviado.corpo.produtos.find((x) => x.codigo === codigo);
  assert.ok(p, 'produto ativo foi enviado');
  assert.equal(p.loja, 'amazon');
  assert.match(p.link, /tag=minhatag-20/);
  assert.equal(vitrine.resumoCliques(3650).total, antes + 1, 'clique do site entrou');

  const tela = vitrine.configParaTela();
  assert.equal(tela.sync_configurado, true);
  assert.ok(!JSON.stringify(tela).includes('segredo-da-sync'), 'a tela nunca recebe a senha');

  vitrine.salvarConfigVitrine({ sync_token: '' });
  assert.equal(vitrine.configVitrine().sync_token, 'segredo-da-sync', 'em branco mantem a senha');

  const post = await publicacoes.buildPublication({ product_id: fone.id });
  assert.match(post.mensagem, new RegExp(`https://awaydev\.com\.br/ofertas/p/${codigo}`));
});

test('vitrine em outro site: produto pausado sai da lista; site fora do ar vira erro registrado', async () => {
  repos.productRepository.update(fone.id, { status: 'pausado' });
  let corpo = null;
  await vitrine.sincronizarVitrine({ fetchImpl: async (_u, o) => { corpo = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } });
  assert.ok(!corpo.produtos.some((x) => x.codigo === codigo));

  const r = await vitrine.sincronizarVitrine({ fetchImpl: async () => { throw new Error('site fora do ar'); } });
  assert.equal(r.ok, false);
  assert.equal(vitrine.configParaTela().sync.erro, 'site fora do ar');
});

test('vitrine não mostra produto sem link de afiliado (clique sem comissão)', () => {
  const semTag = produtos.createProduct({
    marketplace: 'magalu', external_id: 'SEM-TAG-1', titulo_original: 'Produto sem link de afiliado',
    preco_atual: 10, url_original: 'https://www.magazineluiza.com.br/p/1',
  });
  assert.equal(semTag.url_afiliado ?? null, null);
  assert.equal(vitrine.produtoDaVitrine(vitrine.codigoDoProduto(semTag)), null);
});

test.after(() => {
  servidor.close();
  closeDb();
  fs.rmSync(arquivoTeste, { force: true });
});
