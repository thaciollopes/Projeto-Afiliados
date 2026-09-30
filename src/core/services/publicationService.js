/**
 * Publicacoes: montagem do post, validacao, fila, envio e retry.
 *
 * Fluxo (o mesmo do desenho do projeto):
 *   produto -> preco -> promocao -> cupom -> validade -> disponibilidade
 *   -> texto (template/IA) -> validacao -> fila -> horario -> WAHA -> historico
 */
import {
  publicationRepository, productRepository, channelRepository, templateRepository,
  promotionRepository, couponRepository, campaignRepository, alertRepository,
} from '../repositories/index.js';
import { calculatePricing } from './pricingService.js';
import { renderPublication } from './templateService.js';
import { activePromotionFor } from './promotionService.js';
import { bestCouponFor, registerUse } from './couponService.js';
import { exigeLinkDoPainel, ehLinkDeAfiliadoCurto, lojaBase } from './affiliateLinkService.js';
import { podeConverter, converterProdutosDaLoja } from './linkPorCookieService.js';
import { verificarProduto } from './verificacaoLinkService.js';
import { seloMenorPreco } from './historicoPrecoService.js';
import { linkParaCanal, subIdDoCanal } from './linkPorCanalService.js';
import { mensageiroDo, precisaPausaAntiBloqueio } from '../../integrations/mensageiros.js';
import { generate } from '../../integrations/ai/index.js';
import { config } from '../../config/index.js';
import {
  nowIso, addMinutes, dentroDoHorario, inicioDoDiaIso,
} from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { notFound, badRequest } from '../utils/errors.js';
import { linkDaVitrine } from './vitrineService.js';

const log = logger.child('publicacao');

/** Espera entre tentativas: 30s, 2min, 5min. Depois vira erro definitivo. */
const RETRY_MINUTOS = [0.5, 2, 5];
export const MAX_TENTATIVAS = RETRY_MINUTOS.length;

// ---------------------------------------------------------------- montagem --

/**
 * Monta o post completo (sem gravar nada). E o que a tela de preview usa.
 * @returns {Promise<{mensagem, precos, produto, template, promocao, cupom, bloqueios, avisos, ia}>}
 */
export async function buildPublication({
  product_id, promotion_id, coupon_id, template_id, usar_ia = false, reference = new Date(),
  channel_id = null,
} = {}) {
  let produto = productRepository.findById(product_id);
  if (!produto) throw notFound('Produto');

  // Ultima chance antes de publicar sem comissao: produto do ML/Shopee sem
  // link de afiliado e com sessao salva -> converte agora. Falhou, segue com
  // o aviso no preview.
  if (podeConverter(produto)) {
    try {
      await converterProdutosDaLoja(produto.marketplace, { ids: [produto.id] });
      produto = productRepository.findById(product_id);
    } catch (err) {
      log.warn(`Nao consegui gerar o link de afiliado agora: ${err.message}`, { product_id });
    }
  }

  // Link curto nao prova de quem e a comissao: abre e le o ID no destino.
  // So vai a rede uma vez por link (o resultado fica guardado).
  let conferencia = null;
  try {
    conferencia = await verificarProduto(produto);
  } catch (err) {
    log.warn(`Nao consegui conferir o link de afiliado: ${err.message}`, { product_id });
  }

  // Com o grupo conhecido, a Shopee ganha um link com o sub ID do grupo (so
  // neste post; o produto continua com o link normal).
  let linkCanal = null;
  if (channel_id) {
    const canal = channelRepository.findById(channel_id);
    const link = await linkParaCanal(produto, canal);
    if (link) {
      linkCanal = { link, sub_id: subIdDoCanal(canal) };
      produto = { ...produto, url_afiliado: link, url_final: link };
    }
  }

  const promocao = promotion_id
    ? promotionRepository.findById(promotion_id)
    : activePromotionFor(produto.id, reference);

  const cupom = coupon_id
    ? couponRepository.findById(coupon_id)
    : (promocao?.coupon_id ? couponRepository.findById(promocao.coupon_id) : bestCouponFor(produto, reference));

  const precos = calculatePricing({ product: produto, promotion: promocao, coupon: cupom, reference });

  const template = template_id
    ? templateRepository.findById(template_id)
    : (templateRepository.findOne({ padrao: 1 }) || templateRepository.findOne({ ativo: 1 }));

  let produtoParaTexto = produto;
  let ia = null;

  if (usar_ia) {
    try {
      const resultado = await generate({ tarefa: 'titulo', product: produto, pricing: precos });
      if (resultado.texto) {
        produtoParaTexto = { ...produto, titulo_publicacao: resultado.texto };
        ia = { usada: true, provider: resultado.provider, violacoes: resultado.violacoes };
      }
    } catch (err) {
      ia = { usada: false, erro: err.message };
      log.warn(`IA falhou, seguindo com o texto original: ${err.message}`, { product_id });
    }
  }

  // Com a vitrine ligada (Amazon/ML ou todas), o post leva para a pagina do
  // produto no seu site; o link de afiliado fica no botao de la. A validacao
  // abaixo continua conferindo o link de afiliado de verdade.
  const linkVitrine = linkDaVitrine(produto);
  if (linkVitrine) produtoParaTexto = { ...produtoParaTexto, url_final: linkVitrine };

  const menorPreco = seloMenorPreco(produto, { reference });
  const { mensagem } = renderPublication({
    template,
    product: produtoParaTexto,
    pricing: precos,
    promotion: promocao,
    coupon: precos.cupom,
    extras: { menor_preco: menorPreco?.selo },
  });

  const { bloqueios, avisos } = validatePublication({
    produto, precos, promocao, cupom, mensagem, conferencia,
  });
  if (!linkVitrine && lojaBase(produto.marketplace) === 'amazon') {
    avisos.push('Amazon: o link de associado vai direto no post. A Amazon pede que ele passe por um site seu — ligue a VITRINE.');
  }

  return {
    mensagem,
    precos,
    produto,
    template,
    promocao,
    cupom: precos.cupom,
    cupom_ignorado: cupom && !precos.cupom ? { codigo: cupom.codigo, motivo: precos.motivos[0] || 'invalido' } : null,
    bloqueios,
    avisos,
    ia,
    conferencia_link: conferencia,
    link_canal: linkCanal,
    link_vitrine: linkVitrine,
    pode_publicar: bloqueios.length === 0,
  };
}

