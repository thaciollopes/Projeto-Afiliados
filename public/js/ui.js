/** Blocos de interface reaproveitados por todas as paginas. */

export const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function moeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function dataCurta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

/** ISO -> valor para <input type="datetime-local"> (no fuso do navegador). */
export function paraInputDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function deInputDataHora(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ------------------------------------------------------------- avisos --

export function aviso(mensagem, tipo = 'info') {
  const caixa = document.getElementById('avisos');
  const item = el(`<div class="aviso ${tipo}">${escapar(mensagem)}</div>`);
  caixa.appendChild(item);
  setTimeout(() => {
    item.style.opacity = '0';
    setTimeout(() => item.remove(), 250);
  }, tipo === 'erro' ? 6500 : 3500);
}

export const ok = (m) => aviso(m, 'ok');
export const erro = (m) => aviso(m, 'erro');

/** Executa uma acao mostrando erro amigavel se falhar. */
export async function tentar(fn, mensagemSucesso) {
  try {
    const r = await fn();
    if (mensagemSucesso) ok(mensagemSucesso);
    return r;
  } catch (e) {
    erro(e.message || 'Falhou');
    return null;
  }
}

// -------------------------------------------------------------- modal --

let onSalvar = null;

export function modal({ titulo, corpo, acoes = [], largura }) {
  const fundo = document.getElementById('modal-fundo');
  document.getElementById('modal-titulo').textContent = titulo;

  const caixaCorpo = document.getElementById('modal-corpo');
  caixaCorpo.innerHTML = '';
  caixaCorpo.appendChild(typeof corpo === 'string' ? el(`<div>${corpo}</div>`) : corpo);

  if (largura) fundo.querySelector('.modal').style.width = largura;

  const rodape = document.getElementById('modal-acoes');
  rodape.innerHTML = '';
  for (const acao of acoes) {
    const botao = el(`<button class="${acao.classe || ''}">${escapar(acao.rotulo)}</button>`);
    botao.onclick = async () => {
      if (acao.aoClicar) {
        botao.disabled = true;
        try { await acao.aoClicar(); } finally { botao.disabled = false; }
      }
      if (acao.fechar !== false) fecharModal();
    };
    rodape.appendChild(botao);
  }

  fundo.hidden = false;
  onSalvar = acoes.find((a) => a.principal)?.aoClicar || null;
  setTimeout(() => caixaCorpo.querySelector('input, select, textarea')?.focus(), 40);
}

export function fecharModal() {
  document.getElementById('modal-fundo').hidden = true;
  onSalvar = null;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-fechar').onclick = fecharModal;
  document.getElementById('modal-fundo').onclick = (e) => {
    if (e.target.id === 'modal-fundo') fecharModal();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModal();
    if (e.key === 'Enter' && e.ctrlKey && onSalvar) onSalvar();
  });
});

export function confirmar(mensagem, aoConfirmar) {
  modal({
    titulo: 'Confirmar',
    corpo: `<p>${escapar(mensagem)}</p>`,
    acoes: [
      { rotulo: 'Cancelar' },
      { rotulo: 'Confirmar', classe: 'btn-perigo', aoClicar: aoConfirmar, principal: true },
    ],
  });
}

// ----------------------------------------------------------- formulario --

/**
 * Formulario declarativo.
 * campo: {nome, rotulo, tipo, opcoes, dica, valor, obrigatorio, largura}
 * tipos: text, number, textarea, select, checkbox, datetime, hidden
 */
export function formulario(campos, valores = {}) {
  const form = el('<form class="campos"></form>');

  for (const campo of campos) {
    if (campo.tipo === 'hidden') continue;

    const valor = valores[campo.nome] ?? campo.valor ?? '';
    const caixa = el(`<div class="campo" style="grid-column: span ${campo.largura || 1}"></div>`);

    if (campo.tipo === 'checkbox') {
      caixa.appendChild(el(`
        <label class="check">
          <input type="checkbox" name="${campo.nome}" ${valor ? 'checked' : ''}>
          <span>${escapar(campo.rotulo)}</span>
        </label>`));
    } else {
      caixa.appendChild(el(`
        <label>${escapar(campo.rotulo)}
          ${campo.dica ? `<span class="dica">— ${escapar(campo.dica)}</span>` : ''}
        </label>`));

      if (campo.tipo === 'select') {
        const opcoes = (campo.opcoes || []).map((o) => {
          const v = typeof o === 'string' ? o : o.valor;
          const r = typeof o === 'string' ? o : o.rotulo;
          return `<option value="${escapar(v)}" ${String(v) === String(valor) ? 'selected' : ''}>${escapar(r)}</option>`;
        }).join('');
        caixa.appendChild(el(`<select name="${campo.nome}">${opcoes}</select>`));
      } else if (campo.tipo === 'textarea') {
        caixa.appendChild(el(`<textarea name="${campo.nome}" rows="${campo.linhas || 8}">${escapar(valor)}</textarea>`));
      } else if (campo.tipo === 'datetime') {
        caixa.appendChild(el(`<input type="datetime-local" name="${campo.nome}" value="${paraInputDataHora(valor)}">`));
      } else {
        caixa.appendChild(el(`<input type="${campo.tipo || 'text'}"
          name="${campo.nome}" value="${escapar(valor)}"
          ${campo.passo ? `step="${campo.passo}"` : ''}
          ${campo.obrigatorio ? 'required' : ''}
          placeholder="${escapar(campo.exemplo || '')}">`));
      }
    }
    form.appendChild(caixa);
  }

  form.onsubmit = (e) => e.preventDefault();
  form.ler = () => lerFormulario(form, campos);
  return form;
}

