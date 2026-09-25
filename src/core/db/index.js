/**
 * Conexao unica com o banco + aplicacao do schema.
 * Todo acesso a dados passa pelos repositorios; ninguem fora de core/ usa isto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../config/index.js';
import { openDatabase } from './driver.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;

export function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.db.file), { recursive: true });
  db = openDatabase(config.db.file);

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  aplicarColunasNovas(db);

  logger.info('db', `Banco pronto (${db.engine})`, { file: config.db.file });
  return db;
}

/**
 * Coluna nova em tabela que ja existe. O schema.sql roda com IF NOT EXISTS,
 * entao banco criado antes da coluna nunca a ganharia sozinho. A coluna
 * tambem vai no schema.sql (banco novo nasce com ela; aqui vira no-op).
 * Regra: so ADD COLUMN, nunca renomear/apagar — backup antigo continua abrindo.
 */
const COLUNAS_NOVAS = [
  ['channels', 'sub_id', 'TEXT'],
];

function aplicarColunasNovas(conn) {
  for (const [tabela, coluna, tipo] of COLUNAS_NOVAS) {
    const existentes = conn.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
    if (!existentes.includes(coluna)) {
      conn.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
      logger.info('db', `Coluna nova: ${tabela}.${coluna}`);
    }
  }
}

export function closeDb() {
  if (db) {
    try { db.close(); } catch { /* ignora */ }
    db = null;
  }
}

/** Executa uma funcao dentro de transacao. */
export function transaction(fn) {
  const conn = getDb();
  conn.exec('BEGIN');
  try {
    const result = fn(conn);
    conn.exec('COMMIT');
    return result;
  } catch (err) {
    try { conn.exec('ROLLBACK'); } catch { /* ignora */ }
    throw err;
  }
}