/** O que impede a publicacao (bloqueio) e o que so merece aviso. */
export function validatePublication({
  produto, precos, promocao, cupom, mensagem, conferencia = null,
}) {
  const bloqueios = [];
  const avisos = [];

  if (!precos.valido) bloqueios.push('Produto sem preco valido');
  if (produto.disponibilidade && produto.disponibilidade !== 'disponivel') bloqueios.push('Produto indisponivel');
  if (produto.status === 'pausado') bloqueios.push('Produto pausado');
  if (produto.status === 'expirado') bloqueios.push('Produto expirado');

  const link = produto.url_final || produto.url_afiliado || produto.url_original;
  if (!link) bloqueios.push('Produto sem link');

  if (!mensagem || mensagem.trim().length < 10) bloqueios.push('Mensagem vazia ou muito curta');
  if (/\{[a-z_]+\}/i.test(mensagem || '')) bloqueios.push('Mensagem com variavel nao resolvida');

  if (promocao && precos.motivos.includes('promocao_expirada')) bloqueios.push('Promocao expirada');
  if (cupom && !precos.cupom) avisos.push(`Cupom ${cupom.codigo} nao entrou: ${precos.motivos[0] || 'invalido'}`);
  if (!produto.imagem_principal) avisos.push('Produto sem imagem: sera enviado so o texto');

  // O pior erro silencioso do ramo: publicar bonito e nao ganhar comissao.
  const exige = exigeLinkDoPainel(produto.marketplace);
  const linkTemRastreio = ehLinkDeAfiliadoCurto(produto.url_final);

  if (exige && !linkTemRastreio) {
    avisos.push(`SEM COMISSAO: ${exige} Cole o link gerado no painel no campo "Link de afiliado" do produto.`);
  } else if (!produto.url_afiliado) {
    avisos.push('Sem link de afiliado: usando o link original (a venda nao sera atribuida a voce)');
  }

  // Comissao para outra conta e pior que sem comissao: bloqueia.
  if (conferencia?.confere === false) {
    bloqueios.push(`Link de afiliado de OUTRA conta: ${conferencia.motivo}`);
  } else if (conferencia?.confere === null && linkTemRastreio) {
    avisos.push(`ID de afiliado nao conferido: ${conferencia.motivo}`);
  }

  return { bloqueios, avisos };
}

