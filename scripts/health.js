/** Diagnostico rapido: usado pelo STATUS.bat. Funciona com o app ligado ou nao. */
import fs from 'node:fs';
import { config } from '../src/config/index.js';

const linha = (nome, ok, extra = '') =>
  console.log(`   ${ok ? '🟢' : '🔴'}  ${nome.padEnd(22)} ${extra}`);

async function alcancavel(url, ms = 4000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

const appUrl = `http://localhost:${config.app.port}`;

console.log('');
const appOnline = await alcancavel(`${appUrl}/api/health`);
linha('Painel (app)', appOnline, appOnline ? appUrl : 'parado — rode INICIAR.bat');

const bancoExiste = fs.existsSync(config.db.file);
linha('Banco de dados', bancoExiste,
  bancoExiste ? `${(fs.statSync(config.db.file).size / 1048576).toFixed(2)} MB` : 'rode INSTALAR.bat');

const n8nOnline = await alcancavel(`${config.n8n.baseUrl}/healthz`);
linha('n8n', n8nOnline, config.n8n.baseUrl);

if (config.whatsapp.provider === 'waha') {
  const wahaOnline = await alcancavel(`${config.whatsapp.baseUrl}/api/sessions`);
  linha('WAHA (WhatsApp)', wahaOnline, config.whatsapp.baseUrl);
} else {
  linha('WhatsApp', true, 'provider "mock" (simulação, nada é enviado)');
}

linha('Modo de envio', !config.runtime.dryRun,
  config.runtime.dryRun ? 'SIMULAÇÃO (DRY_RUN=true)' : 'ENVIO REAL');
linha('IA', config.ai.provider !== 'mock', `provider: ${config.ai.provider}`);

if (appOnline) {
  try {
    const d = await (await fetch(`${appUrl}/api/sistema/dashboard`)).json();
    console.log('');
    console.log(`   Produtos ativos ....... ${d.produtos.ativos}`);
    console.log(`   Promoções ativas ...... ${d.promocoes.ativas}`);
    console.log(`   Cupons ativos ......... ${d.cupons.ativos}`);
    console.log(`   Campanhas ativas ...... ${d.campanhas.ativas}`);
    console.log(`   Publicado hoje ........ ${d.publicacoes.enviadas_hoje}`);
    console.log(`   Na fila ............... ${d.publicacoes.na_fila}`);
    console.log(`   Erros ................. ${d.publicacoes.erros}`);
  } catch { /* dashboard e opcional aqui */ }
}
console.log('');
