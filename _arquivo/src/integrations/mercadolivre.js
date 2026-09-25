/**
 * Mercado Livre — busca real via API oficial.
 *
 * Autenticação: a busca exige `Authorization: Bearer`. O caminho documentado é
 * `authorization_code` + `refresh_token`:
 *
 *   1. você autoriza uma vez no navegador  -> volta um `code`
 *   2. o sistema troca o code por access_token + refresh_token
 *   3. daí em diante ele renova sozinho (access_token dura ~6h,
 *      refresh_token dura ~6 meses)
 *
 * O DevCenter também oferece `client_credentials` para algumas aplicações. Ele
 * dispensa a autorização manual, então tentamos primeiro; se a aplicação não
 * tiver esse fluxo, caímos no caminho de cima sem quebrar nada.
 * PKCE é suportado: se a aplicação exigir, o desafio vai junto sozinho.
 *
 * client_id/secret ficam no .env; os tokens (que mudam sozinhos) ficam na
 * tabela `settings`, porque seria errado reescrever o .env a cada 6 horas.
 */
import { createHash, randomBytes } from 'node:crypto';
import { MarketplaceAdapter } from './base.js';
import { settingRepository } from '../../core/repositories/index.js';
import { logger } from '../../core/utils/logger.js';

const log = logger.child('mercadolivre');

const AUTH_URL = 'https://auth.mercadolivre.com.br/authorization';
const API = 'https://api.mercadolibre.com';
const CHAVE_TOKENS = 'mercadolivre_tokens';
const CHAVE_PKCE = 'mercadolivre_pkce';
const CHAVE_STATE = 'mercadolivre_state';
const SITE = 'MLB'; // Brasil

export class MercadoLivreAdapter extends MarketplaceAdapter {
  constructor(credenciais = {}) {
    const temCredenciais = Boolean(credenciais.clientId && credenciais.clientSecret);
    super({
      nome: 'mercadolivre',
      rotulo: 'Mercado Livre',
      implementado: temCredenciais,
      motivo: temCredenciais
        ? ''
        : 'Faltam MERCADOLIVRE_CLIENT_ID e MERCADOLIVRE_CLIENT_SECRET no .env.',
      docs: 'https://developers.mercadolivre.com.br/pt_br/itens-e-buscas',
    });
    this.clientId = credenciais.clientId || '';
    this.clientSecret = credenciais.clientSecret || '';
    this.redirectUri = credenciais.redirectUri || '';
  }

  // ----------------------------------------------------------- OAuth --

