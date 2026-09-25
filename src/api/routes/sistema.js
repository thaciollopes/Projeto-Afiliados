/**
 * Rotas de sistema: dashboard, status, logs, alertas, configuracoes,
 * backup, limpeza, export/import Excel e IA.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { asyncHandler, queryOptions } from '../middleware/index.js';
import { config, publicConfig } from '../../config/index.js';
import { dashboard, charts } from '../../core/services/dashboardService.js';
import { systemStatus } from '../../core/services/statusService.js';
import { firstSteps } from '../../core/services/onboardingService.js';
import {
  createBackup, listBackups, restoreBackup, runCleanup, cleanupSettings, saveCleanupSettings,
} from '../../core/services/maintenanceService.js';
import { exportToExcel, importProductsFromExcel } from '../../core/services/excelService.js';
import { logRepository, alertRepository, settingRepository } from '../../core/repositories/index.js';
import { expireCoupons } from '../../core/services/couponService.js';
import { expirePromotions } from '../../core/services/promotionService.js';
import { expireStaleProducts, recalculateScores } from '../../core/services/productService.js';
import { generate } from '../../integrations/ai/index.js';
import { badRequest } from '../../core/utils/errors.js';

export const sistemaRouter = Router();

sistemaRouter.get('/config', asyncHandler(async (_req, res) => {
  res.json({ ...publicConfig(), configuracoes: settingRepository.all() });
}));

sistemaRouter.put('/config', asyncHandler(async (req, res) => {
  const salvos = {};
  for (const [chave, valor] of Object.entries(req.body || {})) {
    salvos[chave] = settingRepository.set(chave, valor);
  }
  res.json(salvos);
}));

/** COMECE AQUI: o que ja esta configurado e o que falta. */
sistemaRouter.get('/primeiros-passos', asyncHandler(async (_req, res) => {
  res.json(await firstSteps());
}));

sistemaRouter.get('/dashboard', asyncHandler(async (_req, res) => {
  res.json(dashboard());
}));

sistemaRouter.get('/graficos', asyncHandler(async (req, res) => {
  res.json(charts({ dias: Number(req.query.dias) || 14 }));
}));

sistemaRouter.get('/status', asyncHandler(async (_req, res) => {
  res.json(await systemStatus());
}));

sistemaRouter.get('/logs', asyncHandler(async (req, res) => {
  const filtros = {};
  if (req.query.level) filtros.level = req.query.level;
  if (req.query.service) filtros.service = req.query.service;
  res.json(logRepository.findAll(queryOptions(req, filtros)));
}));

sistemaRouter.delete('/logs', asyncHandler(async (_req, res) => {
  res.json({ removidos: logRepository.removeWhere({ level: ['debug', 'info', 'warn', 'error'] }) });
}));

sistemaRouter.get('/alertas', asyncHandler(async (req, res) => {
  const filtros = {};
  if (req.query.lido !== undefined) filtros.lido = req.query.lido === 'true' ? 1 : 0;
  if (req.query.tipo) filtros.tipo = req.query.tipo;
  res.json(alertRepository.findAll(queryOptions(req, filtros)));
}));

sistemaRouter.post('/alertas/:id/lido', asyncHandler(async (req, res) => {
  res.json(alertRepository.update(req.params.id, { lido: true }));
}));

sistemaRouter.post('/alertas/marcar-todos', asyncHandler(async (_req, res) => {
  const naoLidos = alertRepository.list({ filters: { lido: 0 }, limit: 1000 });
  for (const alerta of naoLidos) alertRepository.update(alerta.id, { lido: true });
  res.json({ marcados: naoLidos.length });
}));

// -------------------------------------------------------- backup/limpeza --

sistemaRouter.get('/backups', asyncHandler(async (_req, res) => {
  res.json(listBackups());
}));

sistemaRouter.post('/backups', asyncHandler(async (req, res) => {
  res.status(201).json(createBackup({ rotulo: req.body?.rotulo || 'manual' }));
}));

sistemaRouter.post('/backups/restaurar', asyncHandler(async (req, res) => {
  if (!req.body?.arquivo) throw badRequest('informe o arquivo do backup');
  res.json(restoreBackup(req.body.arquivo));
}));

sistemaRouter.get('/limpeza', asyncHandler(async (_req, res) => {
  res.json({ regras: cleanupSettings(), previa: runCleanup({ dry: true }).resultado });
}));

sistemaRouter.put('/limpeza', asyncHandler(async (req, res) => {
  res.json(saveCleanupSettings(req.body || {}));
}));

sistemaRouter.post('/limpeza/executar', asyncHandler(async (req, res) => {
  res.json(runCleanup({ dry: Boolean(req.body?.dry) }));
}));

/** Manutencao do dia: expira o que venceu e recalcula score. */
sistemaRouter.post('/manutencao', asyncHandler(async (_req, res) => {
  res.json({
    cupons: expireCoupons(),
    promocoes: expirePromotions(),
    produtos: expireStaleProducts(),
    scores: recalculateScores(),
  });
}));

// ------------------------------------------------------------ excel --

sistemaRouter.post('/exportar', asyncHandler(async (req, res) => {
  const resultado = await exportToExcel(req.body?.tabelas || []);
  res.json({ ...resultado, download: `/api/sistema/download/${path.basename(resultado.arquivo)}` });
}));

sistemaRouter.get('/download/:arquivo', asyncHandler(async (req, res) => {
  const arquivo = path.join(config.storage.exportDir, path.basename(req.params.arquivo));
  if (!fs.existsSync(arquivo)) throw badRequest('Arquivo nao encontrado');
  res.download(arquivo);
}));

sistemaRouter.post('/importar-excel', asyncHandler(async (req, res) => {
  if (!req.body?.caminho) throw badRequest('informe o caminho do arquivo .xlsx');
  res.json(await importProductsFromExcel(req.body.caminho));
}));

// ---------------------------------------------------------------- ia --

export const iaRouter = Router();

iaRouter.post('/gerar', asyncHandler(async (req, res) => {
  const { tarefa = 'post', produto = {}, precos = {}, instrucao = '', texto = '' } = req.body || {};
  res.json(await generate({ tarefa, product: produto, pricing: precos, instrucao, texto }));
}));
