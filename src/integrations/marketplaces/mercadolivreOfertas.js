/**
 * Mercado Livre pelas páginas de OFERTAS — o único caminho de busca que o ML
 * não barra (medido em 24/09/2026):
 *   - lista.mercadolivre.com.br (busca)  → captcha, com ou sem o seu cookie;
 *   - api.mercadolibre.com/.../search    → 403 desde abr/2025;
 *   - www.mercadolivre.com.br/ofertas     → 200, ~48 cartões por página,
 *     filtra por categoria (?category=MLB1246) e pagina (?page=2).
 *
 * A página ignora palavra-chave, então o sistema varre algumas páginas e
 * filtra pelo título. O cookie vai junto (preço de quem está logado).
 */

/** Categorias da própria página de ofertas (ids do ML). */
export const CATEGORIAS_ML = [
  ['', 'Todas as ofertas'],
  ['MLB1246', 'Beleza e Cuidado Pessoal'],
  ['MLB264586', 'Saúde'],
  ['MLB1430', 'Calçados, Roupas e Bolsas'],
  ['MLB3937', 'Joias e Relógios'],
  ['MLB1574', 'Casa, Móveis e Decoração'],
  ['MLB5726', 'Eletrodomésticos'],
  ['MLB1000', 'Eletrônicos, Áudio e Vídeo'],
  ['MLB1051', 'Celulares e Telefones'],
  ['MLB1648', 'Informática'],
  ['MLB1144', 'Games'],
  ['MLB1276', 'Esportes e Fitness'],
  ['MLB1384', 'Bebês'],
  ['MLB1132', 'Brinquedos e Hobbies'],
  ['MLB1071', 'Pet Shop'],
  ['MLB1403', 'Alimentos e Bebidas'],
  ['MLB263532', 'Ferramentas'],
  ['MLB1500', 'Construção'],
  ['MLB5672', 'Acessórios para Veículos'],
  ['MLB1368', 'Arte, Papelaria e Armarinho'],
  ['MLB12404', 'Festas e Lembrancinhas'],
];

export function urlOfertas(categoria, pagina = 1) {
  const params = new URLSearchParams();
  if (categoria) params.set('category', categoria);
  if (pagina > 1) params.set('page', String(pagina));
  const qs = params.toString();
  return `https://www.mercadolivre.com.br/ofertas${qs ? `?${qs}` : ''}`;
}

/** "29 reais com 90 centavos" → 29.9 */
function valorDoRotulo(rotulo) {
  const m = String(rotulo || '').match(/([\d.]+)\s*reais?(?:\s*com\s*(\d{1,2})\s*centavos?)?/i);
  if (!m) return null;
  return Number(m[1].replace(/\./g, '')) + (m[2] ? Number(m[2]) / 100 : 0);
}

/** "+5mil vendidos" → 5000 (é o piso que o ML mostra, não um número exato). */
function vendidos(texto) {
  const m = String(texto).match(/\+\s*([\d.,]+)\s*(mil)?\s*vendidos/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
  return Math.round(m[2] ? n * 1000 : n);
}

function limpar(t) {
  return String(t || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** Cartões `poly-card` da página de ofertas → produtos crus. */
export function extrairOfertasML(html) {
  const pedacos = String(html).split(/<div class="andes-card poly-card/).slice(1);
  const produtos = [];
  const vistos = new Set();

  for (const c of pedacos) {
    const link = c.match(/<a href="([^"]+)"[^>]*class="poly-component__title"[^>]*>([^<]+)<\/a>/);
    if (!link) continue;
    const bruto = limpar(link[1]);
    const url = bruto.split('#')[0];
    const titulo = limpar(link[2]);

    // O id do anúncio (wid) às vezes só aparece depois do "#" do link.
    const id = bruto.match(/[?&#]wid=(MLB\d+)/)?.[1]
      || url.match(/MLB-?(\d{8,})/)?.[0]?.replace('-', '')
      || url.match(/MLBU\d+/)?.[0];
    if (!id || vistos.has(id)) continue;

    const anterior = valorDoRotulo(c.match(/andes-money-amount--previous[^>]*aria-label="Antes: ([^"]+)"/)?.[1]);
    const atual = valorDoRotulo(c.match(/poly-price__current[\s\S]*?aria-label="([^"]+)"/)?.[1]);
    const comCupom = /poly-price__unit-description[^>]*>\s*com Cupom/i.test(c);
    const semCupom = valorDoRotulo(c.match(/poly-price__installments[\s\S]*?aria-label="([^"]+)"[\s\S]*?em outros meios/)?.[1]);

    // "R$ 29,90 com Cupom" só vale para quem tem o cupom do ML — publicar esse
    // valor sem o código seria preço inventado. Fica o preço sem cupom.
    const preco = comCupom && semCupom ? semCupom : atual;
    if (!titulo || !Number.isFinite(preco) || preco <= 0) continue;

    const nota = c.match(/Classificação ([\d.]+) de 5/)?.[1];
    vistos.add(id);
    produtos.push({
      external_id: id,
      titulo,
      url,
      imagem: c.match(/<img[^>]+class="poly-component__picture"[^>]+src="([^"]+)"/)?.[1]
        || c.match(/<img[^>]+src="([^"]+)"[^>]+class="poly-component__picture"/)?.[1] || null,
      preco,
      preco_anterior: anterior && anterior > preco ? anterior : null,
      avaliacao: nota ? Number(nota) : null,
      vendas: vendidos(c),
      frete_gratis: /grátis/i.test(c.match(/poly-component__shipping[\s\S]{0,400}/)?.[0] || ''),
      disponibilidade: 'disponivel',
      tags: ['ofertas-ml', ...(comCupom ? ['cupom-ml'] : [])],
    });
  }
  return produtos;
}

/** Todas as palavras do termo no título, sem ligar para acento e caixa. */
export function casaComTermo(titulo, termo) {
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const palavras = norm(termo).split(/\s+/).filter((p) => p.length > 1);
  const alvo = norm(titulo);
  return palavras.every((p) => alvo.includes(p));
}
