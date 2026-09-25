/**
 * WAHA (https://waha.devlike.pro) - WhatsApp via sessao nao oficial.
 * Endpoints usados: /api/sessions, /api/sendText, /api/sendImage, /api/{s}/groups
 */
import { logger } from '../../core/utils/logger.js';

const log = logger.child('waha');

export class WahaProvider {
  constructor({ baseUrl, session, apiKey } = {}) {
    this.name = 'waha';
    this.baseUrl = String(baseUrl || 'http://localhost:3003').replace(/\/+$/, '');
    this.session = session || 'default';
    this.apiKey = apiKey || '';
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

  /**
   * @param {{chatId:string, texto:string, imagem?:string}} payload
   * @returns {Promise<{id:string, provider:string}>}
   */
  async sendMessage({ chatId, texto, imagem }) {
    if (!chatId) throw new Error('chatId vazio');

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
