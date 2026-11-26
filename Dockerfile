# 012.media — single service: public site, access endpoints, scheduler, PDF rendering.
# Node 22 (>= 22.13 for node:sqlite) + Chromium for the tagged-PDF renderer.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DATA_DIR=/var/data \
    PORT=10000

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && npx playwright install --with-deps chromium \
 && rm -rf /root/.npm /var/lib/apt/lists/*

COPY . .
RUN mkdir -p /var/data && chown -R node:node /var/data /app
USER node

EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
