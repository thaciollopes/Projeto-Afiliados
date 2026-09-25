# Quando algo dá errado

Antes de tudo: **`STATUS.bat`**. Ele diz em 5 segundos o que está de pé e o que não está.

---

## O sistema não abre

| Sintoma | Causa provável | Solução |
|---|---|---|
| "node não é reconhecido" | Node.js não instalado | instale a versão LTS em nodejs.org e rode `INSTALAR.bat` |
| Janela abre e fecha na hora | erro na inicialização | abra o `cmd`, rode `cd C:\Projeto-Afiliados` e `npm start` para ler a mensagem |
| `EADDRINUSE` na porta 3010 | outra coisa usando a porta | rode `PARAR.bat`, ou mude `APP_PORT` no `.env` |
| "Cannot find module" | dependências faltando | `INSTALAR.bat` |
| Navegador mostra "não foi possível acessar" | servidor ainda subindo | espere 3 segundos e recarregue |

Ver quem está na porta:

```bat
netstat -ano | findstr :3010
```

---

## O painel abre, mas algo não funciona

| Sintoma | Solução |
|---|---|
| Página em branco | F12 → aba Console; o erro aparece lá. Ctrl+F5 limpa o cache |
| "Não consegui falar com o servidor" | a janela preta fechou — rode `INICIAR.bat` |
| Pede token toda hora | `APP_TOKEN` preenchido no `.env`; use o token ou deixe vazio para uso local |
| Números do dashboard zerados | é o estado real: o sistema não tem dados de exemplo |

---

## WhatsApp

| Sintoma | Solução |
|---|---|
| "provider mock" | `.env`: `WHATSAPP_PROVIDER=waha` + `REINICIAR.bat` |
| 🔴 Desconectado | `docker ps` mostra `afiliados-waha`? Senão: `docker compose -f docker-compose.waha.yml up -d` |
| `SCAN_QR_CODE` | falta parear: WHATSAPP → Conexão → Parear |
| `STOPPED` | clique em **Iniciar sessão** |
| "Não consegui listar grupos" | a sessão precisa estar `WORKING` e ter terminado de sincronizar |
| Caiu depois de uns dias | normal em sessão não oficial — pareie de novo |
| Imagem não vai | a URL da imagem precisa ser pública; o sistema manda só o texto e registra o aviso |

Logs: `docker logs -f afiliados-waha`

---

## Nada é publicado

Siga nesta ordem:

1. **A campanha está ativa?** CAMPANHAS → status deve ser `ativa`.
2. **Tem grupo ligado nela?** Coluna Destinos.
3. **Tem produto?** Botão 👁️ mostra o que ela pegaria agora.
4. **O grupo aceita agora?** WHATSAPP → Grupos → coluna "Agora".
5. **A fila tem itens?** PUBLICAÇÕES → Fila.
6. **O worker está ligado?** `WORKER_ENABLED=true` no `.env`.
7. **É dry run?** Se o topo mostra MODO SIMULAÇÃO, nada sai — é o esperado.

Teste rápido: CAMPANHAS → ▶️ (ignora horário e intervalo) e veja a mensagem de retorno.

Os motivos possíveis e o que significam estão em [CAMPAIGNS.md](CAMPAIGNS.md#por-que-minha-campanha-não-publicou).

---

## "Produto já publicado neste canal nos últimos X dias"

Não é erro — é o controle de repetição. Opções: esperar, baixar "Não repetir por" na
campanha, ou usar `ignorar_duplicado: true` na API (o botão de teste do produto já faz
isso).

---

## Publicação com erro

PUBLICAÇÕES → Histórico → aba **Erros**. A coluna Status mostra o motivo.

O sistema já tenta de novo sozinho: 30s, 2min, 5min. Depois marca erro definitivo e
gera alerta. O botão 🔁 força uma nova tentativa.

| Erro | Significado |
|---|---|
| `WAHA ... ECONNREFUSED` | WAHA fora do ar |
| `WAHA ... 404` | sessão não existe — inicie a sessão |
| `chatId vazio` | grupo sem identificador; corrija em WHATSAPP → Grupos |
| `Canal removido` | o grupo foi apagado depois de a publicação entrar na fila |

---

## Preço ou cupom errado no post

Use o **preview** (botão 👁️ no produto): ele mostra a cascata inteira — preço normal,
promoção, cupom, final — e o motivo de um cupom não ter entrado.

| Sintoma | Causa |
|---|---|
| Cupom não aparece | expirado, compra mínima não atingida, categoria diferente ou esgotado — o preview diz qual |
| "De/por" não aparece | `preco_anterior` vazio ou menor que o atual |
| Preço desatualizado | atualize o produto (botão ↻) ou edite na mão; a mudança entra no histórico |
| Valor estranho | confira `preco_atual` e `preco_anterior` no cadastro; a conta é sempre desses dois campos |

---

## n8n

| Sintoma | Solução |
|---|---|
| Status offline no painel | o n8n está no ar em <http://localhost:5678>? |
| Não consigo importar fluxos | falta `N8N_API_KEY` no `.env` — ou importe pela interface |
| Fluxo dá erro de conexão | dentro do Docker use `http://host.docker.internal:3010`, não `localhost` |
| Fluxo roda mas nada acontece | veja a resposta do nó HTTP; se vier 401, falta o header `x-api-token` |

---

## Banco de dados

| Sintoma | Solução |
|---|---|
| "database is locked" | dois processos escrevendo; `PARAR.bat` e inicie um só |
| "Nenhum driver SQLite disponível" | Node abaixo de 22 — atualize, ou `npm install better-sqlite3` |
| Dados sumiram | SISTEMA → Backup → Restaurar |
| Quero começar do zero | `node scripts/reset.js --sim` e depois `npm run seed` |

---

## IA

| Sintoma | Solução |
|---|---|
| "SDK da Anthropic não instalado" | `npm install @anthropic-ai/sdk` |
| "AI_API_KEY vazia" | preencha no `.env` + `REINICIAR.bat` |
| Sugestão pobre | é o modo `mock` (regras locais). Configure um provider de verdade |
| "A IA tentou inventar dados" | o guard funcionou: o trecho foi removido. Nada a corrigir |

---

## Ainda travado

1. `VER-LOGS.bat` — a mensagem real costuma estar ali.
2. Painel → SISTEMA → Logs, filtrando por `error`.
3. `npm test` — se algum teste falhar, o problema é no código, não na configuração.
4. `npm run health` — diagnóstico completo em texto.
