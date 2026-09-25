# Guia do usuário

Este guia é para **usar** o sistema, sem mexer em código. Se travar em algo,
veja [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## 1. Ligar e desligar

| Quero… | Faça |
|---|---|
| Ligar o sistema | duplo clique em `INICIAR.bat` |
| Ligar tudo (n8n e WhatsApp junto) | duplo clique em `SUBIR-TUDO.bat` |
| Abrir o painel de novo | `ABRIR-PAINEL.bat` |
| Desligar | feche a janela preta ou rode `PARAR.bat` |
| Ver se está tudo de pé | `STATUS.bat` |

A **janela preta precisa ficar aberta** enquanto você usa o sistema. Ela é o servidor.

---

## 2. Modo simulação (leia antes de tudo)

Enquanto aparecer o aviso **MODO SIMULAÇÃO** no topo do painel, **nada é enviado
no WhatsApp**. Tudo o mais funciona: campanhas rodam, a fila anda, o histórico enche.
É a forma segura de aprender o sistema.

Para começar a enviar de verdade:

1. Abra o arquivo `.env` (bloco de notas serve).
2. Troque `DRY_RUN=true` por `DRY_RUN=false`.
3. Salve e rode `REINICIAR.bat`.

Faça isso **só depois** de mandar um teste para um grupo seu e ver o post do jeito
que você quer.

---

## 3. Primeira configuração (passo a passo)

### Passo 1 — Conectar o WhatsApp

1. Menu **WHATSAPP → Conexão**.
2. Se aparecer "provider mock", abra o `.env`, troque `WHATSAPP_PROVIDER=mock` por
   `WHATSAPP_PROVIDER=waha` e rode `REINICIAR.bat`.
3. Clique em **Iniciar sessão** e depois em **Parear (QR Code)**.
4. No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → leia o QR.

> Use um número **só para divulgação**. Nunca o número pessoal.

### Passo 2 — Adicionar os grupos

1. Menu **WHATSAPP → Grupos e canais**.
2. Clique em **Importar do WhatsApp** — o sistema lista os grupos da sessão.
3. Marque os que vão receber ofertas e importe.
4. Em cada grupo, ajuste:
   - **Intervalo**: de quanto em quanto tempo pode receber (ex.: 30 min)
   - **Horário**: das 08:00 às 22:00, por exemplo
   - **Máximo por dia**: teto de posts (ex.: 12)


### Passo 3 — Cadastrar seus programas de afiliados

Menu **CONTEÚDO → Afiliados → + Novo**. Preencha nome, marketplace e seu ID de
afiliado. As chaves secretas de API ficam no `.env`, nunca na tela.

### Passo 4 — Ter produtos

Três caminhos:

- **Procurar produtos** (menu PRODUTOS → Procurar): busca, você seleciona e importa.
- **Cadastrar na mão** (PRODUTOS → Todos → + Novo produto): cole título, preço e link.
- **Planilha**: monte um `.xlsx` com as colunas `titulo, preco, preco_anterior, url,
  imagem, categoria, marketplace` e importe.

### Passo 5 — Montar promoção e cupom (opcional)

- **PROMOÇÕES → + Nova promoção**: escolha o produto, coloque preço normal e
  promocional, a validade e, se houver, o cupom.
- **PROMOÇÕES → Cupons → + Novo cupom**: código, tipo (% ou R$), compra mínima,
  validade e em quais categorias vale.

Nada disso é obrigatório: um produto pode ser divulgado só pelo preço normal.

### Passo 6 — Criar a campanha

Menu **CAMPANHAS → + Nova campanha**:

| Campo | O que significa |
|---|---|
| **Modo** | como escolher os produtos (por filtro, por pesquisa salva, só com cupom, ofertas do dia…) |
| **Filtros** | categoria, preço máximo, desconto mínimo, palavras-chave |
| **Template** | o formato do post |
| **Intervalo** | de quanto em quanto tempo publica |
| **Horário** | janela em que pode publicar |
| **Não repetir por** | quantos dias até o mesmo produto poder voltar |
| **Loop** | ao acabar a lista, recomeça |
| **Grupos** | onde publica |

Salve **pausada**. Depois clique em 👁️ para ver quais produtos ela pegaria, e em ▶️
para rodar uma rodada de teste.

### Passo 7 — Conferir e ativar

1. Menu **PUBLICAÇÕES → Fila**: veja o que está esperando.
2. Clique em 👁️ em qualquer item para ler o post exatamente como vai sair.
3. Gostou? Volte em **CAMPANHAS** e clique em ✅ para ativar.

Pronto: o sistema passa a publicar sozinho, respeitando horário, intervalo e teto.

---

## 4. O dia a dia

**Dashboard** — quanto foi publicado hoje, o que está na fila, erros, alertas,
promoções e cupons prestes a vencer.

**Achou um produto bom?** PRODUTOS → Procurar → selecione → **Publicar selecionados**
(escolhe os grupos) ou **Criar campanha**.

**Quer ver como o post vai ficar?** Em qualquer produto, clique em 👁️. Dá para trocar
o template, ligar a IA e mandar um teste na hora.

**Um post falhou?** PUBLICAÇÕES → Histórico → aba **Erros**. O sistema já tenta de novo
sozinho (30s, 2min, 5min). O botão 🔁 força uma nova tentativa.

**Cupom venceu?** O sistema tira a linha do cupom do post automaticamente e avisa no
sino 🔔.

---

## 5. Melhorar textos com IA

No produto, clique em ✨. Escolha o que melhorar (título, descrição, chamada),
clique em **Gerar**, leia a sugestão e só então **Salvar no produto**.

A IA **não pode** mexer em preço, desconto, cupom, avaliação ou vendas. Se ela tentar,
o sistema apaga o trecho e avisa embaixo da sugestão. Isso é proposital: os números vêm
do cadastro, sempre.

Sem chave de IA configurada, o sistema usa o modo **simulado** — limpa o título
(tira "frete grátis", "50% OFF", códigos) sem custo nenhum.

---

## 6. Manutenção

| Tarefa | Onde |
|---|---|
| Backup | `BACKUP.bat` ou SISTEMA → Backup |
| Restaurar | SISTEMA → Backup → ♻️ (cria cópia de segurança antes) |
| Exportar para Excel | SISTEMA → Backup → Exportar Excel |
| Limpar dados velhos | SISTEMA → Limpeza |
| Ver erros do sistema | SISTEMA → Logs, ou `VER-LOGS.bat` |
| Ver se tudo está no ar | SISTEMA → Status, ou `STATUS.bat` |

Backup automático diário: ative o workflow **AFILIADOS 04** no n8n
(veja [N8N.md](N8N.md)).

---

## 7. Perguntas rápidas

**Posso fechar a janela preta?** Não enquanto estiver usando — ela é o servidor.

**O sistema publica com o PC desligado?** Não. Para 24h, ou deixa o PC ligado ou sobe
numa VPS ([VPS.md](VPS.md)).

**Posso usar o mesmo produto em várias campanhas?** Sim. O controle de repetição é por
produto + grupo.

**E se eu publicar errado?** Apague a mensagem no WhatsApp. No sistema, corrija o
produto/promoção — o histórico guarda o que foi publicado para você conferir.

**Quantos grupos aguenta?** Dezenas, tranquilamente. O limite prático é o WhatsApp,
não o sistema: publicar rápido demais em muitos grupos é o que derruba número.
Use intervalos de 30 minutos ou mais.
