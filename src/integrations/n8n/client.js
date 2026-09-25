/**
 * Cliente do n8n.
 *
 * Divisao de responsabilidade adotada no projeto:
 *   - o APP e dono dos dados e da fila (funciona sozinho, sem n8n no ar);
 *   - o n8n ORQUESTRA (agenda coleta, health check, relatorio, backup) chamando
 *     a API do app, e pode publicar chamando /api/publicacoes/processar.
 * Por isso aqui so existe status + disparo de webhook: nada de logica de negocio.
 */
import { config } from '../../config/index.js';

export class N8nClient {
  constructor({ baseUrl, apiKey, webhookPrefix } = {}) {
    this.baseUrl = String(baseUrl || config.n8n.baseUrl).replace(/\/+$/, '');
    this.apiKey = apiKey ?? config.n8n.apiKey;
    this.webhookPrefix = String(webhookPrefix || config.n8n.webhookPrefix).replace(/\/+$/, '');
  }

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['X-N8N-API-KEY'] = this.apiKey;
    return h;
  }

  async status() {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const workflows = await this.listWorkflows().catch(() => null);
      return {
        online: true,
        baseUrl: this.baseUrl,
        temApiKey: Boolean(this.apiKey),
        workflows: workflows ? workflows.length : null,
        ativos: workflows ? workflows.filter((w) => w.active).length : null,
        erro: null,
      };
    } catch (err) {
      return { online: false, baseUrl: this.baseUrl, temApiKey: Boolean(this.apiKey), erro: err.message };
    }
  }

  async listWorkflows() {
    if (!this.apiKey) throw new Error('N8N_API_KEY nao configurada no .env');
    const res = await fetch(`${this.baseUrl}/api/v1/workflows?limit=100`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`n8n HTTP ${res.status}`);
    const data = await res.json();
    return (data?.data || []).map((w) => ({ id: w.id, nome: w.name, active: w.active, atualizado: w.updatedAt }));
  }

  /** Dispara um webhook do n8n (ex.: "coletar-produtos"). */
  async trigger(caminho, payload = {}) {
    const url = `${this.webhookPrefix}/${String(caminho).replace(/^\/+/, '')}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const texto = await res.text();
    if (!res.ok) throw new Error(`Webhook n8n ${caminho}: HTTP ${res.status} ${texto.slice(0, 200)}`);
    try { return JSON.parse(texto); } catch { return { raw: texto }; }
  }
}

export const n8nClient = new N8nClient();
