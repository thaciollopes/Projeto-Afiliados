# WhatsApp (WAHA)

O sistema fala com o WhatsApp através do **WAHA** (WhatsApp HTTP API), que roda em
Docker. A API oficial do WhatsApp Business **não** é usada nesta versão.

Por trás, o resto do sistema só conhece a interface `WhatsAppProvider`. Trocar para
Evolution API ou para a API oficial no futuro = um arquivo novo em
`src/integrations/whatsapp/` + uma linha no `.env`. Nenhum service muda.

---

## Antes de começar: recado importante

O WAHA usa a mesma conexão que o WhatsApp Web. Isso **não é oficial**, e o WhatsApp
pode bloquear números que se comportam como robô. Reduza o risco:

- use um **número dedicado** à divulgação, nunca o pessoal;
- deixe **intervalo de 30 minutos ou mais** entre posts no mesmo grupo;
- respeite a janela de horário (ninguém manda oferta às 3 da manhã);
- use o **teto diário** por grupo;
- publique em grupos **seus** ou onde você tem permissão.

O sistema já tem todos esses freios — eles existem por esse motivo.

---

## Subir o WAHA deste projeto

```bat
docker compose -f docker-compose.waha.yml up -d
```

Container: `afiliados-waha`, porta **3003**, painel em <http://localhost:3003>.

A porta 3003 é de propósito: suas outras WAHA (`crm-waha` na 3001 e `ranch-waha`
na 3002) continuam intocadas, cada uma com sua sessão. **Nunca** declare aqueles
containers neste compose — dois composes cuidando do mesmo container destroem a sessão.

---

## Ligar no sistema

No `.env`:

```env
WHATSAPP_PROVIDER=waha
WAHA_BASE_URL=http://localhost:3003
WAHA_SESSION=default
WAHA_API_KEY=
```

Rode `REINICIAR.bat`.

---

## Parear o número

1. Painel → **WHATSAPP → Conexão**
2. **Iniciar sessão**
3. **Parear (QR Code)**
4. No celular: WhatsApp → Aparelhos conectados → Conectar aparelho → leia o QR

Deu certo quando o painel mostra 🟢 **Conectado** e o estado `WORKING`.

Se o QR não abrir no painel, abra <http://localhost:3003> direto — o painel do WAHA
também mostra.

---

## Cadastrar os grupos

Painel → **WHATSAPP → Grupos e canais → Importar do WhatsApp**. O sistema lista os
grupos da sessão e você escolhe quais entram.

Cada grupo tem configuração própria:

| Campo | Para quê |
|---|---|
| **Intervalo** | tempo mínimo entre dois posts neste grupo |
| **Hora inicial / final** | janela em que pode receber (ex.: 08:00–22:00) |
| **Máximo por dia** | teto de posts por dia |
| **Status** | pausado = não recebe nada |

A coluna **Agora** mostra, em tempo real, se o grupo está aceitando envio — e, quando
não está, o motivo (fora do horário, teto atingido, pausado).

---

## Testar

**Teste de mensagem simples:** na linha do grupo, botão 📤.

**Teste de oferta real:** em qualquer produto, botão 👁️ → escolha template e grupo →
**Enviar teste agora**. Assim você vê o post inteiro (preço, cupom, imagem) antes de
qualquer campanha.

Com `DRY_RUN=true`, os dois testes **simulam** — aparecem no histórico marcados como
`simulado`, mas nada sai no WhatsApp.

---

## Engines: NOWEB ou WEBJS

```env
WAHA_ENGINE=NOWEB
```

- **NOWEB** (padrão): leve, rápido, gasta pouca memória.
- **WEBJS**: roda um navegador de verdade; mais pesado, às vezes mais compatível.

Trocou? Recrie o container:

```bat
docker compose -f docker-compose.waha.yml up -d --force-recreate
```

---

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Painel diz "provider mock" | `WHATSAPP_PROVIDER=waha` no `.env` + `REINICIAR.bat` |
| 🔴 Desconectado | `docker ps` mostra `afiliados-waha`? Se não: `docker compose -f docker-compose.waha.yml up -d` |
| Status `SCAN_QR_CODE` | falta parear: clique em Parear e leia o QR |
| Status `STOPPED` | clique em **Iniciar sessão** |
| Caiu sozinho depois de uns dias | normal em sessão não oficial; parear de novo resolve |
| "Não consegui listar grupos" | a sessão precisa estar `WORKING`; espere terminar de sincronizar |
| Imagem não vai, só o texto | o link da imagem precisa ser público; o sistema cai para texto sozinho e registra o aviso |

Logs do WAHA:

```bat
docker logs -f afiliados-waha
```

---

## Na VPS

O `docker-compose.yml` já traz o WAHA na rede interna. Lá, **preencha**:

```env
WAHA_API_KEY=uma-chave-longa
WAHA_DASHBOARD_PASSWORD=outra-senha-longa
```

e não publique a porta 3003 na internet — quem precisa falar com o WAHA é o app,
pela rede do compose (`http://waha:3000`). Veja [VPS.md](VPS.md).
