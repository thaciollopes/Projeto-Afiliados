/**
 * Campanhas: a regra automatica que decide O QUE publicar, ONDE e QUANDO.
 *
 * A campanha nao envia nada: ela escolhe o produto e coloca na fila. Quem envia
 * e o publicationService. Isso deixa o envio auditavel e permite dry run.
 */
import {
  campaignRepository, campaignTargetRepository, channelRepository,
  productRepository, promotionRepository, savedSearchRepository, publicationRepository,
} from '../repositories/index.js';
import { enqueue, isDuplicate, channelWindowOpen } from './publicationService.js';
import { activePromotionFor } from './promotionService.js';
import { bestCouponFor } from './couponService.js';
import { config } from '../../config/index.js';
import {
  nowIso, localWeekday, addMinutes, dentroDoHorario, inicioDoDiaIso,
} from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { notFound, badRequest } from '../utils/errors.js';

const log = logger.child('campanha');

/** Quantos produtos a campanha tenta por grupo quando o primeiro esta bloqueado. */
const TENTATIVAS_POR_CANAL = 5;

export const MODOS = [
  'manual', 'automatica', 'pesquisa', 'categoria', 'palavras',
  'promocoes', 'cupons', 'ofertas_do_dia',
];

export function listCampaigns(options = {}) {
  return campaignRepository.findAll(options);
}

export function getCampaign(id) {
  const campanha = campaignRepository.findById(id);
  if (!campanha) throw notFound('Campanha');
  return campanha;
}

/** Campanha + canais + contagem de produtos disponiveis. */
export function expandCampaign(campanha) {
  const alvos = campaignTargetRepository.list({ filters: { campaign_id: campanha.id }, limit: 100 });
  const canais = alvos.map((alvo) => ({
    ...alvo,
    canal: channelRepository.findById(alvo.channel_id),
  })).filter((a) => a.canal);
  return { ...campanha, alvos: canais, total_canais: canais.length };
}

export function createCampaign(data) {
  if (!data.nome) throw badRequest('nome e obrigatorio');
  if (data.modo && !MODOS.includes(data.modo)) throw badRequest(`modo deve ser um de: ${MODOS.join(', ')}`);

  const { canais = [], ...dados } = data;
  const campanha = campaignRepository.create({
    modo: 'manual',
    status: 'pausada',
    intervalo_minutos: 30,
    hora_inicio: '08:00',
    hora_fim: '22:00',
    loop: true,
    nao_repetir_dias: 7,
    limite_diario: 20,
    filtros: {},
    produto_ids: [],
    dias_semana: [],
    ...dados,
  });

  setCampaignChannels(campanha.id, canais);
  return expandCampaign(campanha);
}

export function updateCampaign(id, patch) {
  getCampaign(id);
  const { canais, ...dados } = patch;
  const campanha = campaignRepository.update(id, dados);
  if (Array.isArray(canais)) setCampaignChannels(id, canais);
  return expandCampaign(campanha);
}

export function deleteCampaign(id) {
  getCampaign(id);
  campaignTargetRepository.removeWhere({ campaign_id: id });
  return campaignRepository.remove(id);
}

/** @param {Array<string|{channel_id:string, intervalo_minutos?:number, limite_diario?:number}>} canais */
export function setCampaignChannels(campaignId, canais = []) {
  const atuais = campaignTargetRepository.list({ filters: { campaign_id: campaignId }, limit: 200 });
  const novos = canais.map((c) => (typeof c === 'string' ? { channel_id: c } : c)).filter((c) => c.channel_id);
  const idsNovos = new Set(novos.map((c) => c.channel_id));

  for (const alvo of atuais) {
    if (!idsNovos.has(alvo.channel_id)) campaignTargetRepository.remove(alvo.id);
  }
  for (const novo of novos) {
    campaignTargetRepository.upsertBy(
      { campaign_id: campaignId, channel_id: novo.channel_id },
      {
        intervalo_minutos: novo.intervalo_minutos ?? null,
        limite_diario: novo.limite_diario ?? null,
        ativo: novo.ativo === undefined ? true : Boolean(novo.ativo),
      },
    );
  }
  return campaignTargetRepository.list({ filters: { campaign_id: campaignId }, limit: 200 });
}

