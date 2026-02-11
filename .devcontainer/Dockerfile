FROM node:25-alpine

# Instalar dependencias necesarias
RUN apk add --no-cache \
    git \
    curl \
    maven \
    wget \
    bash

RUN npm install -g @anthropic-ai/claude-code

# Instalar Bun
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -s /root/.bun/bin/bunx /usr/local/bin/bunx

# Instalar pnpm usando corepack
# En Node.js 25, corepack necesita ser instalado con --force debido a conflictos con yarn
RUN npm install -g corepack --force && \
    corepack enable && \
    corepack prepare pnpm@10.5.0 --activate

# Establecer el directorio de trabajo
WORKDIR /workspace

# Configurar el shell por defecto
SHELL ["/bin/bash", "-c"]

# Comando por defecto
CMD ["sleep", "infinity"] 