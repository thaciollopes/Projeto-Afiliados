# Comece aqui

Leia isto uma vez. Depois disso, o próprio painel te guia: abra
**http://localhost:3010** e a primeira tela é **🚀 Comece aqui**, que confere
sozinha o que já está pronto e o que falta.

---

## O que já está feito (não precisa fazer nada)

| Item | Estado |
|---|---|
| Sistema instalado e rodando | ✅ http://localhost:3010 |
| Banco criado, com dados de exemplo | ✅ 24 produtos, 5 cupons, 5 promoções, 3 grupos |
| WAHA deste projeto (WhatsApp) | ✅ no ar na porta 3003, sessão iniciada esperando o QR |
| n8n ligado ao sistema | ✅ usa o n8n que você já tinha (porta 5678) |
| 8 fluxos do n8n importados | ✅ **desativados**, esperando sua conferência |
| Modo simulação | ✅ ligado — nada é enviado no WhatsApp ainda |

**Nada do Ranch Life foi tocado.** Os 53 fluxos de lá continuam iguais (39 ativos),
as WAHA do CRM (3001) e do Ranch (3002) não foram reiniciadas nem reconfiguradas.
Este projeto usa a porta 3003, container próprio e sessão própria.

---

## O que falta — 4 coisas suas

### 1. Parear o WhatsApp (5 minutos)

O QR já está esperando. No painel:

**WHATSAPP → Conexão → Parear (QR Code)**

No celular do número que vai divulgar: WhatsApp → **Aparelhos conectados** →
**Conectar aparelho** → aponte para o QR.

> Use um número **só para divulgação**, nunca o pessoal. Número que manda oferta
> em vários grupos corre risco de bloqueio — por isso o sistema tem intervalo,
> janela de horário e teto diário.

Deu certo quando a tela mostra 🟢 **Conectado**.

---

### 2. Trazer seus grupos

**WHATSAPP → Grupos e canais → Importar do WhatsApp**

O sistema lista os grupos daquele número; você marca os que vão receber ofertas.

Em cada grupo, ajuste:
- **Intervalo**: 30 minutos é um bom começo
- **Horário**: 08:00 às 22:00
- **Máximo por dia**: 10 a 12


---

### 3. Colocar suas lojas

**LOJAS → Minhas lojas.** Um cartão por loja, com dois campos:

1. **Tag de afiliado** — o que paga a sua comissão (Amazon: `seuid-20`).
2. **Cookie** — a sua sessão na loja, exportada com a extensão Cookie Editor.

| Loja | Como o link vira seu | Como os produtos entram |
|---|---|---|
| Mercado Livre | cookie → o sistema gera o `meli.la` | extensão do navegador |
| Amazon | tag entra no link (`?tag=`) | busca do sistema ou extensão |
| Shopee | link gerado no painel da Shopee | extensão do navegador |
| Magazine Luiza | link da sua loja Parceiro Magalu | extensão do navegador |

Não há API: Mercado Livre não tem API de afiliados, e as outras exigem aprovação.
O sistema trabalha só com a sua tag e o seu cookie. Detalhes em `docs/AFFILIATES.md`.

---

### 4. Criar sua campanha e testar

**CAMPANHAS → + Nova campanha**. Escolha o modo, os filtros, o ritmo e os grupos.
Salve **pausada**.

Depois:
- botão **👁️** → mostra quais produtos ela pegaria agora;
- botão **▶️** → roda uma rodada de teste;
- **PUBLICAÇÕES → Fila** → clique em 👁️ e leia o post exatamente como sairia.

Gostou do texto, do preço e do cupom? Então:

1. abra o arquivo `.env`, troque `DRY_RUN=true` por `DRY_RUN=false`;
2. rode **`REINICIAR.bat`**;
3. volte em CAMPANHAS e clique em ✅ para ativar.

A partir daí o sistema publica sozinho.

---

## Os arquivos que você usa no dia a dia

| Arquivo | Quando usar |
|---|---|
| **`INICIAR.bat`** | ligar o sistema (deixe a janela preta aberta) |
| **`SUBIR-TUDO.bat`** | ligar tudo: Docker + n8n + WAHA + painel |
| **`PARAR.bat`** | desligar |
| **`REINICIAR.bat`** | sempre que editar o `.env` |
| **`STATUS.bat`** | ver se está tudo de pé |
| **`BACKUP.bat`** | salvar seus dados |
| **`VER-LOGS.bat`** | ver o que o sistema registrou |

---

## Sobre o n8n (os 8 fluxos importados)

Eles estão no seu n8n, com o prefixo **AFILIADOS**, todos **desativados**.
Não encostam em nenhum fluxo do Ranch Life.

| Fluxo | O que faz | Ativar? |
|---|---|---|
| 01 – Processar fila | publica o que está na fila | só se desligar o motor interno |
| 02 – Executar campanhas | roda as campanhas ativas | só se desligar o motor interno |
| 03 – Manutenção diária | expira cupons/promoções vencidos | **pode ativar** |
| 04 – Backup diário | backup às 03:30 | **pode ativar** |
| 05 – Limpeza semanal | apaga dado velho | pode ativar |
| 06 – Health check | avisa se algo cair | pode ativar |
| 07 – Coletar produtos | busca produtos por webhook | quando tiver marketplace real |
| 08 – Relatório diário | resumo do dia às 20:00 | pode ativar (pluge o Telegram) |

**Os fluxos 01 e 02 são opcionais**: o sistema já publica sozinho pelo motor interno.
Ative-os só se colocar `WORKER_ENABLED=false` no `.env` — senão os dois fazem a mesma
coisa.

---

## Quando algo der errado

| Sintoma | O que fazer |
|---|---|
| Tela branca / travada | **Ctrl+F5** (limpa o cache do navegador) |
| "Não consegui falar com o servidor" | a janela preta fechou — `INICIAR.bat` |
| WhatsApp desconectado | WHATSAPP → Conexão → Iniciar sessão → Parear |
| Nada é publicado | veja `docs/TROUBLESHOOTING.md`, seção "Nada é publicado" |
| Qualquer outra coisa | `docs/TROUBLESHOOTING.md` — está organizado por sintoma |

---

## Onde está cada documento

| Preciso de… | Arquivo |
|---|---|
| Guia completo de uso | menu **📖 Manual** no painel |
| Resolver problema | `docs/TROUBLESHOOTING.md` |
| Configurar o `.env` | `docs/CONFIGURATION.md` |
| WhatsApp | `docs/WAHA.md` |
| n8n | `docs/N8N.md` |
| Promoções e preços | `docs/PROMOTIONS.md` |
| Cupons | `docs/COUPONS.md` |
| Campanhas | `docs/CAMPAIGNS.md` |
| IA | `docs/AI.md` |
| Marketplaces e afiliados | `docs/AFFILIATES.md` |
| Subir para VPS | `docs/VPS.md` |
| Como o sistema é por dentro | `docs/ARCHITECTURE.md` |