export function lerFormulario(form, campos) {
  const dados = {};
  for (const campo of campos) {
    const input = form.querySelector(`[name="${campo.nome}"]`);
    if (!input) continue;

    if (campo.tipo === 'checkbox') { dados[campo.nome] = input.checked; continue; }

    let valor = input.value;
    if (valor === '') { dados[campo.nome] = null; continue; }
    if (campo.tipo === 'number') valor = Number(valor);
    if (campo.tipo === 'datetime') valor = deInputDataHora(valor);
    dados[campo.nome] = valor;
  }
  return dados;
}

// -------------------------------------------------------------- tabela --

/**
 * @param {{colunas:{campo?:string,rotulo:string,render?:Function,classe?:string}[],
 *          linhas:object[], vazio?:string}} config
 */
export function tabela({ colunas, linhas, vazio = 'Nada por aqui ainda.' }) {
  if (!linhas?.length) return el(`<div class="cartao"><div class="vazio">${escapar(vazio)}</div></div>`);

  const cabecalho = colunas.map((c) => `<th class="${c.classe || ''}">${escapar(c.rotulo)}</th>`).join('');
  const caixa = el(`<div class="tabela-caixa"><table><thead><tr>${cabecalho}</tr></thead><tbody></tbody></table></div>`);
  const corpo = caixa.querySelector('tbody');

  for (const linha of linhas) {
    const tr = document.createElement('tr');
    for (const coluna of colunas) {
      const td = document.createElement('td');
      if (coluna.classe) td.className = coluna.classe;
      const conteudo = coluna.render ? coluna.render(linha) : linha[coluna.campo];
      if (conteudo instanceof Node) td.appendChild(conteudo);
      else td.innerHTML = conteudo ?? '—';
      tr.appendChild(td);
    }
    corpo.appendChild(tr);
  }
  return caixa;
}

/** Botoes de acao de uma linha da tabela. */
export function acoes(botoes) {
  const caixa = el('<div class="linha" style="justify-content:flex-end;gap:6px"></div>');
  for (const b of botoes.filter(Boolean)) {
    const botao = el(`<button class="btn-pequeno ${b.classe || ''}" title="${escapar(b.titulo || b.rotulo)}">${b.rotulo}</button>`);
    botao.onclick = b.aoClicar;
    caixa.appendChild(botao);
  }
  return caixa;
}

export function etiqueta(texto, tipo = '') {
  return `<span class="tag ${tipo}">${escapar(texto)}</span>`;
}

const CORES_STATUS = {
  ativo: 'ok', ativa: 'ok', enviado: 'ok', ok: 'ok', disponivel: 'ok',
  pausado: 'alerta', pausada: 'alerta', aguardando: 'alerta', programado: 'alerta',
  programada: 'alerta', processando: 'alerta', enviando: 'alerta', atencao: 'alerta',
  erro: 'erro', expirado: 'erro', expirada: 'erro', cancelado: 'erro',
  indisponivel: 'erro', esgotado: 'erro',
};

export function statusEtiqueta(valor) {
  return etiqueta(valor || '—', CORES_STATUS[String(valor).toLowerCase()] || '');
}

// ------------------------------------------------------------ graficos --

export function graficoBarras(dados, { rotulo = 'dia', valor = 'total' } = {}) {
  const max = Math.max(...dados.map((d) => Number(d[valor]) || 0), 1);
  const barras = dados.map((d) => {
    const altura = Math.round(((Number(d[valor]) || 0) / max) * 100);
    return `<div class="barra" style="height:${Math.max(altura, 2)}%" title="${escapar(d[rotulo])}: ${d[valor]}"></div>`;
  }).join('');
  const legendas = dados.map((d, i) => {
    const texto = i % Math.ceil(dados.length / 7) === 0 ? String(d[rotulo]).slice(-5) : '';
    return `<span>${escapar(texto)}</span>`;
  }).join('');
  return el(`<div><div class="barras">${barras}</div><div class="barras-legenda">${legendas}</div></div>`);
}

export function listaProporcional(dados) {
  if (!dados?.length) return el('<p class="texto-fraco pequeno">Sem dados.</p>');
  const max = Math.max(...dados.map((d) => d.total), 1);
  const itens = dados.map((d) => `
    <div class="item">
      <span style="width:130px" class="pequeno">${escapar(d.rotulo)}</span>
      <span class="trilho"><span class="preenchido" style="width:${(d.total / max) * 100}%"></span></span>
      <span class="num">${d.total}</span>
    </div>`).join('');
  return el(`<div class="lista-dados">${itens}</div>`);
}

export function carregando() {
  return el('<div class="carregando">Carregando…</div>');
}

/** Preview no formato de balao do WhatsApp. */
export function previewWhatsApp(mensagem, imagem) {
  return el(`
    <div class="whats-preview">
      <div class="whats-balao">
        ${imagem ? `<img src="${escapar(imagem)}" alt="" onerror="this.remove()">` : ''}
        ${formatarWhats(mensagem)}
      </div>
    </div>`);
}

/** Aplica negrito/italico/riscado do WhatsApp so para exibir. */
function formatarWhats(texto) {
  return escapar(texto || '')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>');
}
