/** Mapa de rotas do painel (hash routing, sem dependência externa). */
import { renderComece } from './pages/comece.js';
import { renderLojas } from './pages/lojas.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderProdutos, renderBuscar } from './pages/produtos.js';
import { renderPromocoes, renderCupons } from './pages/promocoes.js';
import { renderCampanhas } from './pages/campanhas.js';
import { renderWhatsApp, renderCanais } from './pages/whatsapp.js';
import { renderTemplates } from './pages/templates.js';
import { renderFila, renderHistorico } from './pages/publicacoes.js';
import { renderSistema, renderStatus } from './pages/sistema.js';
import { paginaCrud } from './pages/crud.js';
import { escapar, moeda, dataCurta, etiqueta, statusEtiqueta } from './ui.js';

const renderCategorias = paginaCrud({
  titulo: 'Categorias',
  descricao: 'Organizam produtos, filtros e campanhas. Crie quantas quiser.',
  singular: 'categoria',
  rota: '/categorias',
  padrao: { ativo: true },
  campos: [
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
    { nome: 'nicho', rotulo: 'Nicho', dica: 'ex.: Beleza' },
    { nome: 'descricao', rotulo: 'Descrição', largura: 2 },
    { nome: 'ativo', rotulo: 'Ativa', tipo: 'checkbox' },
  ],
  colunas: [
    { rotulo: 'Nome', render: (c) => `<strong>${escapar(c.nome)}</strong>` },
    { rotulo: 'Slug', render: (c) => `<code class="pequeno">${escapar(c.slug)}</code>` },
    { rotulo: 'Nicho', campo: 'nicho' },
    { rotulo: 'Ativa', render: (c) => (c.ativo ? etiqueta('sim', 'ok') : etiqueta('não')) },
  ],
});

const renderPesquisas = paginaCrud({
  titulo: 'Pesquisas salvas',
  descricao: 'Uma pesquisa salva vira campanha automática em dois cliques.',
  singular: 'pesquisa',
  rota: '/pesquisas',
  campos: [
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true, largura: 2 },
    { nome: 'quantidade', rotulo: 'Quantidade de produtos', tipo: 'number' },
    {
      nome: 'ordenacao', rotulo: 'Ordenação', tipo: 'select',
      opcoes: ['score', 'vendas', 'desconto', 'preco', 'avaliacao', 'recentes'],
    },
    { nome: 'f_termo', rotulo: 'Palavras-chave', largura: 2 },
    { nome: 'f_categoria', rotulo: 'Categoria' },
    { nome: 'f_preco_max', rotulo: 'Preço máximo', tipo: 'number', passo: '0.01' },
    { nome: 'f_desconto_min', rotulo: 'Desconto mínimo (%)', tipo: 'number' },
    { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', linhas: 2, largura: 2 },
  ],
  aoSalvar: (dados) => ({
    nome: dados.nome,
    quantidade: Number(dados.quantidade) || 20,
    ordenacao: dados.ordenacao || 'score',
    observacoes: dados.observacoes,
    filtros: {
      termo: dados.f_termo || undefined,
      categoria: dados.f_categoria || undefined,
      preco_max: dados.f_preco_max || undefined,
      desconto_min: dados.f_desconto_min || undefined,
      ordenacao: dados.ordenacao || 'score',
    },
  }),
  colunas: [
    { rotulo: 'Nome', render: (p) => `<strong>${escapar(p.nome)}</strong>` },
    { rotulo: 'Filtros', render: (p) => `<span class="pequeno texto-fraco">${escapar(JSON.stringify(p.filtros || {}))}</span>` },
    { rotulo: 'Ordenação', campo: 'ordenacao' },
    { rotulo: 'Qtd', campo: 'quantidade' },
  ],
});


export const rotas = {
  '': { titulo: 'Dashboard', render: renderDashboard },
  comece: { titulo: 'Comece aqui', render: renderComece },
  produtos: { titulo: 'Produtos', render: renderProdutos },
  buscar: { titulo: 'Procurar produtos', render: renderBuscar },
  lojas: { titulo: 'Lojas', render: renderLojas },
  pesquisas: { titulo: 'Pesquisas salvas', render: renderPesquisas },
  categorias: { titulo: 'Categorias', render: renderCategorias },
  promocoes: { titulo: 'Promoções', render: renderPromocoes },
  cupons: { titulo: 'Cupons', render: renderCupons },
  campanhas: { titulo: 'Campanhas', render: renderCampanhas },
  whatsapp: { titulo: 'WhatsApp', render: renderWhatsApp },
  canais: { titulo: 'Grupos e canais', render: renderCanais },
  templates: { titulo: 'Templates e IA', render: renderTemplates },
  fila: { titulo: 'Fila de publicação', render: renderFila },
  historico: { titulo: 'Histórico', render: renderHistorico },
  sistema: { titulo: 'Sistema', render: renderSistema },
  status: { titulo: 'Status', render: renderStatus },
};

export { moeda, dataCurta };
