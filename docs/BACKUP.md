# Backup e restauração

## O que é salvo

Cada backup gera **dois arquivos** em `storage/backups/`:

| Arquivo | O que é |
|---|---|
| `backup-AAAA-MM-DD...-rotulo.db` | cópia do banco SQLite — é o que restaura |
| `backup-AAAA-MM-DD...-rotulo.json` | os mesmos dados em texto legível, para conferir ou migrar |

Inclui produtos, promoções, cupons, campanhas, canais, templates, afiliados, pesquisas,
publicações e as configurações do painel.

Antes de copiar o arquivo, o sistema faz `wal_checkpoint` — sem isso a cópia poderia
sair sem os últimos registros.

---

## Fazer backup

| Como | Onde |
|---|---|
| Duplo clique | `BACKUP.bat` |
| Painel | SISTEMA → Backup → **Fazer backup agora** |
| Terminal | `npm run backup` |
| Automático (diário 03:30) | workflow **AFILIADOS 04** no n8n |
| API | `POST /api/sistema/backups` |

O sistema guarda os **15 mais recentes** (`BACKUP_KEEP` no `.env`) e apaga os antigos.

---

## Restaurar

Painel → SISTEMA → Backup → botão **♻️ Restaurar** na linha desejada.

O que acontece:

1. o banco atual é copiado para `afiliados.db.antes-da-restauracao-<timestamp>`;
2. o backup escolhido vira o banco ativo;
3. arquivos `-wal`/`-shm` antigos são removidos (apontavam para o banco substituído);
4. a conexão é reaberta.

Ou seja: **restaurar não é irreversível** — se restaurou o backup errado, a cópia de
segurança está lá ao lado.

Pela API:

```http
POST /api/sistema/backups/restaurar
{ "arquivo": "backup-2026-09-23T18-31-38-manual.db" }
```

---

## Backup manual (sem o sistema)

Com o servidor **parado**, copie:

```
data\afiliados.db        ← todos os dados
.env                     ← suas chaves (guarde em lugar seguro)
storage\backups\         ← backups anteriores
```

Só isso. O resto (código, `node_modules`) você recria com `INSTALAR.bat`.

---

## Exportar para Excel

SISTEMA → Backup → **Exportar Excel** gera um `.xlsx` com uma aba por tabela em
`storage/exports/`. Serve para conferir números, mandar para alguém ou migrar para
outra ferramenta — **não** é um backup restaurável.

---

## Levar para outra máquina (ou para a VPS)

1. `BACKUP.bat` na máquina antiga.
2. Copie a pasta do projeto (ou clone o repositório) para a máquina nova.
3. `INSTALAR.bat`.
4. Copie o `.db` do backup para `data\afiliados.db` **ou** use SISTEMA → Backup → Restaurar.
5. Copie o `.env` (ou recrie as chaves).
6. `INICIAR.bat`.

Na VPS com Docker, o banco fica no volume `afiliados-data`:

```bash
docker cp backup-2026-09-23.db afiliados-app:/app/data/afiliados.db
docker restart afiliados-app
```

---

## Reset total

```bash
node scripts/reset.js --sim
npm run seed
```

Apaga tudo e recria só categorias e templates. **Faz backup automático antes** — mesmo
assim, tenha certeza.

---

## Rotina recomendada

| Frequência | O quê |
|---|---|
| Diária | backup automático (workflow 04 do n8n) |
| Semanal | copiar o `.db` mais recente para a nuvem ou HD externo |
| Antes de mexer em algo grande | `BACKUP.bat` na mão |
| Mensal | testar uma restauração — backup que nunca foi testado não é backup |
