/**
 * Amazon: com a Creators API configurada, busca e consulta pela API oficial
 * (link ja com a tag, sem risco de bloqueio). Sem ela, segue pela pagina de
 * busca da Amazon, como antes.
 */
import { LojaAdapter } from './cookie.js';
import { buscarItens, buscarPorAsins } from './amazonCreatorsApi.js';
import { credenciaisAmazon } from '../../core/services/amazonService.js';
import { logger } from '../../core/utils/logger.js';

const log = logger.child('loja');

export class AmazonAdapter extends LojaAdapter {
  async status() {
    return { ...(await super.status()), api: Boolean(credenciaisAmazon()) };
  }

  async search(filtros = {}) {
    const credenciais = credenciaisAmazon();
    if (!credenciais) return super.search(filtros);

    const termo = String(filtros.termo || '').trim();
    if (!termo) throw new Error('Informe a palavra-chave da busca.');
    filtros.aoProgredir?.({ etapa: 'lendo', pagina: 1, total_paginas: 1 });
    const itens = await buscarItens(credenciais, termo);
    const produtos = itens.map((p) => this.normalize(p));
    log.info(`Amazon API: ${produtos.length} produtos para "${termo}"`);
    return produtos.slice(0, Number(filtros.limite) || 20);
  }

  async getProduct(externalId) {
    const credenciais = credenciaisAmazon();
    if (!credenciais) return super.getProduct(externalId);
    const [item] = await buscarPorAsins(credenciais, [String(externalId)]);
    return item ? this.normalize(item) : null;
  }
}
