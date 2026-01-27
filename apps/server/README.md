# Kogito.es Server Application

This is the core application of the **Kogito.es** system, built with [Payload CMS 3.0](https://payloadcms.com/) and [Next.js](https://nextjs.org/).

## Features

- **Multi-tenancy**: Built-in support for multiple tenants, with content scoped to specific organizations.
- **Keycloak Authentication**: Secure login and identity management integrated via `payload-authjs`.
- **AI-Powered Search**: Real-time content indexing to Typesense for semantic search and RAG workflows.
- **AI Chat Agent**: Integrated conversational interface for interacting with content.

## Setup & Configuration

### Environment Variables

Ensure your `.env` file (copied from `.env.example` in the root) includes the necessary configurations for:
- **Database**: `DATABASE_URL` (PostgreSQL)
- **Payload Secret**: `PAYLOAD_SECRET`
- **Keycloak**: `AUTH_KEYCLOAK_ID`, `AUTH_KEYCLOAK_SECRET`, `NEXT_PUBLIC_LOCAL_KEYCLOAK_URL`, etc.
- **Typesense**: `TYPESENSE_API_KEY`, `TYPESENSE_HOST`, etc.

### Running Development Server

To run just this application (and its dependencies):

```bash
pnpm dev:server
```
or from the root:
```bash
turbo run dev --filter=server
```

### Database Seeding

To seed the database with initial data (tenants, users, pages):

```bash
pnpm seed
```

## Architecture Details

- **Collections**: `Pages`, `Users`, `Tenants`, `ChatSessions`.
- **Plugins**:
  - `multiTenantPlugin`: Handles data isolation.
  - `authjsPlugin`: Bridges Keycloak and Payload sessions.
  - `typesensePlugin`: Syncs content to the search engine.

For a deeper dive into the system architecture, refer to the [Root Architecture Documentation](../../ARCHITECTURE.md).

## Docker

The application is container-ready. See `Dockerfile` in this directory for build instructions.

```bash
docker build -t kogito-server .
```
