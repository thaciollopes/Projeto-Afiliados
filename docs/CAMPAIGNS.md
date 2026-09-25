# Campanhas

Uma campanha é a **regra automática**: o que publicar, onde, de quanto em quanto tempo.

Importante: a campanha **não envia nada**. Ela escolhe o produto e coloca na fila.
Quem envia é a fila, respeitando a janela do grupo. Essa separação é o que permite
preview, dry run e auditoria — e o que impede um erro de virar 50 mensagens erradas.

---

## Modos

| Modo | Como escolhe os produtos |
|---|---|
| **manual** | lista fixa que você selecionou |
| **automatica** | pelos filtros da campanha |
| **pesquisa** | por uma pesquisa salva |
| **categoria** | por categoria (filtro) |
| **palavras** | por palavras-chave (filtro) |
| **promocoes** | só produtos com promoção ativa |
| **cupons** | só produtos com cupom válido agora |
| **ofertas_do_dia** | maiores descontos (mínimo 20% por padrão) |

---

## Ritmo e agendamento

| Campo | O que faz |
|---|---|
| **Intervalo** | tempo mínimo entre publicações da campanha |
| **Hora inicial / final** | janela em que pode publicar |
| **Dias da semana** | nenhum marcado = todos os dias |
| **Máximo por dia** | teto da campanha |
| **Não repetir por** | 1, 3, 7, 15, 30 dias ou nunca repetir |
| **Loop** | ao acabar a lista, recomeça; sem loop, a campanha se encerra sozinha |

Cada **grupo** também tem intervalo, janela e teto próprios. Quando os dois existem,
**vale o mais restritivo** — o grupo sempre manda, porque é ele que corre risco de
levar bloqueio.

Exemplo: campanha a cada 30 min, grupo A a cada 30, grupo B a cada 45, grupo C a cada
60 — cada um recebe no seu ritmo, pela mesma campanha.

---

## Controle de repetição

O sistema checa, por **produto + grupo**, se já houve publicação dentro da janela
configurada. Se sim, pula para o próximo produto da lista.

Isso significa que o mesmo produto pode ir para o grupo A hoje e para o grupo B amanhã,
sem conflito — o controle é por destino.

---

## Rodando

| Botão | O que faz |
|---|---|
| 👁️ | mostra os produtos que a campanha pegaria **agora** |
| ▶️ | roda uma rodada de teste, ignorando intervalo e horário |
| ✅ / ⏸️ | ativa ou pausa |

Depois de rodar, veja o resultado em **PUBLICAÇÕES → Fila**. Nada saiu ainda: dá tempo
de conferir, cancelar ou corrigir.

Uma rodada enfileira **uma publicação por grupo** — não despeja a lista inteira de uma
vez. O ritmo é o que protege o número.

---

## Por que minha campanha não publicou?

O sistema diz o motivo, e todos são propositais:

| Motivo | Significa |
|---|---|
| `campanha_nao_ativa` | está pausada |
| `fora_do_dia` | hoje não está nos dias da semana |
| `aguardando_intervalo` | ainda não completou o intervalo |
| `fora_do_horario` | fora da janela do grupo |
| `limite_diario` | o grupo já bateu o teto |
| `sem_canais` | nenhum grupo ligado à campanha |
| `sem_produtos` | nenhum produto bate com os filtros |
| `todos_ja_publicados` | todos foram publicados dentro da janela de repetição |
| `lista_esgotada_campanha_encerrada` | acabou a lista e o loop está desligado |

---

## Pesquisas salvas

Salve uma busca boa (PRODUTOS → Procurar → **Salvar esta pesquisa**) e crie uma
campanha no modo **pesquisa** apontando para ela. Mudou a pesquisa, a campanha muda
junto — sem mexer na campanha.

---

## Exemplo completo

```
Nome:        Perfumes Femininos
Modo:        pesquisa → "Perfumes femininos mais vendidos"
Template:    Oferta
Filtros:     Perfumaria, até R$ 150, desconto mínimo 20%
Intervalo:   30 minutos
Horário:     08:00 às 22:00
Dias:        todos
Não repetir: 7 dias
Loop:        sim
Grupos:      Ofertas Femininas
IA:          ligada (melhora só o título)
```

O que acontece a cada 30 minutos, dentro da janela:

1. escolhe o produto de maior score que ainda não foi para aquele grupo em 7 dias;
2. calcula preço, promoção e cupom válidos **naquele instante**;
3. monta o texto pelo template (IA no título, se ligada);
4. valida (preço, validade, disponibilidade, link);
5. enfileira;
6. a fila envia pelo WAHA e grava o histórico com o preço e o cupom publicados.
