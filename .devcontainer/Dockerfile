FROM node:24-bookworm-slim

# Debian (glibc) base → paridad con el backend en prod (uv:python3.12-bookworm-slim)
# y con CI (Node 24). Evita la fricción de musl con sharp/native deps y wheels Python.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git bash curl ca-certificates netcat-openbsd unzip \
 && rm -rf /var/lib/apt/lists/*

# Claude CLI (official installer)
RUN curl -fsSL https://claude.ai/install.sh | bash

# uv (binarios oficiales) + Python 3.12 gestionado por uv (glibc → wheels manylinux,
# sin compilar desde source). Lo necesita el workspace backend/ (agno-agent, workers).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
RUN uv python install 3.12

# Bun — lo usa apps/mcp (`bun --watch src/index.ts`)
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -s /root/.bun/bin/bunx /usr/local/bin/bunx

# pnpm via corepack (Node 24 ya incluye corepack → sin --force)
RUN corepack enable && \
    corepack prepare pnpm@10.14.0 --activate

WORKDIR /workspace

SHELL ["/bin/bash", "-c"]

CMD ["sleep", "infinity"]
