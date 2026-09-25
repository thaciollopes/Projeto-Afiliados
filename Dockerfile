# Imagem do painel de afiliados. Node 22+ traz o modulo node:sqlite embutido,
# entao nao ha dependencia nativa para compilar.
FROM node:22-alpine

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p data storage/backups storage/exports storage/logs storage/cache

EXPOSE 3010

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.APP_PORT||3010)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
