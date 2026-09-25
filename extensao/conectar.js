/**
 * "Conectar loja": exporta a sua sessao + a sua etiqueta de afiliado para o
 * painel, do jeito que as plataformas de afiliado fazem.
 *
 * Voce ja esta logado na loja no seu navegador. A extensao le os cookies
 * daquele dominio e manda para o SEU painel, rodando no SEU computador.
 * Nada vai para servidor de terceiro.
 */

const DOMINIOS = {
  mercadolivre: 'mercadolivre.com.br',
  shopee: 'shopee.com.br',
  amazon: 'amazon.com.br',
  magalu: 'magazineluiza.com.br',
};

/** Cookies de analytics nao servem para nada aqui — ficam de fora. */
const DESCARTAVEIS = /^(_ga|_gid|_gcl|_hj|_fb|_tt|_pin|_uet|_clck|_clsk|__utm|ajs_|amplitude)/i;

export async function conectarLoja(loja, api) {
  const dominio = DOMINIOS[loja];
  if (!dominio) throw new Error(`Loja "${loja}" não suportada.`);

  const cookies = (await chrome.cookies.getAll({ domain: dominio }))
    .filter((c) => !DESCARTAVEIS.test(c.name))
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      secure: Boolean(c.secure),
      httpOnly: Boolean(c.httpOnly),
      expirationDate: c.expirationDate,
    }));

  if (!cookies.length) {
    throw new Error(`Você não está logado em ${dominio}. Faça login e tente de novo.`);
  }

  const res = await fetch(`${api}/api/marketplaces/${loja}/sessao`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookies: JSON.stringify(cookies) }),
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => '');
    throw new Error(`O painel recusou (${res.status}): ${detalhe.slice(0, 120)}`);
  }

  return res.json();
}

/** Descobre a sua etiqueta de afiliado a partir da conta logada na loja. */
export async function detectarEtiqueta(loja) {
  if (loja !== 'mercadolivre') return null;

  // O ML guarda o id da conta num cookie proprio — e a mesma conta que aparece
  // no painel de afiliados.
  const cookie = await chrome.cookies.get({
    url: 'https://www.mercadolivre.com.br',
    name: 'orguseridp',
  });
  return cookie?.value || null;
}

export { DOMINIOS };
