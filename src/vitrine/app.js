/**
 * Vitrine publica — servidor proprio, em porta separada do painel.
 *
 * So existem tres caminhos aqui: a lista (/), a pagina do produto (/p/:codigo)
 * e a ida para a loja (/ir/:codigo). Nada de API, nada do painel: e isso que
 * permite publicar esta porta na internet (tunel/dominio) com seguranca.
 *
 * O publico da vitrine e perfumaria feminina: os femininos vem primeiro e o
 * visual segue essa linha. Os outros produtos continuam aparecendo depois.
 */
import express from 'express';
import {
  configVitrine, produtoDaVitrine, produtosDaVitrine, registrarClique, codigoDoProduto,
} from '../core/services/vitrineService.js';
import { lojaBase } from '../core/services/affiliateLinkService.js';
import { formatBRL, round2 } from '../core/utils/money.js';
import { logger } from '../core/utils/logger.js';

const log = logger.child('vitrine');

const NOME_LOJA = { amazon: 'Amazon', mercadolivre: 'Mercado Livre', shopee: 'Shopee', magalu: 'Magazine Luiza' };

/** Filtros da lista (?f=). Ordem = ordem dos botoes na tela. */
const FILTROS = [
  { id: '', rotulo: 'Todos' },
  { id: 'feminino', rotulo: 'Femininos' },
  { id: 'masculino', rotulo: 'Masculinos' },
  { id: 'ate200', rotulo: 'Até R$ 200' },
  { id: 'desconto', rotulo: 'Maiores descontos' },
];

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function titulo(p) {
  return p.titulo_publicacao || p.titulo_original;
}

/** Publico do produto lido do proprio titulo/categoria (nao ha campo para isso). */
function publico(p) {
  const texto = `${p.titulo_original || ''} ${p.titulo_publicacao || ''} ${p.categoria || ''}`.toLowerCase();
  if (/unissex|unisex/.test(texto)) return 'unissex';
  if (/feminin|\bmulher|pour femme|for women/.test(texto)) return 'feminino';
  if (/masculin|\bhomem|pour homme|for men/.test(texto)) return 'masculino';
  return null;
}

const ROTULO_PUBLICO = { feminino: 'Feminino', masculino: 'Masculino', unissex: 'Unissex' };

function nomeDaLoja(p) {
  return NOME_LOJA[lojaBase(p.marketplace)] || p.marketplace;
}

function temDesconto(p) {
  return p.preco_anterior && p.preco_anterior > p.preco_atual;
}

function precoHtml(p) {
  const de = temDesconto(p) ? `<s class="de">${esc(formatBRL(p.preco_anterior))}</s>` : '';
  return `<div class="precos">${de}<strong>${esc(formatBRL(p.preco_atual))}</strong></div>`;
}

function aplicarFiltro(produtos, filtro) {
  if (filtro === 'feminino') return produtos.filter((p) => ['feminino', 'unissex'].includes(publico(p)));
  if (filtro === 'masculino') return produtos.filter((p) => ['masculino', 'unissex'].includes(publico(p)));
  if (filtro === 'ate200') return produtos.filter((p) => Number(p.preco_atual) <= 200);
  if (filtro === 'desconto') {
    return produtos.filter((p) => p.desconto_percentual)
      .sort((a, b) => Number(b.desconto_percentual) - Number(a.desconto_percentual));
  }
  // Sem filtro: femininos primeiro, mantendo a ordem de publicacao dentro de cada grupo.
  const peso = (p) => ({ feminino: 0, unissex: 1 }[publico(p)] ?? 2);
  return produtos.map((p, i) => ({ p, i }))
    .sort((a, b) => peso(a.p) - peso(b.p) || a.i - b.i)
    .map(({ p }) => p);
}

function pagina(cfg, {
  tituloPagina, descricao = '', imagem = '', corpo, temAmazon,
}) {
  const ga = cfg.ga_tag
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(cfg.ga_tag)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(cfg.ga_tag)}');</script>`
    : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tituloPagina)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="theme-color" content="${esc(cfg.cor)}">
