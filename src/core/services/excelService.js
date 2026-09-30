/**
 * Excel: exportar para conferir/mandar para alguem e importar planilha de
 * produtos. O Excel NAO e o banco do sistema (isso seria fragil e lento) —
 * ele e a ponte com o mundo de fora.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { config } from '../../config/index.js';
import { EXPORTAVEIS } from './maintenanceService.js';
import { importProducts } from './productService.js';
import { lojaDaUrl } from './affiliateLinkService.js';
import { toNumber } from '../utils/money.js';
import { badRequest } from '../utils/errors.js';

/** @param {string[]} tabelas - nomes de EXPORTAVEIS; vazio = todas. */
export async function exportToExcel(tabelas = []) {
  const alvos = tabelas.length
    ? tabelas.filter((t) => EXPORTAVEIS[t])
    : Object.keys(EXPORTAVEIS);
  if (!alvos.length) throw badRequest('Nenhuma tabela valida para exportar');

  const wb = new ExcelJS.Workbook();
  wb.creator = config.app.name;
  wb.created = new Date();

  for (const nome of alvos) {
    const registros = EXPORTAVEIS[nome].listAll();
    const aba = wb.addWorksheet(nome.slice(0, 31));
    if (!registros.length) { aba.addRow(['(sem registros)']); continue; }

    const colunas = Object.keys(registros[0]);
    aba.columns = colunas.map((c) => ({ header: c, key: c, width: Math.min(Math.max(c.length + 4, 14), 45) }));
    for (const registro of registros) {
      const linha = {};
      for (const coluna of colunas) {
        const valor = registro[coluna];
        linha[coluna] = valor && typeof valor === 'object' ? JSON.stringify(valor) : valor;
      }
      aba.addRow(linha);
    }
    aba.getRow(1).font = { bold: true };
    aba.views = [{ state: 'frozen', ySplit: 1 }];
  }

  fs.mkdirSync(config.storage.exportDir, { recursive: true });
  const arquivo = path.join(
    config.storage.exportDir,
    `export-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.xlsx`,
  );
  await wb.xlsx.writeFile(arquivo);
  return { arquivo, tabelas: alvos };
}

/**
 * Importa produtos de uma planilha (.xlsx ou .csv). Cabecalhos aceitos na
 * primeira linha: os nomes do sistema (titulo, preco, preco_anterior,
 * marketplace, categoria, url, url_afiliado, imagem, external_id, avaliacao,
 * vendas, descricao, tags) ou os da lista da Shopee (ver COLUNAS).
 */
/**
 * Id para linha sem external_id. Antes era o numero da linha ("xls-2"): a
 * segunda planilha sobrescrevia os produtos da primeira nas mesmas linhas.
 * Agora o mesmo link (ou o mesmo titulo) cai sempre no mesmo produto.
 */
