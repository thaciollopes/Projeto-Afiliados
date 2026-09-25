# Plataforma de Afiliados — como trabalhar neste projeto

Plataforma de automação de ofertas: acha produtos, monta promoções/cupons, cria
campanhas e publica em grupos do WhatsApp via WAHA. Roda local (Windows, `.bat`) e
sobe para VPS por Docker sem reescrever nada.

**Leia primeiro:** `docs/ARCHITECTURE.md` — o porquê das decisões.
Este arquivo é sobre *como mexer no projeto*.

---

## Regra de ouro

> O app é dono dos **dados** e da **fila**. O n8n **orquestra**.

Nenhuma regra de negócio dentro de workflow. Todo fluxo do n8n só chama a API
(`docs/API.md`). O sistema publica sozinho com o n8n desligado.

E a segunda regra, que vale mais que qualquer feature: **nada de dado inventado**.
Preço, desconto e cupom vêm do cadastro e passam pelo `pricingService`. A IA só mexe em
texto, e o guard (`src/integrations/ai/guards.js`) remove número que ela tentar criar.
Marketplace sem credencial fica `implementado: false` — nunca devolve dado falso.

---

## Onde as coisas ficam

| O quê | Onde |
|---|---|
| Regra de negócio | `src/core/services/` — **só aqui** |
| Acesso a dados | `src/core/repositories/` — única camada que sabe que é SQLite |
| Schema | `src/core/db/schema.sql` (roda a cada boot, `IF NOT EXISTS`) |
| Rotas HTTP | `src/api/routes/` — sem lógica, só entrada/saída |
| WhatsApp, IA, marketplaces, n8n | `src/integrations/` |
| Motor interno (campanhas + fila) | `src/workers/scheduler.js` |
| Painel | `public/` — HTML/CSS/JS puro, sem build |
| Fluxos do n8n | `n8n/workflows/*.json` |
| Operação (duplo clique) | `*.bat` na raiz |

**Direção das dependências:** rotas → services → repositories → db. Nunca o contrário.
Nada em `core/` conhece "WAHA" ou "AliExpress" pelo nome.

---

## Comandos

```bash
npm start              # sobe (ou INICIAR.bat)
npm run dev            # com --watch
npm test               # 100 testes; o painel entra junto se o servidor estiver no ar
npm run seed           # só categorias e templates (idempotente)
npm run health         # diagnóstico
node scripts/reset.js --sim   # zera o banco (faz backup antes)
```

Servidor em <http://localhost:3010>. Porta 3010 de propósito: 3001 e 3002 são das WAHA
dos outros projetos.

---

## Ambiente desta máquina

| Serviço | Onde | Observação |
|---|---|---|
| n8n | `localhost:5678` (`ranch-n8n`) | do projeto `C:\Projeto\Projeton8n` — **reusado**, não crie outro |
| WAHA deste projeto | `localhost:3003` (`afiliados-waha`) | compose próprio |
| WAHA de outros projetos | 3001 (`crm-waha`), 3002 (`ranch-waha`) | **não declare** nos composes daqui |
| Postgres pgvector | 5432 (`ranch-postgres-ia`) | de outro projeto; não usado aqui |

n8n em Docker chama o app por `http://host.docker.internal:3010` (não `localhost`).

---

## Convenções

- **Português** em código, comentário, commit e interface. Sem acento em nome de
  arquivo, variável e `.bat`.
- Comentário explica **por que**, não o que. Se o código precisa de comentário para
  dizer o que faz, reescreva o código.
- Erros de negócio: `AppError` / `badRequest()` / `notFound()` de `core/utils/errors.js`.
- Datas em ISO-8601 UTC no banco; formatação pt-BR só na borda.
- Dinheiro: sempre `round2()` de `core/utils/money.js`.
- Campo novo no banco = coluna em `schema.sql` + (se for JSON/bool) declarar em
  `repositories/index.js`.

---

## Antes de entregar qualquer mudança

```bash
npm test
```

Se mexeu em preço, template, fila ou campanha, o teste correspondente precisa existir:

| Área | Arquivo |
|---|---|
| Cascata de preço, cupons, score | `tests/precos.test.js` |
| Template (linha some, blocos) | `tests/template.test.js` |
| Fila, dedupe, retry, campanha | `tests/fluxo.test.js` |
| Todas as páginas do painel | `tests/painel.test.js` (jsdom; pula se o servidor estiver parado) |

`tests/fluxo.test.js` usa banco temporário — define `DB_FILE` antes dos imports
dinâmicos. Copie o padrão se precisar de outro teste com banco.

---

## Armadilhas conhecidas

| Armadilha | Detalhe |
|---|---|
| Editar `.env` e não reiniciar | o config só lê no boot — `REINICIAR.bat` |
| `label` dentro de bloco `if (...)` no `.bat` | quebra no cmd; use `goto` |
| Heredoc grande no Git Bash | falha; escreva arquivo grande com a ferramenta de escrita |
| `node --test tests/` | não funciona no Windows; use `node --test "tests/*.test.js"` |
| Parâmetro em SQLite | só number/string/null — o `BaseRepository` converte bool e objeto |
| `DRY_RUN` | padrão `true`; se "não envia nada", provavelmente é isso (e está certo) |
| Tabela `settings` | PK é `chave`, não `id` — tem repositório próprio |
| Teste que escreve em `settings` | usa o banco real: guarde e devolva o valor (um teste apagou o PKCE de uma autorização em andamento) |
| Mercado Livre | busca da API fechada desde abr/2025; link de afiliado = `meli.la` via cookie (`mercadoLivreLinkService.js`) |
| Shopee | link de afiliado = `s.shopee.com.br` via cookie do painel (`shopeeLinkService.js`); a conta é a do cookie, o ID em LOJAS só confere |
| "Link curto = comissão" | falso: `verificacaoLinkService.js` abre o link e lê o ID no destino; ID de outra conta bloqueia a fila |
| Reimportar produto | não pode trocar o link de afiliado gerado pelo link cru (`importProducts` preserva) |
| Worker + n8n na mesma fila | `sendPublication` reserva a publicação (lê e marca `enviando` sem `await` no meio); não troque por algo com `await` antes do `update` |
| Envio real em rajada | `processQueue` manda 1 envio real por vez com pausa sorteada (`ENVIO_PAUSA_MIN/MAX_SEGUNDOS`); o resto fica para o próximo ciclo |
| Lojas | **sem API e sem loja demo** (pedido do dono). Catálogo em `marketplaces/lojas.js`; tag + cookie na tela LOJAS. Código antigo em `_arquivo/` |

---

## Status

Fases 1 a 5 prontas e testadas (painel, produtos, promoções, cupons, campanhas, fila
com retry, templates, IA com guard, backup, limpeza, logs, status, 8 workflows).

Fase 6 (próxima): marketplaces reais conforme as credenciais chegarem, Postgres, VPS,
multiusuário. Os pontos de extensão já existem: `MarketplaceAdapter`, `BaseRepository`,
`WhatsAppProvider`.
