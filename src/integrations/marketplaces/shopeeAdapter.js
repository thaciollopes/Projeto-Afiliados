/**
 * Shopee: com a API de afiliados configurada (AppID + Senha em LOJAS), o
 * sistema busca sozinho; sem ela, continua como antes — extensao ou CSV.
 * Por isso "implementado" e calculado a cada consulta, nao fixo.
 */
import { LojaAdapter } from './cookie.js';
import { buscarOfertas, ofertaParaProduto } from './shopeeApi.js';
import { credenciaisShopee } from '../../core/services/shopeeApiService.js';
import { logger } from '../../core/utils/logger.js';

const log = logger.child('loja');

const ORDENACAO_DA_TELA = {
  vendas: 'vendas', desconto: 'vendas', preco: 'preco', avaliacao: 'relevancia', comissao: 'comissao',
};

export class ShopeeAdapter extends LojaAdapter {
  get implementado() {
    return Boolean(credenciaisShopee());
  }

  // O construtor da base atribui implementado; aqui ele e sempre calculado.
  set implementado(_valor) {}

  get motivo() {
    return this.implementado ? '' : `Shopee: configure a API em LOJAS para buscar pelo sistema. ${this.loja.comoEntramProdutos}`;
  }

  set motivo(_valor) {}

  async status() {
    return { ...(await super.status()), api: this.implementado };
  }

  async search(filtros = {}) {
    const credenciais = credenciaisShopee();
    if (!credenciais) throw new Error(this.motivo);

    const limite = Math.min(Number(filtros.limite) || 20, 50);
    const precoMax = Number(filtros.precoMax ?? filtros.preco_max) || null;
    const descontoMin = Number(filtros.descontoMin ?? filtros.desconto_min) || null;
    filtros.aoProgredir?.({ etapa: 'lendo', pagina: 1, total_paginas: 1 });

    const { nodes } = await buscarOfertas(credenciais, {
      termo: filtros.termo,
      ordenacao: ORDENACAO_DA_TELA[filtros.ordenacao] || filtros.ordenacao || 'vendas',
      pagina: filtros.pagina || 1,
      limite: 50,
    });

    const produtos = nodes.map(ofertaParaProduto)
      .filter((p) => p.titulo && p.preco)
      .filter((p) => !precoMax || p.preco <= precoMax)
      .filter((p) => !descontoMin || (p.preco_anterior && (1 - p.preco / p.preco_anterior) * 100 >= descontoMin))
      .map((p) => ({ ...this.normalize(p), comissao_percentual: p.comissao_percentual, observacoes: observacao(p) }));

    log.info(`Shopee API: ${produtos.length} ofertas para "${filtros.termo || '(todas)'}"`);
    return produtos.slice(0, filtros.pagina ? 50 : limite);
  }

  async getProduct(externalId) {
    const achados = await this.search({ termo: String(externalId), limite: 50 });
    return achados.find((p) => String(p.external_id) === String(externalId)) || null;
  }
}

function observacao(p) {
  return [
    p.comissao_percentual != null && `Comissao: ${p.comissao_percentual}%`,
    p.loja && `Loja: ${p.loja}`,
  ].filter(Boolean).join(' | ') || null;
}
