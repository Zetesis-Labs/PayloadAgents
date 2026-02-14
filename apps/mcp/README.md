# Typesense MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with powerful search capabilities over Typesense collections. This server enables semantic search, lexical search, and hybrid search across your Typesense data.

## Features

- **Multi-mode Search**: Supports lexical, semantic, and hybrid search modes
- **Chunk-based Retrieval**: Search and retrieve document chunks with full context
- **Advanced Filtering**: Filter by taxonomies, headers, and custom facets
- **Parent Document Access**: Retrieve complete documents via parent IDs
- **Docker Ready**: Easy deployment via Docker container

## Tools

This MCP server provides 4 tools for AI assistants:

### 1. `get_filter_criteria`
Get available taxonomies and filter criteria for collections. Returns facet fields and their available values.

**Parameters:**
- `collection` (optional): Specific collection name. Returns all collections if omitted.

### 2. `search_collections`
Search across chunk collections using lexical, semantic, or hybrid search.

**Parameters:**
- `query` (required): Search query text
- `collections` (optional): Array of collection names to search
- `mode` (optional): Search mode - `lexical`, `semantic`, or `hybrid` (default)
- `filters` (optional): Facet filters (tenant, taxonomy_slugs, headers)
- `per_page` (optional): Results per page (default: 20)
- `page` (optional): Page number (default: 1)

### 3. `get_chunks_by_ids`
Retrieve specific chunks by their IDs from a collection.

**Parameters:**
- `collection` (required): Chunk collection name
- `ids` (required): Array of chunk document IDs

### 4. `get_chunks_by_parent`
Retrieve all chunks belonging to a parent document, ordered by chunk index.

**Parameters:**
- `collection` (required): Chunk collection name
- `parent_doc_id` (required): Parent document ID

## Installation

### Docker (Recommended)

```bash
docker pull zetesis/payload-agents-db-mcp:latest
```

### From Source

```bash
git clone <repository-url>
cd apps/mcp
bun install
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Typesense Configuration
TYPESENSE_HOST=your-typesense-host.com
TYPESENSE_PORT=443
TYPESENSE_PROTOCOL=https
TYPESENSE_API_KEY=your-api-key

# OpenAI Configuration (for semantic search)
OPENAI_API_KEY=your-openai-api-key
```

### Claude Desktop Configuration

Add to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "typesense": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e", "TYPESENSE_HOST=your-host",
        "-e", "TYPESENSE_PORT=443",
        "-e", "TYPESENSE_PROTOCOL=https",
        "-e", "TYPESENSE_API_KEY=your-key",
        "-e", "OPENAI_API_KEY=your-key",
        "zetesis/payload-agents-db-mcp:latest"
      ]
    }
  }
}
```

Or run from source with Bun:

```json
{
  "mcpServers": {
    "typesense": {
      "command": "bun",
      "args": ["run", "/path/to/apps/mcp/src/index.ts"],
      "env": {
        "TYPESENSE_HOST": "your-host",
        "TYPESENSE_PORT": "443",
        "TYPESENSE_PROTOCOL": "https",
        "TYPESENSE_API_KEY": "your-key",
        "OPENAI_API_KEY": "your-key"
      }
    }
  }
}
```

## Usage

Once configured, Claude Desktop will automatically have access to search your Typesense collections. Example prompts:

- "Search for documents about machine learning"
- "Find chunks related to authentication in the api-docs collection"
- "Get all chunks from parent document xyz-123"
- "What filter criteria are available?"

## Development

```bash
# Install dependencies
bun install

# Run locally
bun run start

# Build Docker image
docker build -t typesense-mcp .

# Run with Docker
docker run -i --rm \
  -e TYPESENSE_HOST=your-host \
  -e TYPESENSE_API_KEY=your-key \
  typesense-mcp
```

## Requirements

- Typesense server (v0.24.0 or later)
- OpenAI API key (for semantic search)
- Bun runtime (for local development)
- Docker (for containerized deployment)

## License

[Add your license here]

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues and questions, please open an issue on GitHub.
