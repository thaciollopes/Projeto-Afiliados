import { api } from '../api.js';
import {
  el, escapar, modal, confirmar, tentar, ok, tabela, acoes,
  etiqueta, previewWhatsApp,
} from '../ui.js';

export async function renderTemplates() {
  const [variaveis, produtos] = await Promise.all([
    api.get('/templates/variaveis'),
    api.get('/produtos', { limite: 100 }),
  ]);

  const tela = el('<div></div>');
  const cabecalho = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Templates de publicação</h2>
        <p>O template monta o post. Linha cuja variável está vazia some sozinha — sem cupom, sem linha de cupom.</p></div>
        <button class="btn-primario" id="novo">+ Novo template</button>
      </div>
      <details>
        <summary class="pequeno texto-fraco" style="cursor:pointer">Ver todas as variáveis disponíveis</summary>
        <div class="grade g3 mt">
          ${variaveis.map((v) => `<div class="pequeno">
            <code style="color:var(--primaria)">{${v.nome}}</code><br>
            <span class="texto-fraco">${escapar(v.descricao)}</span></div>`).join('')}
        </div>
        <p class="pequeno texto-fraco mt">
          Bloco condicional: <code>[[se:cupom]] … [[/se]]</code> mostra o trecho só quando a variável tiver valor.
        </p>
      </details>
    </div>`);
  tela.appendChild(cabecalho);

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  async function carregar() {
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    const dados = await api.get('/templates', { limite: 100 });
    area.innerHTML = '';
    area.appendChild(tabela({
      vazio: 'Nenhum template.',
      colunas: [
        { rotulo: 'Nome', render: (t) => `<strong>${escapar(t.nome)}</strong> ${t.padrao ? etiqueta('padrão', 'info') : ''}<br>
            <span class="pequeno texto-fraco">${escapar(t.descricao || '')}</span>` },
        { rotulo: 'Tipo', render: (t) => etiqueta(t.tipo || '—') },
        { rotulo: 'Prévia', render: (t) => `<span class="pequeno texto-fraco">${escapar(String(t.corpo).split('\n').slice(0, 2).join(' / ')).slice(0, 70)}…</span>` },
        {
          rotulo: 'Ações', classe: 'acoes',
          render: (t) => acoes([
            { rotulo: '✏️', titulo: 'Editar', aoClicar: () => editor(t) },
            {
              rotulo: '⭐', titulo: 'Tornar padrão',
              aoClicar: async () => {
                await tentar(() => api.put(`/templates/${t.id}`, { padrao: true }), 'Agora é o padrão');
                carregar();
              },
            },
            {
              rotulo: '🗑️', titulo: 'Remover', classe: 'btn-perigo',
              aoClicar: () => confirmar(`Remover "${t.nome}"?`, async () => {
                await tentar(() => api.del(`/templates/${t.id}`), 'Removido');
                carregar();
              }),
            },
          ]),
        },
      ],
      linhas: dados.rows,
    }));
  }

  function editor(template) {
    const corpo = el(`
      <div>
        <div class="campos">
          <div class="campo"><label>Nome</label><input id="t-nome" value="${escapar(template?.nome || '')}"></div>
          <div class="campo"><label>Tipo</label>
            <select id="t-tipo">
              ${['oferta', 'achadinho', 'cupom', 'simples', 'custom'].map((v) => `
                <option ${template?.tipo === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select></div>
          <div class="campo" style="grid-column:span 2"><label>Descrição</label>
            <input id="t-desc" value="${escapar(template?.descricao || '')}"></div>
        </div>
        <div class="grade g2">
          <div>
            <label>Conteúdo do post</label>
            <textarea id="t-corpo" rows="16">${escapar(template?.corpo || MODELO_NOVO)}</textarea>
            <div class="linha mt">
              <select id="t-produto" class="pequeno">
                <option value="">— produto de exemplo —</option>
                ${produtos.rows.map((p) => `<option value="${p.id}">${escapar(p.titulo_original.slice(0, 40))}</option>`).join('')}
              </select>
              <button class="btn btn-pequeno" id="t-preview">↻ Atualizar prévia</button>
            </div>
          </div>
          <div>
            <label>Como vai aparecer no WhatsApp</label>
            <div id="t-saida"></div>
          </div>
        </div>
      </div>`);

    async function atualizar() {
      const saida = corpo.querySelector('#t-saida');
      saida.innerHTML = '<div class="carregando">…</div>';
      const r = await api.post('/templates/preview', {
        corpo: corpo.querySelector('#t-corpo').value,
        product_id: corpo.querySelector('#t-produto').value || undefined,
      }).catch((e) => ({ mensagem: `Erro: ${e.message}` }));
      saida.innerHTML = '';
      saida.appendChild(previewWhatsApp(r.mensagem));
      if (r.produto) saida.appendChild(el(`<p class="pequeno texto-fraco">Exemplo com: ${escapar(r.produto)}</p>`));
    }

    corpo.querySelector('#t-preview').onclick = atualizar;
    corpo.querySelector('#t-produto').onchange = atualizar;
    corpo.querySelector('#t-corpo').addEventListener('input', debounce(atualizar, 600));

    modal({
      titulo: template ? 'Editar template' : 'Novo template',
      corpo,
      largura: 'min(1000px, 100%)',
      acoes: [
        { rotulo: 'Cancelar' },
        {
          rotulo: 'Salvar', classe: 'btn-primario', principal: true,
          aoClicar: async () => {
            const dados = {
              nome: corpo.querySelector('#t-nome').value,
              tipo: corpo.querySelector('#t-tipo').value,
              descricao: corpo.querySelector('#t-desc').value,
              corpo: corpo.querySelector('#t-corpo').value,
            };
            const r = await tentar(() => (template
              ? api.put(`/templates/${template.id}`, dados)
              : api.post('/templates', dados)), 'Template salvo');
            if (r) carregar();
          },
        },
      ],
    });

    atualizar();
  }

  cabecalho.querySelector('#novo').onclick = () => editor(null);
  await carregar();
  return tela;
}

const MODELO_NOVO = [
  '🔥 *OFERTA*',
  '',
  '{titulo}',
  '',
  '💰 De: ~{preco_anterior}~',
  '🔥 Por: {preco_final}',
  '',
  '🏷️ Cupom: *{cupom}*',
  '',
  '👉 {link}',
].join('\n');

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export { ok };
