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
import {
  converterLinks, converterProdutos, tagDeAfiliado,
} from '../../core/services/mercadoLivreLinkService.js';
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
  res.json({ ...resumoLoja(loja), reaplicados: resultado.atualizados });
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

// -------------------------- Mercado Livre: link de afiliado (cookie) --

/** Converte um link avulso (teste na tela LOJAS). */
marketplacesRouter.post('/mercadolivre/converter-link', asyncHandler(async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!url) throw badRequest('Informe o link do produto do Mercado Livre.');
  const r = await converterLinks([url]);
  const item = r.resultados[0] || {};
  res.json({ ok: Boolean(item.link), original: url, link: item.link || null, erro: item.erro || null, tag: r.tag });
}));

/** Converte todos os produtos do ML que ainda estão sem link de afiliado. */
marketplacesRouter.post('/mercadolivre/converter', asyncHandler(async (req, res) => {
  res.json(await converterProdutos({ ids: req.body?.ids || null }));
}));
