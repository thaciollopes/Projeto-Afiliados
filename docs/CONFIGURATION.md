# Configuração (.env)

Todas as configurações e chaves ficam em **um único arquivo**: `.env`, na raiz do
projeto. Ele **nunca** vai para o git e o navegador nunca recebe o conteúdo dele.

> Depois de editar o `.env`, rode **`REINICIAR.bat`**. Reiniciar é obrigatório:
> o sistema lê essas variáveis só na inicialização.

---

## Aplicação

```env
APP_NAME=Plataforma de Afiliados
APP_PORT=3010          # porta do painel
APP_HOST=0.0.0.0       # 0.0.0.0 aceita acesso da rede local; 127.0.0.1 só este PC
NODE_ENV=development   # production na VPS
TZ=America/Sao_Paulo   # usado em horários de campanha e grupo
APP_TOKEN=             # vazio = sem senha (uso local)
```

**`APP_TOKEN`** — preencha com uma senha longa quando o painel for acessível de fora.
Aí toda chamada precisa do cabeçalho `x-api-token`; no navegador, o painel pede o token
uma vez e guarda.

---

## Banco de dados

```env
DB_DRIVER=sqlite
DB_FILE=./data/afiliados.db
```

`DB_FILE` é o arquivo do banco — **é ele que você copia num backup manual**.
`DB_DRIVER` existe para o dia em que entrar Postgres; hoje só `sqlite` está implementado.

---

## Modo de operação

```env
DRY_RUN=true           # true = simula, não envia nada no WhatsApp
WORKER_ENABLED=true    # motor interno de campanhas e fila
WORKER_TICK_SECONDS=30 # de quanto em quanto tempo ele acorda
```

**`DRY_RUN`** é a trava de segurança. Com `true`, tudo funciona (campanha escolhe
produto, fila anda, histórico enche), mas a mensagem não sai. Deixe `true` até ver um
post de teste do jeito que você quer.

**`WORKER_ENABLED=false`** desliga o motor interno — use se quiser que **só** o n8n
comande as publicações. As mesmas ações continuam disponíveis na API
(`/api/campanhas/executar-ativas` e `/api/publicacoes/processar`).

---

## WhatsApp

```env
WHATSAPP_PROVIDER=mock        # mock (simulação) | waha (de verdade)
WAHA_BASE_URL=http://localhost:3003
WAHA_SESSION=default
WAHA_API_KEY=                 # deixe vazio no uso local
```

Com `mock`, o sistema finge que envia e registra tudo — útil para desenvolver e testar.
Veja [WAHA.md](WAHA.md) para ligar de verdade.

---

## n8n

```env
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=
N8N_WEBHOOK_PREFIX=http://localhost:5678/webhook
```

A **API key** só é necessária para o `IMPORTAR-WORKFLOWS-N8N.bat` e para o painel
mostrar a contagem de workflows. Pegue em n8n → Settings → n8n API → Create an API key.

---

## IA

```env
AI_PROVIDER=mock              # mock | anthropic | compatible
AI_API_KEY=
AI_MODEL=claude-opus-5        # claude-sonnet-5 e claude-haiku-4-5 custam menos
AI_BASE_URL=                  # só para compatible (OpenAI, Groq, OpenRouter, Ollama…)
AI_MAX_TOKENS=800
```

- **`mock`** (padrão): limpeza de título por regras locais, sem custo e sem internet.
- **`anthropic`**: usa o SDK oficial da Anthropic. Precisa de `npm install @anthropic-ai/sdk`.
- **`compatible`**: qualquer endpoint no formato `/v1/chat/completions`.

Independente do provider, o guard de fatos está sempre ligado — veja [AI.md](AI.md).

---

## Lojas e envio

Não há credencial de loja no `.env`: tag de afiliado e cookie de cada loja ficam na tela
**LOJAS** (banco local). Veja [AFFILIATES.md](AFFILIATES.md).

```env
ENVIO_PAUSA_MIN_SEGUNDOS=25   # pausa aleatória entre dois envios de verdade
ENVIO_PAUSA_MAX_SEGUNDOS=75
```

```env
WHATSAPP_DIGITANDO=true              # "digitando..." 2-6 s antes de cada post
TELEGRAM_BOT_TOKEN=                  # bot do @BotFather, admin do canal
WHATSAPP_WEBHOOK_CHAVE=              # converter no privado; vazio = desligado
WHATSAPP_NUMEROS_AUTORIZADOS=5511999999999   # quem pode usar o conversor
WAHA_HOOK_URL=http://host.docker.internal:3010/api/whatsapp/webhook
```

`WHATSAPP_WEBHOOK_CHAVE` é lida pelo app **e** pelo `docker-compose.waha.yml` (vira a
chave HMAC da WAHA). Depois de mudar, suba a WAHA de novo.

Campanha com 10 grupos não dispara 10 mensagens no mesmo segundo: cada envio real
espera uma pausa sorteada nesse intervalo (o resto fica na fila para o próximo ciclo).
No `DRY_RUN` não há pausa.

---

## Backup e logs

```env
BACKUP_DIR=./storage/backups
BACKUP_KEEP=15         # quantos backups guardar (os mais velhos somem)
LOG_LEVEL=info         # debug | info | warn | error
```

`LOG_LEVEL=debug` mostra cada chamada da API — ligue só para investigar algo.

---

## Configurações que ficam no painel (não no .env)

Algumas coisas mudam sem reiniciar, direto em **SISTEMA → Ajustes**:

| Configuração | Onde |
|---|---|
| Pesos do score dos produtos | SISTEMA → Ajustes |
| Regras de limpeza automática | SISTEMA → Limpeza |
| Intervalo/horário/teto por grupo | WHATSAPP → Grupos |
| Intervalo/horário/loop por campanha | CAMPANHAS |

A regra é: o que é **infraestrutura e segredo** fica no `.env`; o que é **operação do
dia a dia** fica no painel.

---

## Exemplos prontos

**Só testando, sem enviar nada:**
```env
DRY_RUN=true
WHATSAPP_PROVIDER=mock
AI_PROVIDER=mock
```

**Rodando de verdade no seu PC:**
```env
DRY_RUN=false
WHATSAPP_PROVIDER=waha
WAHA_BASE_URL=http://localhost:3003
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
```

**Na VPS (com Docker):**
```env
NODE_ENV=production
APP_HOST=0.0.0.0
APP_TOKEN=uma-senha-longa-e-aleatoria
DRY_RUN=false
WHATSAPP_PROVIDER=waha
WAHA_BASE_URL=http://waha:3000
WAHA_API_KEY=outra-chave-longa
N8N_BASE_URL=http://n8n:5678
```
