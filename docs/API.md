# API

Base: `http://localhost:3010/api`

Todas as respostas são JSON. Listagens vêm no formato
`{ rows: [...], total, limit, offset }`.

**Autenticação**: se `APP_TOKEN` estiver preenchido no `.env`, mande o cabeçalho
`x-api-token: <token>` (ou `?token=` na query). Vazio = liberado (uso local).

**Erros**: `{ "erro": "mensagem", "codigo": "BAD_REQUEST", "detalhes": {...} }`
com status 400, 401, 404, 409 ou 500.

---

## Parâmetros comuns de listagem

| Parâmetro | Efeito |
|---|---|
| `limite` | quantos registros (padrão 50, máximo 500) |
| `pagina` | página, começando em 1 |
| `ordenar` | `campo asc` ou `campo desc` (ex.: `preco_atual desc`) |
| `busca` | busca textual nos campos principais |

---

## Saúde e configuração

| Método | Rota | O que faz |
|---|---|---|
| GET | `/health` | responde `{ok:true}` — use em monitoramento |
| GET | `/config` | configuração pública (nunca segredos) |
| GET | `/sistema/status` | status de app, banco, WhatsApp, n8n, IA e marketplaces |
| GET | `/sistema/dashboard` | todos os números e gráficos do painel |
| GET | `/sistema/graficos?dias=14` | só os gráficos |

---

## Produtos

| Método | Rota | O que faz |
|---|---|---|
| GET | `/produtos` | lista; filtros: `marketplace`, `categoria`, `status`, `preco_min`, `preco_max`, `desconto_min`, `avaliacao_min` |
| GET | `/produtos/:id` | produto + promoção ativa + cupons válidos + preços calculados |
| POST | `/produtos` | cria (mínimo: `titulo_original`, `marketplace`) |
| PUT | `/produtos/:id` | atualiza (mudança de preço entra no histórico) |
| DELETE | `/produtos/:id` | remove |
| GET | `/produtos/estatisticas` | totais por status |
| GET | `/produtos/marketplaces` | lojas disponíveis e quais estão implementadas |
| POST | `/produtos/buscar` | busca no marketplace **sem gravar** |
| POST | `/produtos/importar` | grava os produtos escolhidos (upsert por `marketplace`+`external_id`) |
| POST | `/produtos/filtrar` | filtro avançado (mesma engine das campanhas) |
| POST | `/produtos/:id/atualizar` | recoleta preço/disponibilidade na loja |
| POST | `/produtos/:id/melhorar-ia` | sugere texto novo (não salva) |
| POST | `/produtos/recalcular-score` | recalcula o score de todos |

### Lojas e link de afiliado

| Método | Rota | O que faz |
|---|---|---|
| GET | `/marketplaces` | lojas, tag, sessão (sem valor de cookie) |
| PUT | `/marketplaces/:loja/sessao` | salva o cookie (`{ cookies }`) |
| PUT | `/marketplaces/:loja/tag` | salva a tag/ID e reaplica nos produtos |
| POST | `/marketplaces/:loja/converter-link` | gera o link de afiliado de um link (`mercadolivre`, `shopee`) e confere o ID |
| POST | `/marketplaces/:loja/converter` | gera o link dos produtos da loja que ainda não têm |
| POST | `/marketplaces/:loja/verificar-link` | abre um link e diz se o ID no destino é o seu (`confere`: true/false/null) |
| POST | `/marketplaces/:loja/verificar` | confere os produtos ativos da loja (`limite`, `forcar`) |

### WhatsApp: converter no privado

| Método | Rota | O que faz |
|---|---|---|
| POST | `/whatsapp/webhook` | recebe o evento `message` da WAHA, assinado com HMAC-SHA512 (`X-Webhook-Hmac`). Sem `WHATSAPP_WEBHOOK_CHAVE`: 403. Número fora de `WHATSAPP_NUMEROS_AUTORIZADOS`: ignorado |

### Planilha

| Método | Rota | O que faz |
|---|---|---|
| POST | `/sistema/importar-planilha` | `{ arquivo: <base64 ou data URL>, nome: "x.xlsx" }` — o que o painel usa |
| POST | `/sistema/importar-excel` | `{ caminho }` — só arquivos dentro da pasta `storage` |

**Buscar:**
```http
POST /api/produtos/buscar
{ "termo": "perfume feminino", "marketplaces": ["mercadolivre"],
  "precoMax": 150, "descontoMin": 20, "ordenacao": "vendas", "limite": 20 }
```

---

## Promoções, cupons e categorias

| Método | Rota | O que faz |
|---|---|---|
| GET/POST | `/promocoes` | lista (já com preços calculados) / cria |
| GET/PUT/DELETE | `/promocoes/:id` | detalhe / atualiza / remove |
| GET/POST | `/cupons` | lista (com estado real) / cria |
| GET/PUT/DELETE | `/cupons/:id` | detalhe / atualiza / remove |
| GET | `/cupons/:id/alcance` | quantos produtos aceitam este cupom |
| GET/POST | `/categorias` | lista / cria |
| PUT/DELETE | `/categorias/:id` | atualiza / remove |

