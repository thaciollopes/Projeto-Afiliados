/**
 * Popula o banco com dados de demonstracao (nada real, nenhuma credencial).
 * Rode com: npm run seed   /   INSTALAR.bat ja faz isso.
 *
 * E idempotente: rodar de novo nao duplica nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/config/index.js';
import { getDb } from '../src/core/db/index.js';
import {
  categoryRepository, templateRepository, couponRepository, promotionRepository,
  channelRepository, campaignRepository, affiliateRepository, savedSearchRepository,
  productRepository, settingRepository,
} from '../src/core/repositories/index.js';
import { TEMPLATES_PADRAO } from '../src/core/services/templateService.js';
import { importProducts } from '../src/core/services/productService.js';
import { setCampaignChannels } from '../src/core/services/campaignService.js';
import { MockMarketplace, CATALOGO_DEMO } from '../src/integrations/marketplaces/mock.js';
import { slugify } from '../src/core/utils/id.js';

const CATEGORIAS = [
  ['Perfumaria', 'Beleza'], ['Beleza', 'Beleza'], ['Maquiagem', 'Beleza'],
  ['Skincare', 'Beleza'], ['Cabelos', 'Beleza'], ['Cuidados Pessoais', 'Beleza'],
  ['Moda Feminina', 'Moda'], ['Acessorios', 'Moda'], ['Casa', 'Casa'],
  ['Decoracao', 'Casa'], ['Eletronicos', 'Tecnologia'], ['Infantil', 'Familia'],
  ['Fitness', 'Saude'], ['Presentes', 'Geral'], ['Ofertas Gerais', 'Geral'],
];

const emDias = (dias) => new Date(Date.now() + dias * 86400000).toISOString();

async function main() {
  getDb();
  console.log('Semeando dados de demonstracao...\n');

  gerarImagensDemo();

  // --- categorias ---
  let novasCategorias = 0;
  for (const [nome, nicho] of CATEGORIAS) {
    const slug = slugify(nome);
    if (!categoryRepository.findOne({ slug })) {
      categoryRepository.create({ nome, slug, nicho, ativo: true });
      novasCategorias += 1;
    }
  }
  console.log(`  categorias ....... ${novasCategorias} novas (${categoryRepository.count()} no total)`);

  // --- templates ---
  let novosTemplates = 0;
  for (const template of TEMPLATES_PADRAO) {
    if (!templateRepository.findOne({ nome: template.nome })) {
      templateRepository.create({ ativo: true, padrao: Boolean(template.padrao), ...template });
      novosTemplates += 1;
    }
  }
  console.log(`  templates ........ ${novosTemplates} novos (${templateRepository.count()} no total)`);

  // --- produtos (via adapter de demonstracao) ---
  const demo = new MockMarketplace();
  const produtos = await demo.search({ limite: CATALOGO_DEMO.length });
  const resumo = importProducts(produtos, 'seed');
  console.log(`  produtos ......... ${resumo.criados} novos, ${resumo.atualizados} atualizados`);

  const porTitulo = (trecho) => productRepository.findAll({ search: trecho, limit: 1 }).rows[0] || null;

  // --- cupons ---
  const CUPONS = [
    { codigo: 'PERFUME20', nome: 'R$20 OFF em perfumes', tipo: 'valor_fixo', valor_desconto: 20, valor_minimo: 100, categorias_aplicaveis: ['Perfumaria'], data_fim: emDias(15), origem: 'proprio' },
    { codigo: 'BELEZA30', nome: 'R$30 OFF acima de R$150', tipo: 'valor_fixo', valor_desconto: 30, valor_minimo: 150, categorias_aplicaveis: ['Perfumaria', 'Maquiagem', 'Skincare'], data_fim: emDias(30), origem: 'proprio' },
    { codigo: 'SKIN15', nome: '15% OFF skincare', tipo: 'percentual', valor_desconto: 15, desconto_maximo: 40, categorias_aplicaveis: ['Skincare'], data_fim: emDias(7), origem: 'marketplace' },
    { codigo: 'FRETEGRATIS', nome: 'Frete gratis acima de R$79', tipo: 'frete_gratis', valor_minimo: 79, data_fim: emDias(60), origem: 'marketplace' },
    { codigo: 'PRIMEIRA10', nome: '10% na primeira compra', tipo: 'percentual', valor_desconto: 10, data_fim: emDias(90), origem: 'proprio' },
  ];
  let novosCupons = 0;
  for (const cupom of CUPONS) {
    if (!couponRepository.findOne({ codigo: cupom.codigo })) {
      couponRepository.create({
        status: 'ativo', usos: 0, produtos_aplicaveis: [], categorias_aplicaveis: [],
        marketplace: 'demo', data_inicio: new Date().toISOString(), ...cupom,
      });
      novosCupons += 1;
    }
  }
  console.log(`  cupons ........... ${novosCupons} novos (${couponRepository.count()} no total)`);

  // --- promocoes (uma delas combina desconto da loja + cupom) ---
  const cupomPerfume = couponRepository.findOne({ codigo: 'PERFUME20' });
  const PROMOS = [
    { nome: 'Perfume floral com cupom', busca: 'Perfume Feminino Floral', preco_normal: 199.9, preco_promocional: 159.9, coupon_id: cupomPerfume?.id, dias: 10 },
    { nome: 'Body splash em oferta', busca: 'Body Splash', preco_normal: 59.9, preco_promocional: 39.9, dias: 5 },
    { nome: 'Kit skincare da semana', busca: 'Kit Skincare', preco_normal: 169.9, preco_promocional: 99.9, dias: 7 },
    { nome: 'Serum vitamina C', busca: 'Serum Facial', preco_normal: 99.9, preco_promocional: 59.9, dias: 3 },
    { nome: 'Secador profissional', busca: 'Secador', preco_normal: 299.9, preco_promocional: 189.9, dias: 20 },
  ];
  let novasPromos = 0;
  for (const promo of PROMOS) {
    if (promotionRepository.findOne({ nome: promo.nome })) continue;
    const produto = porTitulo(promo.busca);
    if (!produto) continue;
    promotionRepository.create({
      nome: promo.nome,
      product_id: produto.id,
      marketplace: produto.marketplace,
      categoria: produto.categoria,
      preco_normal: promo.preco_normal,
      preco_promocional: promo.preco_promocional,
      coupon_id: promo.coupon_id || null,
      data_inicio: new Date().toISOString(),
      data_fim: emDias(promo.dias),
      status: 'ativa',
      origem: 'manual',
    });
    novasPromos += 1;
  }
  console.log(`  promocoes ........ ${novasPromos} novas (${promotionRepository.count()} no total)`);

  // --- canais (grupos de demonstracao; trocar pelos IDs reais depois) ---
  const CANAIS = [
    { nome: '[DEMO] Ofertas Femininas', identificador: '120363000000000001@g.us', intervalo_minutos: 30, limite_diario: 12 },
    { nome: '[DEMO] Achadinhos e Cupons', identificador: '120363000000000002@g.us', intervalo_minutos: 45, limite_diario: 10 },
    { nome: '[DEMO] Perfumaria Importada', identificador: '120363000000000003@g.us', intervalo_minutos: 60, limite_diario: 8 },
  ];
  let novosCanais = 0;
  for (const canal of CANAIS) {
    if (!channelRepository.findOne({ identificador: canal.identificador })) {
      channelRepository.create({
        tipo: 'grupo', provider: 'waha', sessao: 'default', status: 'ativo',
        hora_inicio: '08:00', hora_fim: '22:00',
        observacoes: 'Grupo de demonstracao. Troque pelo ID real em WHATSAPP > Grupos.',
        ...canal,
      });
      novosCanais += 1;
    }
  }
  console.log(`  canais ........... ${novosCanais} novos (${channelRepository.count()} no total)`);

  // --- programas de afiliados (sem segredo: as chaves ficam no .env) ---
  const PROGRAMAS = [
    { nome: 'Loja Demo', marketplace: 'demo', parametro_tag: 'aff', identificador: 'DEMO123', base_url: 'https://exemplo.demo', comissao_media: 8, observacoes: 'Programa ficticio usado nos testes.' },
    { nome: 'AliExpress Portals', marketplace: 'aliexpress', parametro_tag: 'aff_trace_key', credenciais: ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_TRACKING_ID'], comissao_media: 6 },
    { nome: 'Amazon Associates', marketplace: 'amazon', parametro_tag: 'tag', credenciais: ['AMAZON_ACCESS_KEY', 'AMAZON_SECRET_KEY', 'AMAZON_PARTNER_TAG'], comissao_media: 5 },
    { nome: 'Mercado Livre', marketplace: 'mercadolivre', parametro_tag: 'matt_tool', credenciais: ['MERCADOLIVRE_CLIENT_ID', 'MERCADOLIVRE_CLIENT_SECRET'], comissao_media: 4 },
    { nome: 'Shopee Affiliate', marketplace: 'shopee', parametro_tag: 'af_id', credenciais: ['SHOPEE_APP_ID', 'SHOPEE_APP_SECRET'], comissao_media: 7 },
  ];
  let novosProgramas = 0;
  for (const programa of PROGRAMAS) {
    if (!affiliateRepository.findOne({ nome: programa.nome })) {
      affiliateRepository.create({ ativo: true, tipo: 'afiliado', status_conexao: 'nao_testado', credenciais: [], ...programa });
      novosProgramas += 1;
    }
  }
  console.log(`  afiliados ........ ${novosProgramas} novos (${affiliateRepository.count()} no total)`);

  // --- pesquisas salvas ---
  const PESQUISAS = [
    { nome: 'Perfumes femininos mais vendidos', filtros: { termo: 'perfume feminino', categoria: 'Perfumaria', preco_max: 150, ordenacao: 'vendas' }, ordenacao: 'vendas', quantidade: 10 },
    { nome: 'Skincare com maior desconto', filtros: { categoria: 'Skincare', desconto_min: 25, ordenacao: 'desconto' }, ordenacao: 'desconto', quantidade: 10 },
  ];
  let novasPesquisas = 0;
  for (const pesquisa of PESQUISAS) {
    if (!savedSearchRepository.findOne({ nome: pesquisa.nome })) {
      savedSearchRepository.create(pesquisa);
      novasPesquisas += 1;
    }
  }
  console.log(`  pesquisas ........ ${novasPesquisas} novas`);

  // --- campanhas ---
  const templatePadrao = templateRepository.findOne({ padrao: 1 });
  const templateAchadinho = templateRepository.findOne({ nome: 'Achadinho do dia' });
  const canais = channelRepository.list({ limit: 10 });
  const pesquisaPerfumes = savedSearchRepository.findOne({ nome: 'Perfumes femininos mais vendidos' });

  const CAMPANHAS = [
    {
      nome: 'Perfumes Femininos', modo: 'pesquisa', saved_search_id: pesquisaPerfumes?.id,
      template_id: templatePadrao?.id, intervalo_minutos: 30, hora_inicio: '08:00', hora_fim: '22:00',
      loop: true, nao_repetir_dias: 7, limite_diario: 12, status: 'pausada',
      descricao: 'Publica perfumes femininos mais vendidos ate R$150.',
      canais: canais.slice(0, 1).map((c) => c.id),
    },
    {
      nome: 'Ofertas do Dia', modo: 'ofertas_do_dia', template_id: templatePadrao?.id,
      filtros: { desconto_min: 25, ordenacao: 'desconto' }, intervalo_minutos: 45,
      hora_inicio: '09:00', hora_fim: '21:00', loop: true, nao_repetir_dias: 3,
      limite_diario: 10, status: 'pausada', descricao: 'Maiores descontos do catalogo.',
      canais: canais.slice(1, 2).map((c) => c.id),
    },
    {
      nome: 'Cupons de Beleza', modo: 'cupons', template_id: templateAchadinho?.id,
      filtros: { categoria: 'Skincare' }, intervalo_minutos: 60, hora_inicio: '10:00',
      hora_fim: '20:00', loop: true, nao_repetir_dias: 15, limite_diario: 8, status: 'pausada',
      descricao: 'So produtos que tem cupom valido no momento.',
      canais: canais.slice(2, 3).map((c) => c.id),
    },
  ];
  let novasCampanhas = 0;
  for (const campanha of CAMPANHAS) {
    if (campaignRepository.findOne({ nome: campanha.nome })) continue;
    const { canais: alvos = [], ...dados } = campanha;
    const criada = campaignRepository.create({ filtros: {}, produto_ids: [], dias_semana: [], usar_ia: false, ...dados });
    setCampaignChannels(criada.id, alvos);
    novasCampanhas += 1;
  }
  console.log(`  campanhas ........ ${novasCampanhas} novas (${campaignRepository.count()} no total)`);

  if (!settingRepository.get('primeira_execucao')) {
    settingRepository.set('primeira_execucao', new Date().toISOString());
    settingRepository.set('score_weights', { vendas: 0.3, avaliacao: 0.2, desconto: 0.3, novidade: 0.1, preco: 0.1 });
  }

  console.log('\nPronto. Tudo criado como DEMONSTRACAO e com as campanhas PAUSADAS.');
  console.log('Abra o painel, confira e so depois ative o que quiser.\n');
}

/** Imagens locais dos produtos demo (funciona offline, sem baixar nada). */
function gerarImagensDemo() {
  const destino = path.join(ROOT, 'public', 'assets', 'demo');
  fs.mkdirSync(destino, { recursive: true });

  for (const item of CATALOGO_DEMO) {
    const arquivo = path.join(destino, `${item.id}.svg`);
    if (fs.existsSync(arquivo)) continue;
    const texto = item.titulo.length > 38 ? `${item.titulo.slice(0, 38)}...` : item.titulo;
    fs.writeFileSync(arquivo, `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#${item.cor}"/><stop offset="100%" stop-color="#ffffff"/>
  </linearGradient></defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="300" cy="235" r="105" fill="#ffffff" opacity="0.55"/>
  <text x="300" y="255" font-family="Segoe UI, Arial" font-size="72" text-anchor="middle" fill="#7a5c6b">DEMO</text>
  <text x="300" y="430" font-family="Segoe UI, Arial" font-size="26" text-anchor="middle" fill="#4a3a42">${escapar(texto)}</text>
  <text x="300" y="470" font-family="Segoe UI, Arial" font-size="20" text-anchor="middle" fill="#7a6a72">${escapar(item.categoria)}</text>
</svg>`, 'utf8');
  }
}

function escapar(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

main().catch((err) => {
  console.error('\nFalha no seed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
