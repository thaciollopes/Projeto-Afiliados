# Arquitetura

Este documento explica **por que** o sistema é assim, não só como ele é.

---

## 1. Princípio central

> O app é dono dos **dados** e da **fila**. O n8n **orquestra**.

O painel funciona com o n8n desligado: o motor interno (`src/workers/scheduler.js`)
roda as campanhas e processa a fila sozinho. O n8n entra por cima, chamando a
**mesma API** que o painel usa — agendar coleta, disparar a fila, backup, relatório,
health check.

Consequência prática: nenhuma regra de negócio mora dentro de um workflow. Se o n8n
sumir, você não perde lógica; se o app cair, o n8n não publica nada errado.

---

## 2. Camadas

```
public/                 painel (HTML/CSS/JS puro, sem build)
   |  fetch /api
src/api/                rotas HTTP + middleware (nada de regra de negócio)
   |
src/core/services/      TODA a regra de negócio
   |
src/core/repositories/  acesso a dados (única camada que "sabe" que é SQLite)
   |
src/core/db/            conexão + schema
```

E, ao lado, as portas para o mundo externo:

```
src/integrations/
   marketplaces/   um adapter por loja (AliExpress, Amazon, Shopee…)
   whatsapp/       WhatsAppProvider -> WahaProvider | MockProvider
   ai/             AiProvider -> Anthropic | compatível | Mock
   n8n/            cliente do n8n (status + disparo de webhook)
```

**Regra de dependência:** as setas só apontam para baixo/para dentro. Um service
nunca importa uma rota; um repositório nunca importa um service; nada em `core/`
sabe o que é "WAHA" ou "AliExpress" — só conhece as interfaces.

---

## 3. Por que SQLite (e não Excel) como base

O pedido original previa Excel como armazenamento inicial. Trocamos por **SQLite**,
mantendo o Excel onde ele é bom:

| | Excel como banco | SQLite |
|---|---|---|
| Dois processos escrevendo (painel + worker + n8n) | corrompe o arquivo | transação, WAL, sem corromper |
| Buscar produto entre milhares | lê o arquivo inteiro | índice, instantâneo |
| "Não repetir produto por 7 dias" | varredura manual | uma consulta |
| Backup | copiar e torcer | checkpoint + cópia consistente |
| Instalação | — | **embutido no Node 22+**, nada para compilar |

O Excel ficou como **ponte com o mundo**: `SISTEMA > Backup > Exportar Excel` gera a
planilha com todas as tabelas, e dá para importar produtos de planilha
(`POST /api/sistema/importar-excel`).

A camada Repository continua sendo o ponto de troca: `BaseRepository` define
`create/update/findById/findAll/remove/count`. Migrar para Postgres = escrever um
`PostgresBaseRepository` com os mesmos métodos e apontar o factory em
`src/core/repositories/index.js`. Nenhum service muda.

---

## 4. Modelo de dados

| Tabela | O que guarda |
|---|---|
| `products` | base central de produtos (preço, desconto, imagem, links, score, status) |
| `price_history` | toda mudança de preço, com variação e origem |
| `promotions` | promoção manual ou do marketplace, com validade e cupom ligado |
| `coupons` | cupom próprio ou da loja: tipo, valor, mínimo, teto, validade, alcance |
| `campaigns` | regra automática: modo, filtros, ritmo, janela, loop, dedupe |
| `campaign_targets` | destino da campanha (cada grupo com intervalo/teto próprios) |
| `channels` | grupos e canais do WhatsApp, com janela e teto diário |
| `templates` | formatos de post, com variáveis e blocos condicionais |
| `publications` | fila **e** histórico (mesmo registro muda de status) |
| `saved_searches` | pesquisas salvas (viram campanha) |
| `affiliate_programs` | programas de afiliados (sem segredo: as chaves ficam no `.env`) |
| `categories`, `logs`, `alerts`, `settings` | apoio |

Fila e histórico na mesma tabela é intencional: a publicação nasce `aguardando` e
caminha para `enviado` ou `erro`, sem perder nada pelo caminho.

---

## 5. Fluxo de uma publicação

```
campanha (ou você, na mão)
   ↓  escolhe o produto respeitando filtros e dedupe
buildPublication()
   ↓  calcula preço: normal → promoção → cupom → final
   ↓  valida: cupom vencido? promoção expirada? produto indisponível? link?
   ↓  monta o texto (template; IA só no texto, nunca nos números)
enqueue()                      status: aguardando
   ↓
processQueue()                 checa janela do grupo e teto diário
   ↓
WhatsAppProvider.sendMessage() (ou dry run, se DRY_RUN=true)
   ↓
histórico + preço/cupom publicados + data no produto
   ↓ (se falhar)
retry 30s → 2min → 5min → erro definitivo + alerta
```

O ponto importante: **quem monta o post não é quem envia**. Isso permite preview,
dry run, teste e auditoria — os três usam o mesmo caminho de código.

---

## 6. Decisões técnicas e o porquê

| Decisão | Motivo |
|---|---|
| Node + Express, sem framework de front | sobe em qualquer hospedagem Node; sem build, sem `node_modules` gigante no deploy |
| Painel em JS puro | você consegue abrir um arquivo e entender; nada de bundler para uma tela de cadastro |
| `node:sqlite` (Node 22+) com fallback para `better-sqlite3` | zero compilação nativa — o inferno clássico de deploy some |
| Fila no app, não no n8n | o sistema continua publicando com o n8n fora do ar |
| Providers e adapters | trocar WhatsApp/IA/loja não mexe em regra de negócio |
| Guard da IA (`integrations/ai/guards.js`) | o risco real do negócio é publicar preço errado; a trava é código, não confiança |
| Dry run ligado por padrão | primeiro erro caro seria mandar oferta errada em grupo cheio |
| Adapter "não implementado" em vez de dado falso | sem API oficial, o painel diz *integração pendente* — nunca inventa produto |

---

## 7. Segurança

- Segredos **só** no `.env` (fora do git). O frontend recebe apenas `publicConfig()`.
- Programas de afiliados exibem o identificador **mascarado** (`ABC1••••XYZ9`).
- `APP_TOKEN` opcional protege painel e API quando exposto na internet.
- Ordenação e filtros são validados contra as colunas reais da tabela (sem injeção).
- Detalhes em [SECURITY.md](SECURITY.md).

---

## 8. Roadmap

| Fase | Situação | O que inclui |
|---|---|---|
| 1 — Fundação | **pronta** | estrutura, painel, dashboard, produtos, categorias, repositories, afiliados, promoções, cupons, grupos, configurações |
| 2 — Automação | **pronta** | fila, agendamento, WAHA, worker interno, workflows de n8n |
| 3 — Campanhas | **pronta** | filtros, pesquisas salvas, loop, histórico, retry, dedupe |
| 4 — IA | **pronta** | templates, editor com preview, geração e melhoria de texto com trava |
| 5 — Sistema | **pronta** | backup/restauração, limpeza, logs, alertas, status, export Excel |
| 6 — Escala | **próxima** | marketplaces reais (depende de credencial), Postgres, VPS, Redis, multiusuário |

Para a fase 6, os pontos de extensão já existem: `MarketplaceAdapter`,
`BaseRepository` e `WhatsAppProvider`.
