/** Arranque do painel: menu, tema, rotas e estado global leve. */
import { api } from './api.js';
import { erro } from './ui.js';
import { rotas } from './router.js';

export const estado = { config: null, alertas: 0 };

const MENU = [
  { grupo: 'Principal', itens: [
    { rota: 'comece', icone: '🚀', rotulo: 'Comece aqui' },
    { rota: '', icone: '📊', rotulo: 'Dashboard' },
  ] },
  { grupo: 'Lojas', itens: [
    { rota: 'lojas', icone: '🏬', rotulo: 'Minhas lojas' },
  ] },
  { grupo: 'Produtos', itens: [
    { rota: 'produtos', icone: '📦', rotulo: 'Todos os produtos' },
    { rota: 'buscar', icone: '🔍', rotulo: 'Procurar produtos' },
    { rota: 'pesquisas', icone: '💾', rotulo: 'Pesquisas salvas' },
    { rota: 'categorias', icone: '🗂️', rotulo: 'Categorias' },
  ] },
  { grupo: 'Promoções', itens: [
    { rota: 'promocoes', icone: '🏷️', rotulo: 'Promoções' },
    { rota: 'cupons', icone: '🎟️', rotulo: 'Cupons' },
  ] },
  { grupo: 'Campanhas', itens: [
    { rota: 'campanhas', icone: '🚀', rotulo: 'Campanhas' },
  ] },
  { grupo: 'WhatsApp', itens: [
    { rota: 'whatsapp', icone: '🟢', rotulo: 'Conexão' },
    { rota: 'canais', icone: '👥', rotulo: 'Grupos e canais' },
  ] },
  { grupo: 'Conteúdo', itens: [
    { rota: 'templates', icone: '✍️', rotulo: 'Templates e IA' },
  ] },
  { grupo: 'Publicações', itens: [
    { rota: 'fila', icone: '⏱️', rotulo: 'Fila' },
    { rota: 'historico', icone: '📜', rotulo: 'Histórico e erros' },
  ] },
  { grupo: 'Sistema', itens: [
    { rota: 'sistema', icone: '⚙️', rotulo: 'Configurações' },
    { rota: 'status', icone: '🩺', rotulo: 'Status' },
  ] },
];

function montarMenu() {
  const nav = document.getElementById('menu');
  nav.innerHTML = MENU.map((grupo) => `
    <div class="menu-grupo">${grupo.grupo}</div>
    ${grupo.itens.map((item) => `
      <a class="menu-item" href="#/${item.rota}" data-rota="${item.rota}">
        <span class="ic">${item.icone}</span><span>${item.rotulo}</span>
      </a>`).join('')}
  `).join('');
}

function marcarMenuAtivo(rota) {
  for (const item of document.querySelectorAll('.menu-item')) {
    item.classList.toggle('ativo', item.dataset.rota === rota);
  }
}

async function navegar() {
  const caminho = location.hash.replace(/^#\/?/, '').split('?')[0];
  const [rota] = caminho.split('/');
  const pagina = rotas[rota] || rotas[''];

  marcarMenuAtivo(rota);
  document.getElementById('titulo-pagina').textContent = pagina.titulo;
  document.getElementById('sidebar').classList.remove('aberta');

  const alvo = document.getElementById('pagina');
  alvo.innerHTML = '<div class="carregando">Carregando…</div>';

  try {
    const conteudo = await pagina.render({ params: caminho.split('/').slice(1) });
    alvo.innerHTML = '';
    alvo.appendChild(conteudo);
  } catch (e) {
    alvo.innerHTML = `<div class="cartao"><h2>Não consegui abrir esta página</h2>
      <p class="texto-fraco">${e.message}</p></div>`;
    erro(e.message);
  }
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  localStorage.setItem('tema', tema);
}

async function carregarConfig() {
  try {
    estado.config = await api.get('/config');
    document.getElementById('brand-modo').textContent =
      estado.config.dryRun ? 'modo simulação' : 'envio real';
    document.getElementById('chip-dry').hidden = !estado.config.dryRun;
    document.getElementById('versao').textContent = estado.config.env === 'production' ? 'prod' : 'dev';
  } catch (e) {
    if (e.status === 401) {
      const token = prompt('Este painel exige token de acesso (APP_TOKEN do .env):');
      if (token) { api.setToken(token); location.reload(); return; }
    }
    erro(`Não consegui falar com o servidor: ${e.message}`);
  }
}

export async function atualizarAlertas() {
  try {
    const { total } = await api.get('/sistema/alertas', { lido: 'false', limite: 1 });
    estado.alertas = total;
    const badge = document.getElementById('badge-alertas');
    badge.textContent = total;
    badge.hidden = !total;
  } catch { /* alerta nao e critico */ }
}

/** Sem hash na URL e sistema ainda nao configurado -> abre o roteiro. */
async function primeiraVisita() {
  if (location.hash && location.hash !== '#/') return;
  try {
    const passos = await api.get('/sistema/primeiros-passos');
    if (!passos.tudo_pronto) location.hash = '#/comece';
  } catch { /* se falhar, segue para o dashboard normalmente */ }
}

function ligarEventos() {
  document.getElementById('btn-tema').onclick = () => {
    aplicarTema(document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro');
  };
  document.getElementById('btn-menu').onclick = () => {
    document.getElementById('sidebar').classList.toggle('aberta');
  };
  document.getElementById('btn-atualizar').onclick = () => navegar();
  document.getElementById('btn-alertas').onclick = () => { location.hash = '#/status'; };
  window.addEventListener('hashchange', navegar);
}

async function iniciar() {
  aplicarTema(localStorage.getItem('tema') || 'claro');
  montarMenu();
  ligarEventos();
  await carregarConfig();
  await primeiraVisita();
  await navegar();
  atualizarAlertas();
  setInterval(atualizarAlertas, 60000);
}

iniciar();
