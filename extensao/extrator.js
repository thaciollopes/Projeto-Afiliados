/**
 * Roda DENTRO da pagina que voce esta vendo e le os produtos da tela.
 *
 * Nada de requisicao nova para a loja: o conteudo ja esta na sua frente,
 * carregado pela sua navegacao. E por isso que isto nao cai em captcha nem
 * em bloqueio — do ponto de vista da loja, quem navegou foi voce.
 */
(() => {
  const RECEITAS = {
    mercadolivre: {
      cartao: '.ui-search-result, .poly-card, li.ui-search-layout__item',
      titulo: '.poly-component__title, .ui-search-item__title, h2',
      preco: '.andes-money-amount__fraction',
      preco_anterior: 's .andes-money-amount__fraction, .andes-money-amount--previous .andes-money-amount__fraction',
      imagem: 'img',
      url: 'a',
    },
    shopee: {
      cartao: '[data-sqe="item"], li.col-xs-2-4, .shopee-search-item-result__item',
      titulo: '[data-sqe="name"] div, .line-clamp-2',
      preco: '.text-shopee-primary, [class*="price"]',
      imagem: 'img',
      url: 'a',
    },
    amazon: {
      cartao: '[data-component-type="s-search-result"]',
      titulo: 'h2, [data-cy="title-recipe"] a span, .a-size-base-plus',
      preco: '.a-price .a-offscreen',
      preco_anterior: '.a-price.a-text-price .a-offscreen',
      imagem: 'img.s-image',
      url: 'a.a-link-normal[href*="/dp/"], h2 a',
      id: 'data-asin',
    },
    magalu: {
      cartao: '[data-testid="product-card-container"]',
      titulo: '[data-testid="product-title"]',
      preco: '[data-testid="price-value"]',
      preco_anterior: '[data-testid="price-original"]',
      imagem: 'img',
      url: 'a',
    },
  };

  function lojaAtual() {
    const host = location.hostname;
    if (/mercadolivre/.test(host)) return 'mercadolivre';
    if (/shopee/.test(host)) return 'shopee';
    if (/amazon/.test(host)) return 'amazon';
    if (/magazineluiza/.test(host)) return 'magalu';
    if (/aliexpress/.test(host)) return 'aliexpress';
    return null;
  }

  const limpar = (t) => (t || '').replace(/\s+/g, ' ').trim();

  /** Pega o PRIMEIRO numero: "4,6 de 5 estrelas" e 4.6, nao 4,65. */
  function numero(texto) {
    const achado = limpar(texto).match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+(?:\.\d+)?/);
    if (!achado) return null;
    let cru = achado[0];
    if (cru.includes(',')) cru = cru.replace(/\./g, '').replace(',', '.');
    const n = Number.parseFloat(cru);
    return Number.isFinite(n) ? n : null;
  }

  function idDoLink(url) {
    if (!url) return null;
    return (
      url.match(/MLB-?\d{8,}/i)?.[0]
      || url.match(/\/dp\/([A-Z0-9]{10})/i)?.[1]
      || url.match(/i\.\d+\.\d+/)?.[0]
      || url.match(/\/p\/(\d+)/)?.[1]
      || null
    );
  }

  const loja = lojaAtual();
  if (!loja || !RECEITAS[loja]) {
    return { erro: 'Esta pagina nao e de uma loja que eu saiba ler.', loja };
  }

  const receita = RECEITAS[loja];
  const cartoes = [...document.querySelectorAll(receita.cartao)];

  const produtos = cartoes.map((cartao) => {
    const pegar = (seletor, prop) => {
      if (!seletor) return null;
      const alvo = cartao.querySelector(seletor);
      if (!alvo) return null;
      return prop ? alvo[prop] : limpar(alvo.textContent);
    };

    const url = pegar(receita.url, 'href');
    return {
      external_id: (receita.id ? cartao.getAttribute(receita.id) : null) || idDoLink(url),
      titulo_original: pegar(receita.titulo),
      preco_atual: numero(pegar(receita.preco)),
      preco_anterior: numero(pegar(receita.preco_anterior)),
      imagem_principal: pegar(receita.imagem, 'src'),
      url_original: url,
      marketplace: loja,
      moeda: 'BRL',
      disponibilidade: 'disponivel',
      status: 'ativo',
      tags: ['extensao'],
    };
  }).filter((p) => p.titulo_original && p.preco_atual > 0 && p.external_id);

  // "De" maior que 5x o preco costuma ser preco de outro item no mesmo cartao.
  for (const p of produtos) {
    if (!(p.preco_anterior > p.preco_atual && p.preco_anterior <= p.preco_atual * 5)) {
      p.preco_anterior = null;
    }
  }

  return { loja, total: cartoes.length, produtos, pagina: document.title };
})();
