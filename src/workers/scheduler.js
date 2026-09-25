/**
 * Motor interno: a cada tick roda as campanhas ativas e processa a fila.
 *
 * Existe para o sistema funcionar sozinho, mesmo com o n8n desligado. Quando o
 * n8n assume o agendamento, basta WORKER_ENABLED=false no .env — as mesmas
 * funcoes ficam expostas em /api/campanhas/executar-ativas e
 * /api/publicacoes/processar.
 */
import { config } from '../config/index.js';
import { runActiveCampaigns } from '../core/services/campaignService.js';
import { processQueue } from '../core/services/publicationService.js';
import { expireCoupons } from '../core/services/couponService.js';
import { expirePromotions } from '../core/services/promotionService.js';
import { logger } from '../core/utils/logger.js';

const log = logger.child('worker');

let timer = null;
let rodando = false;
let ultimaManutencao = 0;

export function startScheduler() {
  if (!config.runtime.workerEnabled) {
    log.info('Worker desligado (WORKER_ENABLED=false). Use o n8n ou a API para publicar.');
    return null;
  }
  if (timer) return timer;

  const intervalo = Math.max(config.runtime.tickSeconds, 10) * 1000;
  timer = setInterval(tick, intervalo);
  timer.unref?.();
  log.info(`Worker ligado: tick a cada ${intervalo / 1000}s`, { dryRun: config.runtime.dryRun });

  setTimeout(tick, 3000);
  return timer;
}

export function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

export async function tick() {
  if (rodando) return;
  rodando = true;
  try {
    // Manutencao (expirar cupom/promocao) no maximo 1x por hora.
    if (Date.now() - ultimaManutencao > 3600000) {
      ultimaManutencao = Date.now();
      expireCoupons();
      expirePromotions();
    }

    await runActiveCampaigns();
    await processQueue({ limite: 10 });
  } catch (err) {
    log.error(`Falha no tick do worker: ${err.message}`, { stack: err.stack?.split('\n')[1]?.trim() });
  } finally {
    rodando = false;
  }
}
