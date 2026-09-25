import { api } from '../api.js';
import {
  el, escapar, modal, formulario, confirmar, tentar, ok, erro,
  tabela, acoes, etiqueta, statusEtiqueta,
} from '../ui.js';

/**
 * A etiqueta de afiliado é o que transforma divulgação em comissão, então esta
 * tela mostra o link pronto antes de você confiar nele.
 */

/** O que preencher em cada loja — some a dúvida de "qual parâmetro é o meu". */
const EXEMPLOS = {
  amazon: { identificador: 'seuid-20', parametro: 'tag', onde: 'Amazon Associates → Sua conta → ID de rastreamento' },
  mercadolivre: { identificador: 'seu_nome', parametro: 'matt_word', onde: 'Mercado Livre → Afiliados → seu identificador' },
  aliexpress: { identificador: '123456789', parametro: 'aff_trace_key', onde: 'AliExpress Portals → Tracking ID' },
  shopee: { identificador: '(link do painel)', parametro: '—', onde: 'A Shopee rastreia pelo link gerado no painel, não por parâmetro' },
  magalu: { identificador: 'seu_id', parametro: 'partner_id', onde: 'Parceiro Magalu → seu código' },
};

const CAMPOS = [
  { nome: 'nome', rotulo: 'Nome do programa', obrigatorio: true, largura: 2, exemplo: 'Amazon Associates' },
  { nome: 'marketplace', rotulo: 'Loja', obrigatorio: true, dica: 'amazon, mercadolivre, shopee…' },
  { nome: 'identificador', rotulo: 'Sua etiqueta / ID de afiliado', dica: 'é o que gera sua comissão', exemplo: 'seuid-20' },
  { nome: 'parametro_tag', rotulo: 'Parâmetro na URL', dica: 'em branco = usa o padrão da loja', exemplo: 'tag' },
  { nome: 'base_url', rotulo: 'URL base da loja', largura: 2 },
  { nome: 'comissao_media', rotulo: 'Comissão média (%)', tipo: 'number', passo: '0.1' },
  { nome: 'ativo', rotulo: 'Ativo', tipo: 'checkbox' },
  { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', linhas: 2, largura: 2 },
];

export async function renderAfiliados() {
  const tela = el('<div></div>');

  const cabecalho = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Sua etiqueta de afiliado</h2>
        <p>É ela que entra no link de todo produto — venha ele de API, do navegador ou cadastrado à mão.</p></div>
        <div class="linha">
          <button class="btn" id="reaplicar">🔄 Reaplicar em todos</button>
          <button class="btn-primario" id="novo">+ Novo programa</button>
        </div>
      </div>
    </div>`);
  tela.appendChild(cabecalho);

  // --- testador de link ---
  const testador = el(`
    <div class="cartao mt">
      <h3>Testar como o link fica</h3>
      <p class="pequeno texto-fraco">Cole o link de um produto e veja o link que sairia no post, com a sua etiqueta.</p>
      <div class="campos">
        <div class="campo" style="grid-column:span 2"><label>Link do produto</label>
          <input id="t-url" placeholder="https://www.amazon.com.br/dp/B0XXXXX"></div>
        <div class="campo"><label>Loja</label><input id="t-loja" placeholder="amazon"></div>
        <div class="campo" style="display:flex;align-items:flex-end">
          <button class="btn" id="t-testar">Testar</button></div>
      </div>
      <div id="t-saida"></div>
    </div>`);
  tela.appendChild(testador);

  testador.querySelector('#t-testar').onclick = async () => {
    const url = testador.querySelector('#t-url').value.trim();
    if (!url) { erro('Cole um link de produto.'); return; }

    const saida = testador.querySelector('#t-saida');
    saida.innerHTML = '<div class="carregando">Testando…</div>';

    const r = await api.post('/afiliados/testar-link', {
      url, marketplace: testador.querySelector('#t-loja').value.trim(),
    }).catch((e) => ({ erro: e.message }));

    saida.innerHTML = r.erro
      ? `<p style="color:var(--erro)" class="pequeno">${escapar(r.erro)}</p>`
      : `<div class="cartao" style="box-shadow:none;background:var(--superficie-2)">
           <p class="pequeno texto-fraco" style="margin:0 0 6px">Link que vai para o grupo:</p>
           <code class="pequeno" style="word-break:break-all">${escapar(r.final)}</code>
           <p class="pequeno" style="margin:8px 0 0;color:${r.aplicado ? 'var(--ok)' : 'var(--alerta)'}">
             ${r.aplicado ? '✅ Sua etiqueta entrou' : '⚠️ Sem etiqueta'} — ${escapar(r.motivo)}
           </p>
         </div>`;
  };

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  async function carregar() {
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    const dados = await api.get('/afiliados', { limite: 100 });
    area.innerHTML = '';

    area.appendChild(tabela({
      vazio: 'Nenhum programa cadastrado. Sem etiqueta, os links saem sem comissão.',
      colunas: [
        { rotulo: 'Programa', render: (a) => `<strong>${escapar(a.nome)}</strong><br>
            <span class="pequeno texto-fraco">${escapar(a.marketplace)}</span>` },
        {
          rotulo: 'Etiqueta',
          render: (a) => (a.identificador
            ? `<code class="pequeno">${escapar(a.identificador)}</code>`
            : '<span class="pequeno" style="color:var(--alerta)">⚠️ não preenchida</span>'),
        },
        { rotulo: 'Parâmetro', render: (a) => escapar(a.parametro_tag || '(padrão da loja)') },
        { rotulo: 'Comissão', render: (a) => (a.comissao_media ? `${a.comissao_media}%` : '—') },
        { rotulo: 'Ativo', render: (a) => (a.ativo ? etiqueta('sim', 'ok') : etiqueta('não')) },
        {
          rotulo: 'Ações', classe: 'acoes',
          render: (a) => acoes([
            { rotulo: '✏️', titulo: 'Editar', aoClicar: () => abrir(a) },
            {
              rotulo: '🗑️', titulo: 'Remover', classe: 'btn-perigo',
              aoClicar: () => confirmar(`Remover "${a.nome}"?`, async () => {
                await tentar(() => api.del(`/afiliados/${a.id}`), 'Removido');
                carregar();
              }),
            },
          ]),
        },
      ],
      linhas: dados.rows,
    }));

    const semEtiqueta = dados.rows.filter((a) => !a.identificador);
    if (semEtiqueta.length) {
      area.appendChild(el(`
        <div class="cartao mt" style="background:var(--alerta-suave);border-color:transparent">
          <strong class="pequeno">⚠️ ${semEtiqueta.length} programa(s) sem etiqueta</strong>
          <p class="pequeno" style="margin:4px 0 0">
            ${semEtiqueta.map((a) => escapar(a.nome)).join(', ')} — enquanto estiver assim, os links
            desses marketplaces saem <strong>sem a sua comissão</strong>.
          </p>
        </div>`));
    }
  }

  function abrir(programa) {
    const form = formulario(CAMPOS, programa || { ativo: true });
    const dica = el('<div class="cartao mt" style="box-shadow:none;background:var(--superficie-2)"></div>');

    function atualizarDica() {
      const loja = form.querySelector('[name="marketplace"]').value.trim().toLowerCase();
      const exemplo = EXEMPLOS[loja];
      dica.innerHTML = exemplo
        ? `<strong class="pequeno">${escapar(loja)}</strong>
           <table style="background:transparent;margin-top:6px">
             <tr><td class="pequeno texto-fraco">Etiqueta</td><td class="pequeno"><code>${escapar(exemplo.identificador)}</code></td></tr>
             <tr><td class="pequeno texto-fraco">Parâmetro</td><td class="pequeno"><code>${escapar(exemplo.parametro)}</code></td></tr>
             <tr><td class="pequeno texto-fraco">Onde achar</td><td class="pequeno">${escapar(exemplo.onde)}</td></tr>
           </table>`
        : '<p class="pequeno texto-fraco" style="margin:0">Digite a loja (amazon, mercadolivre, shopee…) para ver onde achar sua etiqueta.</p>';
    }

    form.querySelector('[name="marketplace"]').addEventListener('input', atualizarDica);
    atualizarDica();

    const corpo = el('<div></div>');
    corpo.appendChild(form);
    corpo.appendChild(dica);

    modal({
      titulo: programa ? 'Editar programa' : 'Novo programa de afiliado',
      corpo,
      acoes: [
        { rotulo: 'Cancelar' },
        {
          rotulo: 'Salvar', classe: 'btn-primario', principal: true,
          aoClicar: async () => {
            const dados = form.ler();
            const r = await tentar(() => (programa
              ? api.put(`/afiliados/${programa.id}`, dados)
              : api.post('/afiliados', dados)), 'Programa salvo');
            if (r) {
              // Etiqueta nova só vale se entrar nos produtos que já existem.
              await api.post('/afiliados/reaplicar-links', {}).catch(() => null);
              carregar();
            }
          },
        },
      ],
    });
  }

  cabecalho.querySelector('#novo').onclick = () => abrir(null);
  cabecalho.querySelector('#reaplicar').onclick = async () => {
    const r = await tentar(() => api.post('/afiliados/reaplicar-links', {}));
    if (r) {
      ok(`${r.atualizados} de ${r.total} produtos atualizados`);
      if (r.lojas_sem_programa.length) {
        erro(`Sem programa cadastrado para: ${r.lojas_sem_programa.join(', ')}`);
      }
    }
  };

  await carregar();
  return tela;
}
