/**
 * VITRINE no painel: configurar o site dos posts e ver os cliques.
 * (As paginas publicas nao passam por aqui — rodam no servidor da vitrine.)
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/index.js';
import {
  configVitrine, salvarConfigVitrine, resumoCliques, configParaTela, sincronizarVitrine,
} from '../../core/services/vitrineService.js';
import { config } from '../../config/index.js';

export const vitrineRouter = Router();

function comEndereco(cfg) {
  return {
    ...cfg,
    porta_local: config.vitrine.enabled ? config.vitrine.port : null,
    endereco_local: config.vitrine.enabled ? `http://localhost:${config.vitrine.port}/` : null,
  };
}

vitrineRouter.get('/', asyncHandler(async (_req, res) => {
  res.json(comEndereco(configParaTela(configVitrine())));
}));

vitrineRouter.put('/', asyncHandler(async (req, res) => {
  const cfg = salvarConfigVitrine(req.body || {});
  // Salvou com vitrine externa: ja envia os produtos (nao espera os 10 min).
  const sync = cfg.sync_url ? await sincronizarVitrine() : null;
  res.json({ ...comEndereco(configParaTela(cfg)), sync_agora: sync });
}));

vitrineRouter.post('/sincronizar', asyncHandler(async (_req, res) => {
  res.json(await sincronizarVitrine());
}));

vitrineRouter.get('/cliques', asyncHandler(async (req, res) => {
  res.json(resumoCliques(Math.min(Number(req.query.dias) || 7, 90)));
}));
