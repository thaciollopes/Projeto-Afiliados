/**
 * Prepara o banco com o básico que não é dado de loja: categorias, templates e
 * pesos do score. Nenhum produto, cupom, grupo ou campanha de exemplo — tudo
 * que aparece no painel é seu.
 * Rode com: npm run seed   /   INSTALAR.bat já faz isso.
 *
 * É idempotente: rodar de novo não duplica nada.
 */
import { getDb } from '../src/core/db/index.js';
import {
  categoryRepository, templateRepository, settingRepository,
} from '../src/core/repositories/index.js';
import { TEMPLATES_PADRAO } from '../src/core/services/templateService.js';
import { slugify } from '../src/core/utils/id.js';

const CATEGORIAS = [
  ['Perfumaria', 'Beleza'], ['Beleza', 'Beleza'], ['Maquiagem', 'Beleza'],
  ['Skincare', 'Beleza'], ['Cabelos', 'Beleza'], ['Cuidados Pessoais', 'Beleza'],
  ['Moda Feminina', 'Moda'], ['Acessorios', 'Moda'], ['Casa', 'Casa'],
  ['Decoracao', 'Casa'], ['Eletronicos', 'Tecnologia'], ['Infantil', 'Familia'],
  ['Fitness', 'Saude'], ['Presentes', 'Geral'], ['Ofertas Gerais', 'Geral'],
];

function main() {
  getDb();
  console.log('Preparando o banco...\n');

  let novasCategorias = 0;
  for (const [nome, nicho] of CATEGORIAS) {
    const slug = slugify(nome);
    if (!categoryRepository.findOne({ slug })) {
      categoryRepository.create({ nome, slug, nicho, ativo: true });
      novasCategorias += 1;
    }
  }
  console.log(`  categorias ....... ${novasCategorias} novas (${categoryRepository.count()} no total)`);

  let novosTemplates = 0;
  for (const template of TEMPLATES_PADRAO) {
    if (!templateRepository.findOne({ nome: template.nome })) {
      templateRepository.create({ ativo: true, padrao: Boolean(template.padrao), ...template });
      novosTemplates += 1;
    }
  }
  console.log(`  templates ........ ${novosTemplates} novos (${templateRepository.count()} no total)`);

  if (!settingRepository.get('primeira_execucao')) {
    settingRepository.set('primeira_execucao', new Date().toISOString());
    settingRepository.set('score_weights', { vendas: 0.3, avaliacao: 0.2, desconto: 0.3, novidade: 0.1, preco: 0.1 });
  }

  console.log('\nPronto. Coloque suas lojas em PRODUTOS → LOJAS.\n');
}

try {
  main();
} catch (err) {
  console.error('\nFalha no seed:', err.message);
  console.error(err.stack);
  process.exit(1);
}
