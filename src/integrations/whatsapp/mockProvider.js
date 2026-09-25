/**
 * Provider de mentira: permite usar o sistema inteiro sem WhatsApp nenhum.
 * E o padrao no .env.example justamente para ninguem mandar mensagem sem querer.
 */
import { logger } from '../../core/utils/logger.js';
import { newId } from '../../core/utils/id.js';

const log = logger.child('whatsapp-mock');

export class MockWhatsAppProvider {
  constructor() {
    this.name = 'mock';
    this.enviadas = [];
  }

  async status() {
    return {
      online: true,
      provider: 'mock',
      baseUrl: null,
      session: 'mock',
      status: 'WORKING',
      conectado: true,
      erro: null,
      aviso: 'Provider de simulacao: nada e enviado de verdade.',
    };
  }

  async qrCode() {
    return { url: null, instrucoes: 'Modo simulacao: nao existe QR para parear.' };
  }

  async startSession() {
    return { status: 'WORKING', session: 'mock' };
  }

  async listGroups() {
    return [
      { identificador: '120363000000000001@g.us', nome: '[DEMO] Ofertas Femininas', tipo: 'grupo', participantes: 128 },
      { identificador: '120363000000000002@g.us', nome: '[DEMO] Achadinhos e Cupons', tipo: 'grupo', participantes: 341 },
      { identificador: '120363000000000003@g.us', nome: '[DEMO] Perfumaria Importada', tipo: 'grupo', participantes: 76 },
    ];
  }

  async sendMessage({ chatId, texto, imagem }) {
    const id = newId('mock');
    this.enviadas.push({ id, chatId, texto, imagem, em: new Date().toISOString() });
    log.info(`Simulou envio para ${chatId}`, { caracteres: texto?.length ?? 0, imagem: Boolean(imagem) });
    return { id, provider: 'mock', comImagem: Boolean(imagem), simulado: true };
  }
}