function idEstavel(url, titulo) {
  const base = (url ? url.split(/[?#]/)[0] : String(titulo)).trim().toLowerCase();
  return `xls-${crypto.createHash('sha1').update(base).digest('hex').slice(0, 12)}`;
}

/**
 * Nomes de coluna aceitos para cada campo. Alem dos nomes do proprio sistema,
 * entram os da lista que a Shopee gera em "Obter link em massa" (em ingles e
 * em portugues) — assim o arquivo baixado de la sobe sem editar nada.
 */
const COLUNAS = {
  titulo: ['titulo', 'titulo_original', 'nome', 'item_name', 'product_name', 'nome_do_item', 'nome_do_produto', 'produto'],
  preco: ['preco', 'preco_atual', 'price', 'preco_do_item', 'preco_promocional'],
  preco_anterior: ['preco_anterior', 'original_price', 'preco_original'],
  url: ['url', 'product_link', 'link_do_produto', 'item_link', 'url_do_produto'],
  url_afiliado: ['url_afiliado', 'offer_link', 'link_da_oferta', 'link_de_afiliado', 'affiliate_link', 'short_link', 'link_curto'],
  imagem: ['imagem', 'image', 'image_link', 'image_url', 'link_da_imagem', 'imagem_principal'],
  external_id: ['external_id', 'item_id', 'id_do_item', 'itemid', 'product_id'],
  vendas: ['vendas', 'sales', 'vendidos', 'quantidade_vendas', 'historical_sold'],
  comissao: ['comissao_percentual', 'commission_rate', 'taxa_de_comissao', 'taxa_comissao'],
  loja: ['shop_name', 'nome_da_loja', 'loja'],
  marketplace: ['marketplace'],
  categoria: ['categoria', 'category'],
  avaliacao: ['avaliacao', 'rating', 'item_rating'],
  descricao: ['descricao', 'description'],
  tags: ['tags'],
};

/** "Link da Oferta" -> "link_da_oferta"; "Preço" -> "preco". */
function normalizarCabecalho(texto) {
  return String(texto ?? '').replace(/^﻿/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function campo(linha, nome) {
  for (const chave of COLUNAS[nome]) {
    const valor = linha[chave];
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') return valor;
  }
  return null;
}

function texto(linha, nome) {
  const valor = campo(linha, nome);
  return valor === null ? null : String(valor).trim();
}

/** Vendas vem como "1,2mil", "10k+" ou "350". */
function lerVendas(valor) {
  if (valor === null) return null;
  const bruto = String(valor).toLowerCase();
  const n = toNumber(bruto.replace(/[^\d,.]/g, ''));
  if (n === null) return null;
  return /mil|k/.test(bruto) ? Math.round(n * 1000) : n;
}

/**
 * CSV com aspas, virgula ou ponto e virgula (o Excel em portugues salva com
 * ";"). O separador e o que mais aparece na primeira linha fora de aspas.
 */
export function lerCsv(conteudoBruto) {
  const conteudo = String(conteudoBruto).replace(/^﻿/, '');
  const primeira = conteudo.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
  const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';

  const linhas = [];
  let linha = [];
  let celula = '';
  let aspas = false;
  const fecharLinha = () => {
    linha.push(celula);
    celula = '';
    if (linha.some((v) => v.trim() !== '')) linhas.push(linha);
    linha = [];
  };
  for (let i = 0; i < conteudo.length; i += 1) {
    const c = conteudo[i];
    if (aspas) {
      if (c === '"' && conteudo[i + 1] === '"') { celula += '"'; i += 1; } else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(celula); celula = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && conteudo[i + 1] === '\n') i += 1;
      fecharLinha();
    } else celula += c;
  }
  fecharLinha();
  return linhas;
}

/** Tabela crua (primeira linha = cabecalhos) -> objetos por cabecalho normalizado. */
function tabelaParaObjetos(tabela) {
  const [cabecalho = [], ...resto] = tabela;
  const chaves = cabecalho.map(normalizarCabecalho);
  return resto.map((valores) => {
    const obj = {};
    chaves.forEach((chave, i) => { if (chave) obj[chave] = valores[i]; });
    return obj;
  });
}

function linhasParaProdutos(linhas) {
  const produtos = [];
  for (const linha of linhas) {
    const titulo = texto(linha, 'titulo');
    if (!titulo) continue;

    const url = texto(linha, 'url');
    const urlAfiliado = texto(linha, 'url_afiliado');
    const comissao = texto(linha, 'comissao');
    const loja = texto(linha, 'loja');
    const tags = texto(linha, 'tags');
    produtos.push({
      // Sem a coluna marketplace, a loja sai do link: e isso que faz o link
      // de afiliado ser gerado (produto "importado" nunca ganharia comissao).
      marketplace: String(texto(linha, 'marketplace') || lojaDaUrl(url) || lojaDaUrl(urlAfiliado) || 'importado').toLowerCase(),
      external_id: texto(linha, 'external_id') || idEstavel(url || urlAfiliado, titulo),
      titulo_original: titulo,
      descricao_original: texto(linha, 'descricao'),
      categoria: texto(linha, 'categoria'),
      preco_atual: toNumber(campo(linha, 'preco')),
      preco_anterior: toNumber(campo(linha, 'preco_anterior')),
      url_original: url || urlAfiliado,
      url_afiliado: urlAfiliado,
      imagem_principal: texto(linha, 'imagem'),
      avaliacao: toNumber(campo(linha, 'avaliacao')),
      quantidade_vendas: lerVendas(campo(linha, 'vendas')),
      tags: tags ? tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : [],
      observacoes: [comissao && `Comissao: ${comissao}`, loja && `Loja: ${loja}`].filter(Boolean).join(' | ') || null,
      moeda: 'BRL',
      disponibilidade: 'disponivel',
      status: 'ativo',
    });
  }
  if (!produtos.length) throw badRequest('Nenhuma linha valida encontrada (falta a coluna "titulo" ou "Item Name"?)');
  const { ids: _ids, ...resultado } = importProducts(produtos, 'import');
  return { ...resultado, lidos: produtos.length };
}

export function importarCsv(conteudo) {
  return linhasParaProdutos(tabelaParaObjetos(lerCsv(conteudo)));
}

/**
 * Planilha enviada pelo painel (base64): .xlsx ou .csv — inclusive o CSV do
 * "Obter link em massa" da Shopee. O .xlsx so existe durante a leitura: vai
 * para a pasta de cache e e apagado no fim.
 */
export async function importarPlanilhaEnviada(base64, nome = 'planilha.xlsx') {
  if (!base64) throw badRequest('Envie o arquivo .xlsx ou .csv');
  const conteudo = Buffer.from(String(base64).replace(/^data:[^,]*,/, ''), 'base64');
  if (/\.csv$/i.test(String(nome))) return importarCsv(conteudo.toString('utf8'));
  if (!/\.xlsx$/i.test(String(nome))) throw badRequest('O arquivo precisa ser .xlsx ou .csv');

  fs.mkdirSync(config.storage.cacheDir, { recursive: true });
  const temporario = path.join(config.storage.cacheDir, `import-${Date.now()}.xlsx`);
  fs.writeFileSync(temporario, conteudo);
  try {
    return await importProductsFromExcel(temporario);
  } finally {
    fs.rmSync(temporario, { force: true });
  }
}

export async function importProductsFromExcel(caminhoArquivo) {
  // So arquivos da pasta storage: o caminho vem de fora (API/n8n), e sem essa
  // trava daria para mandar o servidor ler qualquer arquivo da maquina.
  const raiz = path.resolve(path.dirname(config.storage.cacheDir));
  if (!path.resolve(caminhoArquivo).startsWith(raiz + path.sep)) {
    throw badRequest('O arquivo precisa estar dentro da pasta storage do sistema');
  }
  if (!fs.existsSync(caminhoArquivo)) throw badRequest('Arquivo nao encontrado');

  if (/\.csv$/i.test(caminhoArquivo)) return importarCsv(fs.readFileSync(caminhoArquivo, 'utf8'));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminhoArquivo);
  const aba = wb.worksheets[0];
  if (!aba) throw badRequest('Planilha vazia');

  const tabela = [];
  aba.eachRow((row) => {
    const valores = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => { valores[col - 1] = cell.value?.text ?? cell.value; });
    tabela.push(Array.from(valores, (v) => (v === undefined ? null : v)));
  });
  return linhasParaProdutos(tabelaParaObjetos(tabela));
}
