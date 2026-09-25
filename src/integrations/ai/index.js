/**
 * Porta de saida da IA. Provider trocavel: mock | anthropic | openai | compatible.
 * Todo texto que volta passa pelo guard antes de chegar no sistema.
 */
import { config } from '../../config/index.js';
import { logger } from '../../core/utils/logger.js';
import { buildFactSheet, enforceFactualText, SYSTEM_PROMPT } from './guards.js';
import { MockAiProvider } from './mockProvider.js';
import { AnthropicAiProvider } from './anthropicProvider.js';
import { CompatibleAiProvider } from './compatibleProvider.js';

const log = logger.child('ia');

function pickProvider() {
  const provider = (config.ai.provider || 'mock').toLowerCase();
  if (provider === 'mock' || !config.ai.apiKey) return new MockAiProvider();
  if (provider === 'anthropic' || provider === 'claude') return new AnthropicAiProvider(config.ai);
  return new CompatibleAiProvider(config.ai);
}

let instance = null;
export function getAiProvider() {
  if (!instance) instance = pickProvider();
  return instance;
}
export function resetAiProvider() { instance = null; }

export async function aiStatus() {
  try {
    return await getAiProvider().status();
  } catch (err) {
    return { online: false, provider: config.ai.provider, erro: err.message };
  }
}

/**
 * Tarefas suportadas: titulo | descricao | post | cta | variacoes
 * @returns {Promise<{texto:string, violacoes:string[], provider:string, original:string}>}
 */
export async function generate({ tarefa, product = {}, pricing = {}, instrucao = '', texto = '' }) {
  const fatos = buildFactSheet({ product, pricing });
  const provider = getAiProvider();

  const prompt = buildPrompt({ tarefa, product, fatos, instrucao, texto });
  const bruto = await provider.complete({ system: SYSTEM_PROMPT, prompt, tarefa, product, fatos });

  const { texto: limpo, violacoes } = enforceFactualText(bruto, fatos);
  if (violacoes.length) {
    log.warn('IA tentou inventar dados; trecho removido', { tarefa, violacoes });
  }
  return { texto: limpo, violacoes, provider: provider.name, original: bruto };
}

function buildPrompt({ tarefa, product, fatos, instrucao, texto }) {
  const dados = [
    `Titulo original: ${product.titulo_original || '(sem titulo)'}`,
    product.descricao_original ? `Descricao: ${String(product.descricao_original).slice(0, 600)}` : null,
    product.categoria ? `Categoria: ${product.categoria}` : null,
    product.marketplace ? `Loja: ${product.marketplace}` : null,
    fatos.avaliacao ? `Avaliacao: ${fatos.avaliacao}` : null,
    fatos.cupom_permitido ? `Existe cupom (o sistema insere o codigo depois)` : null,
  ].filter(Boolean).join('\n');

  const tarefas = {
    titulo: 'Reescreva o titulo do produto para WhatsApp: no maximo 70 caracteres, sem codigo tecnico, sem repetir palavra, sem preco.',
    descricao: 'Escreva 1 a 2 frases descrevendo o produto para um grupo de ofertas. Sem preco, sem promessa.',
    post: 'Escreva a chamada de abertura do post (2 a 3 linhas), sem preco e sem cupom: esses dados entram depois pelo template.',
    cta: 'Escreva uma chamada para acao de 1 linha, sem preco (ex.: "Corre que acaba rapido").',
    variacoes: 'Escreva 3 versoes diferentes da chamada de abertura, uma por linha, sem preco e sem cupom.',
  };

  return [
    tarefas[tarefa] || tarefas.post,
    instrucao ? `Instrucao extra do usuario: ${instrucao}` : null,
    texto ? `Texto atual para melhorar:\n${texto}` : null,
    '',
    'DADOS DO PRODUTO (unica fonte de verdade):',
    dados,
  ].filter(Boolean).join('\n');
}