---

## Templates

| Método | Rota | O que faz |
|---|---|---|
| GET | `/templates` | lista |
| GET | `/templates/variaveis` | variáveis disponíveis, com descrição |
| POST | `/templates/preview` | renderiza um corpo de template com dados reais |
| POST/PUT/DELETE | `/templates[/:id]` | cria / atualiza / remove |

```http
POST /api/templates/preview
{ "corpo": "🔥 {titulo}\n{preco_final}\n{link}", "product_id": "prd_..." }
```

---

## Canais (grupos)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/canais` | lista, já dizendo se a janela está aberta agora |
| GET | `/canais/disponiveis` | grupos do WhatsApp para importar |
| POST/PUT/DELETE | `/canais[/:id]` | cria / atualiza / remove |
| POST | `/canais/:id/testar` | manda mensagem de teste |

---

## Campanhas

| Método | Rota | O que faz |
|---|---|---|
| GET | `/campanhas` | lista com destinos e se pode rodar agora |
| GET | `/campanhas/:id/produtos` | prévia dos produtos que ela pegaria |
| POST/PUT/DELETE | `/campanhas[/:id]` | cria / atualiza / remove |
| POST | `/campanhas/:id/ativar` \| `/pausar` | liga / pausa |
| POST | `/campanhas/:id/executar` | roda uma rodada (`{"forcar": true}` ignora horário) |
| POST | `/campanhas/executar-ativas` | roda todas as ativas — **é o que o n8n chama** |

---

## Publicações

| Método | Rota | O que faz |
|---|---|---|
| GET | `/publicacoes` | histórico; filtros: `status`, `channel_id`, `campaign_id` |
| GET | `/publicacoes/fila` | o que está aguardando/processando/com erro |
| GET | `/publicacoes/estatisticas` | totais + próxima publicação |
| POST | `/publicacoes/preview` | **monta o post sem gravar** (preços, bloqueios, avisos) |
| POST | `/publicacoes/enfileirar` | coloca na fila (aceita vários produtos e vários canais) |
| POST | `/publicacoes/processar` | processa a fila — **é o que o n8n chama** |
| POST | `/publicacoes/:id/enviar` | envia uma agora |
| POST | `/publicacoes/:id/retry` \| `/cancelar` | tenta de novo / cancela |
| DELETE | `/publicacoes/:id` | apaga o registro |

**Preview** (o endpoint mais útil para entender o sistema):
```http
POST /api/publicacoes/preview
{ "product_id": "prd_...", "template_id": "tpl_...", "usar_ia": false }
```
Responde com `mensagem`, `precos` (a cascata inteira), `cupom`, `bloqueios`,
`avisos` e `pode_publicar`.

**Enfileirar em lote:**
```http
POST /api/publicacoes/enfileirar
{ "produtos": ["prd_1","prd_2"], "channel_ids": ["chn_1","chn_2"],
  "template_id": "tpl_1", "usar_ia": false, "nao_repetir_dias": 7 }
```

---

## WhatsApp e n8n

| Método | Rota | O que faz |
|---|---|---|
| GET | `/whatsapp/status` | conexão, sessão e engine |
| GET | `/whatsapp/qr` | dados para parear |
| GET | `/whatsapp/grupos` | grupos da sessão |
| POST | `/whatsapp/sessao/iniciar` | inicia a sessão |
| GET | `/n8n/status` | n8n está no ar? quantos workflows ativos? |
| GET | `/n8n/workflows` | lista (precisa de `N8N_API_KEY`) |
| POST | `/n8n/disparar/:caminho` | dispara um webhook do n8n |

---

## Sistema

| Método | Rota | O que faz |
|---|---|---|
| GET/PUT | `/sistema/config` | configurações guardadas no banco (ex.: pesos do score) |
| GET | `/sistema/logs` | logs (filtros `level`, `service`) |
| GET | `/sistema/alertas` | alertas (`lido=false` para os pendentes) |
| POST | `/sistema/alertas/:id/lido` \| `/marcar-todos` | marca como lido |
| GET/POST | `/sistema/backups` | lista / cria backup |
| POST | `/sistema/backups/restaurar` | restaura (`{"arquivo":"backup-....db"}`) |
| GET/PUT | `/sistema/limpeza` | regras + prévia / salva regras |
| POST | `/sistema/limpeza/executar` | limpa (`{"dry":true}` só simula) |
| POST | `/sistema/manutencao` | expira cupons/promoções e recalcula scores |
| POST | `/sistema/exportar` | gera o .xlsx |
| GET | `/sistema/download/:arquivo` | baixa o .xlsx |
| POST | `/sistema/importar-excel` | importa produtos de planilha |
| POST | `/ia/gerar` | gera texto avulso com o guard ligado |

---

## Chamando de dentro do Docker

O n8n em container não enxerga `localhost` do Windows. Use:

```
http://host.docker.internal:3010/api/...
```

Os workflows já vêm assim, e respeitam a variável `AFILIADOS_API` se você definir outra.
