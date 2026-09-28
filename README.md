# Plataforma de Automação de Ofertas e Afiliados

Sistema próprio para **achar produtos, montar promoções, criar campanhas e publicar
ofertas em grupos e canais do WhatsApp** — com controle de preço, cupom, validade,
fila, histórico e IA para os textos.

Roda **local** no seu PC hoje e sobe para uma **VPS** quando você quiser, sem reescrever nada.

---

## Começar em 3 passos

| Passo | O que fazer |
|---|---|
| 1 | Dois cliques em **`INSTALAR.bat`** (só na primeira vez) |
| 2 | Dois cliques em **`INICIAR.bat`** |
| 3 | O navegador abre sozinho em **http://localhost:3010** |

Prefere subir tudo junto (Docker + n8n + WAHA + painel)? Use **`SUBIR-TUDO.bat`**.

> **O sistema começa em MODO SIMULAÇÃO.** Nada é enviado no WhatsApp de verdade
> até você trocar `DRY_RUN=false` no arquivo `.env`. Isso é de propósito: dá para
> montar tudo, testar e ver o post pronto sem risco de mandar besteira no grupo.

---

## Os arquivos `.bat` (tudo por duplo clique)

| Arquivo | Para quê |
|---|---|
| `INSTALAR.bat` | Instala dependências, cria o `.env` e o banco (categorias e templates) |
| `INICIAR.bat` | Sobe o painel e abre o navegador |
| `SUBIR-TUDO.bat` | Sobe Docker + n8n + WAHA + painel de uma vez |
| `PARAR.bat` | Encerra o painel |
| `REINICIAR.bat` | Reinicia o painel (use sempre que editar o `.env`) |
| `ABRIR-PAINEL.bat` | Só abre o navegador no painel |
| `STATUS.bat` | Mostra se painel, banco, n8n e WAHA estão de pé |
| `BACKUP.bat` | Gera backup do banco agora |
| `VER-LOGS.bat` | Acompanha o log em tempo real |
| `IMPORTAR-WORKFLOWS-N8N.bat` | Sobe os fluxos prontos para o n8n |

---

## O que o sistema faz

**Lojas e links de afiliado** — sem API: o sistema usa a sua sessão (cookie) e a sua
tag. Mercado Livre (`meli.la`) e Shopee (`s.shopee.com.br`) geram o link pela sua
conta; Amazon leva a sua tag. O sistema **abre cada link e confere se o ID de afiliado
que chega na loja é o seu** — link de outra conta não é publicado.

**Produtos** — base central de produtos com título, preço, desconto, imagem, link de
afiliado, categoria, avaliação, vendas e score. Busca no Mercado Livre e na Amazon,
extensão do navegador (Shopee, Magalu e qualquer página), planilha e cadastro manual.

**Preços** — o cálculo é explícito e auditável:
`preço normal → desconto da loja → cupom → preço final`. A IA **nunca** encosta nesses
números.

**Promoções e cupons** — promoção manual ou do marketplace, cupom próprio ou da loja,
por produto ou por categoria, com validade, compra mínima, teto de desconto e limite de
uso. Cupom vencido some do post sozinho.

**Campanhas** — regra automática de publicação: o que buscar, para quais grupos, de
quanto em quanto tempo, em qual janela de horário, com ou sem loop, sem repetir produto
por X dias.

**Publicação** — fila com agendamento, janela de horário por grupo, teto diário, retry
(30s → 2min → 5min) e histórico completo do que foi publicado, com o preço e o cupom
que saíram no post.

**WhatsApp e Telegram** — grupos e canais do WhatsApp via WAHA (com "digitando…" e
pausa entre posts contra bloqueio) e canais/grupos do Telegram por bot oficial. Na
Shopee, cada grupo sai com o próprio Sub ID: o relatório da loja mostra qual grupo vende.

**Converter no privado** — mande um link de produto para o número de divulgação e
receba o post pronto com o seu link de afiliado.

**IA** — melhora título, descrição e chamada. Com trava: se o modelo inventar preço,
desconto ou cupom, o sistema **remove antes de chegar no post** e registra a tentativa.

**Sistema** — dashboard com gráficos, status de todos os serviços, logs, alertas,
backup/restauração, limpeza automática e exportação para Excel.

---

## Como as peças se encaixam

```
   Painel (navegador)
          |
          v
   API Node/Express  <──────── n8n (agenda, coleta, relatório, health check)
          |
          +-- Repositories -> SQLite (troca para Postgres sem mexer no resto)
          +-- WhatsAppProvider -> WAHA -> WhatsApp
          +-- AiProvider -> Claude/compatível (ou mock, sem custo)
          +-- Telegram (bot oficial)
          +-- Lojas -> sessão (cookie) + tag: Mercado Livre, Shopee, Amazon, Magalu
```

O **app é dono dos dados e da fila** — ele funciona sozinho, com ou sem n8n.
O **n8n orquestra**: agenda coleta, dispara a fila, faz backup, manda relatório.
Os dois caminhos usam a **mesma API**, então nada fica escondido em um fluxo.

Detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Documentação

**Para usar:** o passo a passo de cada função está **dentro do painel** — menu
**📖 Manual**, ou o botão **📖 Ajuda** no topo de qualquer tela.

| Para você usar | Para você configurar | Para quem for programar |
|---|---|---|
| Menu 📖 Manual no painel | [INSTALLATION.md](docs/INSTALLATION.md) | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| [PRODUCTS.md](docs/PRODUCTS.md) | [CONFIGURATION.md](docs/CONFIGURATION.md) | [API.md](docs/API.md) |
| [PROMOTIONS.md](docs/PROMOTIONS.md) | [WAHA.md](docs/WAHA.md) | [SECURITY.md](docs/SECURITY.md) |
| [COUPONS.md](docs/COUPONS.md) | [N8N.md](docs/N8N.md) | [BACKUP.md](docs/BACKUP.md) |
| [CAMPAIGNS.md](docs/CAMPAIGNS.md) | [AFFILIATES.md](docs/AFFILIATES.md) | [VPS.md](docs/VPS.md) |
| [AI.md](docs/AI.md) | [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | |

---

## Stack

- **Node.js 22+** e **Express 5** — sem passo de build, sobe em qualquer hospedagem Node
- **SQLite** pelo módulo `node:sqlite` embutido — zero dependência compilada
- **Painel** em HTML/CSS/JS puro, servido pelo próprio app
- **WAHA** para WhatsApp, **n8n** para orquestração, **Docker** para a VPS
- Testes com o runner nativo do Node (`npm test`)

---

## Estado atual

Fases 1 a 5 **prontas e testadas** (`npm test`): painel completo, lojas por cookie e
tag com conferência do ID de afiliado, produtos, promoções, cupons, campanhas, fila
com retry e revalidação de preço antes de enviar, WhatsApp e Telegram, conversor no
privado, templates, IA com trava, manual no painel, backup, limpeza, logs, status e
8 workflows de n8n.

O que ainda não foi testado contra os serviços de verdade (a rede de desenvolvimento
não alcança): a geração de link da Shopee, o envio pelo Telegram e o webhook da WAHA.
Teste cada um antes de ligar o envio real.

Próximo passo para vender como assinatura: **multiusuário** (login, dados separados
por cliente, sessão de WhatsApp por cliente, configurações hoje no `.env` indo para o
painel). O sistema **nunca inventa dados de loja**.

Roadmap completo em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#roadmap).
