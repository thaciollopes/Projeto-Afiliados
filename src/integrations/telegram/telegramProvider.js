/**
 * Telegram pela Bot API oficial (https://core.telegram.org/bots/api).
 *
 * Diferente do WhatsApp, aqui não há risco de banimento por automação: bot é
 * o jeito oficial de postar em canal/grupo do Telegram. Basta criar o bot no
 * @BotFather, pôr o token no .env e adicionar o bot como ADMIN do canal.
 *
 * Mesma interface do WhatsAppProvider (status, sendMessage), para a fila não
 * precisar saber para onde está mandando.
 */
import { logger } from '../../core/utils/logger.js';

const log = logger.child('telegram');

/** Limites da Bot API: legenda de foto 1024, mensagem 4096. */
const LIMITE_LEGENDA = 1024;
const LIMITE_TEXTO = 4096;

export class TelegramProvider {
  constructor({ token, fetchImpl = fetch } = {}) {
    this.name = 'telegram';
    this.token = token || '';
    this.fetch = fetchImpl;
  }

  async chamar(metodo, corpo) {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN vazio no .env');
    const res = await this.fetch(`https://api.telegram.org/bot${this.token}/${metodo}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(30000),
    });
    const dados = await res.json().catch(() => ({}));
    if (!dados.ok) throw new Error(`Telegram ${metodo}: ${dados.description || `HTTP ${res.status}`}`);
    return dados.result;
  }

  async status() {
    if (!this.token) {
      return { online: false, provider: 'telegram', conectado: false, erro: 'TELEGRAM_BOT_TOKEN vazio no .env' };
    }
    try {
      const bot = await this.chamar('getMe', {});
      return { online: true, provider: 'telegram', conectado: true, bot: `@${bot.username}`, erro: null };
    } catch (err) {
      return { online: false, provider: 'telegram', conectado: false, erro: err.message };
    }
  }

  /**
   * @param {{chatId:string, texto:string, imagem?:string}} payload
   *   chatId: "@seucanal" ou o id numérico ("-100...").
   */
  async sendMessage({ chatId, texto, imagem }) {
    if (!chatId) throw new Error('chatId vazio');
    const html = whatsappParaHtml(texto);

    if (imagem && html.length <= LIMITE_LEGENDA) {
      try {
        const r = await this.chamar('sendPhoto', { chat_id: chatId, photo: imagem, caption: html, parse_mode: 'HTML' });
        return { id: String(r.message_id), provider: 'telegram', comImagem: true };
      } catch (err) {
        // Imagem quebrada não segura a oferta: vai só o texto.
        log.warn(`Falha ao enviar foto, enviando só texto: ${err.message}`, { chatId });
      }
    }

    const r = await this.chamar('sendMessage', {
      chat_id: chatId,
      text: html.slice(0, LIMITE_TEXTO),
      parse_mode: 'HTML',
    });
    return { id: String(r.message_id), provider: 'telegram', comImagem: false };
  }
}

/**
 * O template é escrito para o WhatsApp (*negrito*, _itálico_, ~riscado~).
 * No Telegram isso apareceria com os símbolos; vira HTML.
 */
export function whatsappParaHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/gm, '$1<i>$2</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>');
}
