/**
 * Cadastro de canais (grupos e canais do WhatsApp, canais/grupos do Telegram).
 * Valida na entrada o que depois quebraria em silêncio no envio.
 */
import { channelRepository } from '../repositories/index.js';
import { normalizarSubId } from './shopeeLinkService.js';
import { getWhatsAppProvider } from '../../integrations/whatsapp/index.js';
import { mensageiroDo } from '../../integrations/mensageiros.js';
import { badRequest, notFound } from '../utils/errors.js';

const PROVIDERS = ['waha', 'telegram'];

/** Telegram aceita "@nomedocanal" ou o id numérico (canal/grupo: "-100..."). */
const ID_TELEGRAM = /^(@[A-Za-z0-9_]{5,}|-?\d{5,})$/;

export function prepararCanal(dados, atual = null) {
  const canal = { ...dados };
  const provider = String(canal.provider ?? atual?.provider ?? 'waha').toLowerCase();
  if (!PROVIDERS.includes(provider)) throw badRequest(`Provider "${provider}" não existe (use: ${PROVIDERS.join(', ')}).`);
  canal.provider = provider;

  const identificador = String(canal.identificador ?? atual?.identificador ?? '').trim();
  if (provider === 'telegram' && identificador && !ID_TELEGRAM.test(identificador)) {
    throw badRequest('No Telegram o identificador é "@nomedocanal" ou o id numérico (ex.: -1001234567890).');
  }
  if (canal.identificador !== undefined) canal.identificador = identificador;

  // Sub ID vai na URL da Shopee: só letras e números.
  if (canal.sub_id !== undefined) canal.sub_id = normalizarSubId(canal.sub_id);
  return canal;
}

export function criarCanal(dados) {
  if (!dados?.nome || !dados?.identificador) throw badRequest('nome e identificador sao obrigatorios');
  return channelRepository.create(prepararCanal({ status: 'ativo', tipo: 'grupo', provider: 'waha', ...dados }));
}

export function atualizarCanal(id, dados) {
  const atual = channelRepository.findById(id);
  if (!atual) throw notFound('Canal');
  return channelRepository.update(id, prepararCanal(dados, atual));
}

/** Grupos e canais do WhatsApp em que o número pode postar. */
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
