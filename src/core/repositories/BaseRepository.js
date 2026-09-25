/**
 * Camada Repository: o resto do sistema nunca escreve SQL.
 *
 * Trocar SQLite por Postgres no futuro = criar um PostgresBaseRepository com
 * os mesmos metodos (create/update/findById/findAll/remove/count) e apontar o
 * factory em repositories/index.js. Nenhum service precisa mudar.
 */
import { getDb } from '../db/index.js';
import { newId } from '../utils/id.js';
import { nowIso } from '../utils/dates.js';

/** SQLite so aceita number/string/null/bigint/Buffer como parametro. */
function toParam(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

const OPERATORS = {
  eq: (col) => `${col} = ?`,
  ne: (col) => `${col} != ?`,
  gt: (col) => `${col} > ?`,
  gte: (col) => `${col} >= ?`,
  lt: (col) => `${col} < ?`,
  lte: (col) => `${col} <= ?`,
  like: (col) => `${col} LIKE ?`,
};

export class BaseRepository {
  /**
   * @param {{table:string, prefix:string, jsonFields?:string[], boolFields?:string[],
   *          numberFields?:string[], searchFields?:string[], defaultSort?:string}} options
   */
  constructor(options) {
    this.table = options.table;
    this.prefix = options.prefix;
    this.jsonFields = options.jsonFields || [];
    this.boolFields = options.boolFields || [];
    this.searchFields = options.searchFields || [];
    this.defaultSort = options.defaultSort || 'criado_em DESC';
    this._columns = null;
  }

  get db() { return getDb(); }

  /** Colunas reais da tabela: protege contra SQL injection em sort/filtros. */
  columns() {
    if (!this._columns) {
      const rows = this.db.prepare(`PRAGMA table_info(${this.table})`).all();
      this._columns = rows.map((r) => r.name);
    }
    return this._columns;
  }

  isColumn(name) { return this.columns().includes(name); }

  /** row do banco -> objeto de dominio */
  deserialize(row) {
    if (!row) return null;
    const out = { ...row };
    for (const field of this.jsonFields) {
      if (out[field] === null || out[field] === undefined || out[field] === '') {
        out[field] = [];
        continue;
      }
      try {
        out[field] = typeof out[field] === 'string' ? JSON.parse(out[field]) : out[field];
      } catch {
        out[field] = [];
      }
    }
    for (const field of this.boolFields) {
      if (out[field] !== undefined && out[field] !== null) out[field] = Boolean(out[field]);
    }
    return out;
  }

  /** objeto de dominio -> colunas gravaveis */
  serialize(data) {
    const out = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (!this.isColumn(key)) continue;
      if (this.jsonFields.includes(key)) {
        out[key] = value === undefined || value === null ? null : JSON.stringify(value);
      } else {
        out[key] = toParam(value);
      }
    }
    return out;
  }

  create(data) {
    const now = nowIso();
    const record = {
      id: data.id || newId(this.prefix),
      ...data,
      criado_em: data.criado_em || now,
      atualizado_em: now,
    };
    const payload = this.serialize(record);
    const cols = Object.keys(payload);
    const sql = `INSERT INTO ${this.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
    this.db.prepare(sql).run(...cols.map((c) => payload[c]));
    return this.findById(record.id);
  }

  update(id, patch) {
    const payload = this.serialize({ ...patch, atualizado_em: nowIso() });
    delete payload.id;
    delete payload.criado_em;
    const cols = Object.keys(payload);
    if (cols.length === 0) return this.findById(id);
    const sql = `UPDATE ${this.table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...cols.map((c) => payload[c]), id);
    return this.findById(id);
  }

  /** Cria ou atualiza usando uma chave natural, ex.: {marketplace, external_id}. */
  upsertBy(keys, data) {
    const where = Object.entries(keys)
      .filter(([col]) => this.isColumn(col))
      .map(([col]) => `${col} = ?`)
      .join(' AND ');
    const values = Object.values(keys).map(toParam);
    const existing = where
      ? this.db.prepare(`SELECT id FROM ${this.table} WHERE ${where} LIMIT 1`).get(...values)
      : null;
    if (existing) return { record: this.update(existing.id, data), created: false };
    return { record: this.create({ ...keys, ...data }), created: true };
  }

  findById(id) {
    if (!id) return null;
    const row = this.db.prepare(`SELECT * FROM ${this.table} WHERE id = ? LIMIT 1`).get(id);
    return this.deserialize(row);
  }

  findOne(filters = {}) {
    const { rows } = this.findAll({ filters, limit: 1 });
    return rows[0] || null;
  }

  findByIds(ids = []) {
    const clean = ids.filter(Boolean);
    if (clean.length === 0) return [];
    const sql = `SELECT * FROM ${this.table} WHERE id IN (${clean.map(() => '?').join(', ')})`;
    return this.db.prepare(sql).all(...clean).map((r) => this.deserialize(r));
  }

  /**
   * @param {{filters?:object, search?:string, sort?:string, limit?:number,
   *          offset?:number, raw?:string[]}} options
   */
  findAll(options = {}) {
    const { where, params } = this._buildWhere(options);
    const sort = this._buildSort(options.sort);
    const limit = Math.min(Number(options.limit) || 100, 1000);
    const offset = Number(options.offset) || 0;

    const total = this.db
      .prepare(`SELECT COUNT(*) AS total FROM ${this.table} ${where}`)
      .get(...params)?.total ?? 0;

    const rows = this.db
      .prepare(`SELECT * FROM ${this.table} ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset)
      .map((r) => this.deserialize(r));

    return { rows, total: Number(total), limit, offset };
  }

  list(options = {}) { return this.findAll({ limit: 1000, ...options }).rows; }

  count(filters = {}) {
    const { where, params } = this._buildWhere({ filters });
    const row = this.db.prepare(`SELECT COUNT(*) AS total FROM ${this.table} ${where}`).get(...params);
    return Number(row?.total ?? 0);
  }

  remove(id) {
    const r = this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
    return r.changes > 0;
  }

  removeWhere(filters = {}) {
    const { where, params } = this._buildWhere({ filters });
    if (!where) return 0;
    const r = this.db.prepare(`DELETE FROM ${this.table} ${where}`).run(...params);
    return r.changes;
  }

  /** Escape hatch para consultas agregadas (relatorios/dashboard). */
  raw(sql, params = []) {
    return this.db.prepare(sql).all(...params.map(toParam));
  }

  rawOne(sql, params = []) {
    return this.db.prepare(sql).get(...params.map(toParam));
  }

  _buildWhere(options) {
    const clauses = [];
    const params = [];
    const filters = options.filters || {};

    for (const [key, condition] of Object.entries(filters)) {
      if (condition === undefined || condition === '') continue;
      if (!this.isColumn(key)) continue;

      if (condition === null) { clauses.push(`${key} IS NULL`); continue; }

      if (Array.isArray(condition)) {
        if (condition.length === 0) continue;
        clauses.push(`${key} IN (${condition.map(() => '?').join(', ')})`);
        params.push(...condition.map(toParam));
        continue;
      }

      if (typeof condition === 'object') {
        for (const [op, value] of Object.entries(condition)) {
          if (value === undefined || value === '' || value === null) continue;
          const build = OPERATORS[op];
          if (!build) continue;
          clauses.push(build(key));
          params.push(toParam(value));
        }
        continue;
      }

      clauses.push(`${key} = ?`);
      params.push(toParam(condition));
    }

    if (options.search && this.searchFields.length) {
      const term = `%${String(options.search).trim()}%`;
      const parts = this.searchFields.filter((f) => this.isColumn(f)).map((f) => `${f} LIKE ?`);
      if (parts.length) {
        clauses.push(`(${parts.join(' OR ')})`);
        params.push(...parts.map(() => term));
      }
    }

    for (const raw of options.raw || []) {
      if (raw?.sql) {
        clauses.push(`(${raw.sql})`);
        params.push(...(raw.params || []).map(toParam));
      }
    }

    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  _buildSort(sort) {
    if (!sort) return this.defaultSort;
    const parts = String(sort)
      .split(',')
      .map((piece) => {
        const [field, dirRaw] = piece.trim().split(/\s+/);
        const dir = String(dirRaw || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        return this.isColumn(field) ? `${field} ${dir}` : null;
      })
      .filter(Boolean);
    return parts.length ? parts.join(', ') : this.defaultSort;
  }
}
