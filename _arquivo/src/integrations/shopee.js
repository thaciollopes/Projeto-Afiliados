/**
 * Shopee — busca real via Affiliate Open API (GraphQL).
 *
 * Autenticação por assinatura, sem OAuth:
 *   Authorization: SHA256 Credential={appId}, Timestamp={ts}, Signature={sig}
 *   sig = SHA256(appId + timestamp + payload + secret)
 * onde `payload` é exatamente o corpo JSON enviado (byte a byte — por isso a
 * assinatura é calculada sobre a MESMA string que vai no fetch, nunca sobre
 * uma segunda serialização).
 *
 * As credenciais saem do programa de afiliados da Shopee (app_id + secret).
 */
import { createHash } from 'node:crypto';
import { MarketplaceAdapter } from './base.js';
import { logger } from '../../core/utils/logger.js';

const log = logger.child('shopee');

const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';

/** sortType da API: 2 = mais vendidos, 3 = maior preço, 5 = maior comissão */
const ORDENACOES = {
  vendas: 2,
  preco_desc: 3,
  comissao: 5,
  desconto: 2,
  preco: 2,
  avaliacao: 2,
};

const QUERY = `query ($keyword: String!, $limit: Int!, $page: Int!, $sortType: Int!) {
  productOfferV2(input: { keyword: $keyword, limit: $limit, page: $page, sortType: $sortType }) {
    nodes {
      itemId
      productName
      priceMin
      priceMax
      imageUrl
      offerLink
      productLink
      sales
      ratingStar
      commissionRate
      shopName
      priceDiscountRate
    }
    pageInfo { hasNextPage }
  }
}`;

export class ShopeeAdapter extends MarketplaceAdapter {
  constructor(credenciais = {}) {
    const temCredenciais = Boolean(credenciais.appId && credenciais.appSecret);
    super({
      nome: 'shopee',
      rotulo: 'Shopee',
      implementado: temCredenciais,
      motivo: temCredenciais
        ? ''
        : 'Faltam SHOPEE_APP_ID e SHOPEE_APP_SECRET no .env (programa de afiliados Shopee).',
      docs: 'https://affiliate.shopee.com.br',
    });
    this.appId = credenciais.appId || '';
    this.appSecret = credenciais.appSecret || '';
    this.endpoint = credenciais.endpoint || ENDPOINT;
  }

  /**
   * Assina e envia. A string do corpo é gerada UMA vez e reaproveitada:
   * reserializar o JSON aqui geraria bytes diferentes e a Shopee responderia
   * "Invalid Signature".
   */
  async request(variaveis) {
    if (!this.implementado) throw new Error(this.motivo);

    const payload = JSON.stringify({ query: QUERY, variables: variaveis });
    const timestamp = Math.floor(Date.now() / 1000);
    const assinatura = createHash('sha256')
      .update(`${this.appId}${timestamp}${payload}${this.appSecret}`)
      .digest('hex');

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `SHA256 Credential=${this.appId}, Timestamp=${timestamp}, Signature=${assinatura}`,
      },
      body: payload,
      signal: AbortSignal.timeout(30000),
    });

    const texto = await res.text();
    let dados = null;
    try { dados = JSON.parse(texto); } catch { dados = null; }

    if (!res.ok) {
      throw new Error(`Shopee HTTP ${res.status}: ${texto.slice(0, 200)}`);
    }
    if (dados?.errors?.length) {
      const msg = dados.errors.map((e) => e.message || e.extensions?.message).filter(Boolean).join('; ');
      throw new Error(`Shopee recusou a consulta: ${msg || 'erro desconhecido'}`);
    }
    return dados?.data?.productOfferV2 || { nodes: [] };
  }

  async status() {
    const base = await super.status();
    if (!this.implementado) return base;
    try {
      await this.request({ keyword: 'teste', limit: 1, page: 1, sortType: 2 });
      return { ...base, online: true, autorizado: true };
    } catch (err) {
      return { ...base, online: false, autorizado: false, motivo: err.message };
    }
  }

  async search(filtros = {}) {
    const dados = await this.request({
      keyword: String(filtros.termo || '').trim() || 'oferta',
      limit: Math.min(Number(filtros.limite) || 20, 50),
      page: Number(filtros.pagina) || 1,
      sortType: ORDENACOES[filtros.ordenacao] ?? 2,
    });

    let produtos = (dados.nodes || []).map((item) => this.normalize(this.paraBruto(item)));

    // A API filtra pouco; o resto é aplicado aqui sobre o que ela devolveu.
    if (filtros.precoMin) produtos = produtos.filter((p) => p.preco_atual >= Number(filtros.precoMin));
    if (filtros.precoMax) produtos = produtos.filter((p) => p.preco_atual <= Number(filtros.precoMax));
    if (filtros.descontoMin) {
      // O desconto vem do par preço anterior/atual, como em qualquer outra loja.
      produtos = produtos.filter((p) => {
        const de = Number(p.preco_anterior);
        const por = Number(p.preco_atual);
        if (!Number.isFinite(de) || !Number.isFinite(por) || de <= por) return false;
        return ((de - por) / de) * 100 >= Number(filtros.descontoMin);
      });
    }
    if (filtros.avaliacaoMin) produtos = produtos.filter((p) => (p.avaliacao || 0) >= Number(filtros.avaliacaoMin));

    log.debug(`Busca "${filtros.termo}" devolveu ${produtos.length} produtos`);
    return produtos;
  }

  async getProduct(externalId) {
    // A API de afiliados não tem consulta unitária por itemId; buscamos pelo id.
    const encontrados = await this.search({ termo: String(externalId), limite: 20 });
    return encontrados.find((p) => String(p.external_id) === String(externalId)) || null;
  }

  paraBruto(item) {
    const preco = Number(item.priceMin ?? item.priceMax ?? 0);
    const desconto = Number(item.priceDiscountRate || 0);
    // A Shopee entrega o preço final e o % de desconto; o "de" é reconstruído.
    const precoAnterior = desconto > 0 && desconto < 100
      ? Math.round((preco / (1 - desconto / 100)) * 100) / 100
      : null;

    return {
      external_id: String(item.itemId),
      titulo: item.productName,
      descricao: item.shopName ? `Vendido por ${item.shopName}` : '',
      categoria: null,
      imagem: item.imageUrl || null,
      imagens: item.imageUrl ? [item.imageUrl] : [],
      // offerLink já vem com o seu rastreio de afiliado embutido.
      url: item.offerLink || item.productLink,
      preco,
      preco_anterior: precoAnterior,
      moeda: 'BRL',
      frete_gratis: false,
      avaliacao: item.ratingStar ? Number(item.ratingStar) : null,
      quantidade_avaliacoes: null,
      vendas: item.sales ? Number(item.sales) : null,
      disponibilidade: 'disponivel',
      tags: ['shopee'],
    };
  }

  /** O link da Shopee já sai com rastreio; não mexemos nele. */
  buildAffiliateLink(urlOriginal) {
    return urlOriginal;
  }
}
