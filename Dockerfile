FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /srv

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/*.js ./server/
COPY app/ ./app/

ENV PORT=8080 \
    DB_PATH=/data/sushi.db
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:8080/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/server.js"]
