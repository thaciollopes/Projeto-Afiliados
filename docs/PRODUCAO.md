# Produção — onde este projeto roda e como publicar

Guia geral (todos os projetos): `C:\Projeto\vps\GUIA-DO-DIA-A-DIA.md`.

## Onde roda

| Peça | Produção | Observação |
|---|---|---|
| Painel + API + agendador | **VPS** 143.95.218.15, container `afiliados` | painel: https://afiliados.143-95-218-15.sslip.io (login do painel + `APP_TOKEN`) |
| WhatsApp de divulgação | VPS, container `afiliados-waha` | conectar o celular: https://whats-divulgacao.143-95-218-15.sslip.io |
| Fluxos do n8n (`n8n/workflows`) | n8n da VPS | usam `AFILIADOS_API=http://afiliados:3010` |
| **Vitrine pública** | **https://awaydev.com.br/ofertas** (Cv-App, Hostinger) | o sistema envia os produtos a cada 10 min (`src/core/services/vitrineService.js` → `sincronizarVitrine`) |

Banco: SQLite no volume `vps_afiliados_data` (backup diário às 4h, `/opt/vps-backups`).
Configuração da VPS: `/opt/vps/env/afiliados.env` (o `.env` deste PC **não** vai para lá).

## Mudar alguma coisa

1. Mude **aqui** (`C:\Projeto-Afiliados`) e rode `npm test`.
2. Publique:
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\Projeto\vps\scripts\pc\4-publicar-na-vps.ps1 -Servico afiliados
   ```
3. Guarde no GitHub: `git add -A`, `git commit`, `git push` (repositório `thaciollopes/Projeto-Afiliados`).

Mudança só na **aparência da vitrine** (`/ofertas`) é no Cv-App (`C:\Projeto\Cv-App\views\ofertas*.ejs`),
não aqui — lá o `git push` já publica.

## O que é diferente na VPS

- Endereços internos vêm do `docker-compose.yml` da VPS (WAHA `http://afiliados-waha:3000`, n8n `http://n8n:5678`).
- Painel com senha obrigatória (`APP_TOKEN`) e atrás do login do painel.
- Buscas nas lojas (Amazon, ofertas do ML) e geração de link pelo cookie saem do IP da VPS:
  se uma loja começar a pedir captcha, é por isso — prefira as APIs oficiais / listas.