// -------------------------------------------------------------------- fila --

/** Ja publicamos este produto neste canal dentro da janela de repeticao? */
export function isDuplicate(productId, channelId, dias = 7) {
  if (!dias || dias <= 0) return false;
  const limite = new Date(Date.now() - dias * 86400000).toISOString();
  const enviada = publicationRepository.findOne({
    product_id: productId,
    channel_id: channelId,
    status: 'enviado',
    enviado_em: { gte: limite },
  });
  if (enviada) return true;
  // Ainda na fila também conta: com a fila atrasada (grupo fechado, pausa
  // anti-bloqueio), a campanha rodava de novo e enfileirava o mesmo produto
  // para o mesmo grupo antes do primeiro post sair.
  const naFila = publicationRepository.findOne({
    product_id: productId,
    channel_id: channelId,
    status: ['aguardando', 'enviando'],
  });
  return Boolean(naFila);
}

/** Coloca na fila. Nao envia nada aqui: quem envia e o worker/processarFila. */
export async function enqueue({
  product_id, channel_id, campaign_id = null, promotion_id = null, coupon_id = null,
  template_id = null, usar_ia = false, agendado_para = null, origem = 'app', dry_run = null,
  ignorar_duplicado = false, nao_repetir_dias = 7,
} = {}) {
  const canal = channelRepository.findById(channel_id);
  if (!canal) throw notFound('Canal');

  if (!ignorar_duplicado && isDuplicate(product_id, channel_id, nao_repetir_dias)) {
    throw badRequest(`Produto ja publicado neste canal nos ultimos ${nao_repetir_dias} dias`);
  }

  const post = await buildPublication({
    product_id, promotion_id, coupon_id, template_id, usar_ia, channel_id,
  });
  if (post.bloqueios.length) {
    throw badRequest(`Publicacao bloqueada: ${post.bloqueios.join('; ')}`, { bloqueios: post.bloqueios });
  }

  return publicationRepository.create({
    campaign_id,
    product_id,
    promotion_id: post.promocao?.id || null,
    coupon_id: post.cupom?.id || null,
    channel_id,
    template_id: post.template?.id || null,
    mensagem: post.mensagem,
    imagem: post.produto.imagem_principal || null,
    preco_publicado: post.precos.preco_base,
    preco_final_publicado: post.precos.preco_final,
    desconto_publicado: post.precos.desconto_percentual,
    cupom_publicado: post.cupom?.codigo || null,
    status: 'aguardando',
    agendado_para: agendado_para || nowIso(),
    tentativas: 0,
    dry_run: dry_run === null ? config.runtime.dryRun : Boolean(dry_run),
    origem,
  });
}

/** O canal aceita envio agora? (janela de horario + limite diario) */
export function channelWindowOpen(canal, reference = new Date()) {
  if (canal.status !== 'ativo') return { aberto: false, motivo: 'canal_pausado' };

  if (!dentroDoHorario(canal.hora_inicio, canal.hora_fim, reference, config.app.timezone)) {
    return { aberto: false, motivo: 'fora_do_horario' };
  }

  if (canal.limite_diario) {
    const enviadasHoje = publicationRepository.count({
      channel_id: canal.id,
      status: 'enviado',
      enviado_em: { gte: inicioDoDiaIso(reference, config.app.timezone) },
    });
    if (enviadasHoje >= Number(canal.limite_diario)) return { aberto: false, motivo: 'limite_diario' };
  }

  return { aberto: true, motivo: null };
}

/**
 * Processa a fila: pega o que esta pronto, respeita horario e envia.
 * Chamado pelo worker interno e tambem pelo n8n (POST /api/publicacoes/processar).
 */