<meta property="og:title" content="${esc(tituloPagina)}">
<meta property="og:description" content="${esc(descricao)}">
${imagem ? `<meta property="og:image" content="${esc(imagem)}">` : ''}
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
${ga}
<style>
:root {
  --cor: ${esc(cfg.cor)};
  --fundo: #fbf7f4; --cartao: #ffffff; --texto: #2a1c22; --fraco: #7d6a72; --linha: #efe3df;
  --suave: #f6e9e7; --ouro: #a8864f; --foto: #ffffff;
  --serif: "Cormorant Garamond", "Playfair Display", Georgia, "Times New Roman", serif;
  --sans: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --sombra: 0 1px 2px rgba(74, 36, 50, .05), 0 8px 24px rgba(74, 36, 50, .06);
}
@media (prefers-color-scheme: dark) {
  :root { --fundo: #171114; --cartao: #211a1e; --texto: #f5ecef; --fraco: #b8a5ad; --linha: #34282e;
    --suave: #2c2126; --ouro: #d2b27a; --sombra: 0 8px 24px rgba(0, 0, 0, .35); }
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--sans); background: var(--fundo); color: var(--texto); -webkit-font-smoothing: antialiased; }
a { color: inherit; }
.largura { max-width: 1120px; margin: 0 auto; padding: 0 16px; }

header { position: sticky; top: 0; z-index: 10; background: color-mix(in srgb, var(--fundo) 88%, transparent);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid var(--linha); }
.topo { display: flex; align-items: center; gap: 12px; min-height: 64px; }
.topo img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; background: #fff; }
.marca { text-decoration: none; font-family: var(--serif); font-weight: 700; font-size: 1.55rem; letter-spacing: .01em; }
.marca span { color: var(--cor); }

.hero { padding: 40px 0 28px; text-align: center; }
.hero .selo { display: inline-block; font-size: .72rem; letter-spacing: .18em; text-transform: uppercase; color: var(--ouro); font-weight: 600; }
.hero h1 { font-family: var(--serif); font-weight: 600; font-size: clamp(2rem, 6vw, 3.1rem); line-height: 1.08; margin: 10px auto 12px; max-width: 16ch; }
.hero h1 em { color: var(--cor); font-style: italic; }
.hero p { color: var(--fraco); margin: 0 auto; max-width: 46ch; line-height: 1.6; }
.hero.compacto { padding: 22px 0 8px; }
.hero.compacto h1 { font-size: clamp(1.6rem, 4.5vw, 2.1rem); }

form.busca { display: flex; gap: 8px; max-width: 560px; margin: 22px auto 0; background: var(--cartao);
  border: 1px solid var(--linha); border-radius: 999px; padding: 6px; box-shadow: var(--sombra); }
form.busca input { flex: 1; min-width: 0; border: 0; background: transparent; padding: 10px 14px; font: inherit; font-size: 1rem; color: var(--texto); outline: none; }
form.busca button, .botao { background: var(--cor); color: #fff; border: 0; border-radius: 999px; padding: 11px 22px;
  font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; text-align: center; transition: filter .15s, transform .15s; }
form.busca button:hover, .botao:hover { filter: brightness(1.07); }
.botao:active { transform: scale(.98); }

.filtros { display: flex; gap: 8px; overflow-x: auto; padding: 18px 0 20px; scrollbar-width: none; justify-content: safe center; }
.filtros::-webkit-scrollbar { display: none; }
.filtros a { flex: none; text-decoration: none; font-size: .88rem; padding: 8px 16px; border-radius: 999px;
  border: 1px solid var(--linha); background: var(--cartao); color: var(--fraco); transition: all .15s; }
.filtros a:hover { color: var(--texto); border-color: var(--cor); }
.filtros a.ativo { background: var(--texto); border-color: var(--texto); color: var(--fundo); }
.contagem { color: var(--fraco); font-size: .85rem; margin: 0 0 12px; }

