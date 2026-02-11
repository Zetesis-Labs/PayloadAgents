# Next Step: Acceso directo a PostgreSQL (Payload CMS)

## Contexto

El MCP actualmente solo consulta Typesense. Hay datos en la base de datos de Payload CMS que no están indexados en Typesense y que serían útiles para un agente.

## Por qué no Drizzle

Payload CMS no expone un cliente Drizzle standalone. Toda la DB se accede via la instancia de Payload (`payload.find()`, etc.), que requiere cargar toda la config con plugins, auth, etc. — demasiado pesado para un MCP.

El esquema SQL es conocido (ver `apps/server/src/migrations/20260202_210105.ts`), así que podemos conectar directamente con un cliente PostgreSQL ligero.

## Datos útiles NO disponibles en Typesense

| Dato                      | Tabla(s)                          | Uso                                              |
| ------------------------- | --------------------------------- | ------------------------------------------------ |
| Jerarquía de taxonomías   | `taxonomy`, `taxonomy_breadcrumbs`| Árbol completo de categorías (padre-hijo)         |
| Related links de posts    | `posts_related_links_videos/books/other` | Videos, libros y enlaces relacionados     |
| Estructura de capítulos   | `books_chapters`                  | Títulos y orden de capítulos de un libro          |
| Detalle de tenants        | `tenants`                         | Nombre, dominio, slug de cada tenant              |
| Configuración de agentes  | `agents`, `agents_search_collections` | System prompt, colecciones RAG, taxonomías   |

## Plan de implementación

### Dependencia

Añadir `postgres` (o `pg`) como dependencia en `apps/mcp/package.json`. Usar la misma `DATABASE_URL` que el server.

### Nuevos tools

#### 1. `get_taxonomy_tree`

Devuelve el árbol completo de taxonomías con jerarquía padre-hijo y breadcrumbs.

```sql
SELECT t.id, t.name, t.slug, t.parent_id, tb.doc_id, tb.url, tb.label
FROM taxonomy t
LEFT JOIN taxonomy_breadcrumbs tb ON tb.parent_id = t.id
ORDER BY t.parent_id NULLS FIRST, t.name
```

Input: `{ tenant?: string }`
Output: árbol de taxonomías con hijos anidados.

#### 2. `get_document_details`

Dado un ID de documento (obtenido de Typesense via `parent_doc_id`), devuelve metadatos completos que no están en Typesense.

Para posts:
```sql
SELECT p.*, t.slug as tenant_slug, t.name as tenant_name
FROM posts p
LEFT JOIN tenants t ON p.tenant_id = t.id
WHERE p.id = $1
```

Más related links:
```sql
SELECT * FROM posts_related_links_videos WHERE parent_id = $1
SELECT * FROM posts_related_links_books WHERE parent_id = $1
SELECT * FROM posts_related_links_other WHERE parent_id = $1
```

Para books (capítulos):
```sql
SELECT * FROM books_chapters WHERE parent_id = $1 ORDER BY _order ASC
```

Input: `{ collection: 'posts' | 'books', id: string }`
Output: documento con relationships y metadatos completos.

#### 3. `get_tenants`

Lista tenants disponibles.

```sql
SELECT id, name, slug, domain, allow_public_read FROM tenants ORDER BY name
```

Input: `{}`
Output: array de tenants.

### Flujo combinado esperado

```
1. Agente llama get_filter_criteria → obtiene taxonomías y filtros
2. Agente llama search_collections → busca en Typesense → obtiene chunk_ids + parent_doc_ids
3. Agente llama get_chunks_by_ids → lee contenido de chunks
4. Agente llama get_document_details → enriquece con datos de Payload (related links, capítulos, etc.)
```

### Configuración

Nueva variable de entorno:
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```