export async function processQueue({ limite = 10, reference = new Date(), forcar = false } = {}) {
  const agora = reference.toISOString();
  liberarEnviosTravados();

  const candidatas = publicationRepository.list({
    filters: { status: ['aguardando', 'erro'] },
    sort: 'agendado_para ASC',
    limit: 200,
  });

  const resultado = { processadas: 0, enviadas: 0, erros: 0, adiadas: 0, detalhes: [] };

  for (const pub of candidatas) {
    if (resultado.processadas >= limite) break;

    if (pub.status === 'erro') {
      if (pub.tentativas >= MAX_TENTATIVAS) continue;
      if (pub.proxima_tentativa && pub.proxima_tentativa > agora) continue;
    }
    if (pub.agendado_para && pub.agendado_para > agora && !forcar) continue;

    const canal = channelRepository.findById(pub.channel_id);
    if (!canal) {
      marcarErro(pub, 'Canal removido', true);
      resultado.erros += 1;
      continue;
    }

    if (!forcar) {
      const janela = channelWindowOpen(canal, reference);
      if (!janela.aberto) {
        resultado.adiadas += 1;
        resultado.detalhes.push({ id: pub.id, status: 'adiada', motivo: janela.motivo });
        continue;
      }
    }

    // Anti-bloqueio: um envio de verdade por vez, com pausa sorteada entre
    // eles. O que nao cabe agora fica na fila para o proximo ciclo.
    const comPausa = !pub.dry_run && !config.runtime.dryRun && precisaPausaAntiBloqueio(canal);
    // Intervalo do grupo vale tambem para o que foi enfileirado a mao: dez
    // produtos jogados no mesmo grupo saindo um por minuto e rajada de robo.
    if (comPausa && !forcar && canal.intervalo_minutos && canal.ultimo_envio) {
      const liberaEm = new Date(canal.ultimo_envio).getTime() + Number(canal.intervalo_minutos) * 60000;
      if (reference.getTime() < liberaEm) {
        resultado.adiadas += 1;
        resultado.detalhes.push({ id: pub.id, status: 'adiada', motivo: 'aguardando_intervalo_grupo' });
        continue;
      }
    }
    if (comPausa && !forcar && (envioRealEmAndamento || Date.now() < proximoEnvioPermitido)) {
      resultado.adiadas += 1;
      resultado.detalhes.push({ id: pub.id, status: 'adiada', motivo: 'pausa_entre_envios' });
      continue;
    }

    // Reserva ANTES do await: worker e n8n chamando processQueue juntos
    // passariam os dois pela checagem acima e postariam ao mesmo tempo.
    if (comPausa) envioRealEmAndamento = true;
    resultado.processadas += 1;
    let envio;
    try {
      envio = await sendPublication(pub, canal);
    } finally {
      if (comPausa) envioRealEmAndamento = false;
    }
    if (envio.ignorada) {
      resultado.processadas -= 1;
      resultado.detalhes.push({ id: pub.id, status: 'ignorada', motivo: envio.erro });
      continue;
    }
    if (comPausa) proximoEnvioPermitido = Date.now() + sortearPausaMs();
    if (envio.ok) resultado.enviadas += 1; else resultado.erros += 1;
    resultado.detalhes.push({ id: pub.id, status: envio.ok ? 'enviada' : 'erro', motivo: envio.erro || null });
  }

  if (resultado.processadas) {
    log.info(`Fila processada: ${resultado.enviadas} enviadas, ${resultado.erros} erros, ${resultado.adiadas} adiadas`);
  }
  return resultado;
}

let proximoEnvioPermitido = 0;
let envioRealEmAndamento = false;

/** Pausa aleatoria entre dois envios reais (ENVIO_PAUSA_MIN/MAX_SEGUNDOS). */
export function sortearPausaMs() {
  const min = Math.max(0, Number(config.envio.pausaMinSegundos) || 0);
  const max = Math.max(min, Number(config.envio.pausaMaxSegundos) || 0);
  return Math.round((min + Math.random() * (max - min)) * 1000);
}

/** Para testes e para quem precisa zerar o espacamento (ex.: reinicio manual). */
export function zerarPausaEntreEnvios() {
  proximoEnvioPermitido = 0;
  envioRealEmAndamento = false;
}

/**
 * Publicacao presa em "enviando" (o app caiu no meio do envio) vira erro
 * DEFINITIVO com alerta: a mensagem pode ter saido, entao reenviar sozinho
 * arriscaria post duplicado no grupo.
 */
function liberarEnviosTravados() {
  const limite = new Date(Date.now() - 10 * 60000).toISOString();
  const travadas = publicationRepository.list({
    filters: { status: 'enviando', atualizado_em: { lt: limite } },
    limit: 100,
  });
  for (const pub of travadas) {
    marcarErro(pub, 'Envio interrompido (o app parou no meio). Confira no grupo se saiu antes de reenviar.', true);
  }
}

