/**
 * IA via API da Anthropic (SDK oficial @anthropic-ai/sdk).
 *
 * O SDK e carregado sob demanda: quem roda tudo em modo mock nem precisa dele.
 * Modelo padrao: claude-opus-5 (troque em AI_MODEL no .env se quiser sonnet/haiku).
 */
import { logger } from '../../core/utils/logger.js';

const log = logger.child('ia-anthropic');

let Anthropic = null;
async function loadSdk() {
  if (Anthropic) return Anthropic;
  try {
    const mod = await import('@anthropic-ai/sdk');
    Anthropic = mod.default || mod.Anthropic;
    return Anthropic;
  } catch {
    throw new Error(
      'SDK da Anthropic nao instalado. Rode: npm install @anthropic-ai/sdk ' +
      '(ou volte AI_PROVIDER para "mock" no .env).',
    );
  }
}

export class AnthropicAiProvider {
  constructor({ apiKey, model, maxTokens } = {}) {
    this.name = 'anthropic';
    this.apiKey = apiKey;
    this.model = model || 'claude-opus-5';
    this.maxTokens = maxTokens || 800;
    this.client = null;
  }

  async getClient() {
    if (this.client) return this.client;
    const Sdk = await loadSdk();
    this.client = new Sdk({ apiKey: this.apiKey });
    return this.client;
  }

  async status() {
    if (!this.apiKey) {
      return { online: false, provider: 'anthropic', modelo: this.model, erro: 'AI_API_KEY vazia no .env' };
    }
    try {
      await this.getClient();
      return { online: true, provider: 'anthropic', modelo: this.model };
    } catch (err) {
      return { online: false, provider: 'anthropic', modelo: this.model, erro: err.message };
    }
  }

  async complete({ system, prompt }) {
    const client = await this.getClient();

    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      // Texto curto de divulgacao: esforco baixo entrega o mesmo e custa menos.
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
    };

    let response;
    try {
      // fallbacks: se o modelo recusar por politica, a propria API repete em
      // outro modelo dentro da mesma chamada, em vez de devolver nada.
      response = await client.beta.messages.create({
        ...params,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (err) {
      if (err?.status === 400) {
        log.warn(`Beta de fallback recusada (${err.message}); repetindo sem ela.`);
        response = await client.messages.create(params);
      } else {
        throw err;
      }
    }

    if (response.stop_reason === 'refusal') {
      throw new Error('A IA recusou gerar este texto. Ajuste o produto ou escreva manualmente.');
    }

    return (response.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
  }
}
