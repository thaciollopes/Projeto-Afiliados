/**
 * IA por endpoint compativel com OpenAI (/v1/chat/completions).
 * Serve para OpenAI, Groq, OpenRouter, Ollama, LM Studio e afins.
 *
 * Para Claude, use o anthropicProvider (SDK oficial), nao este.
 */
export class CompatibleAiProvider {
  constructor({ apiKey, model, baseUrl, maxTokens } = {}) {
    this.name = 'compatible';
    this.apiKey = apiKey || '';
    this.model = model || 'gpt-4o-mini';
    this.baseUrl = String(baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
    this.maxTokens = maxTokens || 800;
  }

  async status() {
    if (!this.baseUrl) return { online: false, provider: this.name, erro: 'AI_BASE_URL vazia' };
    return { online: Boolean(this.apiKey || this.baseUrl.includes('localhost')), provider: this.name, modelo: this.model, endpoint: this.baseUrl };
  }

  async complete({ system, prompt }) {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0.7,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const detalhe = await res.text().catch(() => '');
      throw new Error(`IA HTTP ${res.status}: ${detalhe.slice(0, 200)}`);
    }

    const data = await res.json();
    return String(data?.choices?.[0]?.message?.content || '').trim();
  }
}
