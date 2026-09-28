/**
 * Ponto de entrada. Sobe HTTP + worker e desliga com calma no Ctrl+C.
 */
import { createApp } from './app.js';
import { config } from './config/index.js';
import { startScheduler, stopScheduler } from './workers/scheduler.js';
import { closeDb } from './core/db/index.js';
import { logger } from './core/utils/logger.js';

const log = logger.child('servidor');

const app = createApp();

const server = app.listen(config.app.port, config.app.host, () => {
  const url = `http://localhost:${config.app.port}`;
  console.log('');
  console.log('  ===============================================');
  console.log(`   ${config.app.name}`);
  console.log('  ===============================================');
  console.log(`   Painel:     ${url}`);
  console.log(`   API:        ${url}/api`);
  console.log(`   Modo:       ${config.runtime.dryRun ? 'SIMULACAO (dry run)' : 'ENVIO REAL'}`);
  console.log(`   WhatsApp:   ${config.whatsapp.provider}`);
  console.log(`   IA:         ${config.ai.provider}`);
  console.log('  ===============================================');
  console.log('');
  // Aberto para a rede sem senha: qualquer um no mesmo Wi-Fi (ou na internet,
  // numa VPS) controla o painel, os cookies das lojas e os envios.
  if (!config.app.token && !/^(127\.|localhost$|::1$)/.test(String(config.app.host))) {
    log.warn(`Painel ouvindo em ${config.app.host} SEM APP_TOKEN: qualquer um que alcance esta porta controla o sistema. `
      + 'Defina APP_TOKEN no .env (ou APP_HOST=127.0.0.1 para uso só neste computador).');
  }
  startScheduler();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log.error(`A porta ${config.app.port} ja esta em uso. Mude APP_PORT no .env ou feche o outro programa.`);
    process.exit(1);
  }
  throw err;
});

function encerrar(sinal) {
  log.info(`Recebi ${sinal}, encerrando...`);
  stopScheduler();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('unhandledRejection', (motivo) => {
  log.error(`Promessa rejeitada sem tratamento: ${motivo?.message || motivo}`);
});
