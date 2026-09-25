/**
 * O ID de afiliado chega mesmo na loja? Conversão da Shopee pelo cookie,
 * conferência do ID no destino do link e os caminhos por onde o link de
 * afiliado se perdia. Sem rede: o `fetch` é trocado por respostas gravadas no
 * formato que as lojas devolvem. Banco temporário.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arquivoTeste = path.join(os.tmpdir(), `afiliados-link-${Date.now()}.db`);
process.env.DB_FILE = arquivoTeste;
process.env.DRY_RUN = 'true';
process.env.WORKER_ENABLED = 'false';
process.env.WHATSAPP_PROVIDER = 'mock';
process.env.AI_PROVIDER = 'mock';

const { getDb, closeDb } = await import('../src/core/db/index.js');
const repos = await import('../src/core/repositories/index.js');
const shopee = await import('../src/core/services/shopeeLinkService.js');
const verificacao = await import('../src/core/services/verificacaoLinkService.js');
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
    chamadas.push({ url: String(url), opcoes });
    return responder(String(url), opcoes);
  };
  return chamadas;
}
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status });
const redireciona = (para) => new Response(null, { status: 302, headers: { location: para } });

test.afterEach(() => { globalThis.fetch = fetchOriginal; });

// ------------------------------------------------------------ Shopee ---

test('Shopee: link curto é reconhecido; link de produto é limpo do rastreio alheio', () => {
  assert.equal(shopee.jaEhLinkDeAfiliado('https://s.shopee.com.br/7AbCdE'), true);
  assert.equal(shopee.jaEhLinkDeAfiliado('https://shopee.com.br/Perfume-i.123.456'), false);
  assert.equal(shopee.ehLinkDaShopee('https://shopee.com.br/Perfume-i.123.456?sp_atk=x'), true);
  assert.equal(
    shopee.linkLimpo('https://shopee.com.br/Perfume-100ml-i.123.456?sp_atk=abc&utm_source=an_999'),
    'https://shopee.com.br/product/123/456',
  );
  assert.equal(shopee.idNoLink('https://s.shopee.com.br/an_redir?origin_link=x&affiliate_id=18300000001'), '18300000001');
  assert.equal(shopee.idNoLink('https://shopee.com.br/product/1/2?utm_source=an_18300000001'), '18300000001');
});

test('Shopee: sem cookie, diz o que falta em vez de fingir', async () => {
  await assert.rejects(shopee.converterLinks(['https://shopee.com.br/x-i.1.2']), /cookie da Shopee/);
});

test('Shopee: converte pelo cookie no formato do painel (batchCustomLink)', async () => {
  salvarSessao('shopee', JSON.stringify([
    { name: 'SPC_EC', value: 'sessao', domain: '.shopee.com.br' },
    { name: 'csrftoken', value: 'tok', domain: '.shopee.com.br' },
  ]));
  const chamadas = trocarFetch(() => json({
    data: {
      batchCustomLink: [
        { shortLink: 'https://s.shopee.com.br/AAA111', longLink: 'https://s.shopee.com.br/an_redir?affiliate_id=18300000001', failCode: 0 },
        { shortLink: '', longLink: '', failCode: 1 },
      ],
    },
  }));

  const r = await shopee.converterLinks([
    'https://shopee.com.br/Perfume-i.123.456?sp_atk=alheio',
    'https://shopee.com.br/Outro-i.7.8',
  ]);

  assert.equal(chamadas.length, 1);
  assert.match(chamadas[0].url, /affiliate\.shopee\.com\.br\/api\/v3\/gql\?q=batchCustomLink/);
  const corpo = JSON.parse(chamadas[0].opcoes.body);
  assert.equal(corpo.operationName, 'batchGetCustomLink');
  assert.equal(corpo.variables.linkParams[0].originalLink, 'https://shopee.com.br/product/123/456',
    'o rastreio de outra pessoa não vai junto');
  assert.match(chamadas[0].opcoes.headers.cookie, /SPC_EC=sessao/);

  assert.equal(r.convertidos, 1);
  assert.equal(r.falhas, 1);
  assert.equal(r.affiliate_id, '18300000001');
  assert.equal(r.resultados[0].link, 'https://s.shopee.com.br/AAA111');
});

test('Shopee: sessão recusada vira mensagem clara', async () => {
  trocarFetch(() => json({ errors: [{ message: 'not login' }] }));
  await assert.rejects(shopee.converterLinks(['https://shopee.com.br/x-i.1.2']), /não reconheceu o login/);
  trocarFetch(() => new Response('', { status: 403 }));
  await assert.rejects(shopee.converterLinks(['https://shopee.com.br/x-i.1.2']), /recusou a sessão/);
});

test('Shopee: cookie de OUTRA conta não grava link nenhum', async () => {
  importProducts([{
    marketplace: 'shopee', external_id: 'i.123.456', titulo_original: 'Perfume Shopee',
    preco_atual: 50, url_original: 'https://shopee.com.br/Perfume-i.123.456',
  }], 'extensao');
  salvarTagDaLoja(LOJAS.shopee, '18399999999');
  trocarFetch(() => json({
    data: { batchCustomLink: [{ shortLink: 'https://s.shopee.com.br/BBB', longLink: 'https://s.shopee.com.br/an_redir?affiliate_id=18300000001', failCode: 0 }] },
  }));

  await assert.rejects(shopee.converterProdutos(), /conta de afiliado 18300000001.*18399999999/);
  const produto = repos.productRepository.findOne({ external_id: 'i.123.456' });
  assert.equal(produto.url_final, 'https://shopee.com.br/Perfume-i.123.456', 'nada gravado');
});

test('Shopee: com o ID certo, grava o link curto no produto', async () => {
  salvarTagDaLoja(LOJAS.shopee, '18300000001');
  trocarFetch(() => json({
    data: { batchCustomLink: [{ shortLink: 'https://s.shopee.com.br/CCC', longLink: 'https://s.shopee.com.br/an_redir?affiliate_id=18300000001', failCode: 0 }] },
  }));
  const r = await shopee.converterProdutos();
  assert.equal(r.convertidos, 1);
  const produto = repos.productRepository.findOne({ external_id: 'i.123.456' });
  assert.equal(produto.url_final, 'https://s.shopee.com.br/CCC');
});

// ------------------------------------------------- conferência do ID ---

test('conferência: lê o ID no formato de cada loja', () => {
  assert.deepEqual(verificacao.idsNoTexto('mercadolivre', 'https://x.com/p?matt_tool=1&matt_word=minhatag'), ['minhatag']);
  assert.deepEqual(verificacao.idsNoTexto('shopee', 'https://shopee.com.br/p?utm_source=an_183'), ['183']);
  assert.deepEqual(verificacao.idsNoTexto('amazon', 'https://www.amazon.com.br/dp/B01?tag=eu-20'), ['eu-20']);
});

test('conferência: sem ID esperado ou sem ID no destino é "não sei", nunca "ok"', () => {
  assert.equal(verificacao.avaliar({ esperado: 'eu', encontrados: [] }).confere, null);
  assert.equal(verificacao.avaliar({ esperado: null, encontrados: ['outro'] }).confere, null);
  assert.equal(verificacao.avaliar({ esperado: 'Eu', encontrados: ['eu'] }).confere, true);
  assert.equal(verificacao.avaliar({ esperado: 'eu', encontrados: ['outro'] }).confere, false);
});

test('conferência: segue o meli.la até o destino e acha a tag', async () => {
  salvarTagDaLoja(LOJAS.mercadolivre, 'minhatag');
  trocarFetch((url) => (url.includes('meli.la')
    ? redireciona('https://www.mercadolivre.com.br/produto/MLB1?matt_tool=123&matt_word=minhatag')
    : new Response('<html></html>', { status: 200 })));

  const r = await verificacao.verificarLink('mercadolivre', 'https://meli.la/abc');
  assert.equal(r.confere, true);
  assert.deepEqual(r.ids_encontrados, ['minhatag']);
});

test('conferência: meli.la de outra conta bloqueia a publicação', async () => {
  const { record } = repos.productRepository.upsertBy({ marketplace: 'mercadolivre', external_id: 'MLB9' }, {
    titulo_original: 'Fone de outra conta', preco_atual: 99.9, status: 'ativo', disponibilidade: 'disponivel',
    url_original: 'https://produto.mercadolivre.com.br/MLB-9-fone',
    url_afiliado: 'https://meli.la/deOutro', url_final: 'https://meli.la/deOutro',
  });
  trocarFetch((url) => (url.includes('meli.la')
    ? redireciona('https://www.mercadolivre.com.br/p?matt_word=outrapessoa')
    : new Response('ok')));

  const post = await buildPublication({ product_id: record.id });
  assert.equal(post.pode_publicar, false);
  assert.ok(post.bloqueios.some((b) => /OUTRA conta.*outrapessoa.*minhatag/.test(b)), post.bloqueios.join(' | '));
});

test('conferência: Amazon com ?tag= confere sem ir à rede', async () => {
  const chamadas = trocarFetch(() => { throw new Error('não devia chamar a rede'); });
  salvarTagDaLoja(LOJAS.amazon, 'eu-20');
  const r = await verificacao.verificarLink('amazon', 'https://www.amazon.com.br/dp/B01?tag=eu-20');
  assert.equal(r.confere, true);
  assert.equal(chamadas.length, 0);
});

test('conferência: rede fora do ar vira "não conferido", não "ok"', async () => {
  trocarFetch(() => { throw new Error('ECONNREFUSED'); });
  const r = await verificacao.verificarLink('amazon', 'https://amzn.to/xyz');
  assert.equal(r.confere, null);
  assert.match(r.motivo, /não consegui abrir/);
});

// --------------------------------- onde o link de afiliado se perdia ---

test('reimportar oferta do ML não troca o meli.la pelo link cru', () => {
  importProducts([{
    marketplace: 'mercadolivre', external_id: 'MLB1', titulo_original: 'Oferta ML',
    preco_atual: 10, url_original: 'https://produto.mercadolivre.com.br/MLB-1-x',
  }], 'busca');
  const p = repos.productRepository.findOne({ external_id: 'MLB1' });
  repos.productRepository.update(p.id, { url_afiliado: 'https://meli.la/abc', url_final: 'https://meli.la/abc' });

  importProducts([{
    marketplace: 'mercadolivre', external_id: 'MLB1', titulo_original: 'Oferta ML',
    preco_atual: 9, url_original: 'https://produto.mercadolivre.com.br/MLB-1-x?tracking_id=novo',
  }], 'busca');
  const depois = repos.productRepository.findOne({ external_id: 'MLB1' });
  assert.equal(depois.url_final, 'https://meli.la/abc');
  assert.equal(depois.preco_atual, 9);
});

test('trocar a tag do ML devolve os meli.la antigos para serem gerados de novo', () => {
  const r = salvarTagDaLoja(LOJAS.mercadolivre, 'tagnova');
  assert.ok(r.links_para_refazer >= 1);
  const p = repos.productRepository.findOne({ external_id: 'MLB1' });
  assert.equal(p.url_afiliado, null);
  assert.equal(p.url_final, 'https://produto.mercadolivre.com.br/MLB-1-x?tracking_id=novo');
});

test.after(() => {
  globalThis.fetch = fetchOriginal;
  closeDb();
  for (const sufixo of ['', '-wal', '-shm']) fs.rmSync(`${arquivoTeste}${sufixo}`, { force: true });
});
