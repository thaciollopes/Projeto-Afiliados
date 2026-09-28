/**
 * Popup da extensao: injeta o extrator na aba aberta e manda o que achou
 * para a Plataforma de Afiliados.
 */
import { conectarLoja, detectarEtiqueta, DOMINIOS } from './conectar.js';

const $ = (id) => document.getElementById(id);

/** Painel com senha (APP_TOKEN, obrigatório numa VPS) recusa sem este cabeçalho. */
function cabecalhos() {
  const token = $('token').value.trim();
  return { 'Content-Type': 'application/json', ...(token ? { 'x-api-token': token } : {}) };
}

function explicarRecusa(status) {
  if (status === 401) return 'O painel pediu o token de acesso — preencha o campo "Token" abaixo.';
  return `O painel respondeu ${status}`;
}

/** Qual loja esta na aba aberta agora. */
async function lojaDaAba() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = new URL(aba.url).hostname;
  return Object.keys(DOMINIOS).find((loja) => host.includes(DOMINIOS[loja].split('.')[0])) || null;
}

async function prepararConexao() {
  const loja = await lojaDaAba();
  const card = $('card-conectar');

  if (!loja) {
    card.style.display = 'none';
    return;
  }

  $('conectar').textContent = `Conectar ${loja} ao painel`;
  $('conectar').onclick = async () => {
    const status = $('status-conexao');
    status.textContent = 'Lendo a sua sessão…';
    status.className = 'fraco';

    try {
      const api = $('api').value.replace(/\/+$/, '');
      const r = await conectarLoja(loja, api, cabecalhos());
      const etiqueta = await detectarEtiqueta(loja);

      status.innerHTML = `<span class="ok">✅ Conectado — ${r.total_cookies} cookies salvos`
        + `${etiqueta ? `<br>conta: ${etiqueta}` : ''}</span>`;
    } catch (e) {
      status.innerHTML = `<span class="erro">❌ ${e.message}</span>`;
    }
  };
}

chrome.storage.local.get(['api', 'token'], (guardado) => {
  if (guardado.api) $('api').value = guardado.api;
  if (guardado.token) $('token').value = guardado.token;
});
$('api').addEventListener('change', () => {
  chrome.storage.local.set({ api: $('api').value.replace(/\/+$/, '') });
});
$('token').addEventListener('change', () => {
  chrome.storage.local.set({ token: $('token').value.trim() });
});

async function lerPagina() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [resultado] = await chrome.scripting.executeScript({
    target: { tabId: aba.id },
    files: ['extrator.js'],
  });
  return { aba, dados: resultado?.result };
}

async function analisar() {
  try {
    const { dados } = await lerPagina();
    if (!dados || dados.erro) {
      $('pagina').textContent = dados?.erro || 'Não consegui ler esta página.';
      $('contagem').textContent = 'Abra uma lista de produtos do Mercado Livre, Shopee, Amazon ou Magalu.';
      return null;
    }
    $('pagina').textContent = dados.loja.toUpperCase();
    $('contagem').textContent = `${dados.produtos.length} produto(s) prontos para capturar`;
    $('capturar').disabled = dados.produtos.length === 0;
    return dados;
  } catch (e) {
    $('pagina').textContent = 'Erro ao ler a página';
    $('contagem').textContent = e.message;
    return null;
  }
}

$('capturar').onclick = async () => {
  const dados = await analisar();
  if (!dados?.produtos.length) return;

  $('resultado').innerHTML = '<span class="fraco">Enviando para o painel…</span>';
  $('capturar').disabled = true;

  try {
    const base = $('api').value.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/produtos/importar`, {
      method: 'POST',
      headers: cabecalhos(),
      body: JSON.stringify({ produtos: dados.produtos, origem: 'extensao' }),
    });

    if (!res.ok) throw new Error(explicarRecusa(res.status));
    const r = await res.json();

    // O link de afiliado (meli.la, s.shopee) é gerado na hora pelo cookie:
    // mostra se deu, para ninguém publicar achando que tem comissão.
    const links = Object.entries(r.conversao || {}).map(([loja, c]) => (c.erro
      ? `<br><span class="erro">⚠️ ${loja}: link de afiliado não gerado — ${c.erro}</span>`
      : `<br><span class="fraco">🔗 ${loja}: ${c.convertidos || 0} link(s) de afiliado gerados</span>`)).join('');

    $('resultado').innerHTML = `<span class="ok"><b>✅ ${r.criados} novos</b> · `
      + `${r.atualizados} já existiam (atualizados)</span>${links}`;
  } catch (e) {
    $('resultado').innerHTML = `<span class="erro">❌ ${e.message}</span>`
      + '<br><span class="fraco">O painel está aberto? (INICIAR.bat)</span>';
  } finally {
    $('capturar').disabled = false;
  }
};

$('ver').onclick = async () => {
  const dados = await analisar();
  if (!dados?.produtos.length) return;

  const lista = dados.produtos.slice(0, 5)
    .map((p) => `• ${p.titulo_original.slice(0, 38)}<br><span class="fraco">R$ ${p.preco_atual}`
      + `${p.preco_anterior ? ` (de R$ ${p.preco_anterior})` : ''}</span>`)
    .join('<br>');

  $('resultado').innerHTML = `<b>${dados.produtos.length} encontrados:</b><br>${lista}`
    + (dados.produtos.length > 5 ? '<br><span class="fraco">…</span>' : '');
};

analisar();
prepararConexao();
