#!/bin/bash

echo "Checking devcontainer services..."
echo "================================="

if [ -n "$CODESPACE_NAME" ]; then
    echo "Running in GitHub Codespaces"
    echo "Codespace: $CODESPACE_NAME"
elif [ -n "$REMOTE_CONTAINERS" ]; then
    echo "Running in VS Code Remote Containers"
else
    echo "Warning: devcontainer environment not detected"
fi

echo ""
echo "Checking service connectivity..."
echo "---------------------------------"

check_service() {
    local name="$1" host="$2" port="$3"
    if nc -z "$host" "$port" 2>/dev/null; then
        echo "$name ($host:$port): Open"
    else
        echo "$name ($host:$port): Closed"
    fi
}

check_service "PostgreSQL" db 5432
check_service "Typesense" typesense 8108
check_service "Redis" redis 6379
check_service "LiteLLM" litellm 4000

echo ""
echo "System info..."
echo "--------------"
echo "Docker available: $(which docker >/dev/null && echo "Yes" || echo "No")"
echo "Node version: $(node --version 2>/dev/null || echo "Not found")"
echo "pnpm version: $(pnpm --version 2>/dev/null || echo "Not found")"
echo "uv version: $(uv --version 2>/dev/null || echo "Not found")"
echo "Python (uv): $(uv run python --version 2>/dev/null || echo "Not found")"

echo ""
echo "Open ports..."
echo "-------------"
netstat -tuln 2>/dev/null | grep -E ":3000|:3030|:4000|:5432|:6379|:8000|:8001|:8108" || echo "No service ports found open yet"

echo ""
echo "Next steps..."
echo "------------"
echo "  Full stack:  Run & Debug -> 'Launch' (Server + MCP + Agent Runtime + Workers)"
echo "  TS only:     pnpm dev     (Server :3000 + MCP :3030)"
echo "  LiteLLM UI:  http://localhost:4000/ui/  (admin/admin)"
