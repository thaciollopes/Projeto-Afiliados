import { api } from '../api.js';
import {
  el, escapar, moeda, dataCurta, modal, formulario, confirmar, tentar,
  tabela, acoes, statusEtiqueta, etiqueta,
} from '../ui.js';

// ---------------------------------------------------------- promocoes --

export async function renderPromocoes() {
  const [produtos, cupons] = await Promise.all([
    api.get('/produtos', { limite: 300, ordenar: 'titulo_original ASC' }),
    api.get('/cupons', { limite: 200 }),
  ]);

  const campos = [
    { nome: 'nome', rotulo: 'Nome da promoção', obrigatorio: true, largura: 2 },
    {
      nome: 'product_id', rotulo: 'Produto', tipo: 'select', largura: 2,
      opcoes: [{ valor: '', rotulo: '— sem produto específico —' },
        ...produtos.rows.map((p) => ({ valor: p.id, rotulo: `${p.titulo_original} (${moeda(p.preco_atual)})` }))],
    },
    { nome: 'preco_normal', rotulo: 'Preço normal (R$)', tipo: 'number', passo: '0.01', dica: 'o "de"' },
    { nome: 'preco_promocional', rotulo: 'Preço promocional (R$)', tipo: 'number', passo: '0.01', dica: 'o "por"' },
    {
      nome: 'coupon_id', rotulo: 'Cupom', tipo: 'select',
      opcoes: [{ valor: '', rotulo: '— sem cupom —' },
        ...cupons.rows.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.nome || c.tipo}` }))],
    },
    { nome: 'categoria', rotulo: 'Categoria' },
    { nome: 'data_inicio', rotulo: 'Início', tipo: 'datetime' },
    { nome: 'data_fim', rotulo: 'Fim', tipo: 'datetime', dica: 'promoção vencida não é publicada' },
    { nome: 'quantidade_limitada', rotulo: 'Quantidade limitada', tipo: 'number' },
    { nome: 'status', rotulo: 'Status', tipo: 'select', opcoes: ['ativa', 'pausada', 'programada', 'expirada'] },
    { nome: 'frete_gratis', rotulo: 'Frete grátis', tipo: 'checkbox' },
    { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', linhas: 3, largura: 2 },
  ];

  const tela = el('<div></div>');
  const cabecalho = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Promoções</h2>
        <p>Desconto não é obrigatório: dá para divulgar produto pelo preço normal, com cupom, ou os dois juntos.</p></div>
        <button class="btn-primario" id="nova">+ Nova promoção</button>
      </div>
      <div class="abas">
        <button class="aba ativa" data-status="">Todas</button>
        <button class="aba" data-status="ativa">Ativas</button>
        <button class="aba" data-status="programada">Programadas</button>
        <button class="aba" data-status="expirada">Expiradas</button>
        <button class="aba" data-status="pausada">Pausadas</button>
      </div>
    </div>`);
  tela.appendChild(cabecalho);

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  let filtroStatus = '';

  async function carregar() {
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    const dados = await api.get('/promocoes', { status: filtroStatus, limite: 200 });
    area.innerHTML = '';
    area.appendChild(tabela({
      vazio: 'Nenhuma promoção cadastrada.',
      colunas: [
        { rotulo: 'Promoção', render: (r) => `<strong>${escapar(r.nome)}</strong><br>
            <span class="pequeno texto-fraco">${escapar(r.produto?.titulo_original || 'sem produto')}</span>` },
        { rotulo: 'De / Por', render: (r) => `
            ${r.preco_normal ? `<s class="texto-fraco">${moeda(r.preco_normal)}</s><br>` : ''}
            <strong>${moeda(r.preco_promocional ?? r.produto?.preco_atual)}</strong>` },
        { rotulo: 'Cupom', render: (r) => (r.cupom ? `${etiqueta(r.cupom.codigo, 'info')}<br>
            <span class="pequeno texto-fraco">−${moeda(r.precos?.desconto_cupom)}</span>` : '—') },
        { rotulo: 'Preço final', render: (r) => `<strong style="color:var(--ok)">${moeda(r.precos?.preco_final)}</strong>` },
        { rotulo: 'Desconto', render: (r) => (r.precos?.desconto_percentual ? `${r.precos.desconto_percentual}%` : '—') },
        { rotulo: 'Validade', render: (r) => `${dataCurta(r.data_inicio)} → ${dataCurta(r.data_fim)}` },
        { rotulo: 'Estado', render: (r) => statusEtiqueta(r.estado) },
        {
          rotulo: 'Ações', classe: 'acoes',
          render: (r) => acoes([
            { rotulo: '✏️', titulo: 'Editar', aoClicar: () => abrir(r) },
            {
              rotulo: r.status === 'pausada' ? '▶️' : '⏸️',
              titulo: r.status === 'pausada' ? 'Ativar' : 'Pausar',
              aoClicar: async () => {
                await tentar(() => api.put(`/promocoes/${r.id}`, { status: r.status === 'pausada' ? 'ativa' : 'pausada' }), 'Atualizado');
                carregar();
              },
            },
            {
              rotulo: '🗑️', titulo: 'Remover', classe: 'btn-perigo',
              aoClicar: () => confirmar(`Remover "${r.nome}"?`, async () => {
                await tentar(() => api.del(`/promocoes/${r.id}`), 'Removida');
                carregar();
              }),
            },
          ]),
        },
      ],
      linhas: dados.rows,
    }));
  }

  function abrir(promocao) {
    const form = formulario(campos, promocao || { status: 'ativa' });
    modal({
      titulo: promocao ? 'Editar promoção' : 'Nova promoção',
      corpo: form,
      acoes: [
        { rotulo: 'Cancelar' },
        {
          rotulo: 'Salvar', classe: 'btn-primario', principal: true,
          aoClicar: async () => {
            const r = await tentar(() => (promocao
              ? api.put(`/promocoes/${promocao.id}`, form.ler())
              : api.post('/promocoes', form.ler())), 'Promoção salva');
            if (r) carregar();
          },
        },
      ],
    });
  }

  for (const aba of cabecalho.querySelectorAll('.aba')) {
    aba.onclick = () => {
      cabecalho.querySelectorAll('.aba').forEach((a) => a.classList.remove('ativa'));
      aba.classList.add('ativa');
      filtroStatus = aba.dataset.status;
      carregar();
    };
  }
  cabecalho.querySelector('#nova').onclick = () => abrir(null);

  await carregar();
  return tela;
}

// ------------------------------------------------------------- cupons --

export async function renderCupons() {
  const produtos = await api.get('/produtos', { limite: 300, ordenar: 'titulo_original ASC' });

  const campos = [
    { nome: 'codigo', rotulo: 'Código do cupom', obrigatorio: true, exemplo: 'PERFUME20' },
    { nome: 'nome', rotulo: 'Nome/descrição curta', largura: 2 },
    {
      nome: 'tipo', rotulo: 'Tipo', tipo: 'select',
      opcoes: [
        { valor: 'percentual', rotulo: 'Percentual (%)' },
        { valor: 'valor_fixo', rotulo: 'Valor fixo (R$)' },
        { valor: 'frete_gratis', rotulo: 'Frete grátis' },
        { valor: 'outro', rotulo: 'Outro' },
      ],
    },
    { nome: 'valor_desconto', rotulo: 'Valor do desconto', tipo: 'number', passo: '0.01', dica: '% ou R$ conforme o tipo' },
    { nome: 'valor_minimo', rotulo: 'Compra mínima (R$)', tipo: 'number', passo: '0.01' },
    { nome: 'desconto_maximo', rotulo: 'Desconto máximo (R$)', tipo: 'number', passo: '0.01', dica: 'só para percentual' },
    { nome: 'marketplace', rotulo: 'Marketplace' },
    { nome: 'origem', rotulo: 'Origem', tipo: 'select', opcoes: [{ valor: 'proprio', rotulo: 'Meu cupom' }, { valor: 'marketplace', rotulo: 'Do marketplace' }] },
    { nome: 'limite_uso', rotulo: 'Limite de uso', tipo: 'number' },
    { nome: 'data_inicio', rotulo: 'Início', tipo: 'datetime' },
    { nome: 'data_fim', rotulo: 'Fim', tipo: 'datetime', dica: 'cupom vencido some do post sozinho' },
    { nome: 'categorias_aplicaveis_txt', rotulo: 'Categorias aplicáveis', dica: 'separe por vírgula; vazio = todas', largura: 2 },
    { nome: 'link', rotulo: 'Link do cupom', largura: 2 },
    { nome: 'status', rotulo: 'Status', tipo: 'select', opcoes: ['ativo', 'pausado', 'expirado'] },
    { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', linhas: 3, largura: 2 },
  ];

  const tela = el('<div></div>');
  const cabecalho = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Cupons</h2>
        <p>Seus cupons e os do marketplace. O sistema confere validade e regras antes de colocar no post.</p></div>
        <button class="btn-primario" id="novo">+ Novo cupom</button>
      </div>
    </div>`);
  tela.appendChild(cabecalho);

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  async function carregar() {
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    const dados = await api.get('/cupons', { limite: 200 });
    area.innerHTML = '';
    area.appendChild(tabela({
      vazio: 'Nenhum cupom cadastrado.',
      colunas: [
        { rotulo: 'Código', render: (r) => `<strong>${escapar(r.codigo)}</strong><br><span class="pequeno texto-fraco">${escapar(r.nome || '')}</span>` },
        { rotulo: 'Tipo', render: (r) => etiqueta(rotuloTipo(r.tipo)) },
        { rotulo: 'Desconto', render: (r) => (r.tipo === 'percentual' ? `${r.valor_desconto}%` : r.tipo === 'frete_gratis' ? 'frete' : moeda(r.valor_desconto)) },
        { rotulo: 'Mínimo', render: (r) => (r.valor_minimo ? moeda(r.valor_minimo) : '—') },
        { rotulo: 'Aplica em', render: (r) => (r.categorias_aplicaveis?.length ? r.categorias_aplicaveis.join(', ') : 'todos os produtos') },
        { rotulo: 'Validade', render: (r) => `${dataCurta(r.data_inicio)} → ${dataCurta(r.data_fim)}` },
        { rotulo: 'Usos', render: (r) => `${r.usos || 0}${r.limite_uso ? ` / ${r.limite_uso}` : ''}` },
        { rotulo: 'Estado', render: (r) => statusEtiqueta(r.estado || r.status) },
        {
          rotulo: 'Ações', classe: 'acoes',
          render: (r) => acoes([
            { rotulo: '🎯', titulo: 'Ver produtos que aceitam', aoClicar: () => verAlcance(r) },
            { rotulo: '✏️', titulo: 'Editar', aoClicar: () => abrir(r) },
            {
              rotulo: '🗑️', titulo: 'Remover', classe: 'btn-perigo',
              aoClicar: () => confirmar(`Remover o cupom ${r.codigo}?`, async () => {
                await tentar(() => api.del(`/cupons/${r.id}`), 'Removido');
                carregar();
              }),
            },
          ]),
        },
      ],
      linhas: dados.rows,
    }));
  }

  function abrir(cupom) {
    const valores = cupom
      ? { ...cupom, categorias_aplicaveis_txt: (cupom.categorias_aplicaveis || []).join(', ') }
      : { tipo: 'percentual', status: 'ativo', origem: 'proprio' };

    const form = formulario(campos, valores);
    modal({
      titulo: cupom ? 'Editar cupom' : 'Novo cupom',
      corpo: form,
      acoes: [
        { rotulo: 'Cancelar' },
        {
          rotulo: 'Salvar', classe: 'btn-primario', principal: true,
          aoClicar: async () => {
            const dados = form.ler();
            dados.categorias_aplicaveis = (dados.categorias_aplicaveis_txt || '')
              .split(',').map((c) => c.trim()).filter(Boolean);
            delete dados.categorias_aplicaveis_txt;
            const r = await tentar(() => (cupom
              ? api.put(`/cupons/${cupom.id}`, dados)
              : api.post('/cupons', dados)), 'Cupom salvo');
            if (r) carregar();
          },
        },
      ],
    });
  }

  async function verAlcance(cupom) {
    const corpo = el('<div class="carregando">Calculando…</div>');
    modal({ titulo: `Produtos que aceitam ${cupom.codigo}`, corpo, acoes: [{ rotulo: 'Fechar' }] });
    const r = await api.get(`/cupons/${cupom.id}/alcance`);
    corpo.classList.remove('carregando');
    corpo.innerHTML = `<p class="pequeno texto-fraco">${r.aplicaveis} de ${r.total} produtos ativos atendem às regras.</p>`;
    corpo.appendChild(tabela({
      vazio: 'Nenhum produto atende às regras deste cupom.',
      colunas: [
        { rotulo: 'Produto', render: (p) => escapar(p.titulo_original) },
        { rotulo: 'Preço', render: (p) => moeda(p.preco_atual) },
        { rotulo: 'Categoria', campo: 'categoria' },
      ],
      linhas: r.produtos,
    }));
  }

  cabecalho.querySelector('#novo').onclick = () => abrir(null);
  await carregar();
  return tela;
}

function rotuloTipo(tipo) {
  return { percentual: 'percentual', valor_fixo: 'valor fixo', frete_gratis: 'frete grátis', outro: 'outro' }[tipo] || tipo;
}
