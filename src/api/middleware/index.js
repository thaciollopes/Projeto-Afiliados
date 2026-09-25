import { config } from '../../config/index.js';
import { AppError } from '../../core/utils/errors.js';
import { logger } from '../../core/utils/logger.js';

const log = logger.child('api');

/** Envolve handler async para que erro caia no errorHandler em vez de travar. */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** Token opcional (APP_TOKEN no .env). Vazio = uso local liberado. */
export function auth(req, res, next) {
  if (!config.app.token) return next();
  if (req.path === '/config' || req.path === '/health') return next();

  const enviado = req.get('x-api-token') || req.query.token || '';
  if (enviado === config.app.token) return next();

  return res.status(401).json({ erro: 'Token invalido ou ausente', codigo: 'NAO_AUTORIZADO' });
}

export function requestLogger(req, res, next) {
  if (req.method === 'GET') return next();
  const inicio = Date.now();
  res.on('finish', () => {
    log.debug(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - inicio}ms)`);
  });
  next();
}

export function notFoundHandler(req, res) {
  res.status(404).json({ erro: `Rota nao encontrada: ${req.method} ${req.originalUrl}`, codigo: 'ROTA_NAO_ENCONTRADA' });
}

export function errorHandler(err, req, res, _next) {
  const status = err instanceof AppError ? err.status : 500;
  const corpo = {
    erro: err.message || 'Erro interno',
    codigo: err.code || 'ERRO_INTERNO',
  };
  if (err.details) corpo.detalhes = err.details;

  if (status >= 500) {
    log.error(`${req.method} ${req.originalUrl}: ${err.message}`, { stack: err.stack?.split('\n')[1]?.trim() });
    if (config.app.env !== 'production') corpo.stack = err.stack;
  } else {
    log.warn(`${req.method} ${req.originalUrl}: ${err.message}`);
  }

  res.status(status).json(corpo);
}

/** Lê paginacao/ordenacao/busca da query string, com limites seguros. */
export function queryOptions(req, extras = {}) {
  const limite = Math.min(Number.parseInt(req.query.limite, 10) || 50, 500);
  const pagina = Math.max(Number.parseInt(req.query.pagina, 10) || 1, 1);
  return {
    limit: limite,
    offset: (pagina - 1) * limite,
    sort: req.query.ordenar || undefined,
    search: req.query.busca || undefined,
    filters: extras,
  };
}