  /**
   * Passo 1: a URL que o usuário abre para autorizar o app.
   *
   * Se a aplicação estiver marcada como "PKCE necessário" no DevCenter, o
   * desafio vai junto e o verificador fica guardado para a troca do code.
   * Sem PKCE marcado, isto é inofensivo — o ML simplesmente ignora.
   */
  authorizationUrl(redirectUri = this.redirectUri, { pkce = true } = {}) {
    if (!this.clientId) throw new Error('MERCADOLIVRE_CLIENT_ID não configurado no .env');

    const url = new URL(AUTH_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    if (redirectUri) url.searchParams.set('redirect_uri', redirectUri);

    // `state` amarra a volta ao pedido que saiu daqui: sem isso, qualquer um
    // poderia chamar o callback com um code proprio e plugar a conta dele.
    const state = base64url(randomBytes(16));
    settingRepository.set(CHAVE_STATE, { state, criado_em: Date.now() });
    url.searchParams.set('state', state);

    if (pkce) {
      const verifier = base64url(randomBytes(32));
      const challenge = base64url(createHash('sha256').update(verifier).digest());
      settingRepository.set(CHAVE_PKCE, { verifier, criado_em: Date.now() });
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    return url.toString();
  }

  /** Confere o `state` da volta. Vale 15 minutos e serve uma vez so. */
  validateState(state) {
    const guardado = settingRepository.get(CHAVE_STATE);
    if (!guardado?.state) throw new Error('Nenhuma autorizacao em andamento. Comece de novo pelo painel.');
    if (Date.now() - Number(guardado.criado_em || 0) > 15 * 60000) {
      settingRepository.remove(CHAVE_STATE);
      throw new Error('A autorizacao expirou (mais de 15 minutos). Comece de novo pelo painel.');
    }
    if (String(state) !== guardado.state) throw new Error('Autorizacao nao confere com a que saiu daqui.');
    settingRepository.remove(CHAVE_STATE);
    return true;
  }

  /** Passo 2: troca o `code` (que veio na volta) por tokens. */
  async exchangeCode(code, redirectUri = this.redirectUri) {
    const pkce = settingRepository.get(CHAVE_PKCE);

    const tokens = await this.tokenRequest({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      ...(pkce?.verifier ? { code_verifier: pkce.verifier } : {}),
    });

    settingRepository.remove(CHAVE_PKCE);
    this.saveTokens(tokens);
    log.info('Mercado Livre conectado', { user_id: tokens.user_id });
    return { conectado: true, user_id: tokens.user_id, expira_em: tokens.expires_in };
  }

  /**
   * Caminho sem navegador, quando a aplicação tem o fluxo "Client Credentials"
   * habilitado: o token sai direto de client_id + secret, sem autorização
   * manual. Nem toda aplicação recebe esse fluxo, por isso é uma tentativa —
   * falhou, o sistema segue pedindo a autorização normal.
   */
  async authenticateWithClientCredentials() {
    const tokens = await this.tokenRequest({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    this.saveTokens(tokens);
    log.info('Mercado Livre autenticado por client_credentials (sem autorização manual)');
    return { conectado: true, modo: 'client_credentials', expira_em: tokens.expires_in };
  }

  async refresh() {
    const guardados = settingRepository.get(CHAVE_TOKENS);

    if (!guardados?.refresh_token) {
      // Token de client_credentials não tem refresh: renova pegando outro.
      if (guardados?.modo === 'client_credentials') {
        const novos = await this.authenticateWithClientCredentials();
        return settingRepository.get(CHAVE_TOKENS) || novos;
      }
      throw new Error('Mercado Livre nunca foi conectado. Autorize o app no painel (Lojas conectadas → Conectar).');
    }
    const tokens = await this.tokenRequest({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: guardados.refresh_token,
    });
    this.saveTokens(tokens);
    log.info('Token do Mercado Livre renovado');
    return tokens;
  }

  async tokenRequest(campos) {
    const res = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams(campos).toString(),
      signal: AbortSignal.timeout(20000),
    });

    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detalhe = dados?.message || dados?.error_description || dados?.error || `HTTP ${res.status}`;
      throw new Error(`Mercado Livre recusou a autenticação: ${detalhe}`);
    }
    return dados;
  }

  saveTokens(tokens, modo = tokens.refresh_token ? 'authorization_code' : 'client_credentials') {
    settingRepository.set(CHAVE_TOKENS, {
      modo,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user_id: tokens.user_id,
      // Renova 5 minutos antes de vencer, para não estourar no meio de uma busca.
      expira_em: Date.now() + (Number(tokens.expires_in || 21600) - 300) * 1000,
      atualizado_em: new Date().toISOString(),
    });
  }

  /** Token válido, renovando sozinho quando necessário. */
  async accessToken() {
    const guardados = settingRepository.get(CHAVE_TOKENS);

    if (!guardados?.access_token) {
      // Talvez a aplicação tenha o fluxo client_credentials: vale a tentativa
      // antes de mandar o usuário autorizar na mão. (Se a busca depois devolver
      // 403, o erro acima explica que falta escopo de usuário.)
      try {
        await this.authenticateWithClientCredentials();
        return settingRepository.get(CHAVE_TOKENS).access_token;
      } catch {
        throw new Error(
          'Mercado Livre ainda não foi autorizado. Vá em PRODUTOS → Lojas conectadas → Conectar.',
        );
      }
    }
    if (Date.now() >= Number(guardados.expira_em || 0)) {
      const novos = await this.refresh();
      return novos.access_token;
    }
    return guardados.access_token;
  }

  async status() {
    const base = await super.status();
    const guardados = settingRepository.get(CHAVE_TOKENS);

    // Token de client_credentials existe mas responde 403 na busca (medido).
    // Contá-lo como "autorizado" fazia a tela mentir: dizia pronto e a busca
    // falhava. Só vale a autorização feita no navegador, que traz refresh_token.
    const serveParaBuscar = Boolean(guardados?.access_token) && guardados.modo === 'authorization_code';

    return {
      ...base,
      online: this.implementado && serveParaBuscar,
      autorizado: serveParaBuscar,
      token_modo: guardados?.modo || null,
      user_id: guardados?.user_id || null,
      token_expira_em: guardados?.expira_em ? new Date(guardados.expira_em).toISOString() : null,
      motivo: !this.implementado
        ? base.motivo
        : serveParaBuscar
          ? ''
          : guardados?.modo === 'client_credentials'
            ? 'Token de Client Credentials nao busca produtos (403). Autorize pelo navegador.'
            : 'Credenciais no .env, mas falta autorizar o app (Lojas conectadas → Conectar).',
    };
  }

  // ----------------------------------------------------------- busca --

  async search(filtros = {}) {
    const token = await this.accessToken();

    const url = new URL(`${API}/sites/${SITE}/search`);
    if (filtros.termo) url.searchParams.set('q', filtros.termo);
    if (filtros.categoria) url.searchParams.set('category', filtros.categoria);
    url.searchParams.set('limit', String(Math.min(Number(filtros.limite) || 20, 50)));

    // Faixa de preço no formato do ML: "min-max" (aceita * de um dos lados)
    if (filtros.precoMin || filtros.precoMax) {
      url.searchParams.set('price', `${filtros.precoMin || '*'}-${filtros.precoMax || '*'}`);
    }
    if (filtros.freteGratis) url.searchParams.set('shipping_cost', 'free');
    if (filtros.descontoMin) url.searchParams.set('discount', `${Number(filtros.descontoMin)}-100`);

    const ordenacoes = { preco: 'price_asc', preco_desc: 'price_desc', vendas: 'relevance', desconto: 'relevance' };
    url.searchParams.set('sort', ordenacoes[filtros.ordenacao] || 'relevance');

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });

