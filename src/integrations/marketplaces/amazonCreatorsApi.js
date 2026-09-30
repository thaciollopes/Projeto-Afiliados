/**
 * Amazon Creators API — a API oficial que substituiu a PA-API 5 (desligada em
 * maio/2026). OPCIONAL: a Amazon so libera para associado com cadastro aceito e
 * pelo menos 10 vendas qualificadas nos ultimos 30 dias. Sem ela, o sistema
 * continua pela busca e pela lista de links (amazonListaService).
 *
 * Autenticacao OAuth 2.0 client_credentials; o token vale 1 hora (fica em cache).
 * Credenciais 2.x: Cognito, cabecalho "Bearer <token>, Version <versao>".
 * Credenciais 3.x: Login with Amazon, cabecalho "Bearer <token>".
 * O Brasil fica na regiao NA (mesmas credenciais de US/CA/MX).
 */

export const CREATORS_API_URL = 'https://creatorsapi.amazon/catalog/v1';
const TOKEN_V2_NA = 'https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token';
const TOKEN_V3_NA = 'https://api.amazon.com/auth/o2/token';
const MARKETPLACE = 'www.amazon.com.br';

const RECURSOS = [
  'itemInfo.title',
  'itemInfo.byLineInfo',
  'images.primary.large',
  'offersV2.listings.price',
  'offersV2.listings.availability',
  'customerReviews.starRating',
  'customerReviews.count',
];

const tokens = new Map();

function ehV3(versao) {
  return String(versao || '').trim().startsWith('3');
}

async function obterToken({ credential_id: id, secret, versao }, fetchImpl) {
  const chave = `${id}:${versao}`;
  const guardado = tokens.get(chave);
  if (guardado && guardado.expira > Date.now() + 60000) return guardado.token;

  const v3 = ehV3(versao);
  const res = await fetchImpl(v3 ? TOKEN_V3_NA : TOKEN_V2_NA, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(v3 ? {} : { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` }),
    },
    body: new URLSearchParams(v3
      ? { grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'creatorsapi::default' }
      : { grant_type: 'client_credentials', scope: 'creatorsapi/default' }).toString(),
    signal: AbortSignal.timeout(20000),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok || !dados.access_token) {
    throw new Error(`Amazon: credencial recusada (${dados.error_description || dados.error || `HTTP ${res.status}`}).`);
  }
  tokens.set(chave, { token: dados.access_token, expira: Date.now() + (Number(dados.expires_in) || 3600) * 1000 });
  return dados.access_token;
}

async function chamar(credenciais, operacao, corpo, { fetchImpl = fetch } = {}) {
  if (!credenciais?.credential_id || !credenciais?.secret) throw new Error('Amazon: falta a credencial da Creators API.');
  if (!credenciais.tag) throw new Error('Amazon: salve a sua tag de associado antes (ela vai em cada link).');
  const token = await obterToken(credenciais, fetchImpl);
  const res = await fetchImpl(`${CREATORS_API_URL}/${operacao}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-marketplace': MARKETPLACE,
      Authorization: ehV3(credenciais.versao) ? `Bearer ${token}` : `Bearer ${token}, Version ${credenciais.versao}`,
    },
    body: JSON.stringify({ partnerTag: credenciais.tag, marketplace: MARKETPLACE, resources: RECURSOS, ...corpo }),
    signal: AbortSignal.timeout(30000),
  });
  const dados = await res.json().catch(() => ({}));
  const erro = dados.errors?.[0] || dados.Errors?.[0];
  if (!res.ok || (erro && !dados.searchResult && !dados.itemsResult)) {
    throw new Error(`Amazon API: ${erro?.message || erro?.Message || `HTTP ${res.status}`}`);
  }
  return dados;
}

/** Ate 10 por chamada (limite da Amazon). */
export async function buscarItens(credenciais, termo, opcoes = {}) {
  const dados = await chamar(credenciais, 'searchItems', { keywords: termo, itemCount: 10 }, opcoes);
  return (dados.searchResult?.items || []).map(itemParaProduto).filter(Boolean);
}

/** ASINs em lotes de 10. */
export async function buscarPorAsins(credenciais, asins, opcoes = {}) {
  const produtos = [];
  for (let i = 0; i < asins.length; i += 10) {
    const dados = await chamar(credenciais, 'getItems', { itemIds: asins.slice(i, i + 10) }, opcoes);
    produtos.push(...(dados.itemsResult?.items || []).map(itemParaProduto).filter(Boolean));
  }
  return produtos;
}

/** Item da API → formato cru do adapter. O link ja vem com a sua tag. */
export function itemParaProduto(item) {
  const listagem = item?.offersV2?.listings?.[0];
  const preco = Number(listagem?.price?.money?.amount);
  const titulo = item?.itemInfo?.title?.displayValue;
  if (!item?.asin || !titulo || !Number.isFinite(preco)) return null;
  const economia = Number(listagem?.price?.savings?.money?.amount);
  const anterior = Number.isFinite(economia) && economia > 0 ? Math.round((preco + economia) * 100) / 100 : null;
  return {
    external_id: item.asin,
    titulo,
    imagem: item.images?.primary?.large?.url || null,
    url: `https://www.amazon.com.br/dp/${item.asin}`,
    url_afiliado: item.detailPageURL || null,
    preco,
    preco_anterior: anterior,
    avaliacao: Number(item.customerReviews?.starRating?.value) || null,
    quantidade_avaliacoes: Number(item.customerReviews?.count) || null,
    disponibilidade: 'disponivel',
  };
}

export function limparTokensAmazon() {
  tokens.clear();
}
