# Produtos

A base de produtos é o centro do sistema: campanhas, promoções e publicações
consultam ela, nunca o marketplace direto na hora de publicar.

---

## De onde vêm os produtos

| Caminho | Onde | Quando usar |
|---|---|---|
| Busca no marketplace | PRODUTOS → Procurar | o caminho normal |
| Cadastro manual | PRODUTOS → Todos → + Novo | produto avulso, link que você já tem |
| Planilha Excel | `POST /api/sistema/importar-excel` | migrar uma lista que você já mantinha |
| n8n | workflow 07 | coleta automática agendada |

**Buscar não grava nada.** Você busca, olha, seleciona e só então clica em
**Importar selecionados**. Reimportar o mesmo produto atualiza (não duplica): a chave
é `marketplace` + `external_id`.

---

## Campos principais

| Campo | Para que serve |
|---|---|
| `titulo_original` | como veio da loja |
| `titulo_publicacao` | o que vai no post (a IA mexe **aqui**, nunca no original) |
| `preco_atual` | preço de agora |
| `preco_anterior` | o "de" riscado — só aparece no post se for maior que o atual |
| `desconto_percentual` / `desconto_valor` | calculados sozinhos pelos dois preços |
| `url_original` | link da loja, **nunca apagado** |
| `url_afiliado` | seu link com comissão |
| `url_final` | o que vai no post (afiliado, ou original se não houver) |
| `imagem_principal` | imagem enviada junto do texto |
| `disponibilidade` | `indisponivel` bloqueia a publicação |
| `status` | `ativo`, `pausado`, `expirado`, `arquivado` |
| `score` | nota de 0 a 100 usada para ordenar |
| `data_ultima_publicacao` | base do controle de repetição |

---

## Score

Ordena os produtos nas campanhas. Combina cinco fatores, com pesos que **você** define
em SISTEMA → Ajustes:

| Fator | Peso padrão | Como conta |
|---|---|---|
| vendas | 0,30 | até 1.000 vendas = nota cheia |
| avaliação | 0,20 | 5 estrelas = nota cheia |
| desconto | 0,30 | 70% de desconto = nota cheia |
| novidade | 0,10 | cai ao longo de 30 dias |
| preço | 0,10 | mais barato pontua mais (teto R$ 500) |

Mudou os pesos? Clique em **Salvar e recalcular** — o sistema refaz o score de todos.

---

## Histórico de preço

Toda mudança de preço (edição manual, recoleta ou importação) entra em `price_history`
com o valor anterior, o novo e a variação. Variação de 10% ou mais gera **alerta** no
sino 🔔.

É isso que evita o pior erro do ramo: publicar um preço que não existe mais.

---

## Filtros

Na tela de produtos: busca textual, marketplace, categoria, status, preço máximo,
desconto mínimo e ordenação (score, mais vendidos, maior desconto, menor preço,
melhor avaliação, mais recentes).

Filtros mais completos — com cupom, sem cupom, com promoção, frete grátis, nunca
publicado — estão em `POST /api/produtos/filtrar` e nas campanhas.

---

## Seleção em lote

Marque os produtos e use a barra que aparece no topo:

- **Publicar selecionados** — escolhe os grupos e joga tudo na fila
- **Criar campanha** — leva a seleção para uma campanha nova, no modo manual

---

## Ciclo de vida

```
ativo ──(30 dias sem atualização)──> expirado ──(60 dias)──> apagado na limpeza
  │
  └──(loja sem estoque)──> disponibilidade: indisponivel (não publica)
```

Os prazos ficam em SISTEMA → Limpeza. Produto expirado **não some sozinho** —
ele só para de ser publicado até você atualizar ou a limpeza remover.

---

## Importar de planilha

Primeira linha = cabeçalho. Colunas reconhecidas:

```
titulo | preco | preco_anterior | marketplace | categoria | url |
url_afiliado | imagem | external_id | avaliacao | vendas | descricao | tags
```

Só `titulo` é obrigatório. Tags separadas por vírgula.

```http
POST /api/sistema/importar-excel
{ "caminho": "C:\\Users\\voce\\Downloads\\produtos.xlsx" }
```
