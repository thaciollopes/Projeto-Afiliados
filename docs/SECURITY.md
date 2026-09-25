# Segurança

## Onde ficam os segredos

**Só no `.env`**, na raiz do projeto. Ele está no `.gitignore` e nunca é enviado ao
navegador.

| Nunca faça | Faça |
|---|---|
| chave direto no código | `.env` |
| chave no JavaScript do painel | o backend usa; o front nem vê |
| `.env` no git / em chat / em print | compartilhe o `.env.example` (sem valores) |
| a mesma chave em produção e em teste | uma chave por ambiente |

O painel recebe apenas o que está em `publicConfig()`: nome do app, ambiente, se o dry
run está ligado, qual provider de WhatsApp e de IA, fuso. Nenhum token, nenhuma senha.

Programas de afiliados aparecem **mascarados** na tela (`ABC1••••XYZ9`) — nem o
identificador completo trafega para o navegador.

---

## Protegendo o painel

No uso local (só seu PC), não precisa de senha. Quando o painel ficar acessível para
outras pessoas ou para a internet:

```env
APP_TOKEN=uma-senha-longa-e-aleatoria-de-preferencia-32-caracteres
```

A partir daí toda chamada exige o cabeçalho `x-api-token`. O painel pede o token uma
vez e guarda no navegador.

Gerar um token bom:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

---

## Exposição de rede

| Serviço | Porta | Recomendação |
|---|---|---|
| Painel | 3010 | rede local: ok. Internet: **só** com `APP_TOKEN` + HTTPS |
| WAHA | 3003 | **nunca** exponha. Ele controla seu WhatsApp |
| n8n | 5678 | atrás de autenticação (o seu já usa Cloudflare Tunnel) |

Na VPS, o `docker-compose.yml` já publica o WAHA apenas em `127.0.0.1` — quem fala com
ele é o app, pela rede interna do Docker.

Para restringir o painel a este PC:

```env
APP_HOST=127.0.0.1
```

---

## Proteções que já estão no código

| Risco | O que existe |
|---|---|
| SQL injection | ordenação e filtros são validados contra as colunas reais da tabela; todo valor vai como parâmetro |
| XSS no painel | todo texto vindo do banco passa por `escapar()` antes de virar HTML |
| Segredo vazando para o front | `publicConfig()` é uma lista explícita do que pode sair |
| Segredo em log | os logs registram serviço e mensagem, nunca o corpo das credenciais |
| Publicar dado inventado | guard da IA + validação antes de enfileirar |
| Envio acidental | `DRY_RUN=true` por padrão |
| Loop infinito de retry | máximo de 3 tentativas, depois erro definitivo + alerta |

---

## Cuidados com o WhatsApp

O WAHA usa uma sessão não oficial. O número pode ser bloqueado se parecer robô:

- número **dedicado**, nunca o pessoal;
- intervalo de **30 minutos ou mais** por grupo;
- janela de horário civilizada;
- teto diário por grupo;
- só grupos seus ou com permissão.

Esses freios estão no sistema — não os desligue "para testar mais rápido".

---

## Backup é segurança

Um backup diário protege contra o erro mais comum: apagar algo sem querer.
`BACKUP.bat`, ou o workflow 04 do n8n, ou SISTEMA → Backup. Guarde uma cópia **fora**
do PC (nuvem, HD externo) de tempos em tempos. Veja [BACKUP.md](BACKUP.md).

---

## Se um segredo vazar

1. **Revogue a chave** no painel do serviço (Anthropic, Amazon, AliExpress…).
2. Gere uma nova e coloque no `.env`.
3. `REINICIAR.bat`.
4. Se foi para o git: revogar **é obrigatório** — apagar o commit não basta, a chave já
   foi copiada por bots.

---

## Dados pessoais

O sistema guarda identificadores de grupos do WhatsApp — que são dados pessoais para a
LGPD. Consequências práticas: não compartilhe o banco nem os backups com terceiros, e
publique apenas em grupos onde você tem permissão para isso.
