/**
 * Lojas — tudo que dá para verificar sem rede: catálogo, leitura dos cartões
 * da Amazon, recusa honesta das lojas que não deixam buscar e link de afiliado.
 *
 * A leitura da Amazon foi validada contra a página real (60 cartões, preço
 * "de" riscado e preço por litro em lugares diferentes do cartão).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOJAS, listaDeLojas, lojaPorId } from '../src/integrations/marketplaces/lojas.js';
import { extrairAmazon } from '../src/integrations/marketplaces/cookie.js';
import { extrairOfertasML, casaComTermo, urlOfertas } from '../src/integrations/marketplaces/mercadolivreOfertas.js';

// ------------------------------------------------------------ catálogo --

test('catálogo tem as quatro lojas e nenhuma loja de demonstração', () => {
  const ids = listaDeLojas().map((l) => l.id).sort();
  assert.deepEqual(ids, ['amazon', 'magalu', 'mercadolivre', 'shopee']);
  assert.equal(lojaPorId('demo'), null);
});

test('cada loja diz como os produtos entram e como o link vira comissão', () => {
  for (const loja of listaDeLojas()) {
    assert.ok(loja.comoEntramProdutos, `${loja.id} sem comoEntramProdutos`);
    assert.ok(['cookie', 'tag', 'painel'].includes(loja.linkAfiliado), `${loja.id}: linkAfiliado inválido`);
    assert.ok(loja.tag?.rotulo, `${loja.id} sem rótulo da tag`);
    if (loja.busca && loja.modoBusca !== 'ofertas') assert.equal(typeof loja.buscaUrl, 'function', `${loja.id} busca sem URL`);
  }
});

test('Mercado Livre gera link pelo cookie; Amazon pela tag na URL', () => {
  assert.equal(LOJAS.mercadolivre.linkAfiliado, 'cookie');
  assert.equal(LOJAS.mercadolivre.modoBusca, 'ofertas', 'a busca comum do ML cai em captcha');
  assert.equal(LOJAS.amazon.linkAfiliado, 'tag');
  assert.equal(LOJAS.amazon.parametro, 'tag');
});

// ----------------------------------------------------------- registro --

test('loja que não deixa buscar recusa, em vez de devolver lista vazia', async () => {
  const { getMarketplace } = await import('../src/integrations/marketplaces/index.js');
  for (const id of ['shopee', 'magalu']) {
    const loja = getMarketplace(id);
    assert.equal(loja.implementado, false, id);
    await assert.rejects(() => loja.search({ termo: 'perfume' }), /extensão/i);
  }
});

test('busca exige palavra-chave (não sai buscando à toa)', async () => {
  const { getMarketplace } = await import('../src/integrations/marketplaces/index.js');
  await assert.rejects(() => getMarketplace('amazon').search({ termo: '  ' }), /palavra-chave/i);
});

test('status() expõe nome, busca e se tem cookie — a tela LOJAS depende disso', async () => {
  const { marketplacesStatus } = await import('../src/integrations/marketplaces/index.js');
  const lojas = await marketplacesStatus();
  assert.equal(lojas.length, 4);
  for (const loja of lojas) {
    assert.ok(loja.nome);
    assert.equal(typeof loja.busca, 'boolean');
    assert.equal(typeof loja.com_sessao, 'boolean');
  }
});

// ---------------------------------------------------- leitura da Amazon --

const cartao = (asin, corpo) => `<div data-asin="${asin}" data-index="1" data-component-type="s-search-result" class="s-result-item">${corpo}</div>`;

const HTML_AMAZON = [
  cartao('B07SSMCZ7Z', `
    <img class="s-image" src="https://m.media-amazon.com/images/I/granado.jpg" alt="x">
    <h2 aria-label="Granado Colônia Terrapeutics, 230ml" class="a-size-base-plus"><span>Granado Colônia Terrapeutics, 230ml</span></h2>
    <span class="a-icon-alt">4,6 de 5 estrelas</span>
    <a aria-label="2.869 avaliações" href="#"></a>
    <span class="a-price" data-a-size="xl"><span class="a-offscreen">R$ 65,99</span></span>
    <span class="a-size-base">(<span class="a-price a-text-price" data-a-size="b"><span class="a-offscreen">R$ 286,91</span></span>/litro)</span>
    <span class="a-price a-text-price" data-a-size="b" data-a-strike="true" data-a-color="secondary"><span class="a-offscreen">R$ 106,00</span></span>
    <a class="a-link-normal" href="/Granado/dp/B07SSMCZ7Z/ref=sr_1_1">ver</a>`),
  cartao('B071VCX893', `
    <h2 aria-label="Gabriela Sabatini Eau de Toilette 60Ml"><span>Gabriela Sabatini Eau de Toilette 60Ml</span></h2>
    <span class="a-price"><span class="a-offscreen">R$ 94,99</span></span>`),
  cartao('B000000000', '<h2 aria-label="Produto sem preço"><span>Produto sem preço</span></h2>'),
].join('\n');

test('Amazon: cartão vira produto com preço, avaliação e link curto /dp/', () => {
  const [p] = extrairAmazon(HTML_AMAZON);
  assert.equal(p.external_id, 'B07SSMCZ7Z');
  assert.equal(p.titulo, 'Granado Colônia Terrapeutics, 230ml');
  assert.equal(p.preco, 65.99);
  assert.equal(p.avaliacao, 4.6);
  assert.equal(p.quantidade_avaliacoes, 2869);
  assert.equal(p.url, 'https://www.amazon.com.br/dp/B07SSMCZ7Z');
  assert.match(p.imagem, /granado\.jpg$/);
});

test('Amazon: "de" é o preço riscado, nunca o preço por litro', () => {
  const [p] = extrairAmazon(HTML_AMAZON);
  assert.equal(p.preco_anterior, 106);
});

test('Amazon: sem preço riscado não inventa "de"; sem preço o cartão é descartado', () => {
  const produtos = extrairAmazon(HTML_AMAZON);
  assert.equal(produtos.length, 2);
  assert.equal(produtos[1].preco_anterior, null);
  assert.ok(!produtos.some((p) => p.external_id === 'B000000000'));
});

// ------------------------------------------ ofertas do Mercado Livre --

const preco = (rotulo, extra = '') => `<span class="andes-money-amount ${extra}" aria-label="${rotulo}"></span>`;
const cartaoMl = ({ href, titulo, antes, atual, cupom = false, outros = null, extra = '' }) => `
<div class="andes-card poly-card poly-card--grid-card">
  <img class="poly-component__picture" src="https://http2.mlstatic.com/foto.webp" alt="x">
  <h3><a href="${href}" target="_self" class="poly-component__title">${titulo}</a></h3>
  <span class="andes-visually-hidden">Classificação 4.8 de 5 estrelas. Mais de 10mil produtos vendidos.</span>
  <span class="polylabel-label">| +10mil vendidos</span>
  <div class="poly-component__price">
    ${antes ? `<s class="andes-money-amount andes-money-amount--previous" aria-label="Antes: ${antes}"></s>` : ''}
    <div class="poly-price__current">${preco(atual)}</div>
    ${cupom ? '<span class="poly-price__unit-description">com Cupom</span>' : ''}
    ${outros ? `<span class="poly-price__installments">ou ${preco(outros)} em outros meios</span>` : ''}
  </div>
  <div class="poly-component__shipping-v2"><span>Chegará grátis amanhã</span></div>${extra}
</div>`;

const HTML_ML = [
  cartaoMl({
    href: 'https://www.mercadolivre.com.br/perfume-sabah/up/MLBU123?pdp_filters=deal#polycard_client=offers&amp;wid=MLB3994439565',
    titulo: 'Perfume Sedutor Árabe Sabah 100ml', antes: '230 reais', atual: '142 reais',
  }),
  cartaoMl({
    href: 'https://produto.mercadolivre.com.br/MLB-3800842215-camiseta',
    titulo: 'Camiseta Dry-fit Preta', antes: '69 reais com 31 centavos',
    atual: '29 reais com 90 centavos', cupom: true, outros: '49 reais com 90 centavos',
  }),
].join('\n');

test('ML ofertas: cartão vira produto com id do anúncio, "de/por", nota e vendidos', () => {
  const [p] = extrairOfertasML(HTML_ML);
  assert.equal(p.external_id, 'MLB3994439565', 'o wid vem depois do # e é o id do anúncio');
  assert.equal(p.url, 'https://www.mercadolivre.com.br/perfume-sabah/up/MLBU123?pdp_filters=deal');
  assert.equal(p.preco, 142);
  assert.equal(p.preco_anterior, 230);
  assert.equal(p.avaliacao, 4.8);
  assert.equal(p.vendas, 10000);
  assert.equal(p.frete_gratis, true);
});

test('ML ofertas: preço "com Cupom" não é publicado — vale o preço sem cupom', () => {
  const camiseta = extrairOfertasML(HTML_ML)[1];
  assert.equal(camiseta.external_id, 'MLB3800842215');
  assert.equal(camiseta.preco, 49.9);
  assert.equal(camiseta.preco_anterior, 69.31);
  assert.ok(camiseta.tags.includes('cupom-ml'));
});

test('ML ofertas: palavra-chave casa sem acento e sem caixa; URL leva categoria e página', () => {
  assert.equal(casaComTermo('Perfume Sedutor Árabe Sabah', 'perfume arabe'), true);
  assert.equal(casaComTermo('Perfume Sedutor Árabe Sabah', 'perfume masculino'), false);
  assert.equal(urlOfertas('MLB1246', 2), 'https://www.mercadolivre.com.br/ofertas?category=MLB1246&page=2');
  assert.equal(urlOfertas('', 1), 'https://www.mercadolivre.com.br/ofertas');
});

test('ML: produto não é marcado indisponível só porque não dá para reconsultar', async () => {
  const { getMarketplace } = await import('../src/integrations/marketplaces/index.js');
  await assert.rejects(() => getMarketplace('mercadolivre').getProduct('MLB1'), /reconsultar/);
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