// ------------------------------------------------- selecao de produtos --

/** Traduz os filtros da campanha em consulta de produtos. */
export function selectProducts(campanha, { limite = 50 } = {}) {
  const filtros = campanha.filtros || {};

  if (campanha.modo === 'manual' && campanha.produto_ids?.length) {
    return productRepository.findByIds(campanha.produto_ids).filter((p) => p.status === 'ativo');
  }

  if (campanha.modo === 'pesquisa' && campanha.saved_search_id) {
    const pesquisa = savedSearchRepository.findById(campanha.saved_search_id);
    if (pesquisa) return queryProducts({ ...(pesquisa.filtros || {}), ordenacao: pesquisa.ordenacao }, pesquisa.quantidade || limite);
  }

  if (campanha.modo === 'promocoes') {
    // Status "ativa" não basta: promoção que ainda não começou (ou venceu e o
    // worker ainda não marcou) faria o produto sair sem a promoção no post.
    const promos = promotionRepository.listAll({ filters: { status: 'ativa' } });
    const ids = [...new Set(promos.map((p) => p.product_id).filter(Boolean))];
    return productRepository.findByIds(ids)
      .filter((p) => p.status === 'ativo' && activePromotionFor(p.id))
      .slice(0, limite);
  }

  if (campanha.modo === 'cupons') {
    const candidatos = queryProducts(filtros, 200);
    return candidatos.filter((p) => bestCouponFor(p)).slice(0, limite);
  }

  if (campanha.modo === 'ofertas_do_dia') {
    return queryProducts({ ...filtros, desconto_min: filtros.desconto_min ?? 20, ordenacao: 'desconto' }, limite);
  }

  return queryProducts(filtros, limite);
}

/**
 * "perfume feminino, escova progressiva, -masculino" -> incluir/excluir.
 * Separado por virgula; cada pedaco vale como frase inteira.
 */
export function lerPalavras(texto) {
  const pedacos = String(texto || '').split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  return {
    incluir: pedacos.filter((p) => !p.startsWith('-')),
    excluir: pedacos.filter((p) => p.startsWith('-')).map((p) => p.slice(1).trim()).filter(Boolean),
  };
}

/** Consulta produtos cadastrados a partir de um objeto de filtros da UI. */
export function queryProducts(filtros = {}, limite = 50) {
  const where = { status: 'ativo', disponibilidade: 'disponivel' };
  const raw = [];

  if (filtros.marketplace) where.marketplace = filtros.marketplace;
  if (filtros.categoria) where.categoria = filtros.categoria;
  if (filtros.subcategoria) where.subcategoria = filtros.subcategoria;
  if (filtros.nicho) where.nicho = filtros.nicho;
  if (filtros.preco_min) where.preco_atual = { ...(where.preco_atual || {}), gte: Number(filtros.preco_min) };
  if (filtros.preco_max) where.preco_atual = { ...(where.preco_atual || {}), lte: Number(filtros.preco_max) };
  if (filtros.desconto_min) where.desconto_percentual = { gte: Number(filtros.desconto_min) };
  if (filtros.avaliacao_min) where.avaliacao = { gte: Number(filtros.avaliacao_min) };
  if (filtros.vendas_min) where.quantidade_vendas = { gte: Number(filtros.vendas_min) };
  if (filtros.frete_gratis) where.frete_gratis = 1;
  if (filtros.nunca_publicado) where.data_ultima_publicacao = null;

  const ordenacoes = {
    vendas: 'quantidade_vendas DESC',
    desconto: 'desconto_percentual DESC',
    preco: 'preco_atual ASC',
    preco_desc: 'preco_atual DESC',
    avaliacao: 'avaliacao DESC',
    recentes: 'data_coleta DESC',
    score: 'score DESC',
  };

  const { incluir, excluir } = lerPalavras(filtros.termo || filtros.palavras_chave || '');
  // Qualquer uma das palavras serve (OU); a com "-" na frente tira o produto.
  // COALESCE: NOT (NULL LIKE ...) da NULL e sumiria com o produto sem descricao.
  const campos = ['titulo_original', 'titulo_publicacao', 'descricao_original'];
  const algumCampo = `(${campos.map((c) => `COALESCE(${c}, '') LIKE ?`).join(' OR ')})`;
  if (incluir.length) {
    raw.push({
      sql: incluir.map(() => algumCampo).join(' OR '),
      params: incluir.flatMap((p) => campos.map(() => `%${p}%`)),
    });
  }
  for (const palavra of excluir) {
    raw.push({ sql: `NOT ${algumCampo}`, params: campos.map(() => `%${palavra}%`) });
  }

  const { rows } = productRepository.findAll({
    filters: where,
    sort: ordenacoes[filtros.ordenacao] || ordenacoes.score,
    limit: limite,
    raw,
  });

  if (filtros.com_cupom) return rows.filter((p) => bestCouponFor(p));
  if (filtros.sem_cupom) return rows.filter((p) => !bestCouponFor(p));
  if (filtros.com_promocao) return rows.filter((p) => activePromotionFor(p.id));

  return rows;
}

