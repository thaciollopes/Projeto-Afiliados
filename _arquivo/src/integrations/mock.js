/**
 * Marketplace de demonstracao: catalogo fixo de perfumaria/beleza.
 *
 * Existe para: (1) o seed criar dados de exemplo, (2) dar para testar busca,
 * campanha, fila e template sem nenhuma credencial. Nada aqui e real.
 */
import { MarketplaceAdapter } from './base.js';

const CATALOGO = [
  { id: 'DM-1001', titulo: 'Perfume Feminino Floral Eau de Parfum 100ml', categoria: 'Perfumaria', subcategoria: 'Feminino', preco: 129.9, preco_anterior: 199.9, vendas: 1840, avaliacao: 4.8, avaliacoes: 632, cor: 'f7c8d8', tags: ['perfume', 'feminino', 'importado'] },
  { id: 'DM-1002', titulo: 'Body Splash Frutas Vermelhas 250ml', categoria: 'Perfumaria', subcategoria: 'Body Splash', preco: 39.9, preco_anterior: 59.9, vendas: 3210, avaliacao: 4.6, avaliacoes: 1204, cor: 'ffd6e0', tags: ['body splash', 'feminino'] },
  { id: 'DM-1003', titulo: 'Kit 3 Perfumes Femininos Miniatura 30ml', categoria: 'Perfumaria', subcategoria: 'Kit', preco: 89.9, preco_anterior: 149.9, vendas: 920, avaliacao: 4.7, avaliacoes: 288, cor: 'e8d5f2', tags: ['kit', 'perfume', 'presente'] },
  { id: 'DM-1004', titulo: 'Perfume Masculino Amadeirado 100ml', categoria: 'Perfumaria', subcategoria: 'Masculino', preco: 119.9, preco_anterior: 179.9, vendas: 1410, avaliacao: 4.7, avaliacoes: 501, cor: 'c9d6df', tags: ['perfume', 'masculino'] },
  { id: 'DM-1005', titulo: 'Perfume Importado Feminino Doce 50ml', categoria: 'Perfumaria', subcategoria: 'Feminino', preco: 159.9, preco_anterior: 219.9, vendas: 640, avaliacao: 4.9, avaliacoes: 190, cor: 'f3d1c4', tags: ['perfume', 'importado', 'feminino'] },
  { id: 'DM-1006', titulo: 'Hidratante Corporal Manteiga de Karite 400ml', categoria: 'Skincare', subcategoria: 'Corpo', preco: 45.9, preco_anterior: 69.9, vendas: 2750, avaliacao: 4.8, avaliacoes: 980, cor: 'f6e3c5', tags: ['hidratante', 'corpo'] },
  { id: 'DM-1007', titulo: 'Serum Facial Vitamina C 30ml', categoria: 'Skincare', subcategoria: 'Facial', preco: 59.9, preco_anterior: 99.9, vendas: 4120, avaliacao: 4.7, avaliacoes: 1560, cor: 'ffe9b0', tags: ['skincare', 'vitamina c'] },
  { id: 'DM-1008', titulo: 'Protetor Solar Facial FPS 60 Toque Seco', categoria: 'Skincare', subcategoria: 'Facial', preco: 49.9, preco_anterior: 79.9, vendas: 3890, avaliacao: 4.8, avaliacoes: 1320, cor: 'ffe0a3', tags: ['protetor solar', 'skincare'] },
  { id: 'DM-1009', titulo: 'Kit Skincare Limpeza + Tonico + Hidratante', categoria: 'Skincare', subcategoria: 'Kit', preco: 99.9, preco_anterior: 169.9, vendas: 730, avaliacao: 4.6, avaliacoes: 210, cor: 'd6f0e0', tags: ['kit', 'skincare'] },
  { id: 'DM-1010', titulo: 'Acido Hialuronico Facial 30ml', categoria: 'Skincare', subcategoria: 'Facial', preco: 39.9, preco_anterior: 64.9, vendas: 2210, avaliacao: 4.5, avaliacoes: 640, cor: 'cfe8f7', tags: ['skincare', 'antiidade'] },
  { id: 'DM-1011', titulo: 'Batom Matte Longa Duracao Kit 6 Cores', categoria: 'Maquiagem', subcategoria: 'Labios', preco: 34.9, preco_anterior: 59.9, vendas: 5300, avaliacao: 4.4, avaliacoes: 2100, cor: 'f5b8b8', tags: ['batom', 'maquiagem', 'kit'] },
  { id: 'DM-1012', titulo: 'Paleta de Sombras 35 Cores Profissional', categoria: 'Maquiagem', subcategoria: 'Olhos', preco: 69.9, preco_anterior: 119.9, vendas: 1980, avaliacao: 4.6, avaliacoes: 760, cor: 'e6c9f0', tags: ['sombra', 'maquiagem'] },
  { id: 'DM-1013', titulo: 'Base Liquida Alta Cobertura 30ml', categoria: 'Maquiagem', subcategoria: 'Rosto', preco: 54.9, preco_anterior: 89.9, vendas: 2640, avaliacao: 4.5, avaliacoes: 890, cor: 'f0d9c0', tags: ['base', 'maquiagem'] },
  { id: 'DM-1014', titulo: 'Mascara de Cilios Volume Extremo', categoria: 'Maquiagem', subcategoria: 'Olhos', preco: 29.9, preco_anterior: 49.9, vendas: 4450, avaliacao: 4.3, avaliacoes: 1780, cor: 'd0d0e8', tags: ['cilios', 'maquiagem'] },
  { id: 'DM-1015', titulo: 'Kit Pinceis de Maquiagem 12 Pecas', categoria: 'Maquiagem', subcategoria: 'Acessorios', preco: 44.9, preco_anterior: 79.9, vendas: 1620, avaliacao: 4.6, avaliacoes: 520, cor: 'f2dcc8', tags: ['pincel', 'kit', 'maquiagem'] },
  { id: 'DM-1016', titulo: 'Progressiva Sem Formol 1L', categoria: 'Cabelos', subcategoria: 'Tratamento', preco: 89.9, preco_anterior: 149.9, vendas: 870, avaliacao: 4.4, avaliacoes: 310, cor: 'd9e7c9', tags: ['cabelo', 'progressiva'] },
  { id: 'DM-1017', titulo: 'Kit Shampoo e Condicionador Hidratacao 2x300ml', categoria: 'Cabelos', subcategoria: 'Kit', preco: 59.9, preco_anterior: 94.9, vendas: 2380, avaliacao: 4.7, avaliacoes: 820, cor: 'c9e4f0', tags: ['cabelo', 'kit'] },
  { id: 'DM-1018', titulo: 'Secador de Cabelo Profissional 2200W', categoria: 'Cabelos', subcategoria: 'Eletro', preco: 189.9, preco_anterior: 299.9, vendas: 540, avaliacao: 4.5, avaliacoes: 180, cor: 'e0e0e0', tags: ['cabelo', 'eletro'] },
  { id: 'DM-1019', titulo: 'Oleo Capilar Reparador de Pontas 60ml', categoria: 'Cabelos', subcategoria: 'Tratamento', preco: 27.9, preco_anterior: 44.9, vendas: 3120, avaliacao: 4.6, avaliacoes: 1050, cor: 'f0e2b8', tags: ['cabelo', 'oleo'] },
  { id: 'DM-1020', titulo: 'Escova Alisadora Ceramica Bivolt', categoria: 'Cabelos', subcategoria: 'Eletro', preco: 119.9, preco_anterior: 199.9, vendas: 960, avaliacao: 4.4, avaliacoes: 390, cor: 'dcd6ef', tags: ['cabelo', 'eletro'] },
  { id: 'DM-1021', titulo: 'Necessaire Organizadora de Maquiagem', categoria: 'Acessorios', subcategoria: 'Organizacao', preco: 49.9, preco_anterior: 79.9, vendas: 1180, avaliacao: 4.5, avaliacoes: 420, cor: 'f0cfe0', tags: ['acessorio', 'organizador'] },
  { id: 'DM-1022', titulo: 'Kit Presente Feminino Perfume + Hidratante', categoria: 'Presentes', subcategoria: 'Kit', preco: 109.9, preco_anterior: 179.9, vendas: 690, avaliacao: 4.8, avaliacoes: 240, cor: 'f7d6e8', tags: ['presente', 'kit', 'perfume'] },
  { id: 'DM-1023', titulo: 'Desodorante Antitranspirante Feminino 150ml', categoria: 'Cuidados Pessoais', subcategoria: 'Desodorante', preco: 24.9, preco_anterior: 36.9, vendas: 5100, avaliacao: 4.5, avaliacoes: 1900, cor: 'd8f0ea', tags: ['cuidados', 'feminino'] },
  { id: 'DM-1024', titulo: 'Sabonete Liquido Intimo Suave 200ml', categoria: 'Cuidados Pessoais', subcategoria: 'Higiene', preco: 22.9, preco_anterior: 34.9, vendas: 2870, avaliacao: 4.7, avaliacoes: 940, cor: 'e4f0d8', tags: ['cuidados', 'higiene'] },
];

