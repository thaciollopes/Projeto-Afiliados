/**
 * Captura automática da sessão: em vez de você exportar cookies na mão, o
 * sistema abre um Chrome dedicado, você faz login com as suas mãos, e ele lê
 * os cookies daquela janela.
 *
 * O que muda em relação ao modo manual: nada de segurança — é o mesmo navegador,
 * a mesma conta, o mesmo login feito por você. O que muda é o trabalho: some o
 * passo de instalar extensão e exportar JSON.
 *
 * Como funciona: o Chrome é aberto com `--remote-debugging-port` e um perfil
 * separado (em storage/perfil-navegador). O sistema fala com esse Chrome pelo
 * protocolo de depuração — e só faz uma coisa: pedir os cookies do domínio.
 * Nada de digitar senha, clicar ou navegar por você.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, ROOT } from '../../config/index.js';
import { salvarSessao } from './sessaoLojaService.js';
import { logger } from '../utils/logger.js';
import { badRequest } from '../utils/errors.js';

const log = logger.child('captura-sessao');

const PORTA_DEBUG = 9222;
const PERFIL = path.join(ROOT, 'storage', 'perfil-navegador');

/** Onde o Chrome costuma estar no Windows. */
const CAMINHOS_CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const SITES = {
  mercadolivre: { url: 'https://www.mercadolivre.com.br/afiliados/hub', dominio: 'mercadolivre.com.br' },
  shopee: { url: 'https://affiliate.shopee.com.br', dominio: 'shopee.com.br' },
  amazon: { url: 'https://associados.amazon.com.br', dominio: 'amazon.com.br' },
  magalu: { url: 'https://www.magazineluiza.com.br', dominio: 'magazineluiza.com.br' },
};

export function navegadorDisponivel() {
  return CAMINHOS_CHROME.find((c) => c && fs.existsSync(c)) || null;
}

/** Abre o navegador na página de login da loja. O login é seu, feito por você. */
export function abrirNavegador(loja) {
  const site = SITES[loja];
  if (!site) throw badRequest(`Não sei qual site abrir para "${loja}".`);

  const executavel = navegadorDisponivel();
  if (!executavel) {
    throw badRequest(
      'Não encontrei o Chrome nem o Edge neste computador. '
      + 'Use o modo manual (extensão Cookie Editor) em Lojas conectadas.',
    );
  }

  fs.mkdirSync(PERFIL, { recursive: true });

  const processo = spawn(executavel, [
    `--remote-debugging-port=${PORTA_DEBUG}`,
    `--user-data-dir=${PERFIL}`,
    '--no-first-run',
    '--no-default-browser-check',
    site.url,
  ], { detached: true, stdio: 'ignore' });
  processo.unref();

  log.info(`Navegador aberto para login em ${loja}`, { executavel: path.basename(executavel) });

  return {
    aberto: true,
    loja,
    url: site.url,
    navegador: path.basename(executavel),
    instrucoes: [
      'Faça login na janela que abriu (é o seu login, com as suas mãos).',
      'Deixe a janela aberta e volte aqui.',
      'Clique em "Capturar sessão".',
    ],
  };
}

/** Lê os cookies do domínio na janela aberta e guarda como sessão da loja. */
export async function capturarSessao(loja) {
  const site = SITES[loja];
  if (!site) throw badRequest(`Loja "${loja}" não suportada na captura automática.`);

  let alvos;
  try {
    const res = await fetch(`http://127.0.0.1:${PORTA_DEBUG}/json/list`, {
      signal: AbortSignal.timeout(5000),
    });
    alvos = await res.json();
  } catch {
    throw badRequest(
      'Não achei o navegador aberto. Clique em "Abrir navegador" primeiro e deixe a janela aberta.',
    );
  }

  const aba = alvos.find((a) => a.type === 'page' && String(a.url).includes(site.dominio));
  if (!aba) {
    throw badRequest(
      `A janela aberta não está em ${site.dominio}. Navegue até a loja, faça login e tente de novo.`,
    );
  }

  const cookies = await cookiesDaAba(aba, site.dominio);
  if (!cookies.length) {
    throw badRequest('Nenhum cookie encontrado. Confira se o login foi concluído.');
  }

  const resumo = salvarSessao(loja, JSON.stringify(cookies));
  log.info(`Sessão de ${loja} capturada do navegador`, { cookies: cookies.length });
  return { ...resumo, capturado_de: aba.url.slice(0, 80) };
}

/** Conversa com o Chrome pelo protocolo de depuração — só para ler cookies. */
async function cookiesDaAba(aba, dominio) {
  if (typeof WebSocket !== 'function') {
    throw badRequest('Este Node não tem WebSocket embutido (precisa de Node 22+).');
  }

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(aba.webSocketDebuggerUrl);
    const limite = setTimeout(() => {
      try { socket.close(); } catch { /* ignora */ }
      reject(badRequest('O navegador não respondeu a tempo.'));
    }, 15000);

    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Network.getAllCookies' }));

    socket.onmessage = (evento) => {
      try {
        const resposta = JSON.parse(evento.data);
        if (resposta.id !== 1) return;

        clearTimeout(limite);
        socket.close();

        const todos = resposta.result?.cookies || [];
        resolve(todos
          .filter((c) => String(c.domain).includes(dominio))
          .map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            secure: Boolean(c.secure),
            httpOnly: Boolean(c.httpOnly),
            expirationDate: c.expires > 0 ? c.expires : undefined,
          })));
      } catch (err) {
        clearTimeout(limite);
        reject(badRequest(`Não consegui ler os cookies: ${err.message}`));
      }
    };

    socket.onerror = () => {
      clearTimeout(limite);
      reject(badRequest('Falha ao falar com o navegador aberto.'));
    };
  });
}

export function sitesSuportados() {
  return Object.entries(SITES).map(([loja, site]) => ({ loja, url: site.url, dominio: site.dominio }));
}

export { PERFIL, PORTA_DEBUG };
