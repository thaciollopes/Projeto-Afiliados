/**
 * Rotas operacionais: canais/grupos, campanhas, publicacoes (fila/historico),
 * WhatsApp e n8n.
 */
import { Router } from 'express';
import { asyncHandler, queryOptions } from '../middleware/index.js';
import { channelRepository, publicationRepository } from '../../core/repositories/index.js';
import {
  listCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign,
  expandCampaign, runCampaign, selectProducts, canRunNow, runActiveCampaigns,
} from '../../core/services/campaignService.js';
import {
  buildPublication, enqueue, processQueue, sendPublication, cancelPublication,
  retryPublication, publicationStats, channelWindowOpen,
} from '../../core/services/publicationService.js';
import { getWhatsAppProvider, resetWhatsAppProvider } from '../../integrations/whatsapp/index.js';
import { n8nClient } from '../../integrations/n8n/client.js';
import { notFound, badRequest } from '../../core/utils/errors.js';
import { nowIso } from '../../core/utils/dates.js';

// ----------------------------------------------------------------- canais --

export const canaisRouter = Router();

canaisRouter.get('/', asyncHandler(async (req, res) => {
  const filtros = {};
  for (const campo of ['status', 'tipo', 'provider']) if (req.query[campo]) filtros[campo] = req.query[campo];
  const resultado = channelRepository.findAll(queryOptions(req, filtros));
  resultado.rows = resultado.rows.map((c) => ({ ...c, janela: channelWindowOpen(c) }));
  res.json(resultado);
}));

canaisRouter.post('/', asyncHandler(async (req, res) => {
  if (!req.body.nome || !req.body.identificador) throw badRequest('nome e identificador sao obrigatorios');
  res.status(201).json(channelRepository.create({ status: 'ativo', tipo: 'grupo', provider: 'waha', ...req.body }));
}));

canaisRouter.put('/:id', asyncHandler(async (req, res) => {
  if (!channelRepository.findById(req.params.id)) throw notFound('Canal');
  res.json(channelRepository.update(req.params.id, req.body));
}));

canaisRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ removido: channelRepository.remove(req.params.id) });
}));

/** Lista os grupos da sessao do WhatsApp para o usuario escolher. */
canaisRouter.get('/disponiveis', asyncHandler(async (_req, res) => {
  const grupos = await getWhatsAppProvider().listGroups();
  const cadastrados = new Set(channelRepository.list({ limit: 500 }).map((c) => c.identificador));
  res.json(grupos.map((g) => ({ ...g, ja_cadastrado: cadastrados.has(g.identificador) })));
}));

/** Envia uma mensagem de teste para o canal. */
canaisRouter.post('/:id/testar', asyncHandler(async (req, res) => {
  const canal = channelRepository.findById(req.params.id);
  if (!canal) throw notFound('Canal');

  const texto = req.body.texto || `Teste do ${process.env.APP_NAME || 'sistema de ofertas'} em ${new Date().toLocaleString('pt-BR')}`;
  const provider = getWhatsAppProvider({ session: canal.sessao || undefined });
  const envio = await provider.sendMessage({ chatId: canal.identificador, texto });
  res.json({ enviado: true, ...envio });
}));

// -------------------------------------------------------------- campanhas --

export const campanhasRouter = Router();

campanhasRouter.get('/', asyncHandler(async (req, res) => {
  const filtros = {};
  for (const campo of ['status', 'modo']) if (req.query[campo]) filtros[campo] = req.query[campo];
  const resultado = listCampaigns(queryOptions(req, filtros));
  resultado.rows = resultado.rows.map((c) => ({ ...expandCampaign(c), pode_rodar: canRunNow(c) }));
  res.json(resultado);
}));

campanhasRouter.get('/:id', asyncHandler(async (req, res) => {
  const campanha = getCampaign(req.params.id);
  res.json({ ...expandCampaign(campanha), pode_rodar: canRunNow(campanha) });
}));

/** Previa: quais produtos esta campanha pegaria agora. */
campanhasRouter.get('/:id/produtos', asyncHandler(async (req, res) => {
  const campanha = getCampaign(req.params.id);
  res.json({ rows: selectProducts(campanha, { limite: Number(req.query.limite) || 50 }) });
}));

campanhasRouter.post('/', asyncHandler(async (req, res) => {
  res.status(201).json(createCampaign(req.body));
}));

campanhasRouter.put('/:id', asyncHandler(async (req, res) => {
  res.json(updateCampaign(req.params.id, req.body));
}));

campanhasRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ removido: deleteCampaign(req.params.id) });
}));

campanhasRouter.post('/:id/ativar', asyncHandler(async (req, res) => {
  res.json(updateCampaign(req.params.id, { status: 'ativa' }));
}));

campanhasRouter.post('/:id/pausar', asyncHandler(async (req, res) => {
  res.json(updateCampaign(req.params.id, { status: 'pausada' }));
}));

