/**
 * Testes de CSS que já quebraram a tela uma vez.
 *
 * O painel é testado em jsdom, que NÃO aplica folha de estilo — então um erro
 * de CSS passa por todos os outros testes e só aparece no navegador. Estes
 * testes leem o CSS como texto e conferem as regras que travam a interface.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(RAIZ, 'public', 'css', 'app.css'), 'utf8');
const html = fs.readFileSync(path.join(RAIZ, 'public', 'index.html'), 'utf8');

test('[hidden] vence qualquer display declarado no CSS', () => {
  // Sem esta regra, .modal-fundo{display:flex} deixa o modal vazio cobrindo
  // a tela inteira: o painel abre branco e não dá para navegar.
  assert.match(
    css,
    /\[hidden\]\s*{[^}]*display:\s*none\s*!important/,
    'falta a regra [hidden] { display: none !important; }',
  );
});

test('todo elemento que nasce com hidden no HTML é escondido de fato', () => {
  const comHidden = [...html.matchAll(/id="([\w-]+)"[^>]*\shidden/g)].map((m) => m[1]);
  assert.ok(comHidden.length > 0, 'esperava encontrar elementos com hidden no index.html');

  for (const id of comHidden) {
    // Ou o elemento não tem display próprio, ou a regra global acima o cobre.
    assert.match(css, /\[hidden\]\s*{[^}]*display:\s*none\s*!important/,
      `#${id} depende da regra global de [hidden]`);
  }
});

test('o modal começa fechado no HTML', () => {
  assert.match(html, /id="modal-fundo"[^>]*hidden/, 'o modal precisa nascer com hidden');
});

test('o painel não depende de CDN externo (funciona offline)', () => {
  const externos = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(externos, [], `o painel deve ser offline-first; encontrei: ${externos.join(', ')}`);
});
