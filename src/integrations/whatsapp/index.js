/**
 * Porta de saida do WhatsApp.
 *
 * O resto do sistema chama `getWhatsAppProvider()` e nunca fala "WAHA".
 * Trocar para Evolution API / API oficial = novo arquivo aqui + variavel no .env.
 */
import { config } from '../../config/index.js';
import { WahaProvider } from './wahaProvider.js';
import { MockWhatsAppProvider } from './mockProvider.js';

let instance = null;
let instanceKey = null;

export function getWhatsAppProvider(overrides = {}) {
  const provider = (overrides.provider || config.whatsapp.provider || 'mock').toLowerCase();
  const key = JSON.stringify({ provider, ...overrides });
  if (instance && instanceKey === key) return instance;

  instance = provider === 'waha'
    ? new WahaProvider({ ...config.whatsapp, ...overrides })
    : new MockWhatsAppProvider({ ...config.whatsapp, ...overrides });
  instanceKey = key;
  return instance;
}

export function resetWhatsAppProvider() {
  instance = null;
  instanceKey = null;
}
