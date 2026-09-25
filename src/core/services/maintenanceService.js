/**
 * SISTEMA > Backup e Limpeza.
 *
 * Backup = copia do arquivo SQLite + um JSON legivel (para conferir/migrar).
 * Limpeza = remove o que ja nao serve, com as janelas configuraveis.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config/index.js';
import { getDb, closeDb } from '../db/index.js';
import {
  productRepository, promotionRepository, couponRepository, campaignRepository,
  channelRepository, templateRepository, publicationRepository, affiliateRepository,
  savedSearchRepository, categoryRepository, logRepository, alertRepository,
  settingRepository, campaignTargetRepository,
} from '../repositories/index.js';
import { daysAgoIso, nowIso } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { badRequest, notFound } from '../utils/errors.js';

const log = logger.child('manutencao');

const EXPORTAVEIS = {
  categorias: categoryRepository,
  produtos: productRepository,
  promocoes: promotionRepository,
  cupons: couponRepository,
  campanhas: campaignRepository,
  campanha_canais: campaignTargetRepository,
  canais: channelRepository,
  templates: templateRepository,
  afiliados: affiliateRepository,
  pesquisas: savedSearchRepository,
  publicacoes: publicationRepository,
};

// ------------------------------------------------------------- backup --

export function createBackup({ rotulo = 'manual' } = {}) {
  fs.mkdirSync(config.storage.backupDir, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = path.join(config.storage.backupDir, `backup-${carimbo}-${rotulo}`);

  // WAL checkpoint: sem isso a copia pode sair sem os ultimos registros.
  try { getDb().exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* segue */ }

  const arquivoDb = `${base}.db`;
  fs.copyFileSync(config.db.file, arquivoDb);

  const dados = { gerado_em: nowIso(), versao: 1, configuracoes: settingRepository.all(), tabelas: {} };
  for (const [nome, repo] of Object.entries(EXPORTAVEIS)) {
    dados.tabelas[nome] = repo.list({ limit: 1000 });
  }
  const arquivoJson = `${base}.json`;
  fs.writeFileSync(arquivoJson, JSON.stringify(dados, null, 2), 'utf8');

  rotacionarBackups();

  const info = {
    arquivo_db: arquivoDb,
    arquivo_json: arquivoJson,
    tamanho_mb: Math.round((fs.statSync(arquivoDb).size / 1048576) * 100) / 100,
    registros: Object.fromEntries(Object.entries(dados.tabelas).map(([k, v]) => [k, v.length])),
    em: nowIso(),
  };
  log.info(`Backup criado (${info.tamanho_mb} MB)`, { arquivo: path.basename(arquivoDb) });
  return info;
}

export function listBackups() {
  if (!fs.existsSync(config.storage.backupDir)) return [];
  return fs.readdirSync(config.storage.backupDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const completo = path.join(config.storage.backupDir, f);
      const stat = fs.statSync(completo);
      return {
        arquivo: f,
        caminho: completo,
        tamanho_mb: Math.round((stat.size / 1048576) * 100) / 100,
        criado_em: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

/** Restaura um backup .db. O banco atual vira "-antes-da-restauracao". */
export function restoreBackup(arquivo) {
  const origem = path.join(config.storage.backupDir, path.basename(arquivo));
  if (!fs.existsSync(origem)) throw notFound('Arquivo de backup');
  if (!origem.endsWith('.db')) throw badRequest('Informe o arquivo .db do backup');

  const seguranca = `${config.db.file}.antes-da-restauracao-${Date.now()}`;
  closeDb();
  if (fs.existsSync(config.db.file)) fs.copyFileSync(config.db.file, seguranca);
  fs.copyFileSync(origem, config.db.file);
  // WAL/SHM antigos apontam para o banco substituido.
  for (const sufixo of ['-wal', '-shm']) {
    const extra = `${config.db.file}${sufixo}`;
    if (fs.existsSync(extra)) fs.rmSync(extra);
  }
  getDb();

  log.warn(`Backup restaurado: ${path.basename(origem)}`, { seguranca });
  return { restaurado: path.basename(origem), copia_de_seguranca: seguranca };
}

function rotacionarBackups() {
  const manter = Number(process.env.BACKUP_KEEP || 15);
  const backups = listBackups();
  for (const antigo of backups.slice(manter)) {
    try {
      fs.rmSync(antigo.caminho);
      const json = antigo.caminho.replace(/\.db$/, '.json');
      if (fs.existsSync(json)) fs.rmSync(json);
    } catch { /* ignora */ }
  }
}

// ------------------------------------------------------------ limpeza --

export const LIMPEZA_PADRAO = {
  produtos_expirados_dias: 60,
  promocoes_expiradas_dias: 30,
  cupons_expirados_dias: 30,
  publicacoes_dias: 90,
  logs_dias: 30,
  alertas_lidos_dias: 15,
  cache: true,
};

export function cleanupSettings() {
  return { ...LIMPEZA_PADRAO, ...(settingRepository.get('limpeza') || {}) };
}

export function saveCleanupSettings(patch) {
  return settingRepository.set('limpeza', { ...cleanupSettings(), ...patch });
}

/** @param {{dry?:boolean}} options - dry:true so conta, nao apaga. */
export function runCleanup({ dry = false } = {}) {
  const regras = cleanupSettings();
  const resultado = {};

  const remover = (nome, repo, filtros) => {
    const alvo = repo.findAll({ filters: filtros, limit: 1 }).total;
    resultado[nome] = alvo;
    if (!dry && alvo > 0) repo.removeWhere(filtros);
  };

  if (regras.produtos_expirados_dias) {
    remover('produtos_expirados', productRepository, {
      status: 'expirado', atualizado_em: { lt: daysAgoIso(regras.produtos_expirados_dias) },
    });
  }
  if (regras.promocoes_expiradas_dias) {
    remover('promocoes_expiradas', promotionRepository, {
      status: 'expirada', atualizado_em: { lt: daysAgoIso(regras.promocoes_expiradas_dias) },
    });
  }
  if (regras.cupons_expirados_dias) {
    remover('cupons_expirados', couponRepository, {
      status: 'expirado', atualizado_em: { lt: daysAgoIso(regras.cupons_expirados_dias) },
    });
  }
  if (regras.publicacoes_dias) {
    remover('publicacoes_antigas', publicationRepository, {
      status: ['enviado', 'cancelado'], criado_em: { lt: daysAgoIso(regras.publicacoes_dias) },
    });
  }
  if (regras.logs_dias) {
    remover('logs_antigos', logRepository, { timestamp: { lt: daysAgoIso(regras.logs_dias) } });
  }
  if (regras.alertas_lidos_dias) {
    remover('alertas_lidos', alertRepository, { lido: 1, criado_em: { lt: daysAgoIso(regras.alertas_lidos_dias) } });
  }

  if (regras.cache && !dry) {
    try {
      fs.rmSync(config.storage.cacheDir, { recursive: true, force: true });
      fs.mkdirSync(config.storage.cacheDir, { recursive: true });
      resultado.cache_limpo = true;
    } catch { resultado.cache_limpo = false; }
  }

  if (!dry) {
    try { getDb().exec('VACUUM;'); } catch { /* opcional */ }
    log.info('Limpeza executada', resultado);
  }

  return { dry, regras, resultado, em: nowIso() };
}

export { EXPORTAVEIS };
