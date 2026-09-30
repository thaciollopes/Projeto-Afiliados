/**
 * Vitrine: o "site" que o post leva. Cada produto tem uma pagina com foto,
 * preco e o botao "Ir para a loja" — e so esse botao leva o link de afiliado.
 *
 * Por que existe: a Amazon (e, por cautela, o Mercado Livre) nao quer o link de
 * associado direto em aplicativo de mensagem. O post manda para a vitrine;
 * da vitrine a pessoa vai para a loja. E o mesmo modelo do Divulga Links.
 *
 * O link da vitrine so entra no post quando ela esta ligada E tem endereco
 * publico: sem endereco, o post continua com o link da loja (nunca um link
 * que ninguem de fora consegue abrir).
 */
import { settingRepository, productRepository } from '../repositories/index.js';
import { getDb } from '../db/index.js';
import { lojaBase } from './affiliateLinkService.js';
import { badRequest } from '../utils/errors.js';

const CHAVE = 'vitrine';

const PADRAO = {
  ativa: false,
  titulo: 'Achadinhos e Ofertas',
  cor: '#b4637a',
  logo_url: '',
  url_publica: '',
  usar_amazon_ml: true,
  usar_todas: false,
  ga_tag: '',
  // Vitrine hospedada em outro site (ex.: https://awaydev.com.br/ofertas): o sistema
  // envia os produtos para la. Vazio = vitrine propria (porta 3011).
  sync_url: '',
  sync_token: '',
};

export function configVitrine() {
  return { ...PADRAO, ...(settingRepository.get(CHAVE) || {}) };
}

