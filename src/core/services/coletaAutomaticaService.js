/**
 * Coleta automatica: buscas nas lojas que o sistema repete sozinho e importa.
 *
 * Fecha o ciclo sem ninguem no painel: coleta -> base de produtos -> campanha
 * (que ja relê a base a cada rodada) -> fila -> grupo. Importar de novo um
 * produto que ja existe so atualiza preco/foto (e evita que ele expire).
 *
 * Fica guardado em settings (`coleta_automatica`): poucas buscas, sem tela de CRUD.
 */
import { settingRepository, alertRepository } from '../repositories/index.js';
import { searchMarketplaces, importProducts } from './productService.js';
import { converterImportados } from './linkPorCookieService.js';
import { badRequest } from '../utils/errors.js';
import { nowIso } from '../utils/dates.js';
import { newId } from '../utils/id.js';
import { logger } from '../utils/logger.js';

const log = logger.child('coleta-auto');
const CHAVE = 'coleta_automatica';

/** Menos que isso a loja passa a bloquear (o ML pede captcha em busca seguida). */
export const MIN_HORAS = 2;
const MAX_BUSCAS = 10;

const PADRAO = { ativa: false, intervalo_horas: 6, buscas: [], ultima_execucao: null, ultimo_resultado: null };

export function configColeta() {
  return { ...PADRAO, ...(settingRepository.get(CHAVE) || {}) };
}

function gravar(cfg) {
  settingRepository.set(CHAVE, cfg);
  return cfg;
}

/** So o que a busca nas lojas entende; o resto e descartado. */
function limparBusca(b = {}) {
  const loja = String(b.loja || '').trim();
  if (!loja) throw badRequest('Escolha a loja da busca automática.');
  const numero = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));
  return {
    id: b.id || newId('col'),
    loja,
    termo: String(b.termo || '').trim(),
    categoria_loja: b.categoria_loja || undefined,
    desconto_min: numero(b.desconto_min),
    preco_max: numero(b.preco_max),
    ordenacao: b.ordenacao || 'vendas',
    limite: Math.min(Math.max(Number(b.limite) || 20, 1), 50),
  };
}

export function salvarColeta({ ativa, intervalo_horas: horas, buscas } = {}) {
  const cfg = configColeta();
  if (ativa !== undefined) cfg.ativa = Boolean(ativa);
  if (horas !== undefined) cfg.intervalo_horas = Math.max(Number(horas) || PADRAO.intervalo_horas, MIN_HORAS);
  if (Array.isArray(buscas)) {
    if (buscas.length > MAX_BUSCAS) throw badRequest(`No máximo ${MAX_BUSCAS} buscas automáticas.`);
    cfg.buscas = buscas.map(limparBusca);
  }
  return gravar(cfg);
}

export function adicionarBusca(busca) {
  const cfg = configColeta();
  if (cfg.buscas.length >= MAX_BUSCAS) throw badRequest(`No máximo ${MAX_BUSCAS} buscas automáticas.`);
  cfg.buscas.push(limparBusca(busca));
  // Primeira busca salva liga a coleta: foi para isso que o botao foi apertado.
  if (cfg.buscas.length === 1) cfg.ativa = true;
  return gravar(cfg);
}

export function removerBusca(id) {
  const cfg = configColeta();
  cfg.buscas = cfg.buscas.filter((b) => b.id !== id);
  return gravar(cfg);
}

/** Ja passou o intervalo desde a ultima coleta? */
export function coletaPendente(cfg = configColeta(), agora = Date.now()) {
  if (!cfg.ativa || !cfg.buscas.length) return false;
  if (!cfg.ultima_execucao) return true;
  return agora - Date.parse(cfg.ultima_execucao) >= Number(cfg.intervalo_horas) * 3600000;
}

let coletando = false;

/**
 * Roda todas as buscas, uma depois da outra, e importa o que vier.
 * Uma busca que falha nao derruba as outras; falha vira alerta no painel.
 */
export async function executarColeta({ forcar = false } = {}) {
  const cfg = configColeta();
  if (coletando) return { pulado: 'ja_coletando' };
  if (!forcar && !coletaPendente(cfg)) return { pulado: 'fora_do_intervalo' };
  if (!cfg.buscas.length) return { pulado: 'sem_buscas' };

  coletando = true;
  // Marca antes: se o app cair no meio, nao fica tentando de novo a cada tick.
  gravar({ ...cfg, ultima_execucao: nowIso() });
  const resultado = { em: nowIso(), criados: 0, atualizados: 0, buscas: [] };
  try {
    for (const b of cfg.buscas) {
      try {
        const { produtos, erros } = await searchMarketplaces({
          termo: b.termo,
          marketplaces: [b.loja],
          categoria_loja: b.categoria_loja,
          descontoMin: b.desconto_min,
          precoMax: b.preco_max,
          ordenacao: b.ordenacao,
          limite: b.limite,
        });
        const imp = importProducts(produtos, 'coleta_automatica');
        // Igual a importacao manual: ML/Shopee ja entram com o link de afiliado.
        // Falhou, o produto fica com o aviso de comissao e a fila tenta de novo.
        await converterImportados(produtos, imp.ids).catch((e) => log.warn(`Conversao de links falhou: ${e.message}`));
        resultado.criados += imp.criados;
        resultado.atualizados += imp.atualizados;
        resultado.buscas.push({
          id: b.id, termo: b.termo, loja: b.loja, encontrados: produtos.length,
          criados: imp.criados, erro: erros[0]?.erro || null,
        });
      } catch (err) {
        resultado.buscas.push({ id: b.id, termo: b.termo, loja: b.loja, encontrados: 0, criados: 0, erro: err.message });
      }
    }
  } finally {
    coletando = false;
  }

  const falhas = resultado.buscas.filter((b) => b.erro);
  if (falhas.length) {
    alertRepository.create({
      tipo: 'coleta_automatica',
      titulo: `Coleta automática: ${falhas.length} busca(s) falharam`,
      detalhe: falhas.map((f) => `${f.loja} "${f.termo || 'ofertas'}": ${f.erro}`).join(' | ').slice(0, 300),
      severidade: 'atencao',
    });
  }
  gravar({ ...configColeta(), ultimo_resultado: resultado });
  log.info(`Coleta automatica: ${resultado.criados} novos, ${resultado.atualizados} atualizados`, { falhas: falhas.length });
  return resultado;
}
