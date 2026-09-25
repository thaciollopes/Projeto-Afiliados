/**
 * Contrato de um marketplace. Cada loja e um adapter independente:
 * nenhuma regra de negocio conhece "AliExpress" ou "Amazon" pelo nome.
 *
 * Adapter nao implementado NAO inventa API: ele declara implementado=false e
 * a interface mostra "integracao pendente" em vez de dados falsos.
 */
export class MarketplaceAdapter {
  constructor({ nome, rotulo, implementado = false, motivo = '', docs = '' } = {}) {
    this.nome = nome;
    this.rotulo = rotulo || nome;
    this.implementado = implementado;
    this.motivo = motivo;
    this.docs = docs;
  }

  async status() {
    return {
      nome: this.nome,
      marketplace: this.nome,
      rotulo: this.rotulo,
      implementado: this.implementado,
      online: this.implementado,
      motivo: this.motivo,
      docs: this.docs,
    };
  }

  /**
   * @param {{termo?:string, categoria?:string, precoMin?:number, precoMax?:number,
   *          descontoMin?:number, ordenacao?:string, limite?:number}} _filtros
   * @returns {Promise<object[]>} produtos ja normalizados
   */
  async search(_filtros = {}) {
    throw new Error(`Busca nao implementada para ${this.rotulo}. ${this.motivo}`);
  }

  async getProduct(_externalId) {
    throw new Error(`Consulta de produto nao implementada para ${this.rotulo}.`);
  }

  /** Monta o link de afiliado. Sem credencial, devolve a URL original intacta. */
  buildAffiliateLink(urlOriginal, programa = null) {
    if (!urlOriginal) return '';
    if (!programa?.identificador || !programa?.parametro_tag) return urlOriginal;
    try {
      const url = new URL(urlOriginal);
      url.searchParams.set(programa.parametro_tag, programa.identificador);
      return url.toString();
    } catch {
      return urlOriginal;
    }
  }

  /** Normaliza o formato cru da loja para o modelo interno de produto. */
  normalize(raw) {
    return {
      marketplace: this.nome,
      external_id: String(raw.external_id ?? raw.id ?? ''),
      titulo_original: raw.titulo ?? raw.title ?? '',
      descricao_original: raw.descricao ?? raw.description ?? '',
      categoria: raw.categoria ?? null,
      subcategoria: raw.subcategoria ?? null,
      nicho: raw.nicho ?? null,
      palavras_chave: raw.palavras_chave ?? [],
      imagem_principal: raw.imagem ?? raw.image ?? null,
      imagens: raw.imagens ?? [],
      url_original: raw.url ?? null,
      preco_atual: numberOrNull(raw.preco ?? raw.price),
      preco_anterior: numberOrNull(raw.preco_anterior ?? raw.original_price),
      moeda: raw.moeda ?? 'BRL',
      frete_gratis: Boolean(raw.frete_gratis),
      avaliacao: numberOrNull(raw.avaliacao ?? raw.rating),
      quantidade_avaliacoes: numberOrNull(raw.quantidade_avaliacoes),
      quantidade_vendas: numberOrNull(raw.vendas ?? raw.sales),
      disponibilidade: raw.disponibilidade ?? 'disponivel',
      tags: raw.tags ?? [],
      origem: 'busca',
    };
  }
}

function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
