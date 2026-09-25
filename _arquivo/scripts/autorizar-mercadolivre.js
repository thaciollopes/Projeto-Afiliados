/**
 * Autorização do Mercado Livre sem copiar link gigante.
 *
 * O script abre o navegador na URL certa, espera você autorizar, e pede só a
 * URL de volta (aquela que dá erro de site — o código está nela).
 */
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { config } from '../src/config/index.js';
import { getMarketplace } from '../src/integrations/marketplaces/index.js';

const linha = (t = '') => console.log(t);

async function principal() {
  const ml = getMarketplace('mercadolivre');

  linha('');
  linha('  ============================================================');
  linha('    CONECTAR O MERCADO LIVRE');
  linha('  ============================================================');
  linha('');

  if (!ml.clientId || !ml.clientSecret) {
    linha('  [ERRO] Faltam MERCADOLIVRE_CLIENT_ID e MERCADOLIVRE_CLIENT_SECRET no .env.');
    linha('  Pegue em developers.mercadolivre.com.br/devcenter e rode de novo.');
    linha('');
    process.exit(1);
  }

  const jaConectado = (await ml.status()).autorizado;
  if (jaConectado) {
    linha('  O Mercado Livre JA esta conectado.');
    linha('  Continuar vai substituir a conexao atual.');
    linha('');
  }

  const url = ml.authorizationUrl(config.marketplaces.mercadolivre.redirectUri);

  linha('  PASSO 1 - Vou abrir o navegador para voce autorizar.');
  linha('');
  linha('  PASSO 2 - Depois de autorizar, a pagina vai dar ERRO');
  linha('            ("Nao e possivel acessar esse site").');
  linha('            Isso e NORMAL. O que importa esta na barra de endereco.');
  linha('');
  linha('  PASSO 3 - Copie a barra de endereco inteira (clique nela + Ctrl+C)');
  linha('            e cole aqui embaixo.');
  linha('');

  const leitor = createInterface({ input: process.stdin, output: process.stdout });
  await leitor.question('  Pressione ENTER para abrir o navegador...');

  abrirNavegador(url);
  linha('');
  linha('  Navegador aberto. Se nao abrir, o endereco esta em:');
  linha('  storage/cache/link-autorizacao.txt');
  linha('');

  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('storage/cache', { recursive: true });
  writeFileSync('storage/cache/link-autorizacao.txt', url, 'utf8');

  const resposta = (await leitor.question('  Cole aqui a URL de volta: ')).trim();
  leitor.close();

  const codigo = extrairCodigo(resposta);
  if (!codigo) {
    linha('');
    linha('  [ERRO] Nao achei o "code=" nessa URL.');
    linha('  Confira se voce copiou a barra de endereco DEPOIS de autorizar.');
    linha('');
    process.exit(1);
  }

  linha('');
  linha(`  Codigo recebido (${codigo.slice(0, 18)}...). Trocando por acesso...`);

  try {
    const resultado = await ml.exchangeCode(codigo, config.marketplaces.mercadolivre.redirectUri);
    linha('');
    linha('  ============================================================');
    linha('    CONECTADO!');
    linha('  ============================================================');
    linha(`    Conta: ${resultado.user_id}`);
    linha('    O sistema renova o acesso sozinho a partir de agora.');
    linha('');
    linha('    Teste em: PRODUTOS > Lojas conectadas > Testar busca');
    linha('');
  } catch (err) {
    linha('');
    linha(`  [ERRO] ${err.message}`);
    linha('');
    if (/invalid/i.test(err.message)) {
      linha('  O codigo vale poucos minutos e so pode ser usado uma vez.');
      linha('  Rode este arquivo de novo e cole a URL logo depois de autorizar.');
    }
    linha('');
    process.exit(1);
  }
}

/** Aceita a URL inteira ou só o código colado. */
function extrairCodigo(texto) {
  if (!texto) return null;
  const naUrl = texto.match(/[?&]code=([^&\s]+)/);
  if (naUrl) return decodeURIComponent(naUrl[1]);
  if (/^TG-/i.test(texto)) return texto.split(/[&\s]/)[0];
  return null;
}

function abrirNavegador(url) {
  const plataforma = process.platform;
  if (plataforma === 'win32') {
    // O "start" trata & como separador de comando: por isso as aspas vazias.
    spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (plataforma === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

principal().catch((err) => {
  console.error(`\n  Falhou: ${err.message}\n`);
  process.exit(1);
});
