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
import { enqueue, channelWindowOpen } from './publicationService.js';
import { cupomDaLojaValido } from './templateService.js';
import { activePromotionFor } from './promotionService.js';
import { bestCouponFor } from './couponService.js';
import { config } from '../../config/index.js';
import {
  nowIso, localWeekday, addMinutes, dentroDoHorario, inicioDoDiaIso,
} from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { notFound, badRequest } from '../utils/errors.js';

const log = logger.child('campanha');

/** Prefixo do lote pedido no botao "Disparar agora" (ver publicationService). */
export const LOTE_IMEDIATO = 'agora:';

/**
 * Quantos produtos a campanha considera. Era 100: com a coleta automatica
 * trazendo ~75 a cada 6 h, os produtos alem dos 100 primeiros nunca saiam.
 */
const MAX_CANDIDATOS = 1000;

/** Quantos produtos a campanha tenta por grupo quando o primeiro esta bloqueado. */
const TENTATIVAS_POR_CANAL = 5;

/** Teto do lote: rajada maior que isso num grupo e o que o WhatsApp pune. */
export const MAX_POR_RODADA = 10;

export function limitarPorRodada(valor) {
  return Math.min(Math.max(Math.trunc(Number(valor)) || 1, 1), MAX_POR_RODADA);
}

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
    limite_diario: null,
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
export async function runCampaign(campanha, {
  reference = new Date(), forcar = false, quantidade = null, imediato = false,
} = {}) {
  const resultado = { campanha: campanha.id, nome: campanha.nome, enfileiradas: 0, ignorados: [], erros: [] };

  if (!forcar) {
    const pode = canRunNow(campanha, reference);
    if (!pode.pode) return { ...resultado, ignorado: pode.motivo };
  }

  const alvos = campaignTargetRepository.list({ filters: { campaign_id: campanha.id, ativo: 1 }, limit: 50 });
  if (!alvos.length) return { ...resultado, ignorado: 'sem_canais' };

  const candidatos = comCupomPrimeiro(selectProducts(campanha, { limite: MAX_CANDIDATOS }));
  if (!candidatos.length) return { ...resultado, ignorado: 'sem_produtos' };

  const porRodada = limitarPorRodada(quantidade ?? campanha.produtos_por_rodada);
  // "Disparar agora": o lote leva a marca e a fila nao segura pelo intervalo do grupo.
  const lote = `${imediato ? LOTE_IMEDIATO : ''}${campanha.id}:${Date.now()}`;
  let vagasDaCampanha = campanha.limite_diario
    ? Number(campanha.limite_diario) - publicadasHoje({ campaign_id: campanha.id }, reference)
    : Infinity;

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
    const quantidade = alvo.limite_diario
      ? Math.min(porRodada, Number(alvo.limite_diario) - publicadasHoje({ campaign_id: campanha.id, channel_id: canal.id }, reference))
      : porRodada;
    // A campanha anda no ritmo do grupo: com post dela ainda esperando na fila
    // deste grupo, nao enfileira outro (campanha a cada 30 min e grupo a cada
    // 60 enchiam a fila sem parar, e os posts saiam com horas de atraso).
    if (!forcar && publicationRepository.count({
      campaign_id: campanha.id, channel_id: canal.id, status: ['aguardando', 'enviando'],
    })) {
      resultado.ignorados.push({ canal: canal.nome, motivo: 'fila_com_pendentes' });
      continue;
    }

    // Uma consulta por grupo (isDuplicate por produto eram 2 por produto).
    const usados = produtosUsadosNoCanal(canal.id, dias);
    const livres = candidatos.filter((p) => !usados.has(p.id));

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

    // Lote: N produtos de uma vez (produtos_por_rodada), sem passar do maximo
    // por dia da campanha (se houver — vazio = sem limite). Produto bloqueado (sem preco,
    // link de outra conta...) e pulado em vez de travar o grupo; o limite de
    // tentativas existe porque cada uma pode ir a rede conferir o link.
    const vagas = Math.min(quantidade, vagasDaCampanha);
    if (vagas <= 0) {
      resultado.ignorados.push({ canal: canal.nome, motivo: 'limite_diario' });
      continue;
    }
    let noGrupo = 0;
    for (const produto of livres.slice(0, vagas + TENTATIVAS_POR_CANAL - 1)) {
      if (noGrupo >= vagas) break;
      try {
        await enqueue({
          product_id: produto.id,
          channel_id: canal.id,
          campaign_id: campanha.id,
          template_id: campanha.template_id || null,
          usar_ia: Boolean(campanha.usar_ia),
          nao_repetir_dias: dias,
          origem: 'campanha',
          lote,
        });
        noGrupo += 1;
      } catch (err) {
        resultado.erros.push({ canal: canal.nome, produto: produto.id, erro: err.message });
      }
    }
    if (noGrupo) {
      campaignTargetRepository.update(alvo.id, { ultimo_envio: nowIso() });
      resultado.enfileiradas += noGrupo;
      vagasDaCampanha -= noGrupo;
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

/**
 * Produto com cupom (cadastrado ou "com Cupom" do ML) passa na frente: cupom
 * vence, entao vale mais postar enquanto existe. Dentro de cada grupo, mantem a
 * ordem da campanha (sort estavel).
 */
export function comCupomPrimeiro(produtos) {
  const temCupom = (p) => cupomDaLojaValido(p) || Boolean(bestCouponFor(p));
  return produtos.map((p) => ({ p, c: temCupom(p) }))
    .sort((a, b) => Number(b.c) - Number(a.c))
    .map(({ p }) => p);
}

/**
 * Produtos que nao podem sair de novo neste grupo agora: na fila, ou enviados
 * dentro do "nao repetir por". Mesma regra do isDuplicate, numa consulta so.
 */
function produtosUsadosNoCanal(canalId, dias) {
  const desde = new Date(Date.now() - Math.max(Number(dias) || 0, 0) * 86400000).toISOString();
  const linhas = publicationRepository.raw(
    `SELECT DISTINCT product_id FROM publications
     WHERE channel_id = ? AND product_id IS NOT NULL
       AND (status IN ('aguardando', 'enviando') OR (? > 0 AND status = 'enviado' AND enviado_em >= ?))`,
    [canalId, Number(dias) || 0, desde],
  );
  return new Set(linhas.map((l) => l.product_id));
}

/** Posts da campanha criados hoje (na fila ou enviados; cancelado não conta). */
function publicadasHoje(filtros, reference) {
  return publicationRepository.count({
    ...filtros,
    status: ['aguardando', 'enviando', 'enviado', 'erro'],
    criado_em: { gte: inicioDoDiaIso(reference, config.app.timezone) },
  });
}

/**
 * Barra de progresso da tela: o que saiu hoje, o que esta na fila e quanto da
 * lista de produtos ja foi postado (dentro do "nao repetir por").
 */
export function campaignProgress(campanha, reference = new Date()) {
  const inicio = inicioDoDiaIso(reference, config.app.timezone);
  const daCampanha = { campaign_id: campanha.id };
  const hoje = {
    enviadas: publicationRepository.count({ ...daCampanha, status: 'enviado', enviado_em: { gte: inicio } }),
    na_fila: publicationRepository.count({ ...daCampanha, status: ['aguardando', 'enviando'] }),
    erros: publicationRepository.count({ ...daCampanha, status: 'erro', atualizado_em: { gte: inicio } }),
    limite: Number(campanha.limite_diario) || null,
  };

  const alvos = campaignTargetRepository.list({ filters: { campaign_id: campanha.id, ativo: 1 }, limit: 50 });
  const dias = Number(campanha.nao_repetir_dias ?? 7);
  const candidatos = selectProducts(campanha, { limite: MAX_CANDIDATOS });
  const situacoes = situacaoDosProdutos(candidatos, alvos.map((a) => a.channel_id), dias);
  const postados = candidatos.filter((p) => situacoes[p.id]?.postado_em).length;
  const naFila = candidatos.filter((p) => situacoes[p.id]?.na_fila && !situacoes[p.id]?.postado_em).length;

  return {
    hoje,
    produtos: { total: candidatos.length, postados, na_fila: naFila, restantes: candidatos.length - postados - naFila },
    total_publicado: Number(campanha.total_publicado || 0),
    produtos_por_rodada: limitarPorRodada(campanha.produtos_por_rodada),
  };
}

/**
 * Por produto: quando saiu pela ultima vez nesses grupos (dentro da janela de
 * repeticao) e se esta na fila agora. Uma consulta so, para a lista inteira.
 */
export function situacaoDosProdutos(produtos, canais, dias = 7) {
  const ids = produtos.map((p) => p.id);
  const resultado = {};
  if (!ids.length || !canais.length) return resultado;
  const desde = new Date(Date.now() - Math.max(dias, 0) * 86400000).toISOString();
  const marcas = (lista) => lista.map(() => '?').join(', ');
  const linhas = publicationRepository.raw(
    `SELECT product_id, status, MAX(enviado_em) AS enviado_em FROM publications
     WHERE product_id IN (${marcas(ids)}) AND channel_id IN (${marcas(canais)})
       AND (status IN ('aguardando', 'enviando') OR (status = 'enviado' AND enviado_em >= ?))
     GROUP BY product_id, status`,
    [...ids, ...canais, desde],
  );
  for (const l of linhas) {
    const atual = resultado[l.product_id] || { postado_em: null, na_fila: false };
    if (l.status === 'enviado') atual.postado_em = l.enviado_em;
    else atual.na_fila = true;
    resultado[l.product_id] = atual;
  }
  return resultado;
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
