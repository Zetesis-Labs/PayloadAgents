# PayloadAgents - Producto

## Descripción General

**PayloadAgents** es una plataforma multi-tenant basada en Payload CMS que integra capacidades de IA conversacional (RAG), búsqueda semántica y gestión de contenido. Está diseñada para crear aplicaciones web con agentes de IA personalizables por tenant.

## Componentes Principales

### 1. Aplicación Server (apps/server)
CMS multi-tenant construido sobre Payload CMS con:
- **Multi-tenancy**: Cada tenant tiene sus propios usuarios, contenido y agentes de IA
- **Autenticación**: Integración con Keycloak para SSO y gestión de identidades
- **Colecciones**: Users, Tenants, Pages, Agents, ChatSessions, Media, Taxonomies

### 2. Paquetes NPM (@nexo-labs/*)

| Paquete | Descripción |
|---------|-------------|
| **chat-agent** | Componente React de chat flotante con soporte para streaming SSE y markdown |
| **payload-typesense** | Búsqueda híbrida (semántica + keyword), sincronización en tiempo real, y sistema RAG completo |
| **payload-indexer** | Librería genérica de indexación con soporte para múltiples backends, embeddings y estrategias de chunking |
| **payload-taxonomies** | Sistema de taxonomías jerárquicas para categorización de contenido |
| **payload-stripe-inventory** | Integración con Stripe para suscripciones, pagos e inventario |
| **payload-lexical-blocks-builder** | Constructor y renderizador de bloques para el editor Lexical |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│                     + Chat Agent Component                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     Payload CMS (API Layer)                      │
│              Multi-tenant · REST/GraphQL · Auth                  │
└────┬─────────────────┬─────────────────┬───────────────────┬────┘
     │                 │                 │                   │
┌────▼────┐     ┌──────▼──────┐   ┌──────▼──────┐     ┌──────▼──────┐
│ MongoDB │     │  Typesense  │   │  Keycloak   │     │   Stripe    │
│   (DB)  │     │  (Search +  │   │   (Auth)    │     │ (Payments)  │
│         │     │   Vectors)  │   │             │     │             │
└─────────┘     └─────────────┘   └─────────────┘     └─────────────┘
```

## Funcionalidades Clave

### Sistema RAG (Retrieval Augmented Generation)
- Agentes de IA configurables por tenant
- Búsqueda híbrida: vectorial + keyword
- Streaming de respuestas (SSE)
- Historial de conversaciones
- Soporte para OpenAI y Gemini

### Multi-Tenancy
- Aislamiento de datos por tenant
- Dominios personalizados por tenant
- Control de acceso basado en roles (RBAC)
- Superadmin para gestión global

### Búsqueda Avanzada
- Indexación en tiempo real
- Chunking inteligente (markdown, simple)
- Embeddings configurables
- Tolerancia a errores tipográficos

## Stack Tecnológico

| Categoría | Tecnología |
|-----------|------------|
| **Framework** | Next.js 15, React 19 |
| **CMS** | Payload CMS 3.x |
| **Base de Datos** | MongoDB / PostgreSQL |
| **Búsqueda** | Typesense |
| **Autenticación** | Keycloak, NextAuth |
| **IA/Embeddings** | OpenAI, Google Gemini |
| **Pagos** | Stripe |
| **Monorepo** | pnpm workspaces, Turborepo |

## Casos de Uso

1. **Portales de conocimiento con IA**: Bases de conocimiento con chat conversacional
2. **SaaS multi-tenant**: Aplicaciones donde cada cliente tiene su espacio aislado
3. **E-commerce con contenido**: Catálogos de productos con taxonomías y búsqueda avanzada
4. **Documentación interactiva**: Sitios de documentación con asistente de IA integrado

## Desarrollo

```bash
# Instalar dependencias
pnpm install

# Desarrollo
pnpm dev

# Build
pnpm build

# Publicar paquetes
pnpm release
```

## Licencia

MIT - Nexo Labs
