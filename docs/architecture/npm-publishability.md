# Publicacion de paquetes en npm

> **Referencia**: [`typescript-monorepo-types.md`](./typescript-monorepo-types.md) — aislamiento de tipos
> **Referencia**: [`payload-cast-patterns.md`](./payload-cast-patterns.md) — patrones de cast en paquetes aislados

---

## El problema

Publicar paquetes de un monorepo Payload a npm presenta tres desafios:

1. **Type isolation**: Los tipos generados por `payload generate:types` (`declare module 'payload'`) no deben filtrarse al paquete publicado. Un consumidor que instala `@zetesis/payload-indexer` no debe recibir los tipos de coleccion de nuestra app.

2. **Dual-mode resolution**: Durante desarrollo, queremos que el IDE y Next.js lean el **source** (para HMR y Go to Definition). Pero el paquete publicado debe contener solo **artefactos compilados** (`dist/`).

3. **Declarations autocontenidas**: Los `.d.mts` publicados deben ser autocontenidos — sin imports a archivos internos del source que no existen en el tarball de npm.

---

## Arquitectura de un paquete publicable

### Estructura de archivos

```
packages/payload-indexer/
├── src/                          ← source (desarrollo)
│   ├── index.ts                  ← entry point
│   ├── adapter/types.ts
│   ├── plugin/create-indexer-plugin.ts
│   └── ...
├── dist/                         ← artefactos compilados (publicacion)
│   ├── index.mjs                 ← JavaScript (ESM)
│   ├── index.mjs.map             ← source map JS
│   ├── index.d.mts               ← declarations (tipos)
│   └── index.d.mts.map           ← source map declarations
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

### Lo que se publica vs lo que se usa en desarrollo

| Aspecto | Desarrollo (monorepo) | Publicado (npm) |
|---------|----------------------|-----------------|
| JavaScript | `src/*.ts` (source directo via Next.js) | `dist/*.mjs` (compilado por tsdown) |
| Tipos | `dist/*.d.mts` (compilados, aislados) | `dist/*.d.mts` (identico) |
| Source maps | Disponibles en `dist/` | Incluidos en tarball |
| `src/` | Presente en disco | No incluido (ver `files`) |

---

## El mecanismo de dual exports

### `package.json` exports — el corazon del sistema

Cada paquete tiene **dos configuraciones de exports**: una para desarrollo y otra que se activa al publicar.

#### Exports de desarrollo

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "main": "./src/index.ts",
  "types": "./dist/index.d.mts"
}
```

- **`types`** → `dist/` — TypeScript lee declarations compiladas, **aisladas** de la app. `CollectionSlug` es `string`, no una union concreta.
- **`import`** → `src/` — Next.js y el bundler leen source directo para HMR y hot reload.

#### `publishConfig` — override para npm

```json
{
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.mts",
        "import": "./dist/index.mjs",
        "default": "./dist/index.mjs"
      }
    },
    "main": "./dist/index.mjs",
    "types": "./dist/index.d.mts",
    "registry": "https://registry.npmjs.org/",
    "access": "public"
  }
}
```

Cuando `pnpm publish` (durante el job `publish-npm` del workflow) empaqueta el tarball, **reemplaza** el `exports` raiz con el de `publishConfig`. Ahora **todo** apunta a `dist/`:

- **`types`** → `dist/index.d.mts` (igual que desarrollo)
- **`import`** → `dist/index.mjs` (ya no source — JavaScript compilado)

**El consumidor de npm solo ve artefactos compilados**. No necesita el source ni puede acceder a el.

### Por que funciona para el aislamiento de tipos

Los `.d.mts` en `dist/` fueron generados por tsdown compilando el paquete **en aislamiento**, sin `payload-types.ts` en scope. En las declarations:

```typescript
// dist/index.d.mts — CollectionSlug es string, no una union
import { CollectionSlug, Config, Payload } from "payload";

export function createIndexerPlugin<TFieldMapping extends FieldMapping>(
  config: IndexerPluginConfig<TFieldMapping>
): IndexerPluginResult;
```

El consumidor que instala el paquete recibe estos tipos genericos. Su propia app hara module augmentation de `payload`, pero eso no afecta a los tipos del paquete — los `.d.mts` ya estan compilados y sellados.

---

## El campo `files` — que se incluye en el tarball

```json
{
  "files": ["dist", "README.md"]
}
```

| Paquete | `files` | Razon |
|---------|---------|-------|
| payload-indexer | `["dist"]` | Solo artefactos compilados |
| payload-typesense | `["dist"]` | Solo artefactos compilados |
| payload-betterauth-stripe | `["dist", "README.md"]` | + documentacion |
| agent-ui | `["dist", "src", "README.md"]` | + source (para CSS/Tailwind) |

**Regla general**: Solo incluir `dist/`. El source (`src/`) solo se incluye si el consumidor lo necesita (e.g. CSS con Tailwind que necesita escanear source para purge).

---

## Build pipeline: tsdown

### Configuracion tipo

```typescript
// tsdown.config.ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { resolve: true },
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  tsconfig: './tsconfig.json',
  external: [
    'payload',
    '@payloadcms/richtext-lexical',
    'next',
    'react',
    'react-dom',
  ],
})
```

### Lo que produce tsdown

| Artefacto | Extension | Contenido |
|-----------|-----------|-----------|
| JavaScript | `.mjs` | Codigo ESM compilado, tree-shaken |
| Declarations | `.d.mts` | Tipos TypeScript, con tipos internos inlineados |
| JS source map | `.mjs.map` | Mapeo de JS compilado → source original |
| Declaration source map | `.d.mts.map` | Mapeo de declarations → source original |

### `dts: { resolve: true }` — declarations autocontenidas

Esta es la configuracion critica. Sin ella, las declarations tendrian imports relativos a archivos internos:

```typescript
// SIN resolve — imports internos (no funciona en npm)
import { FieldMapping } from '../document/types'
import { EmbeddingService } from '../embedding/types'
export declare function createIndexerPlugin(...): ...
```

Con `resolve: true`, tsdown **inlinea** todos los tipos internos en un unico archivo:

```typescript
// CON resolve — autocontenido (funciona en npm)
interface FieldMapping { name: string; payloadField?: string }
interface EmbeddingService { ... }
export declare function createIndexerPlugin(...): ...
```

El `.d.mts` resultante solo tiene `import` de dependencias **externas** (las declaradas en `external`):

```typescript
import { CollectionSlug, Config, Payload } from "payload";
// ↑ external — el consumidor la instala como peerDependency
// Todos los tipos internos del paquete estan inlineados abajo
```

### `external` — que NO se bundlea

Las dependencias en `external` se excluyen del bundle. Aparecen como `import` en el `.mjs` y `.d.mts`:

```typescript
// tsdown.config.ts
external: ['payload', 'react', '@payloadcms/richtext-lexical']

// En dist/index.mjs generado:
import { CollectionSlug } from 'payload'  // ← external, no bundleado
```

**Regla**: Todo lo que esta en `peerDependencies` debe estar en `external`. Si se bundlea una peerDependency, el consumidor acabaria con dos copias (la bundleada + la suya).

---

## Paquetes con multiples entry points

Algunos paquetes exponen subpaths para separar server/client/rsc:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./src/index.ts"
    },
    "./server": {
      "types": "./dist/server/index.d.mts",
      "import": "./src/server/index.ts"
    },
    "./client": {
      "types": "./dist/client/index.d.mts",
      "import": "./src/client/index.ts"
    },
    "./rsc": {
      "types": "./dist/rsc/index.d.mts",
      "import": "./src/rsc/index.ts"
    }
  }
}
```

Cada subpath corresponde a un **entry point** en tsdown:

```typescript
// tsdown.config.ts
entry: ['src/index.ts', 'src/server/index.ts', 'src/client/index.ts', 'src/rsc/index.ts']
```

tsdown genera un `.mjs` y `.d.mts` por entry point. El codigo compartido se extrae en chunks:

```
dist/
├── index.mjs              ← entry .
├── index.d.mts
├── server/
│   ├── index.mjs          ← entry ./server
│   └── index.d.mts
├── client/
│   ├── index.mjs          ← entry ./client
│   └── index.d.mts
├── rsc/
│   ├── index.mjs          ← entry ./rsc
│   └── index.d.mts
├── docs-BkwbMszm.mjs      ← chunk compartido (tipos de docs)
└── plan-ClnWWaeo.d.mts    ← chunk compartido (tipos de plan)
```

Los chunks se referencian internamente entre entry points — el consumidor no necesita importarlos directamente.

---

## Dependencias: peer vs regular vs dev

### Estrategia

| Tipo | Que va aqui | Ejemplo |
|------|-------------|---------|
| `peerDependencies` | Librerias que el consumidor ya tiene y **debe** compartir (evitar duplicados) | `payload`, `react`, `stripe` |
| `dependencies` | Librerias que el paquete necesita y el consumidor **no deberia** gestionar | `typesense`, `openai`, `zod` |
| `devDependencies` | Solo para desarrollo/build del paquete | `tsdown`, `typescript`, `@types/*` |

### Peer dependencies y `external`

Las peer dependencies se declaran como `external` en tsdown para que no se bundleen:

```json
// package.json
"peerDependencies": {
  "payload": "^3.75.0",
  "react": "^19.0.0"
}
```

```typescript
// tsdown.config.ts
external: ['payload', 'react']
```

**Si se olvida `external`**: tsdown bundlea el codigo de la peerDependency dentro del `.mjs`. El consumidor acaba con dos copias de `payload` (la bundleada + la que instalo), causando errores de runtime y types incompatibles.

### `peerDependenciesMeta` — opcionales

```json
{
  "peerDependencies": {
    "@payloadcms/richtext-lexical": "^3.75.0"
  },
  "peerDependenciesMeta": {
    "@payloadcms/richtext-lexical": {
      "optional": true
    }
  }
}
```

Para features que solo se activan si el consumidor tiene la dependencia instalada (e.g. soporte lexical para extraer texto de rich text fields).

### Dependencia interna: `workspace:*`

```json
// payload-typesense/package.json
"dependencies": {
  "@zetesis/payload-indexer": "workspace:*"
}
```

`workspace:*` es un protocolo de pnpm. En desarrollo, resuelve al paquete local del monorepo. Al publicar, pnpm lo **reemplaza** automaticamente con la version real:

```json
// En el tarball publicado
"dependencies": {
  "@zetesis/payload-indexer": "^0.5.0"
}
```

Esto funciona porque release-please coordina las versiones (ver seccion "Versionado").

---

## Cross-package declarations

Cuando `payload-typesense` depende de `payload-indexer`, sus declarations importan del paquete publicado:

```typescript
// dist/index.d.mts de payload-typesense
import {
  BaseCollectionSchema, FieldMapping, IndexerAdapter,
  TableConfig, VectorSearchOptions
} from "@zetesis/payload-indexer";
```

Esto funciona porque:
1. `@zetesis/payload-indexer` esta en `dependencies` (no `external` — se resuelve como dependencia normal)
2. Pero sus **tipos** no se inlinean — `dts: { resolve: true }` solo inlinea tipos de archivos internos del paquete
3. tsdown marca `@zetesis/payload-indexer` como external automaticamente porque esta en `dependencies`
4. El consumidor instala ambos paquetes y TypeScript resuelve los tipos transitivamente

---

## Versionado y release

### release-please

Usamos [release-please](https://github.com/googleapis/release-please) para versionado y publicacion coordinada de los 9 paquetes npm + 2 paquetes Python (`backend/agno-agent-builder`, `backend/payload-documents-worker-builder`).

#### Configuracion

```json
// release-please-config.json
{
  "release-type": "node",
  "include-component-in-tag": true,
  "include-v-in-tag": true,
  "separate-pull-requests": false,
  "plugins": ["node-workspace"],
  "packages": {
    "packages/payload-indexer":   { "package-name": "@zetesis/payload-indexer", "component": "payload-indexer" },
    "packages/payload-typesense": { "package-name": "@zetesis/payload-typesense", "component": "payload-typesense" },
    // ... resto de paquetes npm + 2 Python con release-type: "python"
  }
}
```

- **`node-workspace`**: cuando `payload-indexer` sube de version, todos los paquetes que lo declaran como `workspace:` (ej. `payload-typesense`) reciben un patch automaticamente. Sustituye al viejo `updateInternalDependencies` de Changesets.
- **`include-component-in-tag`**: cada paquete tiene su propio tag (`payload-indexer-v0.4.0`, `payload-typesense-v0.3.2`, ...). Versiones independientes — no hay lockstep estricto.
- **`separate-pull-requests: false`**: un solo release PR agrega los bumps de todos los paquetes (mismo UX que el viejo `chore: version packages`).
- Los paquetes Python (`release-type: "python"`) bumpean `pyproject.toml` y disparan publicacion a PyPI via `publish-python.yml`.

#### Disparadores

Conventional commits dirigen los bumps:
- `feat(payload-indexer): ...` → minor en `payload-indexer` + patch en `payload-typesense` (cascade via node-workspace)
- `fix(mcp-typesense): ...` → patch en `mcp-typesense`
- `feat(payload-indexer)!: ...` (con `!` o `BREAKING CHANGE:` footer) → major

No hay archivos `.changeset/*.md` que mantener — todo nace de los commit messages.

### Pipeline de release (GitHub Actions)

```
push a main
  ↓
release-please-action revisa conventional commits desde el ultimo release
  ↓
¿Hay bumps pendientes?
  ├── Si → Abre/actualiza release PR (`chore(main): release ...`) con bumps + CHANGELOG.md
  └── No → ¿El push fue un merge del release PR?
              └── Si → tags + GitHub Releases por componente
                      ├── publish-npm: pnpm publish --filter <pkg> por cada path en `paths_released`
                      └── publish-python: PyPI trusted publisher (OIDC) via publish-python.yml
```

El paso critico sigue siendo `pnpm turbo run build --filter="./packages/*"` antes del publish, para que `dist/` este al dia con las declarations correctas.

### Provenance

```yaml
NPM_CONFIG_PROVENANCE: true
```

npm provenance vincula el paquete publicado con el commit y workflow de GitHub que lo genero. Los consumidores pueden verificar criptograficamente que el paquete viene de este repositorio.

---

## Flujo completo: de source a consumidor

### 1. Desarrollo (monorepo)

```
apps/server importa @zetesis/payload-indexer
  ↓
TypeScript (tsc --noEmit):
  → Lee exports.types → dist/index.d.mts (tipos aislados, CollectionSlug = string)

Next.js (runtime):
  → Lee exports.import → src/index.ts (source directo, HMR)
```

### 2. Build (pre-publicacion)

```
turbo run build --filter="./packages/*"
  ↓
Orden: payload-indexer → payload-typesense (dependsOn: ^build)
  ↓
tsdown por paquete:
  → src/*.ts  →  dist/*.mjs (JS compilado, tree-shaken)
  → src/*.ts  →  dist/*.d.mts (declarations con tipos internos inlineados)
  → Genera source maps (.map)
```

### 3. Publicacion

```
release-please-action emite outputs.paths_released = ["packages/payload-indexer", ...]
  ↓
Por cada path:
  1. pnpm --filter <pkg-name> publish
  2. pnpm reemplaza workspace:* con version real (resuelta via node-workspace)
  3. publishConfig.exports reemplaza exports raiz
  4. npm pack genera tarball con files: ["dist"]
  5. npm publish --provenance sube a registry
```

### 4. Consumidor instala

```bash
npm install @zetesis/payload-indexer
```

```
node_modules/@zetesis/payload-indexer/
├── dist/
│   ├── index.mjs         ← JavaScript
│   ├── index.d.mts       ← Tipos (autocontenidos)
│   ├── index.mjs.map     ← Source maps
│   └── index.d.mts.map
├── package.json          ← Con publishConfig.exports activo
└── README.md
```

El consumidor importa:

```typescript
import { createIndexerPlugin } from '@zetesis/payload-indexer'
```

TypeScript resuelve tipos desde `dist/index.d.mts`. JavaScript se resuelve desde `dist/index.mjs`. Ambos son artefactos compilados, aislados, sin leak de tipos.

### 5. El consumidor tiene su propia app con module augmentation

```typescript
// En la app del consumidor
declare module 'payload' {
  export interface GeneratedTypes extends Config {}
}
// CollectionSlug = 'posts' | 'users' | 'media'
```

Pero los tipos de `@zetesis/payload-indexer` ya estan compilados. Sus `.d.mts` dicen `CollectionSlug` (que es `string` en el .d.mts), no la union del consumidor. **No hay leak bidireccional**.

---

## Checklist: añadir un paquete publicable

### package.json

- [ ] `"type": "module"` — ESM
- [ ] `"sideEffects": false` — permite tree-shaking (excepto CSS)
- [ ] `exports` con condiciones `types` → `dist/`, `import` → `src/`
- [ ] `publishConfig.exports` con todo apuntando a `dist/`
- [ ] `publishConfig.access: "public"` y `registry`
- [ ] `files: ["dist"]` — solo artefactos compilados
- [ ] `peerDependencies` para payload, react, y framework deps
- [ ] `"prepublishOnly": "pnpm clean && pnpm build"` como safety net

### tsdown.config.ts

- [ ] `format: ['esm']` — solo ESM
- [ ] `dts: { resolve: true }` — declarations autocontenidas
- [ ] `sourcemap: true` — source maps incluidos
- [ ] `treeshake: true`
- [ ] `external` incluye todas las `peerDependencies`
- [ ] `entry` tiene un item por subpath en `exports`

### tsconfig.json

- [ ] Extiende `tsconfig.base.json` (hereda `composite`, `declaration`, `declarationMap`)
- [ ] `rootDir: "./src"`
- [ ] Si depende de otro paquete del monorepo: `references: [{ "path": "../otro-paquete" }]`

### release-please

- [ ] Entrada anyadida en `release-please-config.json` con `package-name`, `component`, `release-type: "node"`, `changelog-path: "CHANGELOG.md"`
- [ ] Version actual reflejada en `.release-please-manifest.json`

### Verificacion pre-publish

```bash
# 1. Build limpio
pnpm --filter @zetesis/{paquete} clean && pnpm --filter @zetesis/{paquete} build

# 2. Type-check global
pnpm tsc --noEmit

# 3. Inspeccionar tarball (sin publicar)
cd packages/{paquete} && npm pack --dry-run

# 4. Verificar que dist/ no tiene imports a src/
grep -r "from '\.\." dist/*.d.mts  # No debe haber imports relativos que salgan de dist/
```

---

## Mapa de exports por paquete

| Paquete | Subpaths | Entry points |
|---------|----------|-------------|
| payload-indexer | `.`, `./client` | `src/index.ts`, `src/client/index.ts` |
| payload-typesense | `.` | `src/index.ts` |
| payload-betterauth-stripe | `.`, `./server`, `./client`, `./rsc` | 4 entry points |
| payload-lexical-blocks-builder | `.`, `./builder`, `./renderer` | 3 entry points |
| payload-taxonomies | `.`, `./constants` | 2 entry points |
| agent-ui | `.`, `./styles.css` | 1 TS + 1 CSS |

---

## Troubleshooting

### "Los tipos del paquete publicado incluyen tipos de coleccion de mi app"

**Causa**: Las declarations se generaron con `payload-types.ts` en scope.

**Verificar**: Abrir `dist/index.d.mts` y buscar nombres de colecciones concretos (e.g. `'users' | 'posts'`). Si aparecen, hay leak.

**Solucion**: El paquete no debe tener `paths` en su tsconfig que apunten al source de la app. Verificar que `tsdown.config.ts` usa el `tsconfig.json` del paquete, no el de la app.

### "El consumidor ve errores de tipos incompatibles despues de instalar"

**Causa probable**: Version mismatch de `payload`. El consumidor tiene una version diferente a la declarada en `peerDependencies`.

**Solucion**: Verificar que `peerDependencies` tiene rangos correctos (`^3.75.0`).

### "El tarball de npm es muy grande"

**Verificar**: `npm pack --dry-run` muestra los archivos incluidos.

**Causas comunes**:
- `files` incluye `src/` innecesariamente
- `dist/` tiene archivos de un build anterior que no se limpio (`clean: true` en tsdown deberia prevenirlo)
- Source maps son grandes — considerar si `sourcemap: true` es necesario para el paquete publicado

### "`workspace:*` aparece en el paquete publicado"

**Causa**: Se publico via `npm publish` directo en vez del workflow.

**Solucion**: Siempre publicar via el workflow `release-please.yml` (que usa `pnpm publish --filter ...`), nunca `npm publish` manual desde una checkout local.

### "Import de @zetesis/payload-indexer no resuelve en el consumidor"

**Causa**: `payload-typesense` declara `@zetesis/payload-indexer` como `dependencies`, pero el consumidor no lo instalo.

**Verificar**: `npm ls @zetesis/payload-indexer` en el proyecto del consumidor. Deberia instalarse transitivamente.

**Solucion**: Verificar que esta en `dependencies` (no `devDependencies` ni `peerDependencies`) en `payload-typesense/package.json`.
