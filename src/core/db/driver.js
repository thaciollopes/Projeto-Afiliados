/**
 * Abre o SQLite sem depender de modulo nativo quando possivel.
 *
 * 1) node:sqlite  -> embutido no Node 22.5+/24, nada para compilar (padrao)
 * 2) better-sqlite3 -> usado automaticamente em Node antigo, se instalado
 *
 * A API exposta e a mesma nos dois casos: prepare/exec/close + run/get/all.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function openDatabase(file) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(file);
    return wrapNodeSqlite(db);
  } catch (err) {
    try {
      const Better = require('better-sqlite3');
      const db = new Better(file);
      return wrapBetterSqlite(db);
    } catch {
      throw new Error(
        'Nenhum driver SQLite disponivel. Use Node 22.5+ (modulo node:sqlite) ' +
        `ou instale better-sqlite3. Detalhe: ${err.message}`,
      );
    }
  }
}

function wrapNodeSqlite(db) {
  return {
    engine: 'node:sqlite',
    raw: db,
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        run: (...params) => {
          const r = stmt.run(...params);
          return { changes: Number(r.changes ?? 0), lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
        },
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params),
      };
    },
  };
}

function wrapBetterSqlite(db) {
  return {
    engine: 'better-sqlite3',
    raw: db,
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        run: (...params) => {
          const r = stmt.run(...params);
          return { changes: Number(r.changes ?? 0), lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
        },
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params),
      };
    },
  };
}
