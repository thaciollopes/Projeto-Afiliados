/**
 * LOJAS: catálogo, cookie da sessão, tag de afiliado e teste de busca.
 * Sem API oficial — o sistema trabalha com o seu cookie e a sua tag.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/index.js';
import { getMarketplace } from '../../integrations/marketplaces/index.js';
import { LOJAS, listaDeLojas } from '../../integrations/marketplaces/lojas.js';
import {
  salvarSessao, resumoSessao, removerSessao,
} from '../../core/services/sessaoLojaService.js';
import { tagDaLoja, salvarTagDaLoja } from '../../core/services/lojaService.js';
import { tagDeAfiliado } from '../../core/services/mercadoLivreLinkService.js';
import {
  lojaConverteLinkPorCookie, converterLinkAvulso, converterProdutosDaLoja,
} from '../../core/services/linkPorCookieService.js';
import {
  verificarLink, verificarProdutosDaLoja, lojasConferiveis,
} from '../../core/services/verificacaoLinkService.js';
import { badRequest, notFound } from '../../core/utils/errors.js';

export const marketplacesRouter = Router();

function lojaOu404(id) {
  const loja = LOJAS[id];
  if (!loja) throw notFound(`Loja "${id}"`);
  return loja;
}

/** O que a tela LOJAS precisa de cada loja — nunca o valor dos cookies. */
function resumoLoja(loja) {
  const tag = loja.id === 'mercadolivre' ? tagDeAfiliado() : tagDaLoja(loja.id);
  return {
    id: loja.id,
    nome: loja.nome,
    site: loja.site,
    painel: loja.painel,
    busca: loja.busca,
    link_afiliado: loja.linkAfiliado,
    tag_config: loja.tag,
    dica_cookie: loja.dicaCookie,
    como_entram_produtos: loja.comoEntramProdutos,
    tag,
    converte_por_cookie: lojaConverteLinkPorCookie(loja.id),
    conferivel: lojasConferiveis().includes(loja.id),
    tag_propria: loja.id === 'mercadolivre' ? Boolean(tagDaLoja(loja.id)) : Boolean(tag),
    sessao: resumoSessao(loja.id),
  };
}

marketplacesRouter.get('/', asyncHandler(async (_req, res) => {
  res.json(listaDeLojas().map(resumoLoja));
}));

marketplacesRouter.get('/:loja', asyncHandler(async (req, res) => {
  res.json(resumoLoja(lojaOu404(req.params.loja)));
}));

/** Recebe o JSON do Cookie Editor (ou "nome=valor; ...") e guarda. */
marketplacesRouter.put('/:loja/sessao', asyncHandler(async (req, res) => {
  const loja = lojaOu404(req.params.loja);
  salvarSessao(loja.id, req.body?.cookies);
  res.json(resumoLoja(loja));
}));

marketplacesRouter.delete('/:loja/sessao', asyncHandler(async (req, res) => {
  const loja = lojaOu404(req.params.loja);
  removerSessao(loja.id);
  res.json(resumoLoja(loja));
}));

/** Tag de afiliado; troca a tag de todos os produtos da loja na hora. */
marketplacesRouter.put('/:loja/tag', asyncHandler(async (req, res) => {
  const loja = lojaOu404(req.params.loja);
  const resultado = salvarTagDaLoja(loja, req.body?.tag);
  res.json({
    ...resumoLoja(loja),
    reaplicados: resultado.atualizados,
    links_para_refazer: resultado.links_para_refazer || 0,
  });
}));

/** Teste de busca: prova que a loja responde, sem gravar nada. */
marketplacesRouter.post('/:loja/testar', asyncHandler(async (req, res) => {
  const loja = lojaOu404(req.params.loja);
  if (!loja.busca) {
    return res.json({ ok: false, erro: `${loja.nome} não deixa buscar automaticamente. ${loja.comoEntramProdutos}` });
  }
  try {
    const produtos = await getMarketplace(loja.id).search({
      termo: req.body?.termo || 'perfume',
      limite: Number(req.body?.limite) || 3,
    });
    return res.json({
      ok: true,
      encontrados: produtos.length,
      exemplos: produtos.slice(0, 3).map((p) => ({
        titulo: p.titulo_original,
        preco: p.preco_atual,
        preco_anterior: p.preco_anterior,
        avaliacao: p.avaliacao,
        url: p.url_original,
      })),
    });
  } catch (err) {
    return res.json({ ok: false, erro: err.message });
  }
}));

// ------------------- link de afiliado pela sessão (Mercado Livre, Shopee) --

function lojaPorCookieOu400(id) {
  const loja = lojaOu404(id);
  if (!lojaConverteLinkPorCookie(loja.id)) throw badRequest(`${loja.nome} não gera link pelo cookie.`);
  return loja;
}

/** Converte um link avulso (teste na tela LOJAS). */
marketplacesRouter.post('/:loja/converter-link', asyncHandler(async (req, res) => {
  const loja = lojaPorCookieOu400(req.params.loja);
  const url = String(req.body?.url || '').trim();
  if (!url) throw badRequest(`Informe o link do produto da ${loja.nome}.`);
  const r = await converterLinkAvulso(loja.id, url);
  // Já confere o ID: é a prova de que o link gerado paga você.
  const conferencia = r.link ? await verificarLink(loja.id, r.link).catch(() => null) : null;
  res.json({ ...r, conferencia });
}));

/** Converte todos os produtos da loja que ainda estão sem link de afiliado. */
marketplacesRouter.post('/:loja/converter', asyncHandler(async (req, res) => {
  const loja = lojaPorCookieOu400(req.params.loja);
  res.json(await converterProdutosDaLoja(loja.id, { ids: req.body?.ids || null }));
}));

// ------------------------------------------- conferência do ID de afiliado --

/** Abre um link e diz se o ID de afiliado que chega na loja é o seu. */
marketplacesRouter.post('/:loja/verificar-link', asyncHandler(async (req, res) => {
  const loja = lojaOu404(req.params.loja);
  const url = String(req.body?.url || '').trim();
  res.json(await verificarLink(loja.id, url));
}));

/** Confere os links dos produtos ativos da loja. */
marketplacesRouter.post('/:loja/verificar', asyncHandler(async (req, res) => {
  const loja = lojaOu404(req.params.loja);
  res.json(await verificarProdutosDaLoja(loja.id, {
    limite: req.body?.limite,
    forcar: Boolean(req.body?.forcar),
  }));
}));
