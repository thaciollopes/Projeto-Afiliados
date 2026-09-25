/**
 * Excel: exportar para conferir/mandar para alguem e importar planilha de
 * produtos. O Excel NAO e o banco do sistema (isso seria fragil e lento) —
 * ele e a ponte com o mundo de fora.
 */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { config } from '../../config/index.js';
import { EXPORTAVEIS } from './maintenanceService.js';
import { importProducts } from './productService.js';
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
export async function importProductsFromExcel(caminhoArquivo) {
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

    produtos.push({
      marketplace: String(bruto.marketplace || 'importado').toLowerCase(),
      external_id: bruto.external_id ? String(bruto.external_id) : `xls-${numero}`,
      titulo_original: String(titulo),
      descricao_original: bruto.descricao ? String(bruto.descricao) : null,
      categoria: bruto.categoria ? String(bruto.categoria) : null,
      preco_atual: toNumber(bruto.preco ?? bruto.preco_atual),
      preco_anterior: toNumber(bruto.preco_anterior),
      url_original: bruto.url ? String(bruto.url) : null,
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
