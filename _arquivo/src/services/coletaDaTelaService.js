/**
 * Coleta da tela: os produtos que VOCÊ está vendo no navegador.
 *
 * Por que assim, e não o sistema buscando sozinho: quando o sistema navega, a
 * loja percebe (medido — o Mercado Livre caiu em captcha, a Amazon bloqueou na
 * 4ª busca). Quando quem navega é você, não existe requisição automatizada
 * nenhuma: o sistema só lê o que já está na página aberta.
 *
 * Fluxo: você abre a loja, faz a busca que quiser, e clica em "Coletar desta
 * tela". Produto que já está na base é atualizado, não duplicado.
 */
import { RECEITAS } from '../../integrations/marketplaces/scraper.js';
import { importProducts } from './productService.js';
import { productRepository } from '../repositories/index.js';
import { PORTA_DEBUG } from './capturaSessaoService.js';
import { logger } from '../utils/logger.js';
import { badRequest } from '../utils/errors.js';

const log = logger.child('coleta-tela');

/** Qual receita de seletores usar para cada domínio aberto. */
const POR_DOMINIO = [
  { padrao: /mercadolivre\.com/i, loja: 'mercadolivre' },
  { padrao: /shopee\.com/i, loja: 'shopee' },
  { padrao: /amazon\./i, loja: 'amazon' },
  { padrao: /magazineluiza\./i, loja: 'magalu' },
];

/** As abas abertas no navegador do sistema, com o que dá para coletar. */
export async function abasAbertas() {
  let alvos;
  try {
    const res = await fetch(`http://127.0.0.1:${PORTA_DEBUG}/json/list`, {
      signal: AbortSignal.timeout(5000),
    });
    alvos = await res.json();
  } catch {
    throw badRequest(
      'Navegador não está aberto. Use "Abrir navegador" em Lojas conectadas, '
      + 'faça login e navegue até a busca que você quer coletar.',
    );
  }

  return (alvos || [])
    .filter((a) => a.type === 'page' && /^https?:/.test(a.url || ''))
    .map((aba) => {
      const conhecida = POR_DOMINIO.find((d) => d.padrao.test(aba.url));
      return {
        id: aba.id,
        titulo: String(aba.title || '').slice(0, 70),
        url: String(aba.url).slice(0, 110),
        loja: conhecida?.loja || null,
        coletavel: Boolean(conhecida),
      };
    });
}

/**
 * Lê os produtos da aba e cadastra.
 * @param {{abaId?:string, gravar?:boolean}} opcoes gravar=false só mostra o que viu
 */
export async function coletarDaTela({ abaId = null, gravar = true } = {}) {
  const abas = await abasAbertas();
  const coletaveis = abas.filter((a) => a.coletavel);

  if (!coletaveis.length) {
    throw badRequest(
      'Nenhuma aba de loja aberta. Navegue até a lista de produtos (Mercado Livre, '
      + 'Shopee, Amazon ou Magalu) e tente de novo.',
    );
  }

  const aba = abaId ? coletaveis.find((a) => a.id === abaId) : coletaveis[0];
  if (!aba) throw badRequest('Aba não encontrada. Atualize a lista e escolha de novo.');

  const receita = RECEITAS[aba.loja];
  if (!receita) throw badRequest(`Ainda não sei ler produtos de "${aba.loja}".`);

  const brutos = await lerProdutos(aba.id, receita);

  const produtos = brutos
    .filter((p) => p.titulo && Number.isFinite(p.preco) && p.preco > 0)
    .map((p) => ({
      marketplace: aba.loja,
      external_id: String(p.external_id || idDoLink(p.url) || ''),
      titulo_original: p.titulo,
      preco_atual: p.preco,
      preco_anterior: plausivel(p.preco_anterior, p.preco) ? p.preco_anterior : null,
      url_original: p.url || null,
      imagem_principal: p.imagem || null,
      avaliacao: p.avaliacao && p.avaliacao <= 5 ? p.avaliacao : null,
      moeda: 'BRL',
      disponibilidade: 'disponivel',
      status: 'ativo',
      tags: ['coletado-da-tela'],
    }))
    .filter((p) => p.external_id);

  if (!produtos.length) {
    throw badRequest(
      `Não achei produtos nesta tela (${aba.titulo}). Ela está numa lista de produtos? `
      + 'Se estiver, a loja pode ter mudado o layout — os seletores ficam em scraper.js.',
    );
  }

  // Quem já está na base não vira registro novo: o upsert atualiza.
  const jaCadastrados = produtos.filter((p) =>
    productRepository.findOne({ marketplace: p.marketplace, external_id: p.external_id }));

  if (!gravar) {
    return {
      aba: { titulo: aba.titulo, url: aba.url, loja: aba.loja },
      encontrados: produtos.length,
      ja_cadastrados: jaCadastrados.length,
      novos: produtos.length - jaCadastrados.length,
      produtos: produtos.slice(0, 30),
      gravado: false,
    };
  }

  const resultado = importProducts(produtos, 'tela');
  log.info(`Coleta da tela: ${resultado.criados} novos, ${resultado.atualizados} atualizados`, {
    loja: aba.loja,
  });

  return {
    aba: { titulo: aba.titulo, url: aba.url, loja: aba.loja },
    encontrados: produtos.length,
    ...resultado,
    gravado: true,
  };
}

