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
    const registros = EXPORTAVEIS[nome].list({ limit: 1000 });
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
 * Importa produtos de uma planilha. Cabecalhos aceitos (primeira linha):
 * titulo, preco, preco_anterior, marketplace, categoria, url, imagem,
 * external_id, avaliacao, vendas, descricao, tags
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
 * Planilha enviada pelo painel (base64). O arquivo so existe durante a
 * leitura: vai para a pasta de cache e e apagado no fim.
 */
export async function importarPlanilhaEnviada(base64, nome = 'planilha.xlsx') {
  if (!base64) throw badRequest('Envie o arquivo .xlsx');
  if (!/\.xlsx$/i.test(String(nome))) throw badRequest('O arquivo precisa ser .xlsx');
  const conteudo = Buffer.from(String(base64).replace(/^data:[^,]*,/, ''), 'base64');
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

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminhoArquivo);
  const aba = wb.worksheets[0];
  if (!aba) throw badRequest('Planilha vazia');

  const cabecalhos = [];
  aba.getRow(1).eachCell((cell, col) => {
    cabecalhos[col] = String(cell.value || '').trim().toLowerCase();
  });

  const produtos = [];
  aba.eachRow((row, numero) => {
    if (numero === 1) return;
    const bruto = {};
    row.eachCell((cell, col) => {
      const chave = cabecalhos[col];
      if (chave) bruto[chave] = cell.value?.text ?? cell.value;
    });

    const titulo = bruto.titulo || bruto.titulo_original || bruto.nome;
    if (!titulo) return;

    const url = bruto.url ? String(bruto.url) : null;
    produtos.push({
      // Sem a coluna marketplace, a loja sai do link: e isso que faz o link
      // de afiliado ser gerado (produto "importado" nunca ganharia comissao).
      marketplace: String(bruto.marketplace || lojaDaUrl(url) || 'importado').toLowerCase(),
      external_id: bruto.external_id ? String(bruto.external_id) : idEstavel(url, titulo),
      titulo_original: String(titulo),
      descricao_original: bruto.descricao ? String(bruto.descricao) : null,
      categoria: bruto.categoria ? String(bruto.categoria) : null,
      preco_atual: toNumber(bruto.preco ?? bruto.preco_atual),
      preco_anterior: toNumber(bruto.preco_anterior),
      url_original: url,
      url_afiliado: bruto.url_afiliado ? String(bruto.url_afiliado) : null,
      imagem_principal: bruto.imagem ? String(bruto.imagem) : null,
      avaliacao: toNumber(bruto.avaliacao),
      quantidade_vendas: toNumber(bruto.vendas),
      tags: bruto.tags ? String(bruto.tags).split(/[,;]/).map((t) => t.trim()).filter(Boolean) : [],
      moeda: 'BRL',
      disponibilidade: 'disponivel',
      status: 'ativo',
    });
  });

  if (!produtos.length) throw badRequest('Nenhuma linha valida encontrada (falta a coluna "titulo"?)');
  return { ...importProducts(produtos, 'import'), lidos: produtos.length };
}