    if (res.status === 403 && settingRepository.get(CHAVE_TOKENS)?.modo === 'client_credentials') {
      // Medido na pratica: o token de client_credentials e aceito, mas a busca
      // responde 403 "forbidden" — ele nao carrega escopo de usuario. Insistir
      // em renovar so geraria outro token igualmente inutil.
      throw new Error(
        'O token de Client Credentials nao tem permissao para buscar produtos (403). '
        + 'Autorize pelo navegador em PRODUTOS -> Lojas conectadas -> Conectar.',
      );
    }

    if (res.status === 401 || res.status === 403) {
      // Token pode ter sido revogado: tenta uma renovação antes de desistir.
      const novo = await this.refresh();
      const retry = await fetch(url, {
        headers: { Authorization: `Bearer ${novo.access_token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (!retry.ok) throw new Error(`Mercado Livre recusou a busca (HTTP ${retry.status}). Reautorize em Afiliados → Conectar.`);
      return this.mapear(await retry.json(), filtros);
    }

    if (!res.ok) {
      const texto = await res.text().catch(() => '');
      throw new Error(`Mercado Livre HTTP ${res.status}: ${texto.slice(0, 200)}`);
    }

    return this.mapear(await res.json(), filtros);
  }

  async getProduct(externalId) {
    const token = await this.accessToken();
    const res = await fetch(`${API}/items/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Mercado Livre HTTP ${res.status}`);
    return this.normalize(this.paraBruto(await res.json()));
  }

  mapear(resposta, filtros = {}) {
    const itens = resposta?.results || [];
    let produtos = itens.map((item) => this.normalize(this.paraBruto(item)));

    // O ML não ordena por desconto nem por vendas; fazemos aqui, com o dado que veio.
    if (filtros.ordenacao === 'desconto') {
      produtos = produtos.sort((a, b) => descontoDe(b) - descontoDe(a));
    } else if (filtros.ordenacao === 'vendas') {
      produtos = produtos.sort((a, b) => (b.quantidade_vendas || 0) - (a.quantidade_vendas || 0));
    }

    if (filtros.descontoMin) {
      produtos = produtos.filter((p) => descontoDe(p) >= Number(filtros.descontoMin));
    }
    return produtos;
  }

  /** Item do ML -> formato que o `normalize` da base entende. */
  paraBruto(item) {
    const imagem = item.thumbnail_id
      ? `https://http2.mlstatic.com/D_${item.thumbnail_id}-O.jpg`  // versão grande
      : item.thumbnail || item.pictures?.[0]?.secure_url || null;

    return {
      external_id: item.id,
      titulo: item.title,
      descricao: [item.condition === 'new' ? 'Produto novo' : null, item.shipping?.free_shipping ? 'Frete grátis' : null]
        .filter(Boolean).join('. '),
      categoria: item.category_id || null,
      imagem,
      imagens: (item.pictures || []).map((p) => p.secure_url).filter(Boolean).slice(0, 5),
      url: item.permalink,
      preco: item.price,
      preco_anterior: item.original_price || null,
      moeda: item.currency_id || 'BRL',
      frete_gratis: Boolean(item.shipping?.free_shipping),
      avaliacao: item.reviews?.rating_average ?? null,
      quantidade_avaliacoes: item.reviews?.total ?? null,
      vendas: item.sold_quantity ?? null,
      disponibilidade: (item.available_quantity ?? 1) > 0 ? 'disponivel' : 'indisponivel',
      tags: (item.tags || []).slice(0, 5),
    };
  }
}

function descontoDe(produto) {
  const de = Number(produto.preco_anterior);
  const por = Number(produto.preco_atual ?? produto.preco);
  if (!Number.isFinite(de) || !Number.isFinite(por) || de <= por) return 0;
  return Math.round(((de - por) / de) * 100);
}

/** base64 no formato que o PKCE exige (sem +, / ou =). */
function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export { CHAVE_TOKENS, CHAVE_PKCE, CHAVE_STATE };
