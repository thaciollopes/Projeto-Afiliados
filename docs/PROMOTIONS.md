# Promoções e preços

## A cascata de preço

É o cálculo mais importante do sistema. Sempre nesta ordem:

```
preço normal (o "de")
      ↓  desconto da loja / promoção cadastrada
preço promocional (o "por")
      ↓  cupom válido
preço final  ← é este que o cliente paga
```

Exemplo real, como sai no post:

```
De:    R$ 199,90     ← preço normal
Por:   R$ 159,90     ← promoção
Cupom: PERFUME20     ← −R$ 20,00
Final: R$ 139,90     ← 30% de desconto no total
```

Quem faz a conta é `src/core/services/pricingService.js`, e ela é coberta por testes
(`npm test`). **A IA nunca encosta nesses números.**

---

## Desconto não é obrigatório

O sistema aceita todas as combinações:

| Situação | O que aparece no post |
|---|---|
| Produto sem nada | só o preço |
| Produto com desconto | "de/por" |
| Produto com cupom | preço + linha do cupom |
| Desconto **e** cupom | de/por + cupom + preço final |
| Frete grátis | linha de frete (não mexe no preço) |
| Promoção por tempo limitado | preço + validade |

O template esconde sozinho o que não existe. Nunca aparece "De: —" ou "Cupom: ".

---

## Criar uma promoção

**PROMOÇÕES → + Nova promoção**

| Campo | Observação |
|---|---|
| Nome | como você identifica a promoção |
| Produto | opcional — dá para ter promoção sem produto amarrado |
| Preço normal / promocional | se vazio, o sistema usa os preços do produto |
| Cupom | liga um cupom já cadastrado a esta promoção |
| Início / Fim | **promoção vencida não é publicada** |
| Quantidade limitada | informativo, aparece no post se o template usar |
| Status | ativa, pausada, programada, expirada |

O sistema recusa preço promocional maior que o normal — erro de digitação não vira
oferta errada.

---

## Estados

| Estado | Significa | Publica? |
|---|---|---|
| **ativa** | dentro da validade | sim |
| **programada** | data de início ainda não chegou | não |
| **expirada** | passou da data de fim | não |
| **pausada** | você pausou | não |

O estado é recalculado **na hora da consulta**, então a tela nunca mente. Além disso,
a manutenção diária (SISTEMA → Ajustes, ou o workflow 03 do n8n) grava `expirada` no
banco e gera o alerta.

---

## Alertas automáticos

| Alerta | Quando |
|---|---|
| Promoção expira em Xh | faltando 2 horas |
| Cupom expira em Xh | faltando 24 horas |
| Preço mudou X% | variação de 10% ou mais |
| Publicação falhou | depois da 3ª tentativa |

Aparecem no sino 🔔 e em SISTEMA → Status.

---

## O que bloqueia uma publicação

O sistema **se recusa** a publicar quando:

- o produto não tem preço válido;
- o produto está indisponível, pausado ou expirado;
- o produto não tem link;
- a promoção ligada expirou;
- a mensagem ficou vazia, curta demais ou com variável não resolvida.

Já **avisos** (não bloqueiam, só informam): cupom que não entrou e por quê, produto sem
imagem, produto sem link de afiliado.

Tudo isso aparece no preview antes de qualquer envio — botão 👁️ em qualquer produto.

---

## Promoção manual x do marketplace

O campo `origem` separa:

- **manual** — você cadastrou (sua promoção, seu cupom, seu preço);
- **marketplace** — veio da loja pela integração.

Ambas funcionam igual nas campanhas. A diferença é de rastreio: você sabe o que é seu
e o que veio de fora.