/** Envia de fato (ou simula, se dry run). Atualiza status, produto e canal. */
export async function sendPublication(pub, canal = null) {
  const destino = canal || channelRepository.findById(pub.channel_id);
  if (!destino) return { ok: false, erro: 'Canal nao encontrado' };

  // Reserva antes de enviar: worker, n8n e o botao "enviar" podem pegar a
  // mesma publicacao. Ler e marcar sem await no meio e atomico no Node —
  // quem chega depois ve "enviando" e desiste, em vez de postar duplicado.
  const atual = publicationRepository.findById(pub.id);
  if (!atual || !['aguardando', 'erro'].includes(atual.status)) {
    return { ok: false, ignorada: true, erro: `Publicacao ja esta "${atual?.status || 'removida'}"` };
  }
  publicationRepository.update(pub.id, { status: 'enviando' });

  const simular = Boolean(pub.dry_run) || config.runtime.dryRun;

  // O post foi montado quando entrou na fila; pode sair horas depois (grupo
  // fechado à noite, pausa anti-bloqueio). Cupom que venceu à meia-noite ou
  // promoção que acabou não podem ir para o grupo com o preço de ontem.
  let conferido;
  try {
    conferido = await revalidarAntesDeEnviar({ ...pub, ...atual });
  } catch (err) {
    // Falha inesperada ao remontar: tenta de novo depois, sem enviar agora.
    marcarErro(atual, `Nao consegui conferir o post antes de enviar: ${err.message}`, false);
    return { ok: false, erro: err.message };
  }
  if (!conferido.ok) {
    marcarErro(atual, conferido.motivo, true);
    log.warn(`Publicacao nao enviada: ${conferido.motivo}`, { publicacao: pub.id });
    return { ok: false, erro: conferido.motivo };
  }
  pub = conferido.pub;

  try {
    let envio;
    if (simular) {
      envio = { id: `dry_${pub.id}`, provider: 'dry-run', simulado: true };
      log.info(`[DRY RUN] Nao enviado de verdade para ${destino.nome}`, { publicacao: pub.id });
    } else {
      envio = await mensageiroDo(destino).sendMessage({
        chatId: destino.identificador,
        texto: pub.mensagem,
        imagem: pub.imagem || undefined,
      });
    }

    const em = nowIso();
    publicationRepository.update(pub.id, {
      status: 'enviado',
      enviado_em: em,
      provider_message_id: envio.id || null,
      erro: null,
      tentativas: Number(atual.tentativas || 0) + 1,
    });

    channelRepository.update(destino.id, { ultimo_envio: em });

    if (pub.product_id) {
      productRepository.update(pub.product_id, {
        data_ultima_publicacao: em,
        data_publicacao: em,
      });
    }
    if (pub.coupon_id && !simular) {
      try { registerUse(pub.coupon_id); } catch { /* cupom pode ter sido removido */ }
    }
    if (pub.campaign_id) {
      const campanha = campaignRepository.findById(pub.campaign_id);
      if (campanha) {
        campaignRepository.update(campanha.id, {
          total_publicado: Number(campanha.total_publicado || 0) + 1,
          ultima_execucao: em,
        });
      }
    }

    return { ok: true, simulado: simular, id: envio.id };
  } catch (err) {
    // `atual` e o registro lido agora; `pub` pode vir de uma lista antiga
    // e contar tentativas a menos.
    const definitivo = Number(atual.tentativas || 0) + 1 >= MAX_TENTATIVAS;
    marcarErro(atual, err.message, definitivo);
    log.error(`Falha ao publicar: ${err.message}`, { publicacao: pub.id, canal: destino.nome, definitivo });
    return { ok: false, erro: err.message };
  }
}

/** Post parado na fila mais que isto é remontado com os dados de agora. */
const IDADE_PARA_REVALIDAR_MS = 10 * 60000;

/**
 * @returns {Promise<{ok:true, pub:object}|{ok:false, motivo:string}>}
 */
