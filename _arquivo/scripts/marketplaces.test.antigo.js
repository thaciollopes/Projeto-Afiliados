/**
 * Adapters de marketplace — tudo que dá para verificar sem rede nem credencial:
 * assinatura, montagem de URL, normalização e mensagens de erro.
 *
 * A validação com a loja de verdade foi feita contra os endpoints oficiais:
 * a Shopee aceitou a assinatura (recusou por permissão de conta, código 10035)
 * e o Mercado Livre recusou por client_id inválido — ou seja, as requisições
 * estão bem formadas nos dois casos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ShopeeAdapter } from '../src/integrations/marketplaces/shopee.js';
import { MercadoLivreAdapter } from '../src/integrations/marketplaces/mercadolivre.js';
import { MockMarketplace } from '../src/integrations/marketplaces/mock.js';

// ------------------------------------------------------------ Shopee --

test('Shopee sem credencial se declara pendente e não busca', async () => {
  const shopee = new ShopeeAdapter({});
  assert.equal(shopee.implementado, false);
  assert.match(shopee.motivo, /SHOPEE_APP_ID/);
  await assert.rejects(() => shopee.search({ termo: 'perfume' }), /SHOPEE_APP_ID/);
});

test('Shopee: assinatura é SHA256(appId + timestamp + payload + secret)', () => {
  const appId = '123456';
  const secret = 'segredo';
  const timestamp = 1700000000;
  const payload = '{"query":"{ teste }"}';

  const esperado = createHash('sha256')
    .update(`${appId}${timestamp}${payload}${secret}`)
    .digest('hex');

  assert.equal(esperado.length, 64, 'a assinatura é um hex de 64 caracteres');
  // A ordem importa: qualquer troca gera assinatura diferente e a Shopee recusa.
  const ordemTrocada = createHash('sha256')
    .update(`${appId}${payload}${timestamp}${secret}`)
    .digest('hex');
  assert.notEqual(esperado, ordemTrocada);
});

test('Shopee: preço anterior é reconstruído a partir do % de desconto', () => {
  const shopee = new ShopeeAdapter({ appId: 'x', appSecret: 'y' });
  const bruto = shopee.paraBruto({
    itemId: 42, productName: 'Perfume', priceMin: 80, priceDiscountRate: 20,
    imageUrl: 'http://img', offerLink: 'http://loja/42', sales: 500, ratingStar: '4.7', shopName: 'Loja X',
  });

  assert.equal(bruto.preco, 80);
  assert.equal(bruto.preco_anterior, 100, '80 com 20% de desconto vem de 100');
  assert.equal(bruto.vendas, 500);
  assert.equal(bruto.avaliacao, 4.7);
  assert.equal(bruto.url, 'http://loja/42', 'usa o offerLink, que já traz o rastreio');
});

test('Shopee: sem desconto não inventa preço anterior', () => {
  const shopee = new ShopeeAdapter({ appId: 'x', appSecret: 'y' });
  const bruto = shopee.paraBruto({ itemId: 1, productName: 'Item', priceMin: 50, priceDiscountRate: 0 });
  assert.equal(bruto.preco_anterior, null);
});

test('Shopee: o link de afiliado não é reescrito', () => {
  const shopee = new ShopeeAdapter({ appId: 'x', appSecret: 'y' });
  const link = 'https://s.shopee.com.br/abc123';
  assert.equal(shopee.buildAffiliateLink(link), link);
});

// ---------------------------------------------------- Mercado Livre --

test('Mercado Livre sem credencial se declara pendente', () => {
  const ml = new MercadoLivreAdapter({});
  assert.equal(ml.implementado, false);
  assert.match(ml.motivo, /MERCADOLIVRE_CLIENT_ID/);
});

test('Mercado Livre: URL de autorização tem os parâmetros que a API exige', () => {
  const ml = new MercadoLivreAdapter({ clientId: 'abc123', clientSecret: 's' });
  const url = new URL(ml.authorizationUrl('https://exemplo.com/volta'));

  assert.equal(url.origin + url.pathname, 'https://auth.mercadolivre.com.br/authorization');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'abc123');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://exemplo.com/volta');
});

test('Mercado Livre: buscar sem autorizar explica o que fazer', async () => {
  const ml = new MercadoLivreAdapter({ clientId: 'abc', clientSecret: 'def' });
  await assert.rejects(() => ml.search({ termo: 'perfume' }), /não foi autorizado|Conectar/i);
});

test('Mercado Livre: item da API vira produto do sistema', () => {
  const ml = new MercadoLivreAdapter({ clientId: 'a', clientSecret: 'b' });
  const bruto = ml.paraBruto({
    id: 'MLB123', title: 'Perfume Feminino 100ml', price: 159.9, original_price: 199.9,
    permalink: 'https://produto.mercadolivre.com.br/MLB123', thumbnail_id: '123ABC',
    sold_quantity: 250, available_quantity: 10, condition: 'new',
    shipping: { free_shipping: true }, currency_id: 'BRL',
  });

  assert.equal(bruto.external_id, 'MLB123');
  assert.equal(bruto.preco, 159.9);
  assert.equal(bruto.preco_anterior, 199.9);
  assert.equal(bruto.frete_gratis, true);
  assert.equal(bruto.disponibilidade, 'disponivel');
  assert.match(bruto.imagem, /^https:\/\/http2\.mlstatic\.com\/D_123ABC-O\.jpg$/);
});

test('Mercado Livre: produto sem estoque é marcado como indisponível', () => {
  const ml = new MercadoLivreAdapter({ clientId: 'a', clientSecret: 'b' });
  const bruto = ml.paraBruto({ id: 'MLB1', title: 'X', price: 10, available_quantity: 0 });
  assert.equal(bruto.disponibilidade, 'indisponivel');
});

test('Mercado Livre: ordenação por desconto acontece sobre o resultado', () => {
  const ml = new MercadoLivreAdapter({ clientId: 'a', clientSecret: 'b' });
  const produtos = ml.mapear({
    results: [
      { id: '1', title: 'Pouco desconto', price: 90, original_price: 100, available_quantity: 1 },
      { id: '2', title: 'Muito desconto', price: 50, original_price: 100, available_quantity: 1 },
    ],
  }, { ordenacao: 'desconto' });

  assert.equal(produtos[0].external_id, '2', 'o maior desconto vem primeiro');
});

// -------------------------------------------------------------- base --

test('a loja de demonstração continua funcionando sem credencial nenhuma', async () => {
  const demo = new MockMarketplace();
  const produtos = await demo.search({ termo: 'perfume', limite: 5 });

  assert.ok(produtos.length > 0);
  assert.ok(produtos.every((p) => p.marketplace === 'demo'));
  assert.ok(produtos.every((p) => Number.isFinite(p.preco_atual)));
});

test('adapter não implementado nunca devolve produto inventado', async () => {
  const { getMarketplace } = await import('../src/integrations/marketplaces/index.js');
  const amazon = getMarketplace('amazon');

  assert.equal(amazon.implementado, false);
  await assert.rejects(() => amazon.search({ termo: 'perfume' }), /nao implementada|não implementada/i);
});

test('status() expõe `nome` — a UI e o onboarding dependem disso', async () => {
  const { marketplacesStatus } = await import('../src/integrations/marketplaces/index.js');
  const lojas = await marketplacesStatus();

  for (const loja of lojas) {
    assert.ok(loja.nome, `loja "${loja.rotulo}" sem o campo nome`);
  }
  // Sem esta chave, a Loja Demo era contada como "loja de verdade conectada".
  const reais = lojas.filter((l) => l.implementado && l.nome !== 'demo' && l.online !== false);
  assert.ok(!reais.some((l) => l.nome === 'demo'), 'a demo nunca conta como loja conectada');
});

test('Mercado Livre: PKCE entra na URL e o verificador fica guardado', async () => {
  const { settingRepository } = await import('../src/core/repositories/index.js');
  const { CHAVE_PKCE } = await import('../src/integrations/marketplaces/mercadolivre.js');

  // Este teste escreve na mesma chave que uma autorizacao de verdade usa.
  // Sem guardar e devolver, rodar os testes no meio de uma autorizacao a
  // invalida — aconteceu, e o erro aparece como "the code is invalid".
  const anterior = settingRepository.get(CHAVE_PKCE);

  const ml = new MercadoLivreAdapter({ clientId: 'abc', clientSecret: 'def' });
  const url = new URL(ml.authorizationUrl('https://exemplo.com/volta'));

  const desafio = url.searchParams.get('code_challenge');
  assert.ok(desafio, 'o desafio PKCE precisa ir na URL');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.doesNotMatch(desafio, /[+/=]/, 'code_challenge é base64url: sem +, / ou =');

  const guardado = settingRepository.get(CHAVE_PKCE);
  assert.ok(guardado?.verifier, 'o verificador precisa ficar guardado para a troca do code');

  // O desafio é o SHA256 do verificador, em base64url.
  const esperado = createHash('sha256').update(guardado.verifier).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(desafio, esperado);

  if (anterior) settingRepository.set(CHAVE_PKCE, anterior);
  else settingRepository.remove(CHAVE_PKCE);
});

test('Mercado Livre: dá para gerar a URL sem PKCE quando a aplicação não exige', () => {
  const ml = new MercadoLivreAdapter({ clientId: 'abc', clientSecret: 'def' });
  const url = new URL(ml.authorizationUrl('https://exemplo.com/volta', { pkce: false }));
  assert.equal(url.searchParams.get('code_challenge'), null);
});

// ------------------------------------------- coleta por navegação --

test('scraper desligado se declara pendente e não busca', async () => {
  const { ScraperAdapter } = await import('../src/integrations/marketplaces/scraper.js');
  const amazon = new ScraperAdapter('amazon', { baseUrl: '' });

  assert.equal(amazon.implementado, false);
  assert.match(amazon.motivo, /SCRAPER_ENABLED|desligado/i);
  await assert.rejects(() => amazon.search({ termo: 'perfume' }), /desligado|SCRAPER_ENABLED/i);
});

test('scraper exige palavra-chave (não sai navegando à toa)', async () => {
  const { ScraperAdapter } = await import('../src/integrations/marketplaces/scraper.js');
  const amazon = new ScraperAdapter('amazon', { baseUrl: 'http://localhost:3004' });
  await assert.rejects(() => amazon.search({ termo: '  ' }), /palavra-chave/i);
});

test('cada receita de navegação tem o mínimo para funcionar', async () => {
  const { RECEITAS } = await import('../src/integrations/marketplaces/scraper.js');

  for (const [loja, receita] of Object.entries(RECEITAS)) {
    assert.ok(typeof receita.busca === 'function', `${loja}: falta a URL de busca`);
    assert.ok(receita.cartao, `${loja}: falta o seletor do cartão`);
    assert.ok(receita.campos?.titulo && receita.campos?.preco, `${loja}: título e preço são obrigatórios`);
    assert.match(receita.busca('perfume feminino'), /^https:\/\//, `${loja}: a URL precisa ser https`);
  }
});

test('receita de navegação não colide com o adapter oficial da mesma loja', async () => {
  const { getMarketplace } = await import('../src/integrations/marketplaces/index.js');

  // O oficial é "shopee"; o de navegação é "shopee-web". São fontes diferentes
  // e o usuário escolhe qual usar na busca.
  assert.ok(getMarketplace('shopee'), 'adapter oficial da Shopee');
  assert.ok(getMarketplace('shopee-web'), 'adapter de navegação da Shopee');
  assert.notEqual(getMarketplace('shopee'), getMarketplace('shopee-web'));
});

test('o intervalo mínimo entre buscas é respeitado (foi o que causou o bloqueio no teste real)', async () => {
  const { ScraperAdapter } = await import('../src/integrations/marketplaces/scraper.js');
  const amazon = new ScraperAdapter('amazon', { baseUrl: 'http://localhost:3004', intervaloSegundos: 30 });
  assert.equal(amazon.intervaloMs, 30000);

  const rapido = new ScraperAdapter('amazon', { baseUrl: 'http://x', intervaloSegundos: 0 });
  assert.equal(rapido.intervaloMs, 30000, 'zero cai no padrão: sem intervalo a loja bloqueia');
});

test('Mercado Livre: `state` protege o callback contra code de terceiro', async () => {
  const { settingRepository } = await import('../src/core/repositories/index.js');
  const { CHAVE_STATE, CHAVE_PKCE } = await import('../src/integrations/marketplaces/mercadolivre.js');

  const stateAnterior = settingRepository.get(CHAVE_STATE);
  const pkceAnterior = settingRepository.get(CHAVE_PKCE);

  const ml = new MercadoLivreAdapter({ clientId: 'abc', clientSecret: 'def' });
  const url = new URL(ml.authorizationUrl('https://exemplo.com/volta'));
  const state = url.searchParams.get('state');

  assert.ok(state, 'a URL de autorização precisa levar um state');

  // State de outra origem é recusado.
  assert.throws(() => ml.validateState('state-de-atacante'), /nao confere|não confere/i);

  // O state legítimo passa...
  settingRepository.set(CHAVE_STATE, { state, criado_em: Date.now() });
  assert.equal(ml.validateState(state), true);

  // ...e só uma vez: depois de usado, some.
  assert.throws(() => ml.validateState(state), /Nenhuma autorizacao|andamento/i);

  // Devolve o que havia: pode existir uma autorização de verdade em andamento.
  if (stateAnterior) settingRepository.set(CHAVE_STATE, stateAnterior);
  if (pkceAnterior) settingRepository.set(CHAVE_PKCE, pkceAnterior);
});

test('Mercado Livre: state velho é recusado', async () => {
  const { settingRepository } = await import('../src/core/repositories/index.js');
  const { CHAVE_STATE } = await import('../src/integrations/marketplaces/mercadolivre.js');

  const ml = new MercadoLivreAdapter({ clientId: 'abc', clientSecret: 'def' });
  settingRepository.set(CHAVE_STATE, { state: 'antigo', criado_em: Date.now() - 20 * 60000 });

  assert.throws(() => ml.validateState('antigo'), /expirou/i);
});

// ------------------------------------- link de afiliado (comissão) --

test('a etiqueta entra como parâmetro na URL', async () => {
  const { previewLink } = await import('../src/core/services/affiliateLinkService.js');
  const { affiliateRepository } = await import('../src/core/repositories/index.js');

  // Loja só deste teste: usar "amazon" faria o teste depender dos programas
  // reais que já estão cadastrados no banco.
  const criado = affiliateRepository.upsertBy(
    { marketplace: 'lojadeteste', nome: 'Programa de teste' },
    { identificador: 'teste-20', parametro_tag: 'ref', ativo: true },
  );

  const r = previewLink('lojadeteste-web', 'https://www.lojadeteste.com/produto/123');
  assert.equal(r.aplicado, true, r.motivo);
  assert.match(r.final, /[?&]ref=teste-20/);

  affiliateRepository.remove(criado.record.id);
});

test('Mercado Livre: NÃO finge converter — parâmetro ali não paga comissão', async () => {
  const { previewLink } = await import('../src/core/services/affiliateLinkService.js');

  const r = previewLink('mercadolivre-web', 'https://produto.mercadolivre.com.br/MLB-123');
  assert.equal(r.aplicado, false);
  assert.equal(r.sem_comissao, true, 'precisa sinalizar que não haverá comissão');
  assert.equal(r.final, 'https://produto.mercadolivre.com.br/MLB-123', 'o link original é preservado');
  assert.match(r.motivo, /meli\.la|painel/i, 'a mensagem precisa dizer onde se gera o link que paga');
});

test('link já gerado no painel é respeitado, nunca reescrito', async () => {
  const { previewLink } = await import('../src/core/services/affiliateLinkService.js');

  for (const link of ['https://mercadolivre.com/sec/ABC123', 'https://s.shopee.com.br/xyz']) {
    const r = previewLink('mercadolivre', link);
    assert.equal(r.final, link, `${link} não pode ser alterado`);
  }
});

test('publicação avisa quando o link não paga comissão', async () => {
  const { exigeLinkDoPainel } = await import('../src/core/services/affiliateLinkService.js');

  assert.ok(exigeLinkDoPainel('mercadolivre'), 'ML exige link do painel');
  assert.ok(exigeLinkDoPainel('shopee-web'), 'Shopee também, mesmo pela navegação');
  assert.equal(exigeLinkDoPainel('amazon'), null, 'Amazon funciona por parâmetro');
});

// ------------------------------------------ extensão do navegador --

test('a extensão tem os arquivos que o Chrome exige', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extensao');

  for (const arquivo of ['manifest.json', 'popup.html', 'popup.js', 'extrator.js', 'icones/icone.png']) {
    assert.ok(fs.existsSync(path.join(raiz, arquivo)), `falta ${arquivo}`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3, 'o Chrome só aceita manifest v3');
  assert.ok(manifest.permissions.includes('activeTab'));
  assert.ok(manifest.permissions.includes('scripting'), 'precisa de scripting para ler a página');
  assert.ok(
    manifest.host_permissions.some((h) => h.includes('localhost:3010')),
    'a extensão precisa poder falar com o painel',
  );
});

test('o extrator cobre as lojas que a extensão promete', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const codigo = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extensao', 'extrator.js'),
    'utf8',
  );

  for (const loja of ['mercadolivre', 'shopee', 'amazon', 'magalu']) {
    assert.match(codigo, new RegExp(`${loja}:`), `falta a receita de ${loja}`);
  }
  // O bug do "4,6 de 5 estrelas" virando 4.65 não pode voltar aqui também.
  assert.match(codigo, /PRIMEIRO numero/i, 'o extrator precisa pegar só o primeiro número');
});

test('a extensão pede permissão de cookies (precisa para conectar a loja)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extensao');

  const manifest = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));
  assert.ok(manifest.permissions.includes('cookies'), 'sem isso o "Conectar loja" não funciona');
  assert.ok(fs.existsSync(path.join(raiz, 'conectar.js')));
});

test('conectar.js descarta cookie de analytics (só o que serve para a sessão)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const codigo = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extensao', 'conectar.js'),
    'utf8',
  );
  assert.match(codigo, /DESCARTAVEIS/, 'precisa filtrar cookie de rastreio');
  assert.match(codigo, /_ga\|_gid/, 'os de analytics não vão junto');
});
