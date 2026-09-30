/**
 * API oficial de afiliados da Shopee (Open API, GraphQL). E o mesmo caminho
 * que ferramentas como o Divulga Links usam: com o AppID e a Senha do painel
 * de afiliados (affiliate.shopee.com.br → Open API), o sistema busca ofertas
 * ja com imagem, preco, comissao e o SEU link s.shopee.com.br.
 *
 * Autenticacao (doc da Shopee): cada chamada leva
 *   Authorization: SHA256 Credential=<AppID>, Timestamp=<unix>, Signature=<assinatura>
 * com assinatura = sha256(AppID + Timestamp + corpo JSON exato + Senha).
 */
import crypto from 'node:crypto';

export const SHOPEE_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';

/** Ordenacao do productOfferV2 (valores da doc da Shopee). */
export const ORDENACAO_SHOPEE = {
  relevancia: 1,
  vendas: 2,
  preco_desc: 3,
  preco: 4,
  comissao: 5,
};

const CAMPOS_OFERTA = `
  itemId productName commissionRate commission price priceMin priceMax
  priceDiscountRate sales ratingStar imageUrl shopName productLink offerLink`;

export function assinar({ appId, senha, corpo, timestamp }) {
  return crypto.createHash('sha256').update(`${appId}${timestamp}${corpo}${senha}`).digest('hex');
}

export async function consultar(credenciais, query, variables = {}, { fetchImpl = fetch } = {}) {
  const { app_id: appId, senha } = credenciais || {};
  if (!appId || !senha) throw new Error('Shopee: falta o AppID ou a Senha da API (tela LOJAS).');

  // A assinatura e sobre o corpo EXATO enviado: serializa uma vez so.
  const corpo = JSON.stringify({ query, variables });
  const timestamp = Math.floor(Date.now() / 1000);
  const assinatura = assinar({ appId, senha, corpo, timestamp });

  const res = await fetchImpl(SHOPEE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${assinatura}`,
    },
    body: corpo,
    signal: AbortSignal.timeout(30000),
  });

  let dados = null;
  try { dados = await res.json(); } catch { /* corpo vazio ou HTML */ }
  const erroApi = dados?.errors?.[0];
  if (erroApi) {
    const codigo = erroApi.extensions?.code;
    const msg = erroApi.extensions?.message || erroApi.message || 'erro desconhecido';
    throw new Error(`Shopee API${codigo ? ` (${codigo})` : ''}: ${traduzirErro(codigo, msg)}`);
  }
  if (!res.ok) throw new Error(`Shopee API: HTTP ${res.status}`);
  return dados?.data || {};
}

/** Codigos da doc: 10020 = assinatura/credencial invalida; 10030 = limite de chamadas. */
function traduzirErro(codigo, msg) {
  if (codigo === 10020) return 'AppID ou Senha recusados. Confira no painel de afiliados → Open API.';
  if (codigo === 10030) return 'limite de chamadas da API atingido. Espere alguns minutos.';
  return msg;
}

/**
 * Ofertas por palavra-chave. Devolve os nodes crus da Shopee + se ha proxima pagina.
 */
export async function buscarOfertas(credenciais, {
  termo = '', ordenacao = 'vendas', pagina = 1, limite = 20,
} = {}, opcoes = {}) {
  const query = `query ($keyword: String, $sortType: Int, $page: Int, $limit: Int) {
    productOfferV2(keyword: $keyword, sortType: $sortType, page: $page, limit: $limit) {
      nodes { ${CAMPOS_OFERTA} }
      pageInfo { page limit hasNextPage }
    }
  }`;
  const variables = {
    keyword: String(termo || '').trim() || undefined,
    sortType: ORDENACAO_SHOPEE[ordenacao] || ORDENACAO_SHOPEE.vendas,
    page: Math.max(1, Number(pagina) || 1),
    limit: Math.min(Math.max(1, Number(limite) || 20), 50),
  };
  const data = await consultar(credenciais, query, variables, opcoes);
  return {
    nodes: data.productOfferV2?.nodes || [],
    temMais: Boolean(data.productOfferV2?.pageInfo?.hasNextPage),
  };
}

/** Link curto s.shopee.com.br para qualquer link de produto (sub IDs opcionais). */
export async function gerarLinkCurto(credenciais, url, subIds = [], opcoes = {}) {
  const query = `mutation ($input: ShortLinkInput!) {
    generateShortLink(input: $input) { shortLink }
  }`;
  const input = { originUrl: url, subIds: subIds.filter(Boolean).slice(0, 5) };
  const data = await consultar(credenciais, query, { input }, opcoes);
  const link = data.generateShortLink?.shortLink;
  if (!link) throw new Error('Shopee API nao devolveu o link curto.');
  return link;
}

/**
 * Node da Shopee → formato cru que o adapter normaliza. O preco "De" sai da
 * taxa de desconto que a propria Shopee informa (preco / (1 - taxa)); sem
 * taxa, fica sem "De" — nunca inventado.
 */
export function ofertaParaProduto(node) {
  const preco = paraNumero(node.priceMin ?? node.price);
  const taxa = Number(node.priceDiscountRate) || 0;
  const anterior = preco && taxa > 0 && taxa < 100 ? Math.round((preco / (1 - taxa / 100)) * 100) / 100 : null;
  const comissao = Number(node.commissionRate);
  return {
    external_id: String(node.itemId),
    titulo: String(node.productName || '').trim(),
    imagem: node.imageUrl || null,
    url: node.productLink || null,
    url_afiliado: node.offerLink || null,
    preco,
    preco_anterior: anterior && anterior > preco ? anterior : null,
    avaliacao: paraNumero(node.ratingStar),
    vendas: paraNumero(node.sales),
    comissao_percentual: Number.isFinite(comissao) ? Math.round(comissao * 10000) / 100 : null,
    loja: node.shopName || null,
    disponibilidade: 'disponivel',
  };
}

function paraNumero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
