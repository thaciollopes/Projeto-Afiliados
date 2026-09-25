/**
 * Catálogo das lojas. Tudo que a tela LOJAS mostra e tudo que o sistema faz com
 * cada loja sai daqui — sem API oficial: o sistema trabalha com o seu cookie e
 * com a sua tag de afiliado.
 *
 * Os dois campos que importam, medidos na prática (não suposição):
 *   busca        o sistema consegue procurar produtos sozinho nessa loja?
 *                (Amazon: sim. Mercado Livre: só pelas páginas de ofertas — a
 *                busca comum cai em captcha. Shopee/Magalu: pela extensão.)
 *   linkAfiliado como o link vira o SEU link:
 *                'cookie' -> o sistema gera pela sua sessão (ML: meli.la)
 *                'tag'    -> a tag entra como parâmetro na URL (Amazon: ?tag=)
 *                'painel' -> só o link gerado no painel da loja paga comissão
 */
import { CATEGORIAS_ML } from './mercadolivreOfertas.js';

export const LOJAS = {
  mercadolivre: {
    id: 'mercadolivre',
    nome: 'Mercado Livre',
    site: 'https://www.mercadolivre.com.br',
    painel: 'https://www.mercadolivre.com.br/afiliados/linkbuilder',
    dominio: 'mercadolivre.com.br',
    // Busca pelas páginas de ofertas (a busca comum cai em captcha).
    busca: true,
    modoBusca: 'ofertas',
    categorias: CATEGORIAS_ML,
    linkAfiliado: 'cookie',
    tag: {
      rotulo: 'Tag de afiliado',
      exemplo: 'em branco = usa o apelido da sua conta',
      obrigatoria: false,
    },
    dicaCookie: 'Exporte o cookie estando na página linkbuilder do painel de afiliados — o "_csrf" precisa vir junto.',
    comoEntramProdutos: 'Pela busca do sistema (varre as ofertas do ML por categoria e palavra) ou pela extensão. O link vira meli.la sozinho.',
  },

  amazon: {
    id: 'amazon',
    nome: 'Amazon',
    site: 'https://www.amazon.com.br',
    painel: 'https://associados.amazon.com.br',
    dominio: 'amazon.com.br',
    busca: true,
    linkAfiliado: 'tag',
    parametro: 'tag',
    tag: {
      rotulo: 'Tag de associado',
      exemplo: 'seuid-20',
      obrigatoria: true,
    },
    dicaCookie: 'Opcional na Amazon: a busca funciona mesmo sem cookie.',
    comoEntramProdutos: 'Pela busca do sistema (PRODUTOS → Procurar) ou pela extensão.',
    buscaUrl: (termo) => `https://www.amazon.com.br/s?k=${encodeURIComponent(termo)}`,
  },

  shopee: {
    id: 'shopee',
    nome: 'Shopee',
    site: 'https://shopee.com.br',
    painel: 'https://affiliate.shopee.com.br',
    dominio: 'shopee.com.br',
    busca: false,
    linkAfiliado: 'painel',
    tag: {
      rotulo: 'ID de afiliado',
      exemplo: 'seu ID no painel Shopee',
      obrigatoria: false,
    },
    dicaCookie: 'Exporte estando logado no painel de afiliados da Shopee.',
    comoEntramProdutos: 'Pela extensão. O link com comissão é o gerado no painel da Shopee (s.shopee.com.br) — cole no campo "Link de afiliado" do produto.',
  },

  magalu: {
    id: 'magalu',
    nome: 'Magazine Luiza',
    site: 'https://www.magazineluiza.com.br',
    painel: 'https://www.magazinevoce.com.br',
    dominio: 'magazineluiza.com.br',
    busca: false,
    linkAfiliado: 'painel',
    tag: {
      rotulo: 'ID do parceiro',
      exemplo: 'seu ID do Parceiro Magalu',
      obrigatoria: false,
    },
    dicaCookie: 'Exporte estando logado no Parceiro Magalu.',
    comoEntramProdutos: 'Pela extensão. O link com comissão é o da sua loja Parceiro Magalu.',
  },
};

export function lojaPorId(id) {
  return LOJAS[String(id || '').replace(/-(web|painel|api|cookie)$/i, '').toLowerCase()] || null;
}

export function listaDeLojas() {
  return Object.values(LOJAS);
}
