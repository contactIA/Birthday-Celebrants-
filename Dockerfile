# Imagem de produção para a VPS (deploy pelo TurboCloud, que usa este arquivo
# quando o encontra na raiz). Passo a passo em docs/deploy-vps.md.
#
# Multi-stage com `output: 'standalone'`: a imagem final leva só o server.js e
# as dependências rastreadas pelo build, sem o node_modules inteiro.
#
# SEGREDOS NÃO ENTRAM AQUI. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINK_SECRET
# e CRON_SECRET são lidos em runtime e vêm do ambiente do container (console do
# TurboCloud). Nenhum deles é necessário no build.

# Mesma major do .nvmrc.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A CSP `frame-ancestors` é montada no build a partir desta lista (ver
# next.config.ts). Vazio = default do next.config (app.fluxodonto.com).
ARG EMBED_HOSTS
ENV EMBED_HOSTS=${EMBED_HOSTS}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Não roda como root.
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
