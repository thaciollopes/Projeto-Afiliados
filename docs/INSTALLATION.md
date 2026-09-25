# Instalação

## Requisitos

| Item | Versão | Obrigatório? |
|---|---|---|
| **Node.js** | 22 ou superior (LTS) | sim |
| **Docker Desktop** | atual | só para n8n e WAHA |
| Windows 10/11 | — | (Linux/macOS também rodam, veja o fim) |

Por que Node 22+: o banco usa o módulo `node:sqlite`, que vem embutido a partir dessa
versão. Em Node 20 o sistema ainda roda, mas precisa do pacote `better-sqlite3`
(o próprio `npm install` já o instala como alternativa).

Confira o que você tem:

```bat
node --version
```

Se não aparecer nada, instale a versão **LTS** em <https://nodejs.org>.

---

## Instalação (Windows)

1. Dois cliques em **`INSTALAR.bat`**. Ele:
   - confere o Node,
   - instala as dependências (`npm install`),
   - cria o `.env` a partir do `.env.example`,
   - cria o banco com categorias e templates.

2. Dois cliques em **`INICIAR.bat`**. O navegador abre em <http://localhost:3010>.

Pronto. O sistema começa vazio (só categorias e templates). O primeiro passo é
**LOJAS → Minhas lojas**: coloque a sua tag e o cookie de cada loja.

---

## Instalar o WhatsApp (WAHA)

O WAHA roda em Docker, na porta **3003** (separada das WAHA dos seus outros projetos,
que usam 3001 e 3002 — nada é compartilhado, cada uma tem a própria sessão).

```bat
docker compose -f docker-compose.waha.yml up -d
```

Depois, no `.env`:

```env
WHATSAPP_PROVIDER=waha
WAHA_BASE_URL=http://localhost:3003
```

e rode `REINICIAR.bat`. O pareamento é pelo painel: **WHATSAPP → Conexão**.
Detalhes em [WAHA.md](WAHA.md).

---

## Ligar no n8n

O sistema usa o **n8n que você já tem** (projeto `C:\Projeto\Projeton8n`, porta 5678).
Nenhum segundo n8n é criado.

1. Confirme que está no ar: <http://localhost:5678>
2. No `.env` deste projeto, a linha `N8N_BASE_URL=http://localhost:5678` já vem certa.
3. Para subir os fluxos prontos: `IMPORTAR-WORKFLOWS-N8N.bat`
   (peça uma API key em n8n → Settings → n8n API e cole em `N8N_API_KEY` no `.env`,
   ou importe os arquivos de `n8n/workflows/` pela interface).

Detalhes em [N8N.md](N8N.md).

---

## Estrutura de pastas

```
C:\Projeto-Afiliados\
├── *.bat                  atalhos de operação (duplo clique)
├── .env                   suas configurações e chaves (NUNCA compartilhe)
├── .env.example           modelo do .env
├── docker-compose.yml     stack completa (para a VPS)
├── docker-compose.waha.yml WAHA local, porta 3003
├── Dockerfile             imagem do painel
├── src/                   código do servidor
│   ├── api/               rotas HTTP
│   ├── config/            leitura do .env
│   ├── core/              regra de negócio, repositórios, banco
│   ├── integrations/      marketplaces, WhatsApp, IA, n8n
│   └── workers/           motor interno (campanhas + fila)
├── public/                painel (HTML/CSS/JS)
├── n8n/workflows/         fluxos prontos para importar
├── scripts/               seed, backup, health, import de workflows
├── tests/                 testes automatizados
├── data/                  banco SQLite  ← seus dados vivem aqui
├── storage/               backups, exports, logs, cache
└── docs/                  esta documentação
```

As pastas `data/` e `storage/` são as **únicas** que importam num backup manual —
e o `BACKUP.bat` já cuida disso.

---

## Comandos (para quem prefere terminal)

```bash
npm install        # dependências
npm run seed       # categorias e templates (não duplica se rodar de novo)
npm start          # sobe o servidor
npm run dev        # sobe com reinício automático ao salvar arquivo
npm test           # roda os testes
npm run health     # diagnóstico dos serviços
npm run backup     # backup agora
node scripts/reset.js --sim   # apaga tudo (faz backup antes)
```

---

## Atualizar o sistema

```bash
npm install        # se alguma dependência mudou
npm test           # confirma que está tudo certo
```

O banco se atualiza sozinho: o schema usa `CREATE TABLE IF NOT EXISTS` e roda a cada
inicialização. Colunas novas em versões futuras entram por migração — e o `BACKUP.bat`
antes de atualizar continua sendo boa ideia.

---

## Linux / macOS

Os `.bat` são do Windows, mas o sistema em si é multiplataforma:

```bash
npm install && npm run seed && npm start
```

Na VPS o caminho recomendado é Docker — veja [VPS.md](VPS.md).

---

## Desinstalar

Apague a pasta `C:\Projeto-Afiliados`. Se subiu o WAHA:

```bat
docker compose -f docker-compose.waha.yml down -v
```

O `-v` apaga também a sessão do WhatsApp (você precisaria parear de novo).
