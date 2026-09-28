/**
 * O manual não pode mandar o usuário para uma tela que não existe. Roda sem
 * servidor: lê o conteúdo e as rotas do painel direto dos arquivos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SECOES } = await import(`file://${path.join(RAIZ, 'public', 'js', 'manual', 'conteudo.js').replace(/\\/g, '/')}`);

const router = fs.readFileSync(path.join(RAIZ, 'public', 'js', 'router.js'), 'utf8');
const blocoRotas = router.slice(router.indexOf('export const rotas'));
const ROTAS = new Set([...blocoRotas.matchAll(/^\s+(?:'([^']*)'|([a-z_]+)):\s*\{\s*titulo/gm)].map((m) => m[1] ?? m[2]));

test('toda tela citada no manual existe no painel', () => {
  assert.ok(ROTAS.has('produtos') && ROTAS.has('manual'), 'leitura das rotas falhou');
  for (const s of SECOES) {
    if (s.rota !== undefined) assert.ok(ROTAS.has(s.rota), `seção "${s.id}" aponta para #/${s.rota}, que não existe`);
    for (const link of JSON.stringify(s).matchAll(/href=\\"#\/([a-z_]*)/g)) {
      assert.ok(ROTAS.has(link[1]), `seção "${s.id}" tem link para #/${link[1]}, que não existe`);
    }
  }
});

test('seções com id único, título e conteúdo', () => {
  const ids = SECOES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'id repetido');
  for (const s of SECOES) {
    assert.ok(s.titulo && s.resumo, `seção ${s.id} sem título/resumo`);
    assert.ok(s.blocos.length && s.blocos.every((b) => (b.passos || b.itens)?.length), `seção ${s.id} com bloco vazio`);
  }
});

test('o manual não ensina caminho antigo', () => {
  const texto = JSON.stringify(SECOES);
  assert.doesNotMatch(texto, /Afiliados → \+ Novo/, 'cadastro de afiliado agora é em Minhas lojas');
  assert.doesNotMatch(texto, /ALIEXPRESS|AMAZON_ACCESS|SHOPEE_APP_ID/, 'credencial de API não existe mais');
});
