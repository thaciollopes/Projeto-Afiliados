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
| Shopee | ❌ lista não renderiza | cookie → o sistema gera `s.shopee.com.br` | extensão do navegador |
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

## Shopee: `s.shopee.com.br` pelo cookie

Mesmo esquema do ML. `src/core/services/shopeeLinkService.js` faz a chamada da página
**Link personalizado** do painel (`affiliate.shopee.com.br/offer/custom_link`): GraphQL
`batchGetCustomLink`, até 5 links por vez, com o cookie da sessão.

- Cookie: exporte logado em `affiliate.shopee.com.br` — o `SPC_EC` precisa vir junto.
- A Shopee não aceita tag no pedido: o link sai na conta **do cookie**. O "ID de
  afiliado" em LOJAS serve para **conferir** — se o link voltar com `affiliate_id`
  diferente, nada é gravado e o erro diz os dois IDs.
- O link do produto vai limpo (`shopee.com.br/product/<loja>/<item>`): o `sp_atk`/`utm`
  de quem compartilhou não vai junto.
- **Não validado contra a Shopee de verdade** a partir deste ambiente (a rede daqui não
  alcança a Shopee). O formato segue projetos open source que usam o mesmo endpoint;
  teste com "Converter" em LOJAS → Shopee antes de confiar.

## Magalu

Produtos entram pela extensão. O link que paga é o da sua loja Parceiro Magalu:
cole-o no campo **Link de afiliado** do produto.

## Conferência do ID de afiliado

Link curto não prova de quem é a comissão. `verificacaoLinkService.js` abre o link como
o cliente abriria (seguindo os redirecionamentos) e lê o ID no destino:

| Loja | Onde o ID aparece |
|---|---|
| Mercado Livre | `matt_word=<sua tag>` |
| Shopee | `affiliate_id=<seu ID>` ou `utm_source=an_<seu ID>` |
| Amazon | `tag=<sua tag>` (sem rede: está no próprio link) |

- A fila confere antes de publicar (uma vez por link; fica em `link_checks`).
- ID de **outra conta** → a publicação é **bloqueada**.
- Não deu para concluir (rede, ID não cadastrado, formato mudou) → aviso "não
  conferido". Nunca vira "ok" sem prova.
- Trocou a tag do ML: os `meli.la` antigos voltam para o link cru e são gerados de novo.
- Em LOJAS: **Conferir link** (um link colado) e **Conferir os produtos** (até 30).
