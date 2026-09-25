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
