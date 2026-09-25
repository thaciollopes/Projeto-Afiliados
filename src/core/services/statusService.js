/**
 * SISTEMA > STATUS: um retrato de tudo que o sistema depende.
 * Cada checagem e isolada: um servico fora do ar nao derruba a pagina.
 */
import fs from 'node:fs';
import { config, publicConfig } from '../../config/index.js';
import { getDb } from '../db/index.js';
import { getWhatsAppProvider } from '../../integrations/whatsapp/index.js';
import { n8nClient } from '../../integrations/n8n/client.js';
import { aiStatus } from '../../integrations/ai/index.js';
import { marketplacesStatus } from '../../integrations/marketplaces/index.js';
import { productRepository } from '../repositories/index.js';

export async function systemStatus() {
  const [whatsapp, n8n, ia, marketplaces] = await Promise.all([
    checar(() => getWhatsAppProvider().status()),
    checar(() => n8nClient.status()),
    checar(() => aiStatus()),
    checar(() => marketplacesStatus()),
  ]);

  return {
    app: appStatus(),
    banco: dbStatus(),
    whatsapp,
    n8n,
    ia,
    marketplaces,
    config: publicConfig(),
    gerado_em: new Date().toISOString(),
  };
}

function appStatus() {
  const uptime = process.uptime();
  return {
    online: true,
    nome: config.app.name,
    versao: process.env.npm_package_version || '1.0.0',
    node: process.version,
    ambiente: config.app.env,
    porta: config.app.port,
    uptime_segundos: Math.round(uptime),
    uptime_legivel: formatarUptime(uptime),
    memoria_mb: Math.round(process.memoryUsage().rss / 1048576),
    dry_run: config.runtime.dryRun,
    worker: config.runtime.workerEnabled,
  };
}

function dbStatus() {
  try {
    const db = getDb();
    const tamanho = fs.existsSync(config.db.file) ? fs.statSync(config.db.file).size : 0;
    return {
      online: true,
      driver: db.engine,
      arquivo: config.db.file,
      tamanho_mb: Math.round((tamanho / 1048576) * 100) / 100,
      produtos: productRepository.count(),
    };
  } catch (err) {
    return { online: false, erro: err.message };
  }
}

async function checar(fn) {
  try {
    return await fn();
  } catch (err) {
    return { online: false, erro: err.message };
  }
}

function formatarUptime(segundos) {
  const d = Math.floor(segundos / 86400);
  const h = Math.floor((segundos % 86400) / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}min`;
  if (h) return `${h}h ${m}min`;
  return `${m}min`;
}
