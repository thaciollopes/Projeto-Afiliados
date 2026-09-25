# n8n

## Divisão de responsabilidade

> O app é dono dos dados e da fila. O n8n **orquestra**.

O painel publica sozinho — o motor interno (`WORKER_ENABLED=true`) roda campanhas e
processa a fila a cada 30 segundos. O n8n entra para: agendar coleta de produtos, tocar
a fila em outro ritmo, fazer backup, mandar relatório e vigiar a saúde do sistema.

Nenhuma regra de negócio mora dentro de um workflow. Todo fluxo apenas chama a API.
Assim, se o n8n cair, você não perde lógica; e o que o n8n faz, você também consegue
fazer clicando no painel.

**Quer que o n8n comande tudo?** Coloque `WORKER_ENABLED=false` no `.env` e ative os
workflows 01 e 02.

---

## Qual n8n este projeto usa

O que você já tem: **`C:\Projeto\Projeton8n`**, container `ranch-n8n`, em
<http://localhost:5678>. Nenhum segundo n8n é criado — o `SUBIR-TUDO.bat` sobe aquele
mesmo se estiver parado.

No `.env` deste projeto:

```env
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=            # opcional, só para importar fluxos pela API
```

---

## Importar os fluxos

**Jeito rápido:** duplo clique em `IMPORTAR-WORKFLOWS-N8N.bat`.

Sem `N8N_API_KEY`, ele explica como importar na mão. Para usar a API:

1. n8n → **Settings → n8n API → Create an API key**
2. cole em `N8N_API_KEY=` no `.env`
3. rode o `.bat` de novo

Os fluxos entram **desativados**. Ative um por um, depois de conferir.
Reimportar atualiza os existentes (o casamento é pelo nome).

---

## Os 8 fluxos

| # | Nome | Quando roda | O que faz |
|---|---|---|---|
| 01 | Processar fila de publicação | a cada 5 min | `POST /api/publicacoes/processar` e avisa se houver erro |
| 02 | Executar campanhas ativas | a cada 10 min | `POST /api/campanhas/executar-ativas` |
| 03 | Manutenção diária | 03:00 | expira cupons/promoções vencidos, recalcula scores |
| 04 | Backup diário | 03:30 | `POST /api/sistema/backups` |
| 05 | Limpeza semanal | domingo 04:00 | aplica as regras de SISTEMA → Limpeza |
| 06 | Health check | a cada 15 min | checa banco, WhatsApp e n8n; só segue adiante se houver problema |
| 07 | Coletar produtos | webhook `afiliados-coletar` | busca no marketplace e importa para a base |
| 08 | Relatório diário | 20:00 | monta o resumo do dia (pronto para plugar Telegram/WhatsApp) |

Os fluxos 01 e 02 só fazem sentido com `WORKER_ENABLED=false` — senão, o motor interno
e o n8n fazem a mesma coisa (não quebra nada, mas é trabalho dobrado).

---

## O endereço da API dentro do Docker

O n8n roda em container e **não enxerga** `localhost:3010` do Windows. Os fluxos usam:

```
http://host.docker.internal:3010
```

Se precisar de outro endereço (VPS, rede diferente), defina a variável `AFILIADOS_API`
no n8n — os fluxos a respeitam:

```javascript
{{ $env.AFILIADOS_API || 'http://host.docker.internal:3010' }}
```

Na VPS com o `docker-compose.yml` deste projeto, o valor certo é `http://app:3010`
(já vem configurado no serviço `n8n` do compose).

---

## Disparar a coleta de produtos (fluxo 07)

```bash
curl -X POST http://localhost:5678/webhook/afiliados-coletar \
  -H "Content-Type: application/json" \
  -d '{"termo":"perfume feminino","marketplace":"mercadolivre","limite":20,"ordenacao":"vendas"}'
```

Campos aceitos: `termo`, `marketplace` (`mercadolivre` ou `amazon` — as lojas que o
sistema consegue buscar sozinho), `categoria_loja` (categoria das ofertas do ML, ex.:
`MLB1246`), `precoMax`, `descontoMin`, `ordenacao`, `limite`. O fluxo busca e já importa
para a base; produto do ML/Shopee sai da importação com o link de afiliado gerado.

---

## Plugar avisos (Telegram, WhatsApp, e-mail)

Os fluxos 01, 06 e 08 terminam num nó **Code** com comentário `// Pluge aqui`.
Ligue nele o nó que preferir. Como você já usa Telegram no outro projeto, o caminho
mais curto é copiar aquele nó com a credencial existente.

Exemplo de uso do texto pronto do fluxo 08: `{{ $json.texto }}`.

---

## Criar novos fluxos

Tudo que o painel faz está na API — veja [API.md](API.md). Os mais úteis:

| Quero | Chame |
|---|---|
| Publicar agora | `POST /api/publicacoes/processar` |
| Rodar campanhas | `POST /api/campanhas/executar-ativas` |
| Enfileirar produto específico | `POST /api/publicacoes/enfileirar` |
| Ver o post antes | `POST /api/publicacoes/preview` |
| Coletar produtos | `POST /api/produtos/buscar` + `/api/produtos/importar` |
| Números do dia | `GET /api/sistema/dashboard` |
| Saúde | `GET /api/sistema/status` |

Se o `APP_TOKEN` estiver preenchido, acrescente o header `x-api-token` nos nós HTTP.

---

## Exportar um fluxo que você criou

No n8n: menu `...` do workflow → **Download**. Salve o JSON em `n8n/workflows/` com
o padrão `NN-nome-descritivo.json` — assim ele entra no backup e no controle de versão
junto com o resto do projeto.