.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 14px; }
@media (min-width: 760px) { .grade { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; } }
.card { position: relative; background: var(--cartao); border: 1px solid var(--linha); border-radius: 18px; overflow: hidden;
  text-decoration: none; display: flex; flex-direction: column; transition: transform .2s, box-shadow .2s; }
.card:hover { transform: translateY(-3px); box-shadow: var(--sombra); }
.card .foto { background: var(--foto); aspect-ratio: 1; display: grid; place-items: center; padding: 14px; }
.card .foto img { width: 100%; height: 100%; object-fit: contain; transition: transform .35s; }
.card:hover .foto img { transform: scale(1.04); }
.etiqueta { position: absolute; top: 10px; left: 10px; background: var(--cor); color: #fff; font-size: .75rem; font-weight: 600;
  padding: 4px 9px; border-radius: 999px; }
.card .info { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; border-top: 1px solid var(--linha); }
.card .publico { font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; color: var(--ouro); font-weight: 600; }
.card .nome { font-size: .9rem; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card .rodape { margin-top: auto; display: flex; align-items: end; justify-content: space-between; gap: 6px; padding-top: 4px; }
.precos { display: flex; flex-direction: column; }
.precos strong { font-size: 1.15rem; font-weight: 600; }
.de { color: var(--fraco); font-size: .8rem; }
.loja { color: var(--fraco); font-size: .72rem; white-space: nowrap; }

.trilha { font-size: .85rem; color: var(--fraco); padding: 20px 0 14px; }
.trilha a { text-decoration: none; }
.trilha a:hover { color: var(--cor); }
.produto { background: var(--cartao); border: 1px solid var(--linha); border-radius: 22px; overflow: hidden; display: grid; grid-template-columns: 1fr; }
@media (min-width: 820px) { .produto { grid-template-columns: 1.05fr 1fr; } }
.produto .foto { background: var(--foto); display: grid; place-items: center; padding: 24px; position: relative; }
.produto .foto img { width: 100%; max-height: 480px; object-fit: contain; }
.produto .texto { padding: 24px 22px 28px; display: flex; flex-direction: column; }
@media (min-width: 820px) { .produto .texto { padding: 40px 40px; border-left: 1px solid var(--linha); } }
.produto .publico { font-size: .72rem; letter-spacing: .18em; text-transform: uppercase; color: var(--ouro); font-weight: 600; }
.produto h1 { font-family: var(--serif); font-weight: 600; font-size: clamp(1.5rem, 3.4vw, 2.1rem); line-height: 1.15; margin: 8px 0 18px; }
.produto .precos strong { font-size: 2rem; }
.produto .de { font-size: .95rem; }
.economia { display: inline-block; margin-top: 10px; background: var(--suave); color: var(--cor); font-weight: 600; font-size: .88rem; padding: 6px 12px; border-radius: 999px; }
.detalhes { list-style: none; padding: 0; margin: 20px 0 0; display: grid; gap: 8px; color: var(--fraco); font-size: .92rem; }
.produto .botao { margin-top: 26px; font-size: 1.05rem; padding: 16px 22px; }
.aviso { color: var(--fraco); font-size: .78rem; margin: 14px 0 0; line-height: 1.5; }

.secao { font-family: var(--serif); font-weight: 600; font-size: 1.7rem; margin: 44px 0 16px; }
.vazio { text-align: center; color: var(--fraco); padding: 56px 0; }
.vazio a { color: var(--cor); }

footer { border-top: 1px solid var(--linha); margin-top: 56px; }
footer .largura { padding-top: 26px; padding-bottom: 36px; color: var(--fraco); font-size: .78rem; line-height: 1.6; }
footer .marca { font-size: 1.2rem; display: block; margin-bottom: 8px; color: var(--texto); }
</style>
</head>
<body>
<header><div class="largura topo">
${cfg.logo_url ? `<img src="${esc(cfg.logo_url)}" alt="">` : ''}
<a class="marca" href="/">${esc(cfg.titulo)}<span>.</span></a>
</div></header>
<main class="largura">${corpo}</main>
<footer><div class="largura">
<span class="marca">${esc(cfg.titulo)}</span>
Os preços e a disponibilidade podem mudar a qualquer momento; o valor válido é o da loja no momento da compra.
Este site recebe comissão por compras feitas pelos links.
${temAmazon ? '<br>Como Associado da Amazon, recebo por compras qualificadas.' : ''}
</div></footer>
</body>
</html>`;
}

function cartao(p) {
  const pub = publico(p);
  return `<a class="card" href="/p/${esc(codigoDoProduto(p))}">
  ${p.desconto_percentual ? `<span class="etiqueta">-${esc(p.desconto_percentual)}%</span>` : ''}
  <div class="foto">${p.imagem_principal ? `<img src="${esc(p.imagem_principal)}" alt="${esc(titulo(p))}" loading="lazy">` : ''}</div>
  <div class="info">
    ${pub ? `<span class="publico">${ROTULO_PUBLICO[pub]}</span>` : ''}
    <span class="nome">${esc(titulo(p))}</span>
    <div class="rodape">${precoHtml(p)}<span class="loja">${esc(nomeDaLoja(p))}</span></div>
  </div>
</a>`;
}

export function createVitrineApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Vitrine desligada no painel: responde, mas sem mostrar produto nenhum.
  app.use((req, res, next) => {
    if (configVitrine().ativa) return next();
    return res.status(503).type('html').send('<p style="font-family:sans-serif;padding:24px">Site em manutenção.</p>');
  });

  app.get('/', (req, res) => {
    const cfg = configVitrine();
    const busca = String(req.query.q || '').slice(0, 80);
    const filtro = FILTROS.some((f) => f.id === req.query.f) ? String(req.query.f) : '';
    const produtos = aplicarFiltro(produtosDaVitrine({ busca }), filtro);
    const inicio = !busca && !filtro;

    const link = (f) => {
      const q = new URLSearchParams({ ...(busca ? { q: busca } : {}), ...(f ? { f } : {}) }).toString();
      return q ? `/?${q}` : '/';
    };
    const filtros = FILTROS.map((f) => `<a href="${esc(link(f.id))}"${f.id === filtro ? ' class="ativo" aria-current="page"' : ''}>${f.rotulo}</a>`).join('');

    const corpo = `
<section class="hero${inicio ? '' : ' compacto'}">
  <span class="selo">Perfumaria em oferta</span>
  <h1>${busca ? `Resultados para “${esc(busca)}”` : 'Perfumes femininos com <em>preço especial</em>'}</h1>
  ${inicio ? '<p>Selecionamos as melhores ofertas de perfume nas lojas que você já conhece. É só escolher e finalizar a compra direto na loja.</p>' : ''}
  <form class="busca" action="/" method="get" role="search">
    ${filtro ? `<input type="hidden" name="f" value="${esc(filtro)}">` : ''}
    <input name="q" value="${esc(busca)}" placeholder="Busque por marca ou fragrância" aria-label="Buscar">
    <button>Buscar</button>
  </form>
</section>
<nav class="filtros" aria-label="Filtros">${filtros}</nav>
${produtos.length
    ? `<p class="contagem">${produtos.length} ${produtos.length === 1 ? 'oferta' : 'ofertas'}</p><div class="grade">${produtos.map(cartao).join('')}</div>`
    : `<p class="vazio">Nenhuma oferta encontrada. <a href="/">Ver todas as ofertas</a></p>`}`;
    res.type('html').send(pagina(cfg, {
      tituloPagina: `${cfg.titulo} — Perfumes em oferta`,
      descricao: 'Perfumes femininos e outras fragrâncias em oferta, selecionados nas lojas que você já conhece.',
      corpo,
      temAmazon: produtos.some((p) => lojaBase(p.marketplace) === 'amazon'),
    }));
  });

  app.get('/p/:codigo', (req, res) => {
    const cfg = configVitrine();
    const p = produtoDaVitrine(req.params.codigo);
    if (!p) {
      return res.status(404).type('html').send(pagina(cfg, {
        tituloPagina: cfg.titulo,
        corpo: '<p class="vazio">Esta oferta acabou. <a href="/">Ver as ofertas de hoje</a></p>',
      }));
    }
    const loja = nomeDaLoja(p);
    const pub = publico(p);
    const economia = temDesconto(p) ? round2(p.preco_anterior - p.preco_atual) : 0;
    const detalhes = [
      p.avaliacao && `⭐ ${esc(p.avaliacao)} de 5${p.quantidade_avaliacoes ? ` (${esc(p.quantidade_avaliacoes)} avaliações)` : ''}`,
      p.quantidade_vendas && `🛍️ ${esc(p.quantidade_vendas)} vendidos`,
      p.frete_gratis && '🚚 Frete grátis',
      `🏬 Compra finalizada na ${esc(loja)}`,
    ].filter(Boolean).map((d) => `<li>${d}</li>`).join('');

    // Mais do mesmo publico (feminino chama feminino), sem repetir o atual.
    const codigo = codigoDoProduto(p);
    const parecidos = aplicarFiltro(produtosDaVitrine(), pub === 'masculino' ? 'masculino' : '')
      .filter((x) => codigoDoProduto(x) !== codigo)
      .slice(0, 4);

    const corpo = `
<nav class="trilha"><a href="/">Início</a>${pub ? ` · <a href="/?f=${pub === 'masculino' ? 'masculino' : 'feminino'}">${pub === 'masculino' ? 'Masculinos' : 'Femininos'}</a>` : ''}</nav>
<section class="produto">
  <div class="foto">
    ${p.desconto_percentual ? `<span class="etiqueta">-${esc(p.desconto_percentual)}%</span>` : ''}
    ${p.imagem_principal ? `<img src="${esc(p.imagem_principal)}" alt="${esc(titulo(p))}">` : ''}
  </div>
  <div class="texto">
    ${pub ? `<span class="publico">${ROTULO_PUBLICO[pub]}</span>` : ''}
    <h1>${esc(titulo(p))}</h1>
    ${precoHtml(p)}
    ${economia > 0 ? `<span class="economia">Você economiza ${esc(formatBRL(economia))}</span>` : ''}
    <ul class="detalhes">${detalhes}</ul>
    <a class="botao" href="/ir/${esc(codigo)}" rel="nofollow sponsored noopener">Ir para a ${esc(loja)} →</a>
    <p class="aviso">Preço conferido quando a oferta foi publicada. Confira o valor final na ${esc(loja)}.</p>
  </div>
</section>
${parecidos.length ? `<h2 class="secao">Você também pode gostar</h2><div class="grade">${parecidos.map(cartao).join('')}</div>` : ''}`;
    return res.type('html').send(pagina(cfg, {
      tituloPagina: `${titulo(p)} — ${cfg.titulo}`,
      descricao: `${formatBRL(p.preco_atual)} na ${loja}`,
      imagem: p.imagem_principal,
      corpo,
      temAmazon: lojaBase(p.marketplace) === 'amazon',
    }));
  });

  // O unico lugar onde o link de afiliado aparece: no redirecionamento.
  app.get('/ir/:codigo', (req, res) => {
    const p = produtoDaVitrine(req.params.codigo);
    if (!p) return res.redirect(302, '/');
    try {
      registrarClique(p, req.get('referer'));
    } catch (err) {
      log.warn(`Nao consegui registrar o clique: ${err.message}`);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, p.url_final || p.url_afiliado || p.url_original);
  });

  app.get('/robots.txt', (_req, res) => res.type('text').send('User-agent: *\nDisallow: /ir/\n'));
  app.use((_req, res) => res.status(404).type('text').send('Página não encontrada'));
  return app;
}
