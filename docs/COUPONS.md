# Cupons

Dois tipos convivem no mesmo lugar: **seus cupons** (origem `proprio`) e os cupons
**do marketplace** (origem `marketplace`).

---

## Tipos

| Tipo | Campo `valor_desconto` | Efeito |
|---|---|---|
| **percentual** | 15 = 15% | abate % do preço, respeitando o teto |
| **valor_fixo** | 20 = R$ 20,00 | abate o valor; nunca deixa o preço negativo |
| **frete_gratis** | — | não mexe no preço; liga a linha de frete |
| **outro** | — | informativo |

---

## Regras que o sistema confere sozinho

Antes de colocar o cupom no post, tudo isto é verificado:

| Regra | Se não passar |
|---|---|
| Está dentro da validade? | `cupom_expirado` |
| Já começou? | `cupom_nao_comecou` |
| Está pausado? | `cupom_pausado` |
| Atingiu o limite de uso? | `cupom_esgotado` |
| O preço atinge a compra mínima? | `valor_minimo_nao_atingido` |
| O produto está na lista de produtos aplicáveis? | `produto_fora_do_cupom` |
| A categoria bate? | `categoria_fora_do_cupom` |
| O marketplace bate? | `marketplace_diferente` |

Reprovou? **O cupom simplesmente não entra** e a linha some do post — o resto da oferta
sai normalmente. O motivo aparece no preview como aviso.

---

## Cupom por produto

Amarre o cupom a produtos específicos preenchendo `produtos_aplicaveis`
(ou ligando o cupom a uma promoção de produto).

```
Perfume X · R$ 150
Cupom PERFUME20 · −R$ 20
Final: R$ 130
```

## Cupom geral

Deixe `produtos_aplicaveis` vazio e use as **categorias aplicáveis**:

```
BELEZA30 · R$ 30 OFF acima de R$ 150 · categorias: Perfumaria, Maquiagem, Skincare
```

O sistema só aplica em produto dessas categorias **e** com preço ≥ R$ 150.
Para ver o alcance na prática: botão 🎯 na lista de cupons — ele mostra quantos e quais
produtos aceitam aquele cupom agora.

---

## Escolha automática

Quando você não escolhe o cupom na mão, o sistema pega o **melhor cupom válido** para
aquele produto — o que dá mais desconto em reais. É o que a campanha "Cupons de beleza"
faz: percorre os produtos e só publica os que têm cupom válido no momento.

---

## Campos

| Campo | Observação |
|---|---|
| Código | vira maiúsculo automaticamente |
| Nome | descrição curta para você se achar |
| Tipo / Valor | veja a tabela acima |
| Compra mínima | abaixo disso o cupom não entra |
| Desconto máximo | teto para cupom percentual |
| Limite de uso | o sistema conta cada publicação como um uso |
| Início / Fim | validade |
| Categorias aplicáveis | vazio = todas |
| Marketplace | vazio = qualquer loja |
| Link | se a loja der um link de ativação |

---

## Ciclo de vida

```
programado ──(chega a data)──> ativo ──(passa a validade)──> expirado
                                 │
                                 └──(usos = limite)──> esgotado
```

A manutenção diária marca os expirados e gera alerta. A limpeza remove os expirados há
mais de 30 dias (prazo configurável em SISTEMA → Limpeza).

**Cupom expirado nunca é publicado** — nem que esteja amarrado a uma promoção ativa.
