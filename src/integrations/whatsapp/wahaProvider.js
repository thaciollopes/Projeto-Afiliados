/**
 * WAHA (https://waha.devlike.pro) - WhatsApp via sessao nao oficial.
 * Endpoints usados: /api/sessions, /api/sendText, /api/sendImage, /api/{s}/groups,
 * /api/{s}/channels, /api/startTyping, /api/stopTyping
 */
import crypto from 'node:crypto';
import { logger } from '../../core/utils/logger.js';

const log = logger.child('waha');

export class WahaProvider {
  constructor({ baseUrl, session, apiKey, digitando = true } = {}) {
    this.name = 'waha';
    this.baseUrl = String(baseUrl || 'http://localhost:3003').replace(/\/+$/, '');
    this.session = session || 'default';
    this.apiKey = apiKey || '';
    this.digitando = digitando;
  }

  // Separado para o teste nao ficar esperando segundos de verdade.
  esperar(ms) {
    return new Promise((ok) => setTimeout(ok, ms));
  }

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['X-Api-Key'] = this.apiKey;
    return h;
  }

  async request(path, { method = 'GET', body, timeoutMs = 20000 } = {}) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
      if (!res.ok) {
        const msg = data?.message || data?.error || `HTTP ${res.status}`;
        throw new Error(`WAHA ${method} ${path}: ${msg}`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /** { online, session, status, engine, erro } */
  async status() {
    try {
      const sessions = await this.request('/api/sessions', { timeoutMs: 8000 });
      const list = Array.isArray(sessions) ? sessions : [];
      const mine = list.find((s) => s.name === this.session) || list[0] || null;
      return {
        online: true,
        provider: 'waha',
        baseUrl: this.baseUrl,
        session: mine?.name || this.session,
        status: mine?.status || 'DESCONHECIDO',
        engine: mine?.engine?.engine || mine?.config?.engine || null,
        conectado: String(mine?.status || '').toUpperCase() === 'WORKING',
        erro: null,
      };
    } catch (err) {
      return {
        online: false,
        provider: 'waha',
        baseUrl: this.baseUrl,
        session: this.session,
        status: 'OFFLINE',
        conectado: false,
        erro: err.message,
      };
    }
  }

  /** QR code para parear o numero (data URL ou URL do WAHA). */
  async qrCode() {
    const url = `${this.baseUrl}/api/${encodeURIComponent(this.session)}/auth/qr?format=image`;
    return { url, instrucoes: 'Abra o painel do WAHA e escaneie o QR com o WhatsApp do celular.' };
  }

  async startSession() {
    return this.request('/api/sessions/start', {
      method: 'POST',
      body: { name: this.session },
    });
  }

  /** Grupos disponiveis na sessao (para cadastrar em WHATSAPP > GRUPOS). */
  async listGroups() {
    const data = await this.request(`/api/${encodeURIComponent(this.session)}/groups`, { timeoutMs: 30000 });
    const arr = Array.isArray(data) ? data : (data?.groups || []);
    return arr.map((g) => ({
      identificador: g.id?._serialized || g.id || '',
      nome: g.name || g.subject || g.id?.user || 'sem nome',
      tipo: 'grupo',
      participantes: g.participants?.length ?? null,
    })).filter((g) => g.identificador);
  }

  /** Canais do WhatsApp em que a sessao pode postar (dono ou admin). */
  async listChannels() {
    const data = await this.request(`/api/${encodeURIComponent(this.session)}/channels`, { timeoutMs: 30000 });
    return (Array.isArray(data) ? data : [])
      .filter((c) => ['OWNER', 'ADMIN'].includes(String(c.role || '').toUpperCase()))
      .map((c) => ({ identificador: c.id, nome: c.name || c.id, tipo: 'canal', participantes: null }));
  }

  /**
   * "Digitando..." antes de enviar, com tempo proporcional ao texto: um numero
   * que posta instantaneamente em dez grupos e o padrao que o WhatsApp mais
   * associa a robo. Canal (@newsletter) nao tem digitacao. Falha aqui nunca
   * impede o envio.
   */
  async simularDigitacao(chatId, texto) {
    if (!this.digitando || /@newsletter$/i.test(chatId)) return;
    const body = { session: this.session, chatId };
    try {
      await this.request('/api/startTyping', { method: 'POST', body, timeoutMs: 8000 });
      await this.esperar(tempoDigitando(texto));
      await this.request('/api/stopTyping', { method: 'POST', body, timeoutMs: 8000 });
    } catch (err) {
      log.warn(`Nao consegui mostrar "digitando": ${err.message}`, { chatId });
    }
  }

  /**
   * @param {{chatId:string, texto:string, imagem?:string}} payload
   * @returns {Promise<{id:string, provider:string}>}
   */
  async sendMessage({ chatId, texto, imagem }) {
    if (!chatId) throw new Error('chatId vazio');
    await this.simularDigitacao(chatId, texto);

    if (imagem) {
      try {
        const res = await this.request('/api/sendImage', {
          method: 'POST',
          timeoutMs: 45000,
          body: {
            session: this.session,
            chatId,
            file: { url: imagem },
            caption: texto,
          },
        });
        return { id: res?.id?._serialized || res?.id || 'sem-id', provider: 'waha', comImagem: true };
      } catch (err) {
        // Imagem quebrada nao pode impedir a oferta de sair: cai para texto.
        log.warn(`Falha ao enviar imagem, enviando so texto: ${err.message}`, { chatId });
      }
    }

    const res = await this.request('/api/sendText', {
      method: 'POST',
      timeoutMs: 30000,
      body: { session: this.session, chatId, text: texto },
    });
    return { id: res?.id?._serialized || res?.id || 'sem-id', provider: 'waha', comImagem: false };
  }
}

/** 2 a 6 segundos: o suficiente para parecer gente, sem travar a fila. */
export function tempoDigitando(texto) {
  const caracteres = String(texto || '').length;
  return Math.min(6000, Math.max(2000, caracteres * 25));
}

/**
 * O webhook veio mesmo da SUA WAHA? Ela assina o corpo com HMAC-SHA512
 * (WHATSAPP_HOOK_HMAC_KEY) no header X-Webhook-Hmac. Sem isso, qualquer um
 * que achasse a URL poderia fazer o sistema responder mensagens.
 */
export function assinaturaWebhookValida(corpoBruto, assinatura, chave) {
  if (!chave || !assinatura || !corpoBruto) return false;
  const esperada = crypto.createHmac('sha512', chave).update(corpoBruto).digest('hex');
  const a = Buffer.from(String(assinatura), 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Evento "message" da WAHA -> mensagem no formato do sistema.
 * @returns {{id:string, de:string, texto:string, deMim:boolean, privada:boolean}|null}
 */
export function lerMensagemDoWebhook(corpo) {
  if (corpo?.event !== 'message' || !corpo.payload) return null;
  const p = corpo.payload;
  const de = String(p.from || '');
  return {
    id: String(p.id || ''),
    de,
    texto: String(p.body || ''),
    deMim: Boolean(p.fromMe),
    // Grupo, canal e status nunca recebem resposta automatica.
    privada: /@(c\.us|s\.whatsapp\.net|lid)$/i.test(de),
  };
}
