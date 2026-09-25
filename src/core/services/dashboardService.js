/**
 * Numeros e graficos do Dashboard. Tudo agregado no banco, nada calculado no
 * navegador — o painel so desenha o que vem pronto daqui.
 */
import {
  productRepository, publicationRepository, channelRepository, alertRepository,
} from '../repositories/index.js';
import { productStats } from './productService.js';
import { promotionStats } from './promotionService.js';
import { couponStats } from './couponService.js';
import { campaignStats } from './campaignService.js';
import { publicationStats } from './publicationService.js';

export function dashboard() {
  return {
    produtos: productStats(),
    promocoes: promotionStats(),
    cupons: couponStats(),
    campanhas: campaignStats(),
    publicacoes: publicationStats(),
    canais: {
      total: channelRepository.count(),
      ativos: channelRepository.count({ status: 'ativo' }),
      pausados: channelRepository.count({ status: 'pausado' }),
    },
    alertas: {
      nao_lidos: alertRepository.count({ lido: 0 }),
      erros: alertRepository.count({ severidade: 'erro', lido: 0 }),
    },
    graficos: charts(),
  };
}

export function charts({ dias = 14 } = {}) {
  return {
    publicacoes_por_dia: publicacoesPorDia(dias),
    erros_por_dia: errosPorDia(dias),
    produtos_por_marketplace: agrupar(productRepository, 'marketplace'),
    produtos_por_categoria: agrupar(productRepository, 'categoria'),
    produtos_por_status: agrupar(productRepository, 'status'),
  };
}

function publicacoesPorDia(dias) {
  const linhas = publicationRepository.raw(
    `SELECT substr(enviado_em, 1, 10) AS dia, COUNT(*) AS total
       FROM publications
      WHERE status = 'enviado' AND enviado_em IS NOT NULL
      GROUP BY dia ORDER BY dia DESC LIMIT ?`,
    [dias],
  );
  return preencherDias(linhas, dias);
}

function errosPorDia(dias) {
  const linhas = publicationRepository.raw(
    `SELECT substr(atualizado_em, 1, 10) AS dia, COUNT(*) AS total
       FROM publications
      WHERE status = 'erro'
      GROUP BY dia ORDER BY dia DESC LIMIT ?`,
    [dias],
  );
  return preencherDias(linhas, dias);
}

/** Garante um ponto por dia (dias sem registro viram zero, senao o grafico mente). */
function preencherDias(linhas, dias) {
  const mapa = new Map(linhas.map((l) => [l.dia, Number(l.total)]));
  const saida = [];
  for (let i = dias - 1; i >= 0; i -= 1) {
    const dia = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    saida.push({ dia, total: mapa.get(dia) || 0 });
  }
  return saida;
}

function agrupar(repo, coluna) {
  return repo
    .raw(`SELECT COALESCE(${coluna}, 'sem definicao') AS rotulo, COUNT(*) AS total
            FROM ${repo.table} GROUP BY rotulo ORDER BY total DESC LIMIT 12`)
    .map((r) => ({ rotulo: r.rotulo, total: Number(r.total) }));
}