async function revalidarAntesDeEnviar(pub) {
  if (!pub.product_id) return { ok: true, pub };
  const idade = Date.now() - Date.parse(pub.criado_em || '');
  if (!(idade > IDADE_PARA_REVALIDAR_MS)) return { ok: true, pub };
  if (!productRepository.findById(pub.product_id)) return { ok: false, motivo: 'Produto removido depois de entrar na fila' };

  const post = await buildPublication({
    product_id: pub.product_id,
    coupon_id: pub.coupon_id || undefined,
    template_id: pub.template_id || undefined,
    channel_id: pub.channel_id,
  });
  if (post.bloqueios.length) return { ok: false, motivo: `Nao saiu (mudou desde que entrou na fila): ${post.bloqueios.join('; ')}` };

  const mudou = post.precos.preco_final !== pub.preco_final_publicado
    || (post.cupom?.codigo || null) !== (pub.cupom_publicado || null);
  if (!mudou) return { ok: true, pub };

  // O texto e remontado sem IA: o que importa aqui e o numero estar certo.
  const campos = {
    mensagem: post.mensagem,
    imagem: post.produto.imagem_principal || null,
    promotion_id: post.promocao?.id || null,
    coupon_id: post.cupom?.id || null,
    preco_publicado: post.precos.preco_base,
    preco_final_publicado: post.precos.preco_final,
    desconto_publicado: post.precos.desconto_percentual,
    cupom_publicado: post.cupom?.codigo || null,
  };
  publicationRepository.update(pub.id, campos);
  log.info('Preco/cupom mudou enquanto o post esperava na fila: mensagem atualizada', { publicacao: pub.id });
  return { ok: true, pub: { ...pub, ...campos } };
}

function marcarErro(pub, mensagem, definitivo) {
  const tentativas = Number(pub.tentativas || 0) + 1;
  const espera = RETRY_MINUTOS[Math.min(tentativas - 1, RETRY_MINUTOS.length - 1)];

  publicationRepository.update(pub.id, {
    status: 'erro',
    erro: String(mensagem).slice(0, 500),
    // Definitivo tem que parar de vez: a fila so desiste com tentativas no teto.
    tentativas: definitivo ? Math.max(tentativas, MAX_TENTATIVAS) : tentativas,
    proxima_tentativa: definitivo ? null : addMinutes(new Date(), espera).toISOString(),
  });

  if (definitivo) {
    alertRepository.create({
      tipo: 'erro_publicacao',
      titulo: 'Publicacao falhou apos todas as tentativas',
      detalhe: String(mensagem).slice(0, 300),
      referencia_id: pub.id,
      severidade: 'erro',
    });
  }
}

// ------------------------------------------------------------- manutencao --

export function cancelPublication(id) {
  const pub = publicationRepository.findById(id);
  if (!pub) throw notFound('Publicacao');
  if (pub.status === 'enviado') throw badRequest('Publicacao ja enviada');
  return publicationRepository.update(id, { status: 'cancelado' });
}

export function retryPublication(id) {
  const pub = publicationRepository.findById(id);
  if (!pub) throw notFound('Publicacao');
  // Só o que falhou ou foi cancelado volta para a fila: "tentar de novo" num
  // post já enviado (ou saindo agora) postaria duplicado no grupo.
  if (!['erro', 'cancelado'].includes(pub.status)) {
    throw badRequest(`Publicacao "${pub.status}" nao pode voltar para a fila`);
  }
  return publicationRepository.update(id, {
    status: 'aguardando',
    tentativas: 0,
    proxima_tentativa: null,
    erro: null,
    agendado_para: nowIso(),
  });
}

export function publicationStats(reference = new Date()) {
  const inicioDoDia = inicioDoDiaIso(reference, config.app.timezone);

  const proxima = publicationRepository.findAll({
    filters: { status: 'aguardando' },
    sort: 'agendado_para ASC',
    limit: 1,
  }).rows[0] || null;

  return {
    total: publicationRepository.count(),
    na_fila: publicationRepository.count({ status: 'aguardando' }),
    enviadas: publicationRepository.count({ status: 'enviado' }),
    enviadas_hoje: publicationRepository.count({ status: 'enviado', enviado_em: { gte: inicioDoDia } }),
    erros: publicationRepository.count({ status: 'erro' }),
    erros_hoje: publicationRepository.count({ status: 'erro', atualizado_em: { gte: inicioDoDia } }),
    canceladas: publicationRepository.count({ status: 'cancelado' }),
    proxima_publicacao: proxima ? { id: proxima.id, agendado_para: proxima.agendado_para } : null,
  };
}
