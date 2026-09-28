import express from 'express';
import path from 'node:path';
import { config, ROOT } from './config/index.js';
import { apiRouter } from './api/index.js';
import { errorHandler, notFoundHandler, requestLogger } from './api/middleware/index.js';
import { getDb } from './core/db/index.js';
import { logRepository } from './core/repositories/index.js';
import { logger, setLogSink } from './core/utils/logger.js';

/** O painel aberto pelo IP da rede ou por um domínio chama a API da mesma origem. */
function mesmaOrigem(origem, host) {
  try {
    return Boolean(origem && host) && new URL(origem).host === host;
  } catch {
    return false;
  }
}

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
  // Corpo bruto guardado: a assinatura (HMAC) do webhook da WAHA e calculada
  // sobre os bytes exatos, nao sobre o JSON re-serializado.
  app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.corpoBruto = buf; } }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // A extensao do navegador roda em outra origem (chrome-extension://...) e
  // sem isto o navegador bloqueia a chamada antes de sair. Liberado so para
  // extensao e para o proprio painel — nao e um CORS aberto para a internet.
  app.use((req, res, next) => {
    const origem = req.get('origin') || '';
    const permitida = /^chrome-extension:\/\//.test(origem)
      || /^moz-extension:\/\//.test(origem)
      || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem)
      || mesmaOrigem(origem, req.get('host'));

    if (permitida) {
      res.setHeader('Access-Control-Allow-Origin', origem);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(permitida ? 204 : 403);

    // CSRF: sem APP_TOKEN (o padrão local), qualquer site aberto no navegador
    // podia mandar um formulário para localhost:3010 — importar produto com o
    // link de afiliado de OUTRA pessoa, restaurar backup velho. O navegador
    // sempre manda Origin nesses casos: origem estranha não altera nada.
    // (n8n, curl e scripts não mandam Origin e seguem passando.)
    if (origem && !permitida && !['GET', 'HEAD'].includes(req.method)) {
      return res.status(403).json({ erro: 'Origem nao permitida', codigo: 'ORIGEM_NAO_PERMITIDA' });
    }
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
