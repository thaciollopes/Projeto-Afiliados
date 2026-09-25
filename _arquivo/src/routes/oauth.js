/**
 * Retorno das autorizações OAuth (hoje: Mercado Livre).
 *
 * Fica FORA de /api de propósito: quem chama é o navegador do usuário voltando
 * da loja, e ele não tem como mandar o APP_TOKEN. A proteção aqui é o `state`,
 * gerado quando a autorização começou no painel — sem ele, o callback recusa.
 *
 * Esta rota só é usada quando a URI de retorno cadastrada na loja aponta para
 * este app (ex.: https://afiliados.seudominio.com.br/oauth/mercadolivre/callback).
 * Com uma URI que não chega aqui, o fluxo manual do painel continua valendo.
 */
import { Router } from 'express';
import { getMarketplace } from '../../integrations/marketplaces/index.js';
import { logger } from '../../core/utils/logger.js';

const log = logger.child('oauth');

export const oauthRouter = Router();

oauthRouter.get('/mercadolivre/callback', async (req, res) => {
  const { code, state, error, error_description: descricao } = req.query;

  if (error) {
    return res.status(400).send(pagina({
      ok: false,
      titulo: 'Autorização recusada',
      detalhe: descricao || error,
    }));
  }

  if (!code) {
    return res.status(400).send(pagina({
      ok: false,
      titulo: 'Faltou o código',
      detalhe: 'O Mercado Livre não mandou o parâmetro "code" nesta volta.',
    }));
  }

  try {
    const adapter = getMarketplace('mercadolivre');
    adapter.validateState(state);
    const resultado = await adapter.exchangeCode(String(code));

    log.info('Mercado Livre conectado pelo callback', { user_id: resultado.user_id });
    return res.send(pagina({
      ok: true,
      titulo: 'Mercado Livre conectado',
      detalhe: `Conta ${resultado.user_id ?? ''}. Pode fechar esta aba — o sistema renova o acesso sozinho.`,
    }));
  } catch (err) {
    log.error(`Falha no callback do Mercado Livre: ${err.message}`);
    return res.status(400).send(pagina({
      ok: false,
      titulo: 'Não consegui concluir',
      detalhe: err.message,
    }));
  }
});

/**
 * Receptor de notificações do Mercado Livre.
 *
 * O DevCenter exige uma URL de callback de notificações — não dá para deixar
 * vazio. O sistema não depende desses avisos (ele consulta a API quando
 * precisa), mas o ML reenvia a notificação se não receber 200 rápido, então
 * aqui a regra é: responder 200 na hora e registrar, sem processar nada.
 *
 * O corpo vem de fora e não é autenticado: tratamos como dado, nunca como
 * ordem. Nada aqui altera produto, preço ou publicação.
 */
oauthRouter.post('/mercadolivre/notificacoes', (req, res) => {
  // Responde primeiro: o ML espera 200 em poucos segundos.
  res.status(200).json({ recebido: true });

  try {
    const aviso = req.body || {};
    log.debug('Notificação do Mercado Livre', {
      topico: String(aviso.topic || '').slice(0, 40),
      recurso: String(aviso.resource || '').slice(0, 80),
      usuario: String(aviso.user_id || '').slice(0, 20),
    });
  } catch { /* notificação malformada não é problema nosso */ }
});

/** Alguns painéis validam a URL com um GET antes de aceitar o cadastro. */
oauthRouter.get('/mercadolivre/notificacoes', (_req, res) => {
  res.status(200).json({ ok: true, servico: 'receptor de notificacoes do Mercado Livre' });
});

/** Página simples de volta: quem lê é uma pessoa, não uma API. */
function pagina({ ok, titulo, detalhe }) {
  const escapar = (t) => String(t ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ok ? 'Conectado' : 'Erro'} — Plataforma de Afiliados</title>
<style>
  body { font-family: "Segoe UI", system-ui, Arial, sans-serif; background: #f4f5f9;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .caixa { background: #fff; border: 1px solid #e3e6ef; border-radius: 14px; padding: 32px;
           max-width: 460px; box-shadow: 0 8px 24px rgba(20,24,40,.08); text-align: center; }
  .icone { font-size: 46px; }
  h1 { font-size: 19px; margin: 12px 0 6px; color: ${ok ? '#10925f' : '#c73b46'}; }
  p { color: #6b7186; font-size: 14px; line-height: 1.55; margin: 0 0 18px; }
  a { display: inline-block; background: #6b4de6; color: #fff; text-decoration: none;
      padding: 10px 18px; border-radius: 9px; font-size: 14px; font-weight: 600; }
</style>
</head>
<body>
  <div class="caixa">
    <div class="icone">${ok ? '✅' : '⚠️'}</div>
    <h1>${escapar(titulo)}</h1>
    <p>${escapar(detalhe)}</p>
    <a href="/#/lojas">Voltar ao painel</a>
  </div>
</body>
</html>`;
}