/** Executa a extração dentro da aba, pela mesma receita do coletor. */
async function lerProdutos(abaId, receita) {
  const alvos = await fetch(`http://127.0.0.1:${PORTA_DEBUG}/json/list`).then((r) => r.json());
  const aba = alvos.find((a) => a.id === abaId);
  if (!aba?.webSocketDebuggerUrl) throw badRequest('Não consegui falar com essa aba.');

  const expressao = `(() => {
    const receita = ${JSON.stringify({ cartao: receita.cartao, campos: receita.campos })};
    const limpar = (t) => (t || '').replace(/\\s+/g, ' ').trim();
    const numero = (t) => {
      const achado = limpar(t).match(/\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?|\\d+(?:\\.\\d+)?/);
      if (!achado) return null;
      let cru = achado[0];
      if (cru.includes(',')) cru = cru.replace(/\\./g, '').replace(',', '.');
      const n = Number.parseFloat(cru);
      return Number.isFinite(n) ? n : null;
    };
    return JSON.stringify([...document.querySelectorAll(receita.cartao)].map((cartao) => {
      const item = {};
      for (const [campo, regra] of Object.entries(receita.campos)) {
        if (regra.atributo) { item[campo] = cartao.getAttribute(regra.atributo); continue; }
        const alvo = cartao.querySelector(regra.seletor);
        if (!alvo) { item[campo] = null; continue; }
        const valor = regra.propriedade ? alvo[regra.propriedade] : alvo.textContent;
        item[campo] = regra.numero ? numero(valor) : limpar(valor);
      }
      return item;
    }));
  })()`;

  const texto = await avaliarNaAba(aba.webSocketDebuggerUrl, expressao);
  try {
    return JSON.parse(texto || '[]');
  } catch {
    throw badRequest('A leitura da tela voltou em formato inesperado.');
  }
}

function avaliarNaAba(urlSocket, expressao) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(urlSocket);
    const limite = setTimeout(() => {
      try { socket.close(); } catch { /* ignora */ }
      reject(badRequest('O navegador não respondeu a tempo.'));
    }, 20000);

    socket.onopen = () => socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: expressao, returnByValue: true, awaitPromise: false },
    }));

    socket.onmessage = (evento) => {
      try {
        const resposta = JSON.parse(evento.data);
        if (resposta.id !== 1) return;
        clearTimeout(limite);
        socket.close();

        if (resposta.result?.exceptionDetails) {
          reject(badRequest(`Erro ao ler a página: ${resposta.result.exceptionDetails.text}`));
          return;
        }
        resolve(resposta.result?.result?.value ?? '[]');
      } catch (err) {
        clearTimeout(limite);
        reject(badRequest(`Falha lendo a página: ${err.message}`));
      }
    };

    socket.onerror = () => {
      clearTimeout(limite);
      reject(badRequest('Falha ao falar com a aba aberta.'));
    };
  });
}

/** ML e Amazon carregam o id no próprio link (MLB-123..., /dp/ASIN). */
function idDoLink(url) {
  if (!url) return null;
  const texto = String(url);
  return (
    texto.match(/MLB-?(\d{8,})/i)?.[0]
    || texto.match(/\/dp\/([A-Z0-9]{10})/i)?.[1]
    || texto.match(/i\.(\d+)\.(\d+)/)?.[0]
    || null
  );
}

function plausivel(anterior, atual) {
  const de = Number(anterior);
  const por = Number(atual);
  if (!Number.isFinite(de) || !Number.isFinite(por) || por <= 0) return false;
  return de > por && de <= por * 5;
}
