/** Cliente da API. Unico lugar do front que fala HTTP. */

const BASE = '/api';

function token() {
  return localStorage.getItem('app_token') || '';
}

// /api/config e liberado sem token, entao o 401 so aparece nas outras rotas.
// Varias chamadas falham juntas: pergunta uma vez so e recarrega com o token novo.
let pedindoToken = false;
function pedirToken() {
  if (pedindoToken) return;
  pedindoToken = true;
  const valor = prompt(token()
    ? 'Token de acesso recusado. Digite o APP_TOKEN de novo:'
    : 'Este painel exige token de acesso (APP_TOKEN do .env):');
  if (valor) {
    localStorage.setItem('app_token', valor.trim());
    location.reload();
  }
}

async function request(caminho, { method = 'GET', body, query } = {}) {
  let url = `${BASE}${caminho}`;
  if (query) {
    const limpos = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (limpos.length) url += `?${new URLSearchParams(limpos)}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { 'x-api-token': token() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const texto = await res.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { raw: texto }; }

  if (res.status === 401 && dados?.codigo === 'NAO_AUTORIZADO') pedirToken();

  if (!res.ok) {
    const erro = new Error(dados?.erro || `Erro ${res.status}`);
    erro.status = res.status;
    erro.detalhes = dados?.detalhes;
    throw erro;
  }
  return dados;
}

export const api = {
  get: (caminho, query) => request(caminho, { query }),
  post: (caminho, body) => request(caminho, { method: 'POST', body }),
  put: (caminho, body) => request(caminho, { method: 'PUT', body }),
  del: (caminho) => request(caminho, { method: 'DELETE' }),
  setToken: (valor) => localStorage.setItem('app_token', valor || ''),
  /** Para links abertos direto pelo navegador (download), que nao mandam cabecalho. */
  comToken: (url) => (token() ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token())}` : url),
};
