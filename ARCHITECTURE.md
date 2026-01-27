# Architecture Documentation: Kogito.es

## Introduction

**Kogito.es** is a **Multi-tenant Content Management System** built with [Payload CMS 3.0](https://payloadcms.com/). It integrates **Keycloak** for robust authentication and identity management, and utilizes **Typesense** for high-performance search capabilities. The system is designed to support AI-driven features, including a conversational chat agent with RAG (Retrieval-Augmented Generation) capabilities.

The project is structured as a **Monorepo** using [Turbo](https://turbo.build/) and [PNPM Workspaces](https://pnpm.io/workspaces), enabling efficient management of the main application and shared packages.

## Tech Stack

### Frontend & Backend (Application)
- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **CMS**: [Payload CMS 3.0 (Beta)](https://payloadcms.com/)
- **Database**: PostgreSQL (via `@payloadcms/db-postgres`)
- **Language**: TypeScript

### Authentication
- **Identity Provider**: [Keycloak](https://www.keycloak.org/)
- **Integration**: `next-auth` (v5) and `payload-authjs`
- **Theme**: Custom Keycloak theme built with [Keycloakify](https://www.keycloakify.dev/)

### Search & AI
- **Search Engine**: [Typesense](https://typesense.org/)
- **AI Integration**: OpenAI / Google Generative AI (integrated via `payload-typesense` plugin)
- **Chat Interface**: Custom React component with `framer-motion` and Markdown support.

### Infrastructure & Tooling
- **Package Manager**: PNPM
- **Monorepo Tool**: Turbo Repo
- **Containerization**: Docker support (implied by Keycloak container configuration)

---

## System Architecture

The architecture consists of three main pillars: the **Server Application**, the **Identity Provider**, and the **Shared Packages Ecosystem**.

### 1. Server Application (`apps/server`)
The core of the platform is the Payload CMS application.
- **Multi-tenancy**: Enabled via `@payloadcms/plugin-multi-tenant`. Content (like `Pages`) is scoped to specific tenants.
- **Authentication**: Relies on Keycloak. The app uses `payload-authjs` to bridge NextAuth sessions with Payload users. It supports both public (browser) and internal (container-to-container) communication with Keycloak.
- **Data Model**:
  - `Users`: System users synced/linked with Keycloak identities.
  - `Tenants`: Organization units for multi-tenancy.
  - `Pages`: Content pages (multi-tenant).
  - `ChatSessions`: Stores history for the AI chat agent.
- **Search Indexing**: Content updates in Payload are automatically indexed to Typesense via the `typesensePlugin`.

### 2. Identity Provider (`keycloak`)
A standalone Keycloak configuration (likely run in a separate container) is used for user management.
- **Custom Theme**: The `keycloak` directory contains a Keycloakify project to build a branded login/register experience that matches the application's design.

### 3. Packages Ecosystem (`packages/*`)
Modular functionality is split into separate packages to promote reusability and clean separation of concerns.

- **`@nexo-labs/payload-typesense`**: A powerful plugin bridging Payload and Typesense.
  - Handles real-time synchronization of collections to Typesense.
  - Includes dependencies for `openai` and `@google/generative-ai`, suggesting it handles embedding generation or semantic search features.
- **`@nexo-labs/chat-agent`**: A React component library providing the floating chat interface.
  - Supports RAG workflows by interacting with the backend/Typesense.
  - Features a polished UI with animations (`framer-motion`) and Markdown rendering.
- **`@nexo-labs/payload-indexer`**: A utility package likely used by `payload-typesense` to process and format data before indexing.
- **`@nexo-labs/payload-stripe-inventory`**: Integration with Stripe for managing inventory (likely for e-commerce features).
- **`@nexo-labs/payload-taxonomies`**: Provides taxonomy management (categories, tags) for Payload collections.
- **`@nexo-labs/payload-lexical-blocks-builder`**: Helper utilities for constructing custom blocks for the Lexical rich text editor in Payload.

---

## Data Flows

### Authentication Flow
1. **User Action**: User clicks "Login".
2. **Redirection**: `next-auth` redirects the user to the Keycloak login page.
3. **Verification**: User enters credentials. Keycloak verifies them.
4. **Callback**: Keycloak redirects back to the Next.js app with an authorization code.
5. **Token Exchange**: Next.js server exchanges the code for an access token (via internal container network).
6. **Session Creation**: `payload-authjs` creates/updates the Payload user and establishes a session.

### Content Indexing Flow
1. **Content Update**: An admin creates or updates a `Page` in Payload.
2. **Hook Trigger**: The `typesensePlugin` (configured in `payload.config.ts`) intercepts the `afterChange` hook.
3. **Processing**: The data is processed (possibly using `payload-indexer`).
4. **Sync**: The plugin pushes the document to the configured Typesense collection.

### AI Chat Flow
1. **User Query**: User types a question in the `chat-agent` interface.
2. **Search/Retrieval**: The system queries Typesense for relevant content (RAG).
3. **Generation**: The context is sent to an LLM (OpenAI/Google) via the backend.
4. **Response**: The AI response is streamed back to the chat component and displayed to the user.
5. **Persistence**: The conversation is saved in the `ChatSessions` collection.

---

## Directory Structure

```
├── apps/
│   └── server/               # Main Next.js + Payload application
│       ├── src/
│       │   ├── collections/  # Payload Collection definitions
│       │   ├── modules/      # Feature modules (e.g., authjs, payload-admin)
│       │   └── payload/      # Payload configuration and plugins
│       └── ...
├── keycloak/                 # Keycloakify project for custom theme
├── packages/
│   ├── chat-agent/           # UI component for AI Chat
│   ├── payload-indexer/      # Data indexing logic
│   ├── payload-typesense/    # Typesense integration plugin
│   ├── payload-stripe-inventory/ # Stripe integration
│   ├── payload-taxonomies/   # Taxonomy management
│   └── ...
├── turbo.json                # Turborepo configuration
└── package.json              # Root workspace configuration
```

## Configuration

### Environment Variables
The application relies heavily on environment variables for configuration. Key variables include:
- `DATABASE_URL`: PostgreSQL connection string.
- `PAYLOAD_SECRET`: Secret key for Payload sessions.
- `NEXT_PUBLIC_LOCAL_KEYCLOAK_URL`: Public-facing Keycloak URL.
- `NEXT_CONTAINER_KEYCLOAK_ENDPOINT`: Internal Keycloak URL for server-side calls.
- `AUTH_KEYCLOAK_ID` / `AUTH_KEYCLOAK_SECRET`: OIDC Client credentials.
- `TYPESENSE_*`: Typesense connection details.

### Multi-tenancy
Multi-tenancy is enforced at the collection level. The `Tenants` collection defines the available tenants. Users are assigned to tenants, and their access to resources like `Pages` is restricted based on this assignment.
