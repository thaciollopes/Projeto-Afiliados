# Lojas e links de afiliado

O sistema **não usa API de loja nenhuma**. Trabalha com duas coisas suas, colocadas
em **LOJAS → Minhas lojas**:

- a **tag de afiliado** — o que faz a venda ser atribuída a você;
- o **cookie** da sua sessão na loja — exportado com a extensão Cookie Editor.

Por que não API: o Mercado Livre **não tem** API de afiliados (e fechou a busca da API
em abril/2025); Amazon e Shopee só liberam API depois de aprovação e volume de vendas.
O código antigo de API está em `_arquivo/`, só para consulta.

---

## O que cada loja faz (medido, não suposto)

| Loja | Busca automática | Como o link vira seu | Como os produtos entram |
|---|---|---|---|
| Mercado Livre | ✅ pelas **ofertas** (a busca comum dá captcha) | cookie → o sistema gera `meli.la` | busca do sistema ou extensão |
| Amazon | ✅ | tag no link (`?tag=seuid-20`) | busca do sistema ou extensão |
| Shopee | ❌ lista não renderiza | só o link do painel da Shopee | extensão do navegador |
| Magazine Luiza | ❌ acesso recusado | link da sua loja Parceiro Magalu | extensão do navegador |

O catálogo acima mora em `src/integrations/marketplaces/lojas.js`. É de lá que a tela
LOJAS, a busca e o registro de lojas tiram tudo — mudou uma loja, muda ali.

---

## Como pegar o cookie

1. Instale a extensão **Cookie Editor** no Chrome.
2. Abra a loja e faça login com a conta de afiliado.
   **Mercado Livre:** exporte estando em `mercadolivre.com.br/afiliados/linkbuilder`
   — o cookie `_csrf` precisa vir junto.
3. Cookie Editor → **Export → Export as JSON**.
4. Cole no campo "Cookie" da loja em LOJAS e clique em **Salvar cookie**.

Cookie é senha: fica só no banco local e nunca volta para a tela (só nomes, quantidade e
validade). Ele vence — quando a loja parar de aceitar, exporte e cole de novo.

---

## Mercado Livre: `meli.la` pelo cookie

`src/core/services/mercadoLivreLinkService.js` faz a mesma chamada que a página
*linkbuilder* do seu painel faz ao clicar em "Gerar link" (cookie + token `_csrf`).

- Tag: a que você salvar em LOJAS; em branco, o apelido da conta (cookie `orgnickp`).
- Produto do ML que entra no sistema já é convertido; o que faltar, a publicação avisa
  **SEM COMISSÃO** em vez de sair com link cru.
- Lotes de 10 com pausa: é a sua conta, rajada chama atenção.

## Mercado Livre: busca pelas páginas de ofertas

Medido: `lista.mercadolivre.com.br` cai em captcha **mesmo com o cookie**; a API de busca
dá 403. Já `mercadolivre.com.br/ofertas` responde (~48 produtos por página) e filtra por
categoria (`?category=MLB1246`) e página (`?page=2`). Ela ignora palavra-chave, então o
sistema varre até 8 páginas e filtra pelo título (`mercadolivreOfertas.js`).

- Preço "com Cupom" não é publicado: fica o preço "em outros meios" (sem cupom).
- "+10mil vendidos" vira 10000 — é o piso que o ML mostra.
- Produto do ML não é reconsultado por id (a busca é bloqueada); ele se atualiza quando
  reaparece nas ofertas.

## Amazon: busca pelo HTML da página

`src/integrations/marketplaces/cookie.js` lê os cartões `data-asin` da busca.

- Preço "de" = só o preço **riscado** (`data-a-strike`). O outro preço pequeno do cartão
  é o preço por litro/unidade — pegar esse foi um bug real.
- Intervalo mínimo de 20 s entre buscas e cache de 20 min: nos testes a Amazon bloqueou
  depois de rajadas do mesmo IP.
- Se a loja pedir captcha, a busca falha dizendo isso — nunca devolve lista vazia fingindo
  que não achou nada.

## Shopee e Magalu

Produtos entram pela extensão. O link que paga é o gerado no painel de afiliado da loja:
cole-o no campo **Link de afiliado** do produto.