// ------------------------------------------------------------ execucao --

/** A campanha pode rodar agora? (status, dia da semana, horario, intervalo) */
export function canRunNow(campanha, reference = new Date()) {
  if (campanha.status !== 'ativa') return { pode: false, motivo: 'campanha_nao_ativa' };

  const dias = campanha.dias_semana || [];
  if (dias.length && !dias.map(Number).includes(localWeekday(reference, config.app.timezone))) {
    return { pode: false, motivo: 'fora_do_dia' };
  }

  // Horário e máximo por dia da campanha existiam no formulário mas não eram
  // aplicados: campanha "08:00–12:00" enfileirava às 20h.
  if (!dentroDoHorario(campanha.hora_inicio, campanha.hora_fim, reference, config.app.timezone)) {
    return { pode: false, motivo: 'fora_do_horario' };
  }
  if (campanha.limite_diario && publicadasHoje({ campaign_id: campanha.id }, reference) >= Number(campanha.limite_diario)) {
    return { pode: false, motivo: 'limite_diario' };
  }

  if (campanha.ultima_execucao) {
    const proxima = addMinutes(campanha.ultima_execucao, Number(campanha.intervalo_minutos || 30));
    if (proxima.getTime() > reference.getTime()) {
      return { pode: false, motivo: 'aguardando_intervalo', proxima: proxima.toISOString() };
    }
  }

  return { pode: true, motivo: null };
}

/**
 * Executa uma campanha: escolhe produto por canal e enfileira.
 * Nao envia; o worker envia depois respeitando a janela do canal.
 */
