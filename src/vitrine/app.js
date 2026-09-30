/**
 * Vitrine publica — servidor proprio, em porta separada do painel.
 *
 * So existem tres caminhos aqui: a lista (/), a pagina do produto (/p/:codigo)
 * e a ida para a loja (/ir/:codigo). Nada de API, nada do painel: e isso que
 * permite publicar esta porta na internet (tunel/dominio) com seguranca.
 */
import express from 'express';
import {
  configVitrine, produtoDaVitrine, produtosDaVitrine, registrarClique, codigoDoProduto,
} from '../core/services/vitrineService.js';
import { lojaBase } from '../core/services/affiliateLinkService.js';
import { formatBRL } from '../core/utils/money.js';
import { logger } from '../core/utils/logger.js';

const log = logger.child('vitrine');

const NOME_LOJA = { amazon: 'Amazon', mercadolivre: 'Mercado Livre', shopee: 'Shopee', magalu: 'Magazine Luiza' };

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function titulo(p) {
  return p.titulo_publicacao || p.titulo_original;
}

function precoHtml(p) {
  const de = p.preco_anterior && p.preco_anterior > p.preco_atual ? `<s class="de">${esc(formatBRL(p.preco_anterior))}</s>` : '';
  const off = p.desconto_percentual ? `<span class="off">-${esc(p.desconto_percentual)}%</span>` : '';
  return `<div class="precos">${de}<strong>${esc(formatBRL(p.preco_atual))}</strong>${off}</div>`;
}

function pagina(cfg, { tituloPagina, descricao = '', imagem = '', corpo, temAmazon }) {
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
<meta property="og:title" content="${esc(tituloPagina)}">
<meta property="og:description" content="${esc(descricao)}">
${imagem ? `<meta property="og:image" content="${esc(imagem)}">` : ''}
<meta property="og:type" content="website">
${ga}
<style>
:root { --cor: ${esc(cfg.cor)}; --fundo: #f6f6f7; --cartao: #fff; --texto: #1d1d1f; --fraco: #6e6e73; --linha: #e5e5ea; }
@media (prefers-color-scheme: dark) { :root { --fundo: #111113; --cartao: #1c1c1f; --texto: #f2f2f4; --fraco: #a1a1a8; --linha: #2c2c30; } }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--fundo); color: var(--texto); }
a { color: inherit; }
header { background: var(--cor); color: #fff; }
.topo { max-width: 1080px; margin: 0 auto; padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
.topo img { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; background: #fff; }
.topo a { text-decoration: none; font-weight: 700; font-size: 1.15rem; }
main { max-width: 1080px; margin: 0 auto; padding: 16px; }
form.busca { display: flex; gap: 8px; margin-bottom: 16px; }
form.busca input { flex: 1; min-width: 0; padding: 12px 14px; border: 1px solid var(--linha); border-radius: 10px; font-size: 1rem; background: var(--cartao); color: var(--texto); }
form.busca button, .botao { background: var(--cor); color: #fff; border: 0; border-radius: 10px; padding: 12px 18px; font-size: 1rem; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-block; text-align: center; }
.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 12px; }
.card { background: var(--cartao); border: 1px solid var(--linha); border-radius: 12px; overflow: hidden; text-decoration: none; display: flex; flex-direction: column; }
.card img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #fff; }
.card .info { padding: 10px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.card .nome { font-size: .9rem; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.precos { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
.precos strong { font-size: 1.1rem; }
.de { color: var(--fraco); font-size: .85rem; }
.off { background: #e8f7ee; color: #0b7a3b; font-size: .75rem; font-weight: 700; padding: 2px 6px; border-radius: 6px; }
.loja { color: var(--fraco); font-size: .78rem; }
.produto { background: var(--cartao); border: 1px solid var(--linha); border-radius: 14px; padding: 16px; display: grid; gap: 20px; grid-template-columns: 1fr; }
@media (min-width: 760px) { .produto { grid-template-columns: 1fr 1fr; padding: 24px; } }
.produto img { width: 100%; max-height: 460px; object-fit: contain; background: #fff; border-radius: 10px; }
.produto h1 { font-size: 1.3rem; line-height: 1.35; margin: 0 0 12px; }
.produto .precos strong { font-size: 1.8rem; }
.produto .botao { width: 100%; margin-top: 18px; font-size: 1.1rem; padding: 16px; }
.detalhes { color: var(--fraco); font-size: .9rem; margin-top: 12px; display: grid; gap: 4px; }
.aviso { color: var(--fraco); font-size: .78rem; margin-top: 14px; }
.vazio { text-align: center; color: var(--fraco); padding: 48px 0; }
footer { max-width: 1080px; margin: 24px auto; padding: 0 16px 32px; color: var(--fraco); font-size: .78rem; line-height: 1.5; }
</style>
</head>
<body>
<header><div class="topo">
${cfg.logo_url ? `<img src="${esc(cfg.logo_url)}" alt="">` : ''}
<a href="/">${esc(cfg.titulo)}</a>
</div></header>
<main>${corpo}</main>
<footer>
Os preços e a disponibilidade podem mudar a qualquer momento; o valor válido é o da loja no momento da compra.
Este site recebe comissão por compras feitas pelos links.
${temAmazon ? '<br>Como Associado da Amazon, recebo por compras qualificadas.' : ''}
</footer>
</body>
</html>`;
}

function cartao(p) {
  return `<a class="card" href="/p/${esc(codigoDoProduto(p))}">
  ${p.imagem_principal ? `<img src="${esc(p.imagem_principal)}" alt="" loading="lazy">` : ''}
  <div class="info"><span class="nome">${esc(titulo(p))}</span>${precoHtml(p)}
  <span class="loja">${esc(NOME_LOJA[lojaBase(p.marketplace)] || p.marketplace)}</span></div>
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
    const produtos = produtosDaVitrine({ busca });
    const corpo = `
<form class="busca" action="/" method="get"><input name="q" value="${esc(busca)}" placeholder="O que você procura?"><button>Buscar</button></form>
${produtos.length ? `<div class="grade">${produtos.map(cartao).join('')}</div>` : '<p class="vazio">Nenhuma oferta encontrada.</p>'}`;
    res.type('html').send(pagina(cfg, {
      tituloPagina: cfg.titulo,
      descricao: 'Ofertas selecionadas com os melhores preços.',
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
    const loja = NOME_LOJA[lojaBase(p.marketplace)] || p.marketplace;
    const detalhes = [
      p.avaliacao && `⭐ ${esc(p.avaliacao)} de 5${p.quantidade_avaliacoes ? ` (${esc(p.quantidade_avaliacoes)} avaliações)` : ''}`,
      p.quantidade_vendas && `🛒 ${esc(p.quantidade_vendas)} vendidos`,
      p.frete_gratis && '🚚 Frete grátis',
    ].filter(Boolean).map((d) => `<span>${d}</span>`).join('');
    const corpo = `
<section class="produto">
  <div>${p.imagem_principal ? `<img src="${esc(p.imagem_principal)}" alt="${esc(titulo(p))}">` : ''}</div>
  <div>
    <h1>${esc(titulo(p))}</h1>
    ${precoHtml(p)}
    <div class="detalhes">${detalhes}</div>
    <a class="botao" href="/ir/${esc(codigoDoProduto(p))}" rel="nofollow sponsored noopener">Ir para a ${esc(loja)} →</a>
    <p class="aviso">Preço conferido quando a oferta foi publicada. Confira o valor final na ${esc(loja)}.</p>
  </div>
</section>
<p style="margin-top:20px"><a href="/">← Ver mais ofertas</a></p>`;
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
