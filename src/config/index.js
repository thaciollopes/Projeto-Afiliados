/**
 * Configuracao central. Unico lugar que le process.env.
 * Nada de credencial fora daqui; o frontend recebe apenas `publicConfig()`.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');

const bool = (v, def = false) => {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(v).toLowerCase());
};
const int = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT, p));

export const config = {
  app: {
    name: process.env.APP_NAME || 'Plataforma de Afiliados',
    port: int(process.env.APP_PORT, 3010),
    host: process.env.APP_HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
    token: process.env.APP_TOKEN || '',
    timezone: process.env.TZ || 'America/Sao_Paulo',
  },
  db: {
    driver: process.env.DB_DRIVER || 'sqlite',
    file: abs(process.env.DB_FILE || './data/afiliados.db'),
  },
  runtime: {
    dryRun: bool(process.env.DRY_RUN, true),
    workerEnabled: bool(process.env.WORKER_ENABLED, true),
    tickSeconds: int(process.env.WORKER_TICK_SECONDS, 30),
  },
  whatsapp: {
    provider: (process.env.WHATSAPP_PROVIDER || 'mock').toLowerCase(),
    baseUrl: process.env.WAHA_BASE_URL || 'http://localhost:3003',
    session: process.env.WAHA_SESSION || 'default',
    apiKey: process.env.WAHA_API_KEY || '',
  },
  n8n: {
    baseUrl: process.env.N8N_BASE_URL || 'http://localhost:5678',
    apiKey: process.env.N8N_API_KEY || '',
    webhookPrefix: process.env.N8N_WEBHOOK_PREFIX || 'http://localhost:5678/webhook',
  },
  ai: {
    provider: (process.env.AI_PROVIDER || 'mock').toLowerCase(),
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-sonnet-5',
    baseUrl: process.env.AI_BASE_URL || '',
    maxTokens: int(process.env.AI_MAX_TOKENS, 800),
  },
  marketplaces: {
    aliexpress: {
      appKey: process.env.ALIEXPRESS_APP_KEY || '',
      appSecret: process.env.ALIEXPRESS_APP_SECRET || '',
      trackingId: process.env.ALIEXPRESS_TRACKING_ID || '',
    },
    amazon: {
      accessKey: process.env.AMAZON_ACCESS_KEY || '',
      secretKey: process.env.AMAZON_SECRET_KEY || '',
      partnerTag: process.env.AMAZON_PARTNER_TAG || '',
    },
    shopee: {
      appId: process.env.SHOPEE_APP_ID || '',
      appSecret: process.env.SHOPEE_APP_SECRET || '',
    },
    mercadolivre: {
      clientId: process.env.MERCADOLIVRE_CLIENT_ID || '',
      clientSecret: process.env.MERCADOLIVRE_CLIENT_SECRET || '',
      // Precisa ser exatamente a mesma URL cadastrada no app do Mercado Livre.
      redirectUri: process.env.MERCADOLIVRE_REDIRECT_URI || '',
    },
    awin: {
      apiToken: process.env.AWIN_API_TOKEN || '',
      publisherId: process.env.AWIN_PUBLISHER_ID || '',
    },
  },
  // Coleta por navegacao (scraping). Fonte NAO oficial: ver docs/AFFILIATES.md.
  scraper: {
    ligado: bool(process.env.SCRAPER_ENABLED, false),
    baseUrl: bool(process.env.SCRAPER_ENABLED, false)
      ? (process.env.BROWSERLESS_URL || 'http://localhost:3004')
      : '',
    token: process.env.BROWSERLESS_TOKEN || 'afiliados-local',
    // Rajada e o que derruba: no teste, a Amazon bloqueou na 4a busca seguida.
    intervaloSegundos: int(process.env.SCRAPER_INTERVALO_SEGUNDOS, 30),
    cacheMinutos: int(process.env.SCRAPER_CACHE_MINUTOS, 30),
  },
  storage: {
    backupDir: abs(process.env.BACKUP_DIR || './storage/backups'),
    exportDir: abs('./storage/exports'),
    logDir: abs('./storage/logs'),
    cacheDir: abs('./storage/cache'),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

/** O que pode ser entregue ao navegador (jamais segredos). */
export function publicConfig() {
  return {
    appName: config.app.name,
    env: config.app.env,
    dryRun: config.runtime.dryRun,
    workerEnabled: config.runtime.workerEnabled,
    whatsappProvider: config.whatsapp.provider,
    aiProvider: config.ai.provider,
    timezone: config.app.timezone,
    requiresToken: Boolean(config.app.token),
  };
}

/** Mascara segredo para exibicao ("sk-abc...xyz"). */
export function mask(secret) {
  if (!secret) return '';
  const s = String(secret);
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}
