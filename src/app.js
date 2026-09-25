import express from 'express';
import path from 'node:path';
import { config, ROOT } from './config/index.js';
import { apiRouter } from './api/index.js';
import { errorHandler, notFoundHandler, requestLogger } from './api/middleware/index.js';
import { getDb } from './core/db/index.js';
import { logRepository } from './core/repositories/index.js';
import { logger, setLogSink } from './core/utils/logger.js';

export function createApp() {
  getDb();

  // A partir daqui todo log tambem vai para a tabela `logs` (SISTEMA > Logs).
  setLogSink((entry) => {
    logRepository.create({
      timestamp: entry.timestamp,
      level: entry.level,
      service: entry.service,
      message: entry.message,
      meta: entry.meta ? JSON.stringify(entry.meta) : null,
    });
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // A extensao do navegador roda em outra origem (chrome-extension://...) e
  // sem isto o navegador bloqueia a chamada antes de sair. Liberado so para
  // extensao e para o proprio painel — nao e um CORS aberto para a internet.
  app.use((req, res, next) => {
    const origem = req.get('origin') || '';
    const permitida = /^chrome-extension:\/\//.test(origem)
      || /^moz-extension:\/\//.test(origem)
      || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);

    if (permitida) {
      res.setHeader('Access-Control-Allow-Origin', origem);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(permitida ? 204 : 403);
    return next();
  });

  app.use('/api', apiRouter);

  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

  // O painel e uma SPA: qualquer rota que nao seja /api cai no index.html.
  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    return res.sendFile(path.join(ROOT, 'public', 'index.html'));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info('app', `${config.app.name} pronto`, {
    ambiente: config.app.env,
    dryRun: config.runtime.dryRun,
    whatsapp: config.whatsapp.provider,
    ia: config.ai.provider,
  });

  return app;
}
