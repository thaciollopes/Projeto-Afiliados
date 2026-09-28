/**
 * Cadastro de canais (grupos e canais do WhatsApp, canais/grupos do Telegram).
 * Valida na entrada o que depois quebraria em silêncio no envio.
 */
import {
  channelRepository, campaignTargetRepository, publicationRepository, linkCanalRepository,
} from '../repositories/index.js';
import { normalizarSubId } from './shopeeLinkService.js';
import { getWhatsAppProvider } from '../../integrations/whatsapp/index.js';
import {
  mensageiroDo, PROVIDERS_DE_ENVIO, PROVIDER_PADRAO, problemaNoDestino,
} from '../../integrations/mensageiros.js';
import { badRequest, notFound } from '../utils/errors.js';

export function prepararCanal(dados, atual = null) {
  const canal = { ...dados };
  const provider = String(canal.provider ?? atual?.provider ?? PROVIDER_PADRAO).toLowerCase();
  if (!PROVIDERS_DE_ENVIO.includes(provider)) {
    throw badRequest(`Provider "${provider}" não existe (use: ${PROVIDERS_DE_ENVIO.join(', ')}).`);
  }
  canal.provider = provider;

  const identificador = String(canal.identificador ?? atual?.identificador ?? '').trim();
  const problema = problemaNoDestino(provider, identificador);
  if (problema) throw badRequest(problema);
  if (canal.identificador !== undefined) canal.identificador = identificador;

  // Sub ID vai na URL da Shopee: só letras e números.
  if (canal.sub_id !== undefined) canal.sub_id = normalizarSubId(canal.sub_id);
  return canal;
}

export function criarCanal(dados) {
  if (!dados?.nome || !dados?.identificador) throw badRequest('nome e identificador sao obrigatorios');
  return channelRepository.create(prepararCanal({ status: 'ativo', tipo: 'grupo', provider: PROVIDER_PADRAO, ...dados }));
}

export function atualizarCanal(id, dados) {
  const atual = channelRepository.findById(id);
  if (!atual) throw notFound('Canal');
  return channelRepository.update(id, prepararCanal(dados, atual));
}

/** Grupos e canais do WhatsApp em que o número pode postar. */
/**
 * Apaga o grupo e o que so existia por causa dele. Antes ficavam: o grupo
 * como destino das campanhas (a campanha "rodava" sem publicar nada, sem
 * dizer por que), os links do sub ID e os posts na fila.
 */
export function removerCanal(id) {
  if (!channelRepository.findById(id)) throw notFound('Canal');
  const cancelados = publicationRepository.listAll({ filters: { channel_id: id, status: ['aguardando', 'erro'] } });
  for (const pub of cancelados) {
    publicationRepository.update(pub.id, { status: 'cancelado', erro: 'Grupo removido' });
  }
  campaignTargetRepository.removeWhere({ channel_id: id });
  linkCanalRepository.removeWhere({ channel_id: id });
  return { removido: channelRepository.remove(id), posts_cancelados: cancelados.length };
}

export async function canaisDisponiveis() {
  const provider = getWhatsAppProvider();
  const grupos = await provider.listGroups();
  const canais = provider.listChannels ? await provider.listChannels().catch(() => []) : [];
  const cadastrados = new Set(channelRepository.list({ limit: 500 }).map((c) => c.identificador));
  return [...grupos, ...canais].map((g) => ({ ...g, ja_cadastrado: cadastrados.has(g.identificador) }));
}

export async function testarCanal(id, texto) {
  const canal = channelRepository.findById(id);
  if (!canal) throw notFound('Canal');
  const mensagem = texto || `Teste do ${process.env.APP_NAME || 'sistema de ofertas'} em ${new Date().toLocaleString('pt-BR')}`;
  return mensageiroDo(canal).sendMessage({ chatId: canal.identificador, texto: mensagem });
}