export class MockMarketplace extends MarketplaceAdapter {
  constructor() {
    super({
      nome: 'demo',
      rotulo: 'Loja Demo (simulacao)',
      implementado: true,
      motivo: 'Catalogo ficticio para testes. Nenhum dado real.',
    });
  }

  async search(filtros = {}) {
    const termo = String(filtros.termo || '').toLowerCase().trim();
    const palavras = termo.split(/\s+/).filter(Boolean);

    let itens = CATALOGO.filter((item) => {
      if (palavras.length) {
        const alvo = `${item.titulo} ${item.categoria} ${item.subcategoria} ${item.tags.join(' ')}`.toLowerCase();
        if (!palavras.every((p) => alvo.includes(p))) return false;
      }
      if (filtros.categoria && String(item.categoria).toLowerCase() !== String(filtros.categoria).toLowerCase()) return false;
      if (filtros.precoMin && item.preco < Number(filtros.precoMin)) return false;
      if (filtros.precoMax && item.preco > Number(filtros.precoMax)) return false;
      if (filtros.descontoMin) {
        const desconto = Math.round(((item.preco_anterior - item.preco) / item.preco_anterior) * 100);
        if (desconto < Number(filtros.descontoMin)) return false;
      }
      if (filtros.avaliacaoMin && item.avaliacao < Number(filtros.avaliacaoMin)) return false;
      return true;
    });

    const ordenacoes = {
      vendas: (a, b) => b.vendas - a.vendas,
      desconto: (a, b) => descontoDe(b) - descontoDe(a),
      preco: (a, b) => a.preco - b.preco,
      preco_desc: (a, b) => b.preco - a.preco,
      avaliacao: (a, b) => b.avaliacao - a.avaliacao,
    };
    itens = [...itens].sort(ordenacoes[filtros.ordenacao] || ordenacoes.vendas);

    const limite = Math.min(Number(filtros.limite) || 20, CATALOGO.length);
    return itens.slice(0, limite).map((item) => this.normalize(toRaw(item)));
  }

  async getProduct(externalId) {
    const item = CATALOGO.find((p) => p.id === externalId);
    return item ? this.normalize(toRaw(item)) : null;
  }
}

function descontoDe(item) {
  return Math.round(((item.preco_anterior - item.preco) / item.preco_anterior) * 100);
}

function toRaw(item) {
  return {
    external_id: item.id,
    titulo: item.titulo,
    descricao: `${item.titulo}. Produto de demonstracao da categoria ${item.categoria}.`,
    categoria: item.categoria,
    subcategoria: item.subcategoria,
    nicho: 'Beleza',
    palavras_chave: item.tags,
    imagem: `/assets/demo/${item.id}.svg`,
    imagens: [`/assets/demo/${item.id}.svg`],
    url: `https://exemplo.demo/produto/${item.id}`,
    preco: item.preco,
    preco_anterior: item.preco_anterior,
    moeda: 'BRL',
    frete_gratis: item.preco >= 79,
    avaliacao: item.avaliacao,
    quantidade_avaliacoes: item.avaliacoes,
    vendas: item.vendas,
    disponibilidade: 'disponivel',
    tags: item.tags,
  };
}

export const CATALOGO_DEMO = CATALOGO;
