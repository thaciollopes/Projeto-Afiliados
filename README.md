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
| `INSTALAR.bat` | Instala dependências, cria o `.env` e o banco com dados de exemplo |
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

**Produtos** — base central de produtos com título, preço, desconto, imagem, link de
afiliado, categoria, avaliação, vendas e score. Busca em marketplaces, importação por
planilha e cadastro manual.

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

**WhatsApp** — via WAHA, atrás de uma interface própria (`WhatsAppProvider`). Trocar de
provider no futuro é mudar uma linha do `.env`.

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
          +-- MarketplaceAdapter -> AliExpress, Amazon, Shopee… (um por loja)
```

O **app é dono dos dados e da fila** — ele funciona sozinho, com ou sem n8n.
O **n8n orquestra**: agenda coleta, dispara a fila, faz backup, manda relatório.
Os dois caminhos usam a **mesma API**, então nada fica escondido em um fluxo.

Detalhes em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Documentação

| Para você usar | Para você configurar | Para quem for programar |
|---|---|---|
| [GUIA_DO_USUARIO.md](docs/GUIA_DO_USUARIO.md) | [INSTALLATION.md](docs/INSTALLATION.md) | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
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

Fase 1 (fundação) e boa parte das fases 2–5 **prontas e testadas**: painel completo,
produtos, promoções, cupons, campanhas, fila com retry, templates, IA com trava,
backup, limpeza, logs, status e 8 workflows de n8n.

O que depende de você: credenciais dos marketplaces (Amazon, AliExpress, Shopee…).
Os adapters já existem e ficam marcados como *integração pendente* até as chaves
chegarem — o sistema **nunca inventa dados de loja**.

Roadmap completo em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#roadmap).
