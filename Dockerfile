# 1. Usa LTS (Long Term Support). La 25 no es estándar aún.
FROM node:24-alpine AS base
RUN npm install -g corepack --force
RUN corepack enable && corepack prepare pnpm@latest --activate

# --- DEPENDENCIES ---
FROM base AS deps
# libc6-compat es necesario para Payload/Sharp en Alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copiamos solo lo necesario para instalar dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
# Copiamos los package.json de los subdirectorios para que pnpm sepa qué instalar
COPY apps/server/package.json ./apps/server/package.json
COPY packages ./packages

# Instalación con devDependencies para que los scripts prepare puedan construir los paquetes
RUN pnpm install --frozen-lockfile
# Los scripts prepare se ejecutan automáticamente y construyen los paquetes (dist/)

# --- BUILDER ---
FROM base AS builder

WORKDIR /app

# Copiamos los paquetes construidos (dist/) desde deps
COPY --from=deps /app/packages ./packages

# Copiamos node_modules (Next.js standalone filtrará las devDependencies automáticamente)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules

# Copiamos el código fuente necesario
COPY ./apps/server /app/apps/server
COPY ./tsconfig.base.json /app/tsconfig.base.json
COPY ./tsconfig.json /app/tsconfig.json

WORKDIR /app/apps/server

# Next.js standalone analiza estáticamente y solo incluye dependencias de producción
# Las devDependencies (rimraf, tsdown, etc.) NO se incluirán en .next/standalone
RUN corepack enable && npx next build --experimental-build-mode compile

# --- RUNNER ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# TeX Live mínimo para compilación LaTeX server-side (pdflatex).
# Paquetes adicionales se auto-instalan bajo demanda en dev.
# Para producción, añadir aquí los texmf-dist-* que necesites.
RUN apk add --no-cache \
    texlive \
    texmf-dist-latexrecommended \
    texmf-dist-latexextra \
    texmf-dist-fontsrecommended \
    texmf-dist-langspanish

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# --- OPTIMIZACIÓN DE COPIA PARA MONOREPO ---

# 1. Copiamos public. OJO: Mantén la estructura de carpetas si tu código la espera
COPY --from=builder /app/apps/server/public ./apps/server/public

# 2. Copiamos el standalone.
# En monorepos, standalone incluye "node_modules" en la raíz y tu app en "apps/server"
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/.next/standalone ./

# 3. Copiamos los estáticos al lugar correcto dentro de la estructura
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/.next/static ./apps/server/.next/static

# 4. Entrypoint (si lo necesitas, sino bórralo y usa CMD directo)
COPY --from=builder --chown=nextjs:nodejs /app/apps/server/scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs

EXPOSE 3000

WORKDIR /app

ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/server/server.js"]