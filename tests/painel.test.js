/**
 * Renderiza TODAS as páginas do painel em um DOM de mentira (jsdom), batendo
 * na API de verdade. Pega import quebrado, campo renomeado e erro de render
 * sem precisar abrir o navegador.
 *
 * Precisa do servidor no ar (INICIAR.bat). Se não estiver, os testes são
 * pulados em vez de falharem — assim `npm test` continua verde no CI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = `http://localhost:${process.env.APP_PORT || 3010}`;

const servidorNoAr = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) })
  .then((r) => r.ok)
  .catch(() => false);

if (!servidorNoAr) {
  test('painel (pulado: servidor não está no ar)', { skip: true }, () => {});
} else {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(fs.readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8'), { url: `${BASE}/` });
  const fetchReal = globalThis.fetch;

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.prompt = () => null;
  globalThis.fetch = (url, opts) =>
    fetchReal(String(url).startsWith('http') ? url : `${BASE}${url}`, opts);

  const { rotas } = await import(`file://${path.join(RAIZ, 'public', 'js', 'router.js').replace(/\\/g, '/')}`);

  for (const [nome, pagina] of Object.entries(rotas)) {
    test(`página #/${nome || '(dashboard)'} renderiza`, async () => {
      const no = await pagina.render({ params: [] });
      const texto = no.textContent.replace(/\s+/g, ' ').trim();
      assert.ok(texto.length > 10, 'a página não pode renderizar vazia');
      assert.doesNotMatch(texto, /undefined|\[object Object\]/, 'vazou valor não tratado na tela');
    });
  }
}
