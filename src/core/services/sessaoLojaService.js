/**
 * Sessão de loja: os cookies do seu navegador, usados pelo coletor.
 *
 * Por que isto existe: Mercado Livre e Shopee barram navegação anônima
 * (o ML manda para /account-verification pedindo login). Com a sua sessão,
 * o navegador headless entra como você entraria — e enxerga o que você enxerga,
 * inclusive o painel de afiliado.
 *
 * TRATAMENTO DE SEGREDO — cookie de sessão é senha, não configuração:
 *   - fica só no banco local, nunca sai inteiro para a tela;
 *   - a tela mostra domínio, quantidade e validade, nunca o valor;
 *   - o sistema avisa quando expira, em vez de falhar em silêncio.
 */
import { settingRepository } from '../repositories/index.js';
import { logger } from '../utils/logger.js';
import { badRequest } from '../utils/errors.js';

const log = logger.child('sessao-loja');
const PREFIXO = 'sessao_loja_';

/** Cookies que só servem para rastreio/analytics — não precisam ser guardados. */
const DESCARTAVEIS = /^(_ga|_gid|_gcl|_hj|_fb|_tt|_pin|_uet|_clck|_clsk|__utm|ajs_|amplitude)/i;

/**
 * Aceita o JSON da extensão Cookie Editor (array de objetos) ou o formato
 * "nome=valor; nome2=valor2" copiado do DevTools.
 * @returns {{cookies:Array, dominios:string[], expira_em:string|null}}
 */
export function parseCookies(entrada) {
  const bruto = String(entrada || '').trim();
  if (!bruto) throw badRequest('Cole os cookies primeiro.');

  let lista;

  if (bruto.startsWith('[') || bruto.startsWith('{')) {
    let dados;
    try {
      dados = JSON.parse(bruto);
    } catch {
      throw badRequest('O JSON dos cookies está inválido. Copie de novo na extensão (botão Export).');
    }
    lista = Array.isArray(dados) ? dados : [dados];
    lista = lista
      .filter((c) => c && c.name && c.value !== undefined)
      .map((c) => ({
        name: String(c.name),
        value: String(c.value),
        domain: c.domain || '',
        path: c.path || '/',
        secure: c.secure !== false,
        httpOnly: Boolean(c.httpOnly),
        sameSite: normalizarSameSite(c.sameSite),
        expires: c.expirationDate ? Math.floor(Number(c.expirationDate)) : undefined,
      }));
  } else {
    // "nome=valor; nome2=valor2"
    lista = bruto.split(';').map((par) => {
      const igual = par.indexOf('=');
      if (igual < 0) return null;
      return {
        name: par.slice(0, igual).trim(),
        value: par.slice(igual + 1).trim(),
        domain: '',
        path: '/',
        secure: true,
      };
    }).filter((c) => c && c.name);
  }

  const uteis = lista.filter((c) => !DESCARTAVEIS.test(c.name));
  if (!uteis.length) throw badRequest('Não encontrei cookies de sessão válidos no que foi colado.');

  const dominios = [...new Set(uteis.map((c) => c.domain).filter(Boolean))];
  const validades = uteis.map((c) => c.expires).filter(Boolean);
  const expiraEm = validades.length ? new Date(Math.min(...validades) * 1000).toISOString() : null;

  return { cookies: uteis, dominios, expira_em: expiraEm };
}

function normalizarSameSite(valor) {
  const mapa = { no_restriction: 'None', lax: 'Lax', strict: 'Strict', unspecified: undefined };
  const chave = String(valor || '').toLowerCase();
  return mapa[chave] ?? undefined;
}

export function salvarSessao(loja, entrada) {
  const { cookies, dominios, expira_em: expiraEm } = parseCookies(entrada);

  settingRepository.set(`${PREFIXO}${loja}`, {
    cookies,
    dominios,
    expira_em: expiraEm,
    total: cookies.length,
    salvo_em: new Date().toISOString(),
  });

  log.info(`Sessão de ${loja} salva`, { cookies: cookies.length, dominios });
  return resumoSessao(loja);
}

/** Cookies de verdade — só para o coletor, nunca para a tela. */
export function cookiesDaSessao(loja) {
  return settingRepository.get(`${PREFIXO}${loja}`)?.cookies || null;
}

/** O que a tela pode ver: sem nenhum valor de cookie. */
export function resumoSessao(loja) {
  const guardada = settingRepository.get(`${PREFIXO}${loja}`);
  if (!guardada) return { loja, configurada: false };

  const expirou = guardada.expira_em ? new Date(guardada.expira_em) < new Date() : false;
  return {
    loja,
    configurada: true,
    total_cookies: guardada.total,
    dominios: guardada.dominios,
    salvo_em: guardada.salvo_em,
    expira_em: guardada.expira_em,
    expirou,
    // Só os nomes: ajuda a conferir se veio a sessão certa, sem expor valor.
    nomes: (guardada.cookies || []).map((c) => c.name).slice(0, 25),
  };
}

export function removerSessao(loja) {
  const removida = settingRepository.remove(`${PREFIXO}${loja}`);
  if (removida) log.info(`Sessão de ${loja} removida`);
  return removida;
}

export function listarSessoes(lojas) {
  return lojas.map((loja) => resumoSessao(loja));
}
