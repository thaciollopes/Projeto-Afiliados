import { api } from '../api.js';
import {
  el, escapar, moeda, dataHora, modal, formulario, confirmar, tentar, ok, erro,
  tabela, acoes, statusEtiqueta, etiqueta,
} from '../ui.js';

const MODOS = [
  { valor: 'manual', rotulo: 'Manual — lista fixa de produtos' },
  { valor: 'automatica', rotulo: 'Automática — por filtros' },
  { valor: 'pesquisa', rotulo: 'Por pesquisa salva' },
  { valor: 'categoria', rotulo: 'Por categoria' },
  { valor: 'palavras', rotulo: 'Por palavras-chave' },
  { valor: 'promocoes', rotulo: 'Só produtos em promoção' },
  { valor: 'cupons', rotulo: 'Só produtos com cupom válido' },
  { valor: 'ofertas_do_dia', rotulo: 'Ofertas do dia (maiores descontos)' },
];

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export async function renderCampanhas() {
  const [templates, canais, pesquisas] = await Promise.all([
    api.get('/templates', { limite: 50 }),
    api.get('/canais', { limite: 100 }),
    api.get('/pesquisas', { limite: 50 }),
  ]);

  const tela = el('<div></div>');
  const cabecalho = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Campanhas</h2>
        <p>A campanha decide o que publicar, onde e de quanto em quanto tempo. Ela só enfileira — quem envia é a fila.</p></div>
        <button class="btn-primario" id="nova">+ Nova campanha</button>
      </div>
    </div>`);
  tela.appendChild(cabecalho);

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  async function carregar() {
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    const dados = await api.get('/campanhas', { limite: 100 });
    area.innerHTML = '';
    area.appendChild(tabela({
      vazio: 'Nenhuma campanha ainda. Crie a primeira e deixe pausada até testar.',
      colunas: [
        { rotulo: 'Campanha', render: (c) => `<strong>${escapar(c.nome)}</strong><br>
            <span class="pequeno texto-fraco">${escapar(rotuloModo(c.modo))}</span>` },
        { rotulo: 'Destinos', render: (c) => (c.alvos?.length
          ? c.alvos.map((a) => etiqueta(a.canal.nome)).join(' ')
          : '<span class="texto-fraco">sem grupo</span>') },
        { rotulo: 'Ritmo', render: (c) => `a cada ${c.intervalo_minutos}min<br>
            <span class="pequeno texto-fraco">${c.hora_inicio}–${c.hora_fim}${c.loop ? ' · loop' : ''}</span>` },
        { rotulo: 'Repetição', render: (c) => (c.nao_repetir_dias ? `não repete por ${c.nao_repetir_dias}d` : 'pode repetir') },
        { rotulo: 'Publicado', render: (c) => `${c.total_publicado || 0}<br>
            <span class="pequeno texto-fraco">${c.ultima_execucao ? dataHora(c.ultima_execucao) : 'nunca'}</span>` },
        { rotulo: 'Status', render: (c) => statusEtiqueta(c.status) },
        {
          rotulo: 'Ações', classe: 'acoes',
          render: (c) => acoes([
            { rotulo: '👁️', titulo: 'Ver produtos que ela pegaria', aoClicar: () => verProdutos(c) },
            { rotulo: '▶️', titulo: 'Rodar agora (1 rodada)', aoClicar: () => rodar(c) },
            {
              rotulo: c.status === 'ativa' ? '⏸️' : '✅',
              titulo: c.status === 'ativa' ? 'Pausar' : 'Ativar',
              aoClicar: async () => {
                await tentar(() => api.post(`/campanhas/${c.id}/${c.status === 'ativa' ? 'pausar' : 'ativar'}`),
                  c.status === 'ativa' ? 'Campanha pausada' : 'Campanha ativada');
                carregar();
              },
            },
            { rotulo: '✏️', titulo: 'Editar', aoClicar: () => abrir(c) },
            {
              rotulo: '🗑️', titulo: 'Remover', classe: 'btn-perigo',
              aoClicar: () => confirmar(`Remover a campanha "${c.nome}"?`, async () => {
                await tentar(() => api.del(`/campanhas/${c.id}`), 'Removida');
                carregar();
              }),
            },
          ]),
        },
      ],
      linhas: dados.rows,
    }));
  }

  async function rodar(campanha) {
    const r = await tentar(() => api.post(`/campanhas/${campanha.id}/executar`, { forcar: true }));
    if (!r) return;
    if (r.enfileiradas) ok(`${r.enfileiradas} publicação(ões) na fila`);
    else ok(`Nada enfileirado (${r.ignorado || r.ignorados?.map((i) => i.motivo).join(', ') || 'sem motivo'})`);
    carregar();
  }

  async function verProdutos(campanha) {
    const corpo = el('<div class="carregando">Selecionando…</div>');
    modal({ titulo: `Produtos de "${campanha.nome}"`, corpo, acoes: [{ rotulo: 'Fechar' }] });
    const r = await api.get(`/campanhas/${campanha.id}/produtos`, { limite: 50 });
    corpo.classList.remove('carregando');
    corpo.innerHTML = `<p class="pequeno texto-fraco">${r.rows.length} produto(s) entrariam nesta campanha agora.</p>`;
    corpo.appendChild(tabela({
      vazio: 'Nenhum produto bate com os filtros desta campanha.',
      colunas: [
        { rotulo: 'Produto', render: (p) => escapar(p.titulo_original) },
        { rotulo: 'Preço', render: (p) => moeda(p.preco_atual) },
        { rotulo: 'Desc.', render: (p) => (p.desconto_percentual ? `${p.desconto_percentual}%` : '—') },
        { rotulo: 'Score', render: (p) => Math.round(p.score || 0) },
      ],
      linhas: r.rows,
    }));
  }

  function abrir(campanha) {
    const campos = [
      { nome: 'nome', rotulo: 'Nome da campanha', obrigatorio: true, largura: 2 },
      { nome: 'modo', rotulo: 'Modo', tipo: 'select', opcoes: MODOS, largura: 2 },
      {
        nome: 'template_id', rotulo: 'Template', tipo: 'select',
        opcoes: [{ valor: '', rotulo: '— usar o padrão —' }, ...templates.rows.map((t) => ({ valor: t.id, rotulo: t.nome }))],
      },
      {
        nome: 'saved_search_id', rotulo: 'Pesquisa salva', tipo: 'select', dica: 'só no modo "por pesquisa"',
        opcoes: [{ valor: '', rotulo: '—' }, ...pesquisas.rows.map((p) => ({ valor: p.id, rotulo: p.nome }))],
      },
      { nome: 'f_termo', rotulo: 'Palavras-chave', dica: 'filtro' },
      { nome: 'f_categoria', rotulo: 'Categoria', dica: 'filtro' },
      { nome: 'f_marketplace', rotulo: 'Marketplace', dica: 'filtro' },
      { nome: 'f_preco_max', rotulo: 'Preço máximo', tipo: 'number', passo: '0.01' },
      { nome: 'f_desconto_min', rotulo: 'Desconto mínimo (%)', tipo: 'number' },
      { nome: 'f_avaliacao_min', rotulo: 'Avaliação mínima', tipo: 'number', passo: '0.1' },
      {
        nome: 'f_ordenacao', rotulo: 'Ordenar por', tipo: 'select',
        opcoes: [
          { valor: 'score', rotulo: 'melhor score' }, { valor: 'vendas', rotulo: 'mais vendidos' },
          { valor: 'desconto', rotulo: 'maior desconto' }, { valor: 'preco', rotulo: 'menor preço' },
          { valor: 'avaliacao', rotulo: 'melhor avaliação' }, { valor: 'recentes', rotulo: 'mais recentes' },
        ],
      },
      { nome: 'intervalo_minutos', rotulo: 'Intervalo (minutos)', tipo: 'number' },
      { nome: 'hora_inicio', rotulo: 'Hora inicial', dica: 'HH:MM' },
      { nome: 'hora_fim', rotulo: 'Hora final', dica: 'HH:MM' },
      { nome: 'limite_diario', rotulo: 'Máximo por dia', tipo: 'number' },
      {
        nome: 'nao_repetir_dias', rotulo: 'Não repetir produto por', tipo: 'select',
        opcoes: [
          { valor: 0, rotulo: 'pode repetir' }, { valor: 1, rotulo: '1 dia' }, { valor: 3, rotulo: '3 dias' },
          { valor: 7, rotulo: '7 dias' }, { valor: 15, rotulo: '15 dias' }, { valor: 30, rotulo: '30 dias' },
          { valor: 3650, rotulo: 'nunca repetir' },
        ],
      },
      { nome: 'loop', rotulo: 'Recomeçar a lista ao terminar (loop)', tipo: 'checkbox' },
      { nome: 'usar_ia', rotulo: 'Melhorar textos com IA', tipo: 'checkbox' },
      { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', linhas: 2, largura: 2 },
    ];

    const filtros = campanha?.filtros || {};
    const valores = campanha ? {
      ...campanha,
      f_termo: filtros.termo, f_categoria: filtros.categoria, f_marketplace: filtros.marketplace,
      f_preco_max: filtros.preco_max, f_desconto_min: filtros.desconto_min,
      f_avaliacao_min: filtros.avaliacao_min, f_ordenacao: filtros.ordenacao || 'score',
    } : {
      modo: 'automatica', intervalo_minutos: 30, hora_inicio: '08:00', hora_fim: '22:00',
      limite_diario: 20, nao_repetir_dias: 7, loop: true, f_ordenacao: 'score',
    };

    const form = formulario(campos, valores);
    const extras = el(`
      <div>
        <div class="campo"><label>Grupos de destino</label>
          <div>${canais.rows.map((c) => `
            <label class="check"><input type="checkbox" value="${c.id}"
              ${campanha?.alvos?.some((a) => a.channel_id === c.id) ? 'checked' : ''}>
              <span>${escapar(c.nome)} <span class="pequeno texto-fraco">(${c.intervalo_minutos}min, ${c.hora_inicio}–${c.hora_fim})</span></span>
            </label>`).join('')}
          </div>
        </div>
        <div class="campo"><label>Dias da semana <span class="dica">nenhum marcado = todos os dias</span></label>
          <div class="linha">${DIAS.map((d, i) => `
            <label class="check"><input type="checkbox" class="dia" value="${i}"
              ${campanha?.dias_semana?.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}
          </div>
        </div>
      </div>`);

    const corpo = el('<div></div>');
    corpo.appendChild(form);
    corpo.appendChild(extras);

    modal({
      titulo: campanha ? 'Editar campanha' : 'Nova campanha',
      corpo,
      acoes: [
        { rotulo: 'Cancelar' },
        {
          rotulo: 'Salvar', classe: 'btn-primario', principal: true,
          aoClicar: async () => {
            const dados = form.ler();
            const payload = {
              nome: dados.nome, modo: dados.modo, descricao: dados.descricao,
              template_id: dados.template_id || null,
              saved_search_id: dados.saved_search_id || null,
              intervalo_minutos: Number(dados.intervalo_minutos) || 30,
              hora_inicio: dados.hora_inicio || '08:00',
              hora_fim: dados.hora_fim || '22:00',
              limite_diario: Number(dados.limite_diario) || 20,
              nao_repetir_dias: Number(dados.nao_repetir_dias) || 0,
              loop: dados.loop, usar_ia: dados.usar_ia,
              filtros: {
                termo: dados.f_termo || undefined, categoria: dados.f_categoria || undefined,
                marketplace: dados.f_marketplace || undefined, preco_max: dados.f_preco_max || undefined,
                desconto_min: dados.f_desconto_min || undefined, avaliacao_min: dados.f_avaliacao_min || undefined,
                ordenacao: dados.f_ordenacao || 'score',
              },
              canais: [...extras.querySelectorAll('input[type=checkbox]:not(.dia):checked')].map((i) => i.value),
              dias_semana: [...extras.querySelectorAll('.dia:checked')].map((i) => Number(i.value)),
            };
            const guardados = sessionStorage.getItem('campanha_produtos');
            if (!campanha && guardados) {
              payload.produto_ids = JSON.parse(guardados);
              payload.modo = 'manual';
              sessionStorage.removeItem('campanha_produtos');
            }
            const r = await tentar(() => (campanha
              ? api.put(`/campanhas/${campanha.id}`, payload)
              : api.post('/campanhas', payload)), 'Campanha salva');
            if (r) carregar();
          },
        },
      ],
    });
  }

  cabecalho.querySelector('#nova').onclick = () => abrir(null);
  await carregar();

  if (location.hash.includes('novo=1')) {
    const ids = JSON.parse(sessionStorage.getItem('campanha_produtos') || '[]');
    if (ids.length) { abrir(null); ok(`${ids.length} produtos vão para esta campanha.`); }
    history.replaceState(null, '', '#/campanhas');
  }

  return tela;
}

function rotuloModo(modo) {
  return MODOS.find((m) => m.valor === modo)?.rotulo || modo;
}

export { erro };
