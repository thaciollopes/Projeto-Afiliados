# Vitrine (o seu site dos posts)

A Amazon não quer o link de associado direto em aplicativo de mensagem
(WhatsApp, Telegram). O modelo usado por ferramentas como o Divulga Links, e
agora por este sistema:

```
post no grupo  →  seusite/p/<produto>  →  botão "Ir para a Amazon"  →  /ir/<produto>  →  Amazon com a sua tag
```

- A página do produto mostra foto, preço, desconto, avaliação e o aviso
  "Como Associado da Amazon, recebo por compras qualificadas".
- O link de afiliado **só** aparece no redirecionamento do botão.
- Cada clique no botão é contado (VITRINE → Cliques).

## Porta separada

A vitrine roda num servidor próprio, na porta `3011` (`VITRINE_PORT`), separado
do painel (`3010`). Ela só tem três caminhos: `/`, `/p/:codigo` e `/ir/:codigo`.
É **só essa porta** que vai para a internet — o painel, os cookies e a API
continuam fechados no seu computador.

## Ligar

1. Publique a porta 3011 com um endereço https (túnel do Cloudflare apontando
   `loja.seudominio.com.br` para `http://host.docker.internal:3011`, ou uma VPS).
2. Painel → **Vitrine (meu site)**: cole o endereço (`https://…/`), marque
   **Vitrine ligada** e salve.
3. Escolha onde o link do site entra:
   - **Amazon e Mercado Livre** (recomendado);
   - **todas as lojas** (Shopee também — o sub ID por grupo da Shopee não passa pelo site).

Sem endereço público, o post continua com o link da loja: o sistema nunca manda
um link que ninguém de fora consegue abrir. Post da Amazon com link direto gera
um aviso no preview.