/** Roda agora, ignorando intervalo/horario se forcar=true. */
campanhasRouter.post('/:id/executar', asyncHandler(async (req, res) => {
  const campanha = getCampaign(req.params.id);
  res.json(await runCampaign(campanha, { forcar: req.body?.forcar !== false }));
}));

/** Chamado pelo n8n: roda todas as campanhas ativas. */
campanhasRouter.post('/executar-ativas', asyncHandler(async (_req, res) => {
  res.json({ resultados: await runActiveCampaigns(), em: nowIso() });
}));

// ------------------------------------------------------------ publicacoes --

export const publicacoesRouter = Router();

publicacoesRouter.get('/', asyncHandler(async (req, res) => {
  const filtros = {};
  for (const campo of ['status', 'channel_id', 'campaign_id', 'product_id', 'origem']) {
    if (req.query[campo]) filtros[campo] = req.query[campo];
  }
  const resultado = publicationRepository.findAll(queryOptions(req, filtros));
  resultado.rows = resultado.rows.map(expandirPublicacao);
  res.json(resultado);
}));

publicacoesRouter.get('/estatisticas', asyncHandler(async (_req, res) => {
  res.json(publicationStats());
}));

publicacoesRouter.get('/fila', asyncHandler(async (req, res) => {
  const resultado = publicationRepository.findAll({
    filters: { status: ['aguardando', 'processando', 'enviando', 'erro'] },
    sort: 'agendado_para ASC',
    limit: Number(req.query.limite) || 100,
  });
  resultado.rows = resultado.rows.map(expandirPublicacao);
  res.json(resultado);
}));

/** PREVIEW: monta o post sem gravar nada (usado no "Testar publicacao"). */
publicacoesRouter.post('/preview', asyncHandler(async (req, res) => {
  res.json(await buildPublication(req.body || {}));
}));

publicacoesRouter.post('/enfileirar', asyncHandler(async (req, res) => {
  const { produtos = [], channel_ids = [], ...resto } = req.body || {};
  const alvos = channel_ids.length ? channel_ids : [req.body.channel_id].filter(Boolean);
  if (!alvos.length) throw badRequest('Informe ao menos um canal');

  const ids = produtos.length ? produtos : [req.body.product_id].filter(Boolean);
  if (!ids.length) throw badRequest('Informe ao menos um produto');

  const criadas = [];
  const erros = [];
  for (const produtoId of ids) {
    for (const canalId of alvos) {
      try {
        criadas.push(await enqueue({ ...resto, product_id: produtoId, channel_id: canalId }));
      } catch (err) {
        erros.push({ produto: produtoId, canal: canalId, erro: err.message });
      }
    }
  }
  res.status(criadas.length ? 201 : 400).json({ criadas: criadas.length, erros, publicacoes: criadas });
}));

/** Processa a fila agora (o worker chama isto sozinho; o n8n tambem pode). */
publicacoesRouter.post('/processar', asyncHandler(async (req, res) => {
  res.json(await processQueue({
    limite: Number(req.body?.limite) || 10,
    forcar: Boolean(req.body?.forcar),
  }));
}));

publicacoesRouter.post('/:id/enviar', asyncHandler(async (req, res) => {
  const pub = publicationRepository.findById(req.params.id);
  if (!pub) throw notFound('Publicacao');
  res.json(await sendPublication(pub));
}));

publicacoesRouter.post('/:id/retry', asyncHandler(async (req, res) => {
  res.json(retryPublication(req.params.id));
}));

publicacoesRouter.post('/:id/cancelar', asyncHandler(async (req, res) => {
  res.json(cancelPublication(req.params.id));
}));

publicacoesRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json({ removido: publicationRepository.remove(req.params.id) });
}));

function expandirPublicacao(pub) {
  const canal = pub.channel_id ? channelRepository.findById(pub.channel_id) : null;
  return { ...pub, canal_nome: canal?.nome || '(canal removido)' };
}

// --------------------------------------------------------------- whatsapp --

export const whatsappRouter = Router();

whatsappRouter.get('/status', asyncHandler(async (_req, res) => {
  res.json(await getWhatsAppProvider().status());
}));

whatsappRouter.get('/qr', asyncHandler(async (_req, res) => {
  res.json(await getWhatsAppProvider().qrCode());
}));

whatsappRouter.post('/sessao/iniciar', asyncHandler(async (_req, res) => {
  resetWhatsAppProvider();
  res.json(await getWhatsAppProvider().startSession());
}));

whatsappRouter.get('/grupos', asyncHandler(async (_req, res) => {
  res.json(await getWhatsAppProvider().listGroups());
}));

// -------------------------------------------------------------------- n8n --

export const n8nRouter = Router();

n8nRouter.get('/status', asyncHandler(async (_req, res) => {
  res.json(await n8nClient.status());
}));

n8nRouter.get('/workflows', asyncHandler(async (_req, res) => {
  res.json(await n8nClient.listWorkflows());
}));

n8nRouter.post('/disparar/:caminho', asyncHandler(async (req, res) => {
  res.json(await n8nClient.trigger(req.params.caminho, req.body || {}));
}));
