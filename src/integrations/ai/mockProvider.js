/**
 * IA de mentira: regras deterministicas que ja limpam bastante coisa.
 * Serve para desenvolver, testar e rodar o sistema sem gastar credito.
 */
const RUIDO = [
  /frete\s*gr[aá]tis/gi, /promo[cç][aã]o/gi, /oferta/gi, /desconto/gi,
  /\b(novo|new|hot|top)\b/gi, /\d+\s*(un|pcs|pieces)\b/gi,
  /R\$\s*[\d.,]+/gi, /\d{1,3}\s*%/g,
  /[|/]+/g, /\s{2,}/g,
];

export class MockAiProvider {
  constructor() { this.name = 'mock'; }

  async status() {
    return { online: true, provider: 'mock', modelo: 'regras-locais', aviso: 'IA simulada (sem custo, sem API).' };
  }

  async complete({ tarefa, product = {} }) {
    const titulo = limpar(product.titulo_original || '');
    switch (tarefa) {
      case 'titulo':
        return capitalizar(titulo).slice(0, 70);
      case 'descricao':
        return `${capitalizar(titulo)}${product.categoria ? ` — ${product.categoria}` : ''}. Item selecionado a dedo pra quem acompanha os achadinhos daqui.`;
      case 'cta':
        return '👉 Corre que costuma acabar rapido!';
      case 'variacoes':
        return [
          `✨ ${capitalizar(titulo)}`,
          `🔥 Achadinho do dia: ${capitalizar(titulo)}`,
          `💅 Saiu ${capitalizar(titulo)} — vale a pena conferir`,
        ].join('\n');
      case 'post':
      default:
        return `✨ ${capitalizar(titulo)}\nSeparei esse pra voces hoje 👇`;
    }
  }
}

function limpar(texto) {
  let saida = String(texto);
  for (const regex of RUIDO) saida = saida.replace(regex, ' ');
  return saida.replace(/\s{2,}/g, ' ').trim();
}

function capitalizar(texto) {
  const s = String(texto).trim();
  if (!s) return '';
  const minusculas = s === s.toUpperCase() ? s.toLowerCase() : s;
  return minusculas.charAt(0).toUpperCase() + minusculas.slice(1);
}
