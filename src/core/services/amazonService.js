/**
 * Amazon do jeito do Divulga Links: voce informa a tag e sobe uma LISTA de
 * produtos (links, amzn.to ou ASINs); o sistema completa titulo, preco, foto e
 * avaliacao, aplica a tag e deixa pronto para a campanha.
 *
 * Duas formas de completar os dados:
 *   - Creators API (oficial, opcional): rapida, 10 itens por chamada. Exige
 *     10 vendas nos ultimos 30 dias para a Amazon liberar;
 *   - sem API: consulta a busca da Amazon por ASIN, um por vez, com intervalo
 *     (rajada faz a Amazon bloquear). Lista grande leva minutos — roda em
 *     segundo plano e a tela acompanha o andamento.
 *
 * A Senha da API fica so no banco local; a tela recebe apenas o resumo.
 */
import crypto from 'node:crypto';
import { settingRepository } from '../repositories/index.js';
import { buscarItens, buscarPorAsins, limparTokensAmazon } from '../../integrations/marketplaces/amazonCreatorsApi.js';
import { getMarketplace } from '../../integrations/marketplaces/index.js';
import { importProducts } from './productService.js';
import { tagDaLoja } from './lojaService.js';
import { badRequest, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const log = logger.child('amazon');
const CHAVE = 'amazon_api';
const MAX_LISTA = 200;

// ------------------------------------------------------ credenciais API --

export function credenciaisAmazon() {
  const c = settingRepository.get(CHAVE);
  const tag = tagDaLoja('amazon');
  return c?.credential_id && c?.secret ? { ...c, tag } : null;
}

export function resumoAmazonApi() {
  const c = settingRepository.get(CHAVE);
  if (!c?.credential_id) return { configurada: false };
  const id = String(c.credential_id);
  return {
    configurada: Boolean(c.secret),
    credential_id: id.length > 6 ? `${'•'.repeat(Math.min(id.length - 4, 12))}${id.slice(-4)}` : id,
    versao: c.versao,
    salvo_em: c.salvo_em || null,
    status: c.status || 'nao_testado',
  };
}

/** Salva so se a Amazon aceitar (teste com uma busca). Secret em branco mantem o atual. */
export async function salvarAmazonApi({ credential_id: id, secret, versao } = {}, opcoes = {}) {
  const credentialId = String(id || '').trim();
  const v = String(versao || '').trim();
  if (!credentialId) throw badRequest('Informe o Credential ID da Creators API.');
  if (!/^\d+(\.\d+)?$/.test(v)) throw badRequest('Informe a versão da credencial (ex.: 2.1 ou 3.1), mostrada ao criar a credencial.');
  const anterior = settingRepository.get(CHAVE);
  const segredo = String(secret || '').trim() || (anterior?.credential_id === credentialId ? anterior.secret : '');
  if (!segredo) throw badRequest('Informe o Credential Secret.');
  if (!tagDaLoja('amazon')) throw badRequest('Salve primeiro a sua tag de associado (campo 1 da Amazon).');

  limparTokensAmazon();
  const credenciais = { credential_id: credentialId, secret: segredo, versao: v, tag: tagDaLoja('amazon') };
  const teste = await testarAmazonApi(credenciais, opcoes);
  if (!teste.ok) return { ...resumoAmazonApi(), teste };

  settingRepository.set(CHAVE, {
    credential_id: credentialId, secret: segredo, versao: v, salvo_em: new Date().toISOString(), status: 'ok',
  });
  return { ...resumoAmazonApi(), teste };
}

export function removerAmazonApi() {
  settingRepository.remove(CHAVE);
  limparTokensAmazon();
  return resumoAmazonApi();
}

export async function testarAmazonApi(credenciais = credenciaisAmazon(), opcoes = {}) {
  try {
    const itens = await buscarItens(credenciais, 'perfume', opcoes);
    return { ok: true, encontrados: itens.length, exemplos: itens.slice(0, 3).map((p) => ({ titulo: p.titulo, preco: p.preco })) };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

// ---------------------------------------------------------- lista --

const ASIN_NO_LINK = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin|o\/asin|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i;
const CURTOS = /^https?:\/\/(?:amzn\.to|a\.co|amzn\.com)\//i;

/**
 * Tira os ASINs de qualquer texto: um link por linha, CSV exportado, ASIN solto.
 * Links curtos (amzn.to, a.co) sao devolvidos a parte, para abrir e descobrir o ASIN.
 */
export function extrairDaLista(texto) {
  const asins = [];
  const curtos = [];
  const pedacos = String(texto || '').split(/[\s,;"'<>|]+/).filter(Boolean);
  for (const pedaco of pedacos) {
    const noLink = pedaco.match(ASIN_NO_LINK);
    if (noLink) asins.push(noLink[1].toUpperCase());
    else if (CURTOS.test(pedaco)) curtos.push(pedaco);
    // ASIN solto: 10 caracteres com pelo menos um digito e comecando por B0 ou
    // sendo ISBN-10 — evita pegar palavras de 10 letras do CSV.
    else if (/^(B0[A-Z0-9]{8}|\d{9}[\dX])$/i.test(pedaco)) asins.push(pedaco.toUpperCase());
  }
  return { asins: [...new Set(asins)], curtos: [...new Set(curtos)] };
}

async function resolverCurto(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  return res.url?.match(ASIN_NO_LINK)?.[1]?.toUpperCase() || null;
}

const trabalhos = new Map();

export function lerTrabalhoLista(id) {
  const t = trabalhos.get(String(id));
  if (!t) throw notFound('Importação');
  return t;
}

/**
 * Começa a importar a lista em segundo plano e devolve o id para a tela
 * acompanhar. Com a API: lotes de 10. Sem: um ASIN por vez, com intervalo.
 */
export function iniciarListaAmazon(texto, { fetchImpl = fetch } = {}) {
  const { asins, curtos } = extrairDaLista(texto);
  if (!asins.length && !curtos.length) {
    throw badRequest('Não achei nenhum produto da Amazon na lista (links amazon.com.br/dp/…, amzn.to ou ASIN).');
  }
  if (asins.length + curtos.length > MAX_LISTA) throw badRequest(`Máximo de ${MAX_LISTA} produtos por lista.`);

  const id = crypto.randomUUID();
  const trabalho = {
    id,
    total: asins.length + curtos.length,
    feitos: 0,
    importados: 0,
    criados: 0,
    atualizados: 0,
    falhas: [],
    modo: credenciaisAmazon() ? 'api' : 'busca',
    fim: false,
    iniciado_em: new Date().toISOString(),
  };
  trabalhos.set(id, trabalho);

  processarLista(trabalho, asins, curtos, fetchImpl).catch((err) => {
    trabalho.erro = err.message;
    trabalho.fim = true;
    log.error(`Lista Amazon: ${err.message}`);
  });
  return trabalho;
}

async function processarLista(trabalho, asins, curtos, fetchImpl) {
  for (const curto of curtos) {
    try {
      const asin = await resolverCurto(curto, fetchImpl);
      if (asin && !asins.includes(asin)) asins.push(asin);
      else if (!asin) trabalho.falhas.push({ item: curto, motivo: 'link curto não levou a um produto' });
    } catch (err) {
      trabalho.falhas.push({ item: curto, motivo: err.message });
    }
  }
  trabalho.total = asins.length + trabalho.falhas.length;
  trabalho.feitos = trabalho.falhas.length;

  const guardar = (produtos) => {
    if (!produtos.length) return;
    const r = importProducts(produtos, 'lista-amazon');
    trabalho.importados += r.total;
    trabalho.criados += r.criados;
    trabalho.atualizados += r.atualizados;
  };

  const credenciais = credenciaisAmazon();
  if (credenciais) {
    for (let i = 0; i < asins.length; i += 10) {
      const lote = asins.slice(i, i + 10);
      try {
        const achados = await buscarPorAsins(credenciais, lote, { fetchImpl });
        guardar(achados.map((p) => getMarketplace('amazon').normalize(p)));
        const vieram = new Set(achados.map((p) => p.external_id));
        lote.filter((a) => !vieram.has(a)).forEach((a) => trabalho.falhas.push({ item: a, motivo: 'a Amazon não devolveu (sem oferta ou indisponível)' }));
      } catch (err) {
        lote.forEach((a) => trabalho.falhas.push({ item: a, motivo: err.message }));
      }
      trabalho.feitos += lote.length;
    }
  } else {
    const adapter = getMarketplace('amazon');
    for (const asin of asins) {
      try {
        const produto = await adapter.getProduct(asin);
        if (produto) guardar([produto]);
        else trabalho.falhas.push({ item: asin, motivo: 'não apareceu na busca da Amazon' });
      } catch (err) {
        trabalho.falhas.push({ item: asin, motivo: err.message });
      }
      trabalho.feitos += 1;
    }
  }

  trabalho.fim = true;
  log.info(`Lista Amazon: ${trabalho.importados} importados, ${trabalho.falhas.length} falhas`, { modo: trabalho.modo });
}
