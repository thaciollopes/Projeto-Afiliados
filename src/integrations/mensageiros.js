/**
 * Para onde vai cada canal. O cadastro do canal diz o provider ("waha" ou
 * "telegram"); a fila só chama `mensageiroDo(canal).sendMessage(...)`.
 */
import { config } from '../config/index.js';
import { getWhatsAppProvider } from './whatsapp/index.js';
import { TelegramProvider } from './telegram/telegramProvider.js';

let telegram = null;

export function getTelegramProvider() {
  if (!telegram || telegram.token !== config.telegram.token) {
    telegram = new TelegramProvider({ token: config.telegram.token });
  }
  return telegram;
}

/** Por onde um canal pode publicar. O core pergunta aqui, sem citar nomes. */
export const PROVIDERS_DE_ENVIO = ['waha', 'telegram'];
export const PROVIDER_PADRAO = 'waha';

/** Telegram aceita "@nomedocanal" ou o id numérico (canal/grupo: "-100..."). */
const ID_TELEGRAM = /^(@[A-Za-z0-9_]{5,}|-?\d{5,})$/;

/** Motivo de o identificador não servir para esse provider, ou null. */
export function problemaNoDestino(provider, identificador) {
  if (provider === 'telegram' && identificador && !ID_TELEGRAM.test(identificador)) {
    return 'No Telegram o identificador é "@nomedocanal" ou o id numérico (ex.: -1001234567890).';
  }
  return null;
}

export function ehTelegram(canal) {
  return String(canal?.provider || '').toLowerCase() === 'telegram';
}

export function mensageiroDo(canal) {
  return ehTelegram(canal)
    ? getTelegramProvider()
    : getWhatsAppProvider({ session: canal?.sessao || undefined });
}

/**
 * Pausa e "digitando" são defesa contra o WhatsApp marcar o número como robô.
 * Bot do Telegram é oficial: não precisa esperar.
 */
export function precisaPausaAntiBloqueio(canal) {
  return !ehTelegram(canal);
}
