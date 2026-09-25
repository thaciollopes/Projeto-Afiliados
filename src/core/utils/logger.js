/**
 * Logger unico do sistema: console + arquivo diario + (opcional) tabela `logs`.
 * O sink de banco e injetado depois do boot (evita dependencia circular com o DB).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config/index.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

let dbSink = null;
/** @param {(entry:object)=>void} fn */
export function setLogSink(fn) { dbSink = fn; }

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignora */ }
}

function writeFile(line) {
  try {
    ensureDir(config.storage.logDir);
    const day = new Date().toISOString().slice(0, 10);
    fs.appendFileSync(path.join(config.storage.logDir, `app-${day}.log`), `${line}\n`, 'utf8');
  } catch { /* log nunca derruba a aplicacao */ }
}

function emit(level, service, message, meta) {
  if ((LEVELS[level] ?? 0) < threshold) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: service || 'app',
    message: String(message ?? ''),
    meta: meta ?? null,
  };
  const line = `[${entry.timestamp}] ${level.toUpperCase().padEnd(5)} ${entry.service} :: ${entry.message}` +
    (meta ? ` ${safeJson(meta)}` : '');
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  writeFile(line);
  if (dbSink) { try { dbSink(entry); } catch { /* ignora */ } }
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return '"[nao serializavel]"'; }
}

export const logger = {
  debug: (service, message, meta) => emit('debug', service, message, meta),
  info: (service, message, meta) => emit('info', service, message, meta),
  warn: (service, message, meta) => emit('warn', service, message, meta),
  error: (service, message, meta) => emit('error', service, message, meta),
  child: (service) => ({
    debug: (m, meta) => emit('debug', service, m, meta),
    info: (m, meta) => emit('info', service, m, meta),
    warn: (m, meta) => emit('warn', service, m, meta),
    error: (m, meta) => emit('error', service, m, meta),
  }),
};