export async function runCampaign(campanha, { reference = new Date(), forcar = false } = {}) {
  const resultado = { campanha: campanha.id, nome: campanha.nome, enfileiradas: 0, ignorados: [], erros: [] };

  if (!forcar) {
    const pode = canRunNow(campanha, reference);
    if (!pode.pode) return { ...resultado, ignorado: pode.motivo };
  }

  const alvos = campaignTargetRepository.list({ filters: { campaign_id: campanha.id, ativo: 1 }, limit: 50 });
  if (!alvos.length) return { ...resultado, ignorado: 'sem_canais' };

  const candidatos = selectProducts(campanha, { limite: 100 });
  if (!candidatos.length) return { ...resultado, ignorado: 'sem_produtos' };

  for (const alvo of alvos) {
    const canal = channelRepository.findById(alvo.channel_id);
    if (!canal) continue;

    if (!forcar) {
      const janela = channelWindowOpen(canal, reference);
      if (!janela.aberto) { resultado.ignorados.push({ canal: canal.nome, motivo: janela.motivo }); continue; }

      const intervalo = Number(alvo.intervalo_minutos || campanha.intervalo_minutos || 30);
      if (alvo.ultimo_envio && addMinutes(alvo.ultimo_envio, intervalo).getTime() > reference.getTime()) {
        resultado.ignorados.push({ canal: canal.nome, motivo: 'aguardando_intervalo' });
        continue;
      }
      if (alvo.limite_diario
          && publicadasHoje({ campaign_id: campanha.id, channel_id: canal.id }, reference) >= Number(alvo.limite_diario)) {
        resultado.ignorados.push({ canal: canal.nome, motivo: 'limite_diario' });
        continue;
      }
    }

    const dias = Number(campanha.nao_repetir_dias ?? 7);
    const livres = candidatos.filter((p) => !isDuplicate(p.id, canal.id, dias));

    if (!livres.length) {
      // Loop desligado + lista esgotada = campanha cumpriu seu papel.
      if (!campanha.loop) {
        campaignRepository.update(campanha.id, { status: 'encerrada' });
        resultado.ignorados.push({ canal: canal.nome, motivo: 'lista_esgotada_campanha_encerrada' });
      } else {
        resultado.ignorados.push({ canal: canal.nome, motivo: 'todos_ja_publicados' });
      }
      continue;
    }

    // Produto bloqueado (sem preco, link de outra conta...) nao pode travar o
    // grupo: antes a campanha escolhia o mesmo primeiro da lista a cada ciclo.
    // Limite de tentativas porque cada uma pode ir a rede conferir o link.
    for (const produto of livres.slice(0, TENTATIVAS_POR_CANAL)) {
      try {
        await enqueue({
          product_id: produto.id,
          channel_id: canal.id,
          campaign_id: campanha.id,
          template_id: campanha.template_id || null,
          usar_ia: Boolean(campanha.usar_ia),
          nao_repetir_dias: dias,
          origem: 'campanha',
        });
        campaignTargetRepository.update(alvo.id, { ultimo_envio: nowIso() });
        resultado.enfileiradas += 1;
        break;
      } catch (err) {
        resultado.erros.push({ canal: canal.nome, produto: produto.id, erro: err.message });
      }
    }
  }

  campaignRepository.update(campanha.id, {
    ultima_execucao: nowIso(),
    proxima_execucao: addMinutes(reference, Number(campanha.intervalo_minutos || 30)).toISOString(),
  });

  if (resultado.enfileiradas) {
    log.info(`Campanha "${campanha.nome}": ${resultado.enfileiradas} publicacao(oes) na fila`);
  }
  return resultado;
}

/** Posts da campanha criados hoje (na fila ou enviados; cancelado não conta). */
function publicadasHoje(filtros, reference) {
  return publicationRepository.count({
    ...filtros,
    status: ['aguardando', 'enviando', 'enviado', 'erro'],
    criado_em: { gte: inicioDoDiaIso(reference, config.app.timezone) },
  });
}

/** Roda todas as campanhas ativas (chamado pelo worker a cada tick). */
export async function runActiveCampaigns(reference = new Date()) {
  const ativas = campaignRepository.list({ filters: { status: 'ativa' }, limit: 100 });
  const resultados = [];
  for (const campanha of ativas) {
    try {
      resultados.push(await runCampaign(campanha, { reference }));
    } catch (err) {
      log.error(`Erro na campanha ${campanha.nome}: ${err.message}`);
      resultados.push({ campanha: campanha.id, erro: err.message });
    }
  }
  return resultados;
}

export function campaignStats() {
  return {
    total: campaignRepository.count(),
    ativas: campaignRepository.count({ status: 'ativa' }),
    pausadas: campaignRepository.count({ status: 'pausada' }),
    encerradas: campaignRepository.count({ status: 'encerrada' }),
  };
}
