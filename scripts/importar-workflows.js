/**
 * Sobe os workflows de n8n/workflows para o n8n via API.
 *
 * Precisa de N8N_API_KEY no .env (n8n > Settings > n8n API > Create API key).
 * Sem a chave, o script explica como importar pela interface.
 *
 * Os workflows entram DESATIVADOS de proposito: ative um por um depois de
 * conferir. Reimportar atualiza o que ja existe (busca pelo nome).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from '../src/config/index.js';

const PASTA = path.join(ROOT, 'n8n', 'workflows');
const base = config.n8n.baseUrl.replace(/\/+$/, '');

const arquivos = fs.existsSync(PASTA)
  ? fs.readdirSync(PASTA).filter((f) => f.endsWith('.json')).sort()
  : [];

if (!arquivos.length) {
  console.log('  Nenhum workflow em n8n/workflows.');
  process.exit(0);
}

console.log('');
console.log(`  n8n: ${base}`);
console.log(`  Workflows encontrados: ${arquivos.length}`);
console.log('');

if (!config.n8n.apiKey) {
  console.log('  [!] N8N_API_KEY nao configurada no .env.');
  console.log('');
  console.log('  Duas opcoes:');
  console.log('   1) Pegue a chave em ' + base + ' > Settings > n8n API > Create an API key');
  console.log('      e cole no .env em N8N_API_KEY=. Depois rode este arquivo de novo.');
  console.log('   2) Importe na mao: no n8n, menu "..." > Import from File, e escolha');
  console.log('      cada arquivo desta pasta:');
  console.log(`      ${PASTA}`);
  console.log('');
  console.log('  Em qualquer caso, os workflows chamam a API do painel em');
  console.log('  http://host.docker.internal:3010 (n8n em Docker falando com o app no Windows).');
  console.log('  Se o seu caso for diferente, crie a variavel AFILIADOS_API no n8n.');
  console.log('');
  process.exit(0);
}

const headers = { 'Content-Type': 'application/json', 'X-N8N-API-KEY': config.n8n.apiKey };

async function existentes() {
  const res = await fetch(`${base}/api/v1/workflows?limit=250`, { headers });
  if (!res.ok) throw new Error(`Nao consegui listar workflows (HTTP ${res.status})`);
  const dados = await res.json();
  return new Map((dados.data || []).map((w) => [w.name, w.id]));
}

try {
  const mapa = await existentes();
  let criados = 0;
  let atualizados = 0;

  for (const arquivo of arquivos) {
    const bruto = JSON.parse(fs.readFileSync(path.join(PASTA, arquivo), 'utf8'));
    const corpo = {
      name: bruto.name,
      nodes: bruto.nodes,
      connections: bruto.connections,
      settings: bruto.settings || { executionOrder: 'v1' },
    };

    const idExistente = mapa.get(bruto.name);
    const url = idExistente ? `${base}/api/v1/workflows/${idExistente}` : `${base}/api/v1/workflows`;
    const res = await fetch(url, {
      method: idExistente ? 'PUT' : 'POST',
      headers,
      body: JSON.stringify(corpo),
    });

    if (!res.ok) {
      const detalhe = await res.text();
      console.log(`  [ERRO] ${arquivo}: HTTP ${res.status} ${detalhe.slice(0, 160)}`);
      continue;
    }
    if (idExistente) { atualizados += 1; console.log(`  [atualizado] ${bruto.name}`); }
    else { criados += 1; console.log(`  [criado]     ${bruto.name}`); }
  }

  console.log('');
  console.log(`  Pronto: ${criados} criados, ${atualizados} atualizados.`);
  console.log('  Todos entram DESATIVADOS — ative um por um no n8n depois de conferir.');
  console.log('');
} catch (err) {
  console.log(`  [ERRO] ${err.message}`);
  console.log('  Confira se o n8n esta no ar e se a N8N_API_KEY esta correta.');
  process.exit(1);
}
