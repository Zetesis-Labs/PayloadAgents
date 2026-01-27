# Kogito.es

A powerful, production-ready multi-tenant Content Management System built with [Payload CMS 3.0](https://payloadcms.com/), integrated with [Keycloak](https://www.keycloak.org/) for authentication and [Typesense](https://typesense.org/) for AI-powered search.

This project is a **Monorepo** managed with [Turbo](https://turbo.build/) and [PNPM Workspaces](https://pnpm.io/workspaces).

## 📚 Documentation

- **[Architecture Overview](./ARCHITECTURE.md)**: Detailed breakdown of the system architecture, tech stack, and data flows.
- **[Server App](./apps/server/README.md)**: The core Payload CMS application.
- **[Chat Agent Package](./packages/chat-agent/README.md)**: React component for the AI Chat interface.
- **[Typesense Plugin](./packages/payload-typesense/README.md)**: Payload plugin for Typesense integration.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18+ (v20+ recommended)
- **PNPM**: v9+ (Recommended package manager)
- **Docker**: For running Keycloak and database services.

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Environment Setup:**
   Copy the example environment file and configure your secrets.
   ```bash
   cp .env.example .env
   ```
   > **Note:** You will need to configure Keycloak credentials and Typesense keys in your `.env` file.

### Running the Project

1. **Start Infrastructure (Keycloak, DB, etc.):**
   Ensure your Docker containers are running. If you have a `docker-compose.yml` (check repository root or `dev` scripts), start it.
   *(See `apps/server/package.json` or root scripts for specific docker commands if available)*.

2. **Start Development Server:**
   This will start all applications and packages in development mode.
   ```bash
   pnpm dev
   ```

   Or to start only the server:
   ```bash
   pnpm dev:server
   ```

3. **Access the App:**
   - **Payload Admin**: `http://localhost:3000/admin`
   - **Keycloak**: `http://localhost:8080` (default, check config)

## 📂 Project Structure

```
├── apps/
│   └── server/               # Main Next.js + Payload CMS application
├── keycloak/                 # Custom Keycloak theme (Keycloakify)
├── packages/                 # Shared internal packages
│   ├── chat-agent/           # AI Chat UI component
│   ├── payload-typesense/    # Search & AI integration
│   ├── payload-indexer/      # Data indexing utilities
│   └── ...
├── ARCHITECTURE.md           # Detailed architecture documentation
└── turbo.json                # Turbo repo configuration
```

## 🛠 Scripts

- `pnpm build`: Build all applications and packages.
- `pnpm dev`: Start development mode for all apps.
- `pnpm lint`: Run linter across the workspace.
- `pnpm format`: Format code with Prettier.
- `pnpm release`: Publish packages (using Changesets).

## 🤝 Contributing

Please read the [Architecture Documentation](./ARCHITECTURE.md) to understand the system design before contributing.