export function salvarConfigVitrine(dados = {}) {
  const atual = configVitrine();
  const novo = { ...atual };
  for (const campo of Object.keys(PADRAO)) {
    if (dados[campo] === undefined) continue;
    novo[campo] = typeof PADRAO[campo] === 'boolean' ? Boolean(dados[campo]) : String(dados[campo]).trim();
  }
  // Senha da sincronizacao em branco = mantem a atual (a tela nunca recebe o valor).
  if (dados.sync_token !== undefined && !String(dados.sync_token).trim()) novo.sync_token = atual.sync_token;
  if (novo.sync_url) {
    let u;
    try { u = new URL(novo.sync_url); } catch { throw badRequest('Endereço de sincronização inválido.'); }
    if (u.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) {
      throw badRequest('O endereço de sincronização precisa ser https://');
    }
  }

  if (novo.url_publica) {
    let url;
    try {
      url = new URL(novo.url_publica);
    } catch {
      throw badRequest('Endereço da vitrine inválido. Use o endereço completo, ex.: https://loja.seudominio.com.br/');
    }
    if (url.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) {
      throw badRequest('Use https:// no endereço da vitrine (o WhatsApp marca http como inseguro).');
    }
    novo.url_publica = `${url.origin}${url.pathname.replace(/\/*$/, '/')}`;
  }
  if (!/^#[0-9a-f]{6}$/i.test(novo.cor)) throw badRequest('Cor inválida (use o formato #RRGGBB).');
  if (novo.ga_tag && !/^G-[A-Z0-9]{4,}$/i.test(novo.ga_tag)) throw badRequest('Tag do Google Analytics deve ser G-XXXXXXX.');
  if (novo.logo_url && !/^https:\/\//i.test(novo.logo_url)) throw badRequest('A logo precisa ser um endereço https://');

  settingRepository.set(CHAVE, novo);
  return novo;
}

/** O post deste produto deve levar para a vitrine? */
export function usaVitrine(produto, cfg = configVitrine()) {
  if (!cfg.ativa || !cfg.url_publica || !produto) return false;
  if (cfg.usar_todas) return true;
  return cfg.usar_amazon_ml && ['amazon', 'mercadolivre'].includes(lojaBase(produto.marketplace));
}

/** Codigo curto do produto no link: "prd_ab12cd34ef" -> "ab12cd34ef". */
export function codigoDoProduto(produto) {
  return String(produto.id).replace(/^prd_/, '');
}

export function linkDaVitrine(produto, cfg = configVitrine()) {
  if (!usaVitrine(produto, cfg)) return null;
  return `${cfg.url_publica}p/${codigoDoProduto(produto)}`;
}

/**
 * Produto que pode aparecer na vitrine: ativo, disponivel e com link DE AFILIADO.
 * Sem link de afiliado (ex.: Amazon antes de salvar a tag) o clique vai para a
 * loja sem comissao — melhor nao mostrar.
 */
function publicavel(p) {
  return p && p.status === 'ativo' && p.disponibilidade !== 'indisponivel' && Boolean(p.url_afiliado);
}

export function produtoDaVitrine(codigo) {
  if (!/^[a-z0-9]{4,40}$/i.test(String(codigo))) return null;
  const p = productRepository.findById(`prd_${codigo}`);
  return publicavel(p) ? p : null;
}

export function produtosDaVitrine({ busca = '', limite = 60, maximo = 120 } = {}) {
  const termo = String(busca).trim().toLowerCase();
  return productRepository.findAll({
    filters: { status: 'ativo' },
    search: termo,
    sort: 'data_ultima_publicacao DESC, score DESC',
    limit: Math.min(Number(limite) || 60, maximo),
  }).rows.filter(publicavel);
}

export function registrarClique(produto, origem = null) {
  getDb().prepare('INSERT INTO vitrine_cliques (product_id, origem, em) VALUES (?, ?, ?)')
    .run(produto.id, origem ? String(origem).slice(0, 200) : null, new Date().toISOString());
}

/** Cliques dos ultimos N dias, por produto (tela do painel). */
export function resumoCliques(dias = 7) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS n FROM vitrine_cliques WHERE em >= ?').get(desde).n;
  const top = db.prepare(`
    SELECT c.product_id, COUNT(*) AS cliques, p.titulo_original AS titulo, p.marketplace
    FROM vitrine_cliques c LEFT JOIN products p ON p.id = c.product_id
    WHERE c.em >= ? GROUP BY c.product_id ORDER BY cliques DESC LIMIT 10`).all(desde);
  return { dias, total, top };
}

/** O que a tela recebe: nunca a senha da sincronizacao. */
export function configParaTela(cfg = configVitrine()) {
  const { sync_token: token, ...resto } = cfg;
  return { ...resto, sync_configurado: Boolean(cfg.sync_url && token), sync: settingRepository.get(CHAVE_SYNC) || null };
}

const CHAVE_SYNC = 'vitrine_sync_estado';
const MAX_SINCRONIZAR = 300;

/** Produto no formato que o site externo (Cv-App /ofertas) espera. */
function paraSite(p) {
  return {
    codigo: codigoDoProduto(p),
    titulo: p.titulo_publicacao || p.titulo_original,
    preco: p.preco_atual,
    preco_anterior: p.preco_anterior && p.preco_anterior > p.preco_atual ? p.preco_anterior : null,
    desconto: p.desconto_percentual || null,
    imagem: p.imagem_principal || null,
    loja: lojaBase(p.marketplace),
    avaliacao: p.avaliacao || null,
    avaliacoes: p.quantidade_avaliacoes || null,
    vendas: p.quantidade_vendas || null,
    frete_gratis: Boolean(p.frete_gratis),
    link: p.url_final || p.url_afiliado || p.url_original,
  };
}

/**
 * Envia a lista de produtos para a vitrine hospedada fora (ex.: awaydev.com.br/ofertas)
 * e traz de volta os cliques do botao "Ir para a loja". O site guarda so o ultimo
 * envio: mandar a lista inteira toda vez e o que garante que produto pausado some.
 */
export async function sincronizarVitrine({ fetchImpl = fetch } = {}) {
  const cfg = configVitrine();
  if (!cfg.ativa || !cfg.sync_url || !cfg.sync_token) return { ok: false, pulado: true };
  const produtos = produtosDaVitrine({ limite: MAX_SINCRONIZAR, maximo: MAX_SINCRONIZAR })
    .filter((p) => p.preco_atual != null).map(paraSite);
  const estado = { em: new Date().toISOString(), enviados: produtos.length };
  try {
    const res = await fetchImpl(cfg.sync_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.sync_token}` },
      body: JSON.stringify({
        config: { titulo: cfg.titulo, cor: cfg.cor, logo_url: cfg.logo_url, ga_tag: cfg.ga_tag },
        produtos,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok || !dados.ok) throw new Error(dados.erro || `HTTP ${res.status}`);
    const cliques = Array.isArray(dados.cliques) ? dados.cliques : [];
    const inserir = getDb().prepare('INSERT INTO vitrine_cliques (product_id, origem, em) VALUES (?, ?, ?)');
    for (const c of cliques) {
      if (/^[a-z0-9]{4,40}$/i.test(String(c.codigo))) inserir.run(`prd_${c.codigo}`, 'site-externo', String(c.em || estado.em));
    }
    Object.assign(estado, { ok: true, recebidos: dados.recebidos, cliques: cliques.length });
  } catch (err) {
    Object.assign(estado, { ok: false, erro: err.message });
  }
  settingRepository.set(CHAVE_SYNC, estado);
  return estado;
}
