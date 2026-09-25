/**
 * Factory dos repositorios. Unico ponto a trocar quando o storage mudar
 * (SQLite -> Postgres) ou quando entrar cache.
 */
import { BaseRepository } from './BaseRepository.js';
import { getDb } from '../db/index.js';

export const productRepository = new BaseRepository({
  table: 'products',
  prefix: 'prd',
  jsonFields: ['palavras_chave', 'imagens', 'tags'],
  boolFields: ['frete_gratis'],
  searchFields: ['titulo_original', 'titulo_publicacao', 'descricao_original', 'sku', 'external_id'],
  defaultSort: 'atualizado_em DESC',
});

export const categoryRepository = new BaseRepository({
  table: 'categories',
  prefix: 'cat',
  boolFields: ['ativo'],
  searchFields: ['nome', 'slug', 'nicho'],
  defaultSort: 'nome ASC',
});

export const couponRepository = new BaseRepository({
  table: 'coupons',
  prefix: 'cup',
  jsonFields: ['produtos_aplicaveis', 'categorias_aplicaveis'],
  searchFields: ['codigo', 'nome', 'descricao', 'marketplace'],
  defaultSort: 'criado_em DESC',
});

export const promotionRepository = new BaseRepository({
  table: 'promotions',
  prefix: 'promo',
  boolFields: ['frete_gratis'],
  searchFields: ['nome', 'marketplace', 'categoria'],
  defaultSort: 'criado_em DESC',
});

export const channelRepository = new BaseRepository({
  table: 'channels',
  prefix: 'chn',
  searchFields: ['nome', 'identificador'],
  defaultSort: 'nome ASC',
});

export const templateRepository = new BaseRepository({
  table: 'templates',
  prefix: 'tpl',
  boolFields: ['padrao', 'ativo'],
  searchFields: ['nome', 'descricao'],
  defaultSort: 'nome ASC',
});

export const campaignRepository = new BaseRepository({
  table: 'campaigns',
  prefix: 'cmp',
  jsonFields: ['filtros', 'produto_ids', 'dias_semana'],
  boolFields: ['loop', 'usar_ia'],
  searchFields: ['nome', 'descricao'],
  defaultSort: 'criado_em DESC',
});

export const campaignTargetRepository = new BaseRepository({
  table: 'campaign_targets',
  prefix: 'tgt',
  boolFields: ['ativo'],
  defaultSort: 'criado_em ASC',
});

export const publicationRepository = new BaseRepository({
  table: 'publications',
  prefix: 'pub',
  boolFields: ['dry_run'],
  searchFields: ['mensagem', 'cupom_publicado'],
  defaultSort: 'criado_em DESC',
});

export const affiliateRepository = new BaseRepository({
  table: 'affiliate_programs',
  prefix: 'afl',
  jsonFields: ['credenciais'],
  boolFields: ['ativo'],
  searchFields: ['nome', 'marketplace'],
  defaultSort: 'nome ASC',
});

export const savedSearchRepository = new BaseRepository({
  table: 'saved_searches',
  prefix: 'sch',
  jsonFields: ['filtros'],
  searchFields: ['nome'],
  defaultSort: 'criado_em DESC',
});

export const linkCheckRepository = new BaseRepository({
  table: 'link_checks',
  prefix: 'lck',
  jsonFields: ['ids_encontrados'],
  boolFields: ['confere'],
  defaultSort: 'verificado_em DESC',
});

export const logRepository = new BaseRepository({
  table: 'logs',
  prefix: 'log',
  searchFields: ['message', 'service'],
  defaultSort: 'timestamp DESC',
});

export const alertRepository = new BaseRepository({
  table: 'alerts',
  prefix: 'alr',
  boolFields: ['lido'],
  searchFields: ['titulo', 'detalhe'],
  defaultSort: 'criado_em DESC',
});

export const priceHistoryRepository = new BaseRepository({
  table: 'price_history',
  prefix: 'ph',
  defaultSort: 'criado_em DESC',
});

/**
 * Settings tem chave/valor (PK = chave), entao nao usa o BaseRepository padrao.
 */
class SettingsRepository {
  get db() { return getDb(); }

  get(chave, fallback = null) {
    const row = this.db.prepare('SELECT valor FROM settings WHERE chave = ? LIMIT 1').get(chave);
    if (!row) return fallback;
    try { return JSON.parse(row.valor); } catch { return row.valor; }
  }

  set(chave, valor) {
    const payload = JSON.stringify(valor ?? null);
    this.db
      .prepare(`INSERT INTO settings (chave, valor, atualizado_em) VALUES (?, ?, ?)
                ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`)
      .run(chave, payload, new Date().toISOString());
    return this.get(chave);
  }

  all() {
    const rows = this.db.prepare('SELECT chave, valor, atualizado_em FROM settings ORDER BY chave').all();
    const out = {};
    for (const row of rows) {
      try { out[row.chave] = JSON.parse(row.valor); } catch { out[row.chave] = row.valor; }
    }
    return out;
  }

  remove(chave) {
    return this.db.prepare('DELETE FROM settings WHERE chave = ?').run(chave).changes > 0;
  }
}

export const settingRepository = new SettingsRepository();
