# Subir para uma VPS

O projeto já nasceu pronto para isso: sem passo de build, sem dependência compilada,
banco em arquivo e tudo configurável por `.env`.

---

## O que contratar

| Uso | Especificação | Custo típico |
|---|---|---|
| Painel + WAHA | 2 vCPU, 4 GB RAM, 40 GB SSD | R$ 40–80/mês |
| Painel + WAHA + n8n | 2 vCPU, 8 GB RAM, 80 GB SSD | R$ 80–150/mês |

Ubuntu 22.04 ou 24.04 LTS. Hostinger, Contabo, DigitalOcean, Hetzner — todas servem.

> A WAHA com engine `WEBJS` roda um navegador de verdade e come RAM. Com `NOWEB`
> (padrão), 4 GB bastam.

---

## 1. Preparar o servidor

```bash
ssh root@SEU_IP

# usuário sem root para o dia a dia
adduser afiliados && usermod -aG sudo afiliados

# Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker afiliados

# firewall: só SSH e web
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

Note que **3010, 3003 e 5678 não são liberados** — quem fala com esses serviços é o
proxy reverso, pela rede interna.

---

## 2. Subir o projeto

```bash
su - afiliados
git clone <seu-repositorio> afiliados   # ou envie por scp
cd afiliados
cp .env.example .env
nano .env
```

`.env` de produção:

```env
NODE_ENV=production
APP_HOST=0.0.0.0
APP_PORT=3010
APP_TOKEN=cole-aqui-uma-senha-longa
TZ=America/Sao_Paulo

DRY_RUN=true            # deixe true no primeiro dia

WHATSAPP_PROVIDER=waha
WAHA_BASE_URL=http://waha:3000
WAHA_API_KEY=outra-chave-longa
WAHA_DASHBOARD_PASSWORD=mais-uma-senha

N8N_BASE_URL=http://n8n:5678
```

Suba:

```bash
docker compose up -d                  # app + waha
docker compose --profile n8n up -d    # se quiser n8n nesta VPS também
docker compose logs -f app
```

Dados de exemplo (opcional):

```bash
docker compose exec app npm run seed
```

---

## 3. Domínio e HTTPS

Aponte um subdomínio (ex.: `ofertas.seudominio.com.br`) para o IP da VPS (registro A).

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/afiliados
```

```nginx
server {
    server_name ofertas.seudominio.com.br;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/afiliados /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ofertas.seudominio.com.br
```

O Certbot já configura a renovação automática.

**Alternativa sem abrir portas:** Cloudflare Tunnel, como você já usa no outro projeto
— aponta o túnel para `http://localhost:3010` e pronto.

---

## 4. Parear o WhatsApp na VPS

A WAHA não fica exposta. Use um túnel SSH a partir do seu PC:

```bash
ssh -L 3003:localhost:3003 afiliados@SEU_IP
```

Agora <http://localhost:3003> no seu navegador é a WAHA da VPS. Pareie por lá (ou pelo
painel, em WHATSAPP → Conexão).

---

## 5. Depois de subir

```bash
docker compose ps                    # tudo "Up"?
curl localhost:3010/api/health       # {"ok":true}
docker compose logs -f --tail=50 app
```

Checklist do primeiro dia:

- [ ] painel abre pelo domínio, com HTTPS
- [ ] `APP_TOKEN` pedindo senha
- [ ] WhatsApp pareado e 🟢 em WHATSAPP → Conexão
- [ ] um post de teste saiu do jeito certo
- [ ] só então `DRY_RUN=false` + `docker compose restart app`

---

## 6. Manutenção

| Tarefa | Comando |
|---|---|
| Atualizar o código | `git pull && docker compose up -d --build app` |
| Ver logs | `docker compose logs -f app` |
| Backup | `docker compose exec app npm run backup` |
| Trazer backup para o PC | `docker compose cp app:/app/storage/backups ./backups` |
| Reiniciar | `docker compose restart app` |
| Uso de recursos | `docker stats` |

Backup automático fora da VPS (rode no seu PC, não no servidor):

```bash
scp afiliados@SEU_IP:~/afiliados/storage/backups/*.db ./backups-vps/
```

---

## 7. Monitoramento simples

`GET /api/health` responde `{"ok":true}` — aponte um UptimeRobot (grátis) para
`https://ofertas.seudominio.com.br/api/health` e você recebe e-mail se cair.

Dentro do sistema, o workflow **AFILIADOS 06** já checa banco, WhatsApp e n8n a cada
15 minutos — basta plugar o aviso que você preferir.

---

## 8. Custo de manter

| Item | Mensal |
|---|---|
| VPS | R$ 40–150 |
| Domínio | ~R$ 40/ano |
| HTTPS (Let's Encrypt) | grátis |
| IA (opcional) | centavos por texto; `mock` custa zero |
| WAHA / n8n | grátis (open source) |
