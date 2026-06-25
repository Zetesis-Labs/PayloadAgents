# TypeScript Monorepo Type Isolation

## El problema: module augmentation leak

PayloadCMS usa **module augmentation** para dar type-safety a nivel de aplicacion. Cuando ejecutas `payload generate:types`, se genera un archivo `payload-types.ts` que contiene:

```typescript
declare module 'payload' {
  export interface GeneratedTypes extends Config {}
}
```

Esto convierte `CollectionSlug` de `string` a una union concreta como `'users' | 'posts' | 'media'`. El problema es que `declare module` es **global** en el programa TypeScript. En un monorepo, si el app-level `payload-types.ts` esta en el scope de compilacion, la augmentation se filtra a los paquetes que importan de `payload`.

**Consecuencia**: En un plugin que usa generics como `DataFromCollectionSlug<TUsers>`, TypeScript resuelve el generic a la union de TODOS los tipos de coleccion de la app, en lugar de mantenerlo generico. Esto causa errores como:

- `user?.stripeCustomerId` no existe en el tipo union (porque no todas las colecciones tienen ese campo)
- `plan.name` no existe en el tipo union

Este es un [problema conocido de TypeScript](https://github.com/microsoft/TypeScript/issues/52295).

---

## Como lo resuelve PayloadCMS

### 1. Project references para aislamiento

Cada paquete tiene su propio `tsconfig.json` con `composite: true` y solo declara `references` a otros paquetes de libreria (nunca a la app):

```
tsconfig.base.json          <- composite: true, emitDeclarationOnly: true
  |
  +-- packages/payload/tsconfig.json
  |     references: [translations]
  |
  +-- packages/plugin-stripe/tsconfig.json
  |     references: [payload, ui, next]
  |
  +-- packages/ui/tsconfig.json
  |     references: [payload, translations]
  |
  +-- root tsconfig.json     <- composite: false, noEmit: true
        references: [todos los packages]
```

**Clave**: El `payload-types.ts` de la app NUNCA esta en el scope de compilacion de ningun paquete. Cada paquete se compila de forma aislada, asi que `GeneratedTypes` esta vacio y `CollectionSlug` es `string`.

### 2. Root tsconfig como orquestador

El root es un "solution-style tsconfig": no emite nada, solo orquesta las referencias.

### 3. Exports duales: source para dev, dist para publish

- **En desarrollo**: `types` apunta a `src/` para resolucion directa en el IDE.
- **En npm**: `publishConfig` reemplaza exports para apuntar a `dist/`.

### 4. Build pipeline de dos fases

- TypeScript solo emite `.d.ts` (declarations) con `tsc --emitDeclarationOnly`
- SWC compila el JavaScript real
- Turborepo orquesta el orden con `"dependsOn": ["^build"]`

### 5. Casts como workaround dentro de paquetes

Incluso con project references, cuando un paquete usa generics como `CollectionSlug`, acceder a campos especificos requiere casts:

```typescript
const user = (await payload.findByID({
  collection: config.usersCollectionSlug,
  id: userId,
})) as unknown as UserWithStripe | null
```

Esto es un patron aceptado en el repo oficial de PayloadCMS.

---

## Nuestra implementacion

### Arquitectura de tsconfigs

```
tsconfig.base.json                  <- composite: true, ${configDir} paths
  |
  +-- tsconfig.json (root)          <- composite: false, noEmit: true
  |     references: [todos los packages]
  |
  +-- packages/*/tsconfig.json      <- hereda composite: true
  |     rootDir: ./src
  |     (payload-typesense references payload-indexer)
  |
  +-- apps/server/tsconfig.json     <- composite: false, noEmit: true
        references: [todos sus packages deps]
```

### Mecanismo de aislamiento de tipos

Usamos **tres capas** de aislamiento:

#### Capa 1: Package.json exports (types -> dist)

Todos los paquetes separan la condicion `types` (apunta a `dist/`) de `import` (apunta a `src/`):

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

Con `moduleResolution: "bundler"`, TypeScript lee la condicion `types` primero (tipos compilados en `dist/`, sin augmentaciones de la app), mientras Next.js lee `import` (source para HMR).

**Por que funciona**: Los `.d.mts` en `dist/` fueron generados por tsdown compilando el paquete en aislamiento, sin el `payload-types.ts` de la app en scope. `CollectionSlug` es `string` en esos tipos compilados.

#### Capa 2: Project references

- `composite: true` en cada paquete (heredado de `tsconfig.base.json`)
- El root tsconfig referencia todos los paquetes
- `apps/server` referencia sus dependencias
- **Ningun paquete referencia la app** -> el `declare module 'payload'` de `payload-types.ts` queda aislado

#### Capa 3: Sin paths a source

Se eliminaron los `paths` de `tsconfig.base.json` que apuntaban `@zetesis/*` al source de los paquetes. Sin estos paths, TypeScript resuelve los imports a traves de los symlinks de pnpm workspace + `package.json` exports, que redirigen tipos a `dist/`.

### Casts en paquetes

Los paquetes que usan generics de Payload necesitan casts para acceder a campos especificos:

```typescript
// packages/payload-betterauth-stripe/src/server/utilities/cleanup.ts
interface UserWithStripe {
  id: string | number
  stripeCustomerId?: string | null
}

const user = (await payload.findByID({
  collection: config.usersCollectionSlug,
  id: userId,
})) as unknown as UserWithStripe | null
```

### Grafo de dependencias

```
agent-ui                      (leaf - sin deps Payload)
payload-indexer                 (leaf)
payload-taxonomies              (leaf)
payload-lexical-blocks-builder  (leaf)
payload-betterauth-stripe       (leaf)
payload-typesense               -> payload-indexer

apps/server -> agent-ui, payload-betterauth-stripe,
               payload-indexer, payload-taxonomies,
               payload-typesense
```

### Build y type-check

```bash
# 1. Build paquetes (genera .d.mts en dist/)
pnpm --filter "@zetesis/*" build

# 2. Type-check la app (usa .d.mts compilados, sin leak)
cd apps/server && pnpm tsc --noEmit
```

**Requisito**: Los paquetes deben buildear ANTES del type-check de la app. Turbo maneja esto con `"dependsOn": ["^build"]`.

---

## Diferencias clave con PayloadCMS

| Aspecto | PayloadCMS | Nosotros |
|---------|-----------|----------|
| JS compiler | SWC | tsdown (rolldown) |
| Module resolution | `NodeNext` | `bundler` |
| Build orchestration | Turborepo | Turborepo + pnpm |
| Type emission | `tsc --emitDeclarationOnly` | tsdown `dts: { resolve: true }` |
| Declaration format | `.d.ts` | `.d.mts` |
| Export strategy (dev) | Source para types + import | Source solo para import, dist para types |
| Type isolation mechanism | Project references only | Exports + project references + sin paths |
| Publish override | `publishConfig.exports` | `publishConfig.exports` (identico) |

### Por que nuestra estrategia difiere

PayloadCMS puede apuntar `types` a source durante desarrollo porque sus project references + `tsc -b` crean boundaries de compilacion reales entre paquetes. Cada paquete se compila con su propio scope.

Nosotros no usamos `tsc -b` (usamos tsdown). El `tsc --noEmit` en apps/server compila todo en un unico programa. Sin la separacion de exports (types -> dist), los paths a source meten el codigo del paquete en el mismo programa que `payload-types.ts`, causando el leak.

La separacion `types -> dist` / `import -> src` es nuestra solucion principal. Los project references son una capa adicional de documentacion y correctitud arquitectural.

---

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `tsconfig.base.json` | Base compartida: composite, declaration, `${configDir}` |
| `tsconfig.json` (root) | Solution-style: referencia todos los packages |
| `packages/*/tsconfig.json` | Composite, rootDir, references inter-paquete |
| `apps/server/tsconfig.json` | noEmit, references a sus deps |
| `packages/*/package.json` | exports.types -> dist, exports.import -> src |

---

## Walkthrough: resolucion de tipos paso a paso

Cuando TypeScript en `apps/server` encuentra:

```typescript
import { cleanupStaleCustomer } from '@zetesis/payload-betterauth-stripe/server'
```

La resolucion sigue esta cadena:

1. **TypeScript busca en `paths` de tsconfig** → No hay match. Los `paths` que apuntaban a source fueron eliminados intencionalmente (ver Decision 2).

2. **Busca en `node_modules`** → Encuentra el symlink de pnpm workspace: `node_modules/@zetesis/payload-betterauth-stripe` → `packages/payload-betterauth-stripe/`.

3. **Lee `package.json` exports** para el subpath `./server`:
   ```json
   {
     "exports": {
       "./server": {
         "types": "./dist/server/index.d.mts",
         "import": "./src/server/index.ts",
         "default": "./src/server/index.ts"
       }
     }
   }
   ```

4. **Con `moduleResolution: "bundler"`**, TypeScript lee la condicion `types` primero → resuelve a `./dist/server/index.d.mts`.

5. **Resuelve tipos desde `.d.mts` compilado**. Este archivo fue generado por tsdown compilando el paquete en aislamiento, sin `payload-types.ts` en scope. `CollectionSlug` es `string`, no una union. No hay augmentation leak.

6. **Next.js (runtime)** lee la condicion `import` → `./src/server/index.ts` (source directo para HMR y hot reload).

### Que pasaba ANTES (con paths)

```
tsconfig.base.json:
  "paths": { "@zetesis/payload-betterauth-stripe/*": ["packages/payload-betterauth-stripe/src/*"] }
```

Con paths activos:
1. TypeScript encontraba el path mapping → resuelve directamente a `packages/payload-betterauth-stripe/src/server/index.ts`.
2. El **source** del paquete entraba en el mismo programa TypeScript que `apps/server`.
3. `apps/server` tiene `payload-types.ts` con `declare module 'payload'` → augmentation global.
4. El source del paquete, ahora en el mismo programa, veia `CollectionSlug` como `'users' | 'posts' | 'media'` en lugar de `string`.
5. Generics como `DataFromCollectionSlug<TUsers>` se resolvian a la union completa → errores de tipo.

**La eliminacion de paths rompe este cortocircuito**: TypeScript debe seguir la cadena node_modules → symlink → package.json exports → `dist/` (aislado).

---

## Decision log (ADR)

### Decision 1: `tsc --noEmit` + exports en lugar de `tsc -b`

**Contexto**: `tsc -b` (build mode) auto-rebuilds declarations stale cuando detecta cambios en el source. Esto parece ideal para un monorepo.

**Problema**: Usar `tsc -b` requiere que TypeScript emita declarations. Pero ya usamos tsdown para generar declarations como parte del build. Tener dos generadores de declarations (tsc + tsdown) crea conflictos y duplicacion. La alternativa seria desactivar `dts` en tsdown y usar solo tsc para declarations, pero perdemos las ventajas de tsdown (velocidad, `resolve: true`).

**Decision**: Usar `tsc --noEmit` para type-checking y tsdown para emission de declarations.

**Justificacion**:
- Turbo ya cubre el build ordering con `dependsOn: ["^build"]`, eliminando el principal beneficio de `tsc -b` (auto-rebuild)
- Un unico pipeline de build (tsdown) es mas simple que coordinar tsc + tsdown
- La complejidad extra de `tsc -b` no justifica su unico beneficio practico (auto-rebuild en local)

### Decision 2: Eliminar paths de tsconfig.base.json

**Contexto**: Los `paths` en tsconfig permiten "Go to Definition" directo al source y resolucion inmediata sin build previo.

**Problema**: Los paths cortocircuitan la resolucion de exports en `package.json`. Con paths a source, TypeScript incluye el source del paquete en el mismo programa que `payload-types.ts`, causando el augmentation leak.

**Decision**: Eliminar todos los `paths` de `@zetesis/*` de `tsconfig.base.json`.

**Justificacion**:
- Sin paths, TypeScript sigue la cadena: `node_modules` → symlink pnpm → `package.json` exports → `dist/` (aislado)
- Esto es la pieza central de nuestro mecanismo de aislamiento
- **Trade-off**: "Go to Definition" va a `.d.mts` en lugar del source. Pero `declarationMap: true` genera source maps (`.d.mts.map`) que redirigen al `.ts` original, mitigando este problema

### Decision 3: tsdown `dts: { resolve: true }` en lugar de `tsc --emitDeclarationOnly`

**Contexto**: Necesitamos generar declarations (`.d.mts`) para que los exports de `package.json` funcionen.

**Decision**: Usar tsdown con `dts: { resolve: true }` para generar declarations.

**Justificacion**:
- tsdown genera declarations como parte del build (un solo paso, no requiere invocacion separada de tsc)
- `resolve: true` bundlea e inlinea tipos de dependencias internas, reforzando el aislamiento (ver seccion "Detalle tecnico: tsdown dts resolve")
- Velocidad: rolldown (Rust) es significativamente mas rapido que tsc (JS)
- **Trade-off**: 99.9% fidelidad vs 100% de tsc para edge cases complejos. Riesgo aceptable dado que los tipos de nuestros paquetes no usan patrones exoticos

### Decision 4: `${configDir}` en tsconfig.base.json

**Contexto**: Multiples paquetes extienden `tsconfig.base.json` y necesitan que paths relativos se resuelvan relativo a cada paquete, no relativo al root.

**Decision**: Usar `${configDir}` (TypeScript 5.5+) en el base config.

**Justificacion**:
- Resuelve el problema de que `outDir`, `rootDir`, etc. en un config base se resolvian relativo al directorio del base config (root), no al paquete que lo extiende
- Elimina la necesidad de sobreescribir estos paths en cada `tsconfig.json` de paquete
- Nuestro proyecto usa TypeScript 5.7, compatible con esta feature

Ver seccion "Detalle tecnico: `${configDir}`" para ejemplos concretos.

---

## Detalle tecnico: tsdown `dts: { resolve: true }`

tsdown usa [rolldown](https://rolldown.rs/) (bundler en Rust) junto con un plugin DTS para generar declarations.

### Que hace `resolve: true`

Cuando `resolve` esta activado, tsdown **resuelve e inlinea** los tipos de dependencias internas en el `.d.mts` resultante:

```
Sin resolve (por defecto):
  dist/index.d.mts:
    import { SomeType } from '../other-internal-module'  // referencia externa
    export declare function foo(): SomeType

Con resolve: true:
  dist/index.d.mts:
    interface SomeType { ... }  // tipo inlineado
    export declare function foo(): SomeType
```

### Por que importa para el aislamiento

El `.d.mts` generado es **autocontenido**: no tiene `import` que referencien al source original del paquete. Esto refuerza la isolation porque:

1. No hay camino de vuelta al source desde los tipos compilados
2. TypeScript no puede "descubrir" accidentalmente archivos source del paquete a traves de imports en declarations
3. El boundary entre app y paquete queda completamente sellado en la capa de tipos

### Declaration source maps

tsdown genera `.d.mts.map` (declaration source maps) junto con los `.d.mts`. Estos source maps permiten que "Go to Definition" en el IDE navegue desde el `.d.mts` compilado hasta el `.ts` original, mitigando el trade-off de no tener paths directos al source.

---

## Detalle tecnico: `${configDir}`

`${configDir}` es una template variable introducida en TypeScript 5.5 que se resuelve al **directorio del tsconfig que contiene la variable**, no al directorio del tsconfig que lo extiende.

### El problema sin `${configDir}`

```
tsconfig.base.json (en /workspace):
  "outDir": "./dist"

packages/payload-indexer/tsconfig.json extends base:
  outDir se resuelve a /workspace/dist  ← INCORRECTO
  Todos los paquetes emitirian al mismo directorio
```

Cada paquete tendria que sobreescribir `outDir` manualmente:

```json
// packages/payload-indexer/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

### La solucion con `${configDir}`

```
tsconfig.base.json (en /workspace):
  "outDir": "${configDir}/dist"

packages/payload-indexer/tsconfig.json extends base:
  ${configDir} = /workspace/packages/payload-indexer
  outDir = /workspace/packages/payload-indexer/dist  ← CORRECTO

packages/payload-taxonomies/tsconfig.json extends base:
  ${configDir} = /workspace/packages/payload-taxonomies
  outDir = /workspace/packages/payload-taxonomies/dist  ← CORRECTO
```

Cada paquete hereda `outDir: "${configDir}/dist"` y `${configDir}` se resuelve automaticamente al directorio de **ese** paquete. Lo mismo aplica para `rootDir`, `exclude`, y cualquier otro path relativo en el base config.

### Requisitos

- TypeScript 5.5+ (usamos 5.7)
- Solo funciona en archivos tsconfig, no en linea de comandos

---

## Troubleshooting

### "Cambie un tipo en un paquete pero tsc no lo detecta"

**Causa**: `dist/` tiene declarations stale. Como usamos `tsc --noEmit` (no `tsc -b`), TypeScript no auto-rebuild las declarations.

**Solucion**: Rebuild el paquete:
```bash
pnpm --filter @zetesis/paquete build
```

### "Errores de tipo union despues de payload generate:types"

**Causa**: Leak de module augmentation. El `declare module 'payload'` de `payload-types.ts` esta alcanzando el scope del paquete.

**Verificar**:
1. El paquete **NO** tiene paths en `tsconfig.base.json` apuntando a su source
2. El `exports` del `package.json` tiene `"types"` apuntando a `dist/` (no a `src/`)
3. El `dist/` esta actualizado: `pnpm --filter @zetesis/paquete build`

### "Go to Definition me lleva a un .d.mts"

**Esto es comportamiento esperado**. Con `declarationMap: true`, VS Code deberia seguir el source map al `.ts` original automaticamente.

Si no funciona, verificar que existen los archivos `.d.mts.map` en `dist/`:
```bash
ls packages/payload-betterauth-stripe/dist/**/*.d.mts.map
```

Si no existen, rebuild el paquete para que tsdown los genere.

### "Cannot find module '@zetesis/...' or its type declarations"

**Causa**: El paquete no esta buildeado (no existe `dist/`).

**Solucion**:
```bash
pnpm --filter @zetesis/paquete build
# O para todos:
pnpm --filter "@zetesis/*" build
```

### "Property X does not exist on type union"

**Causa**: Patron de augmentation leak. `CollectionSlug` se resolvio a una union y el generic devolvio un tipo union donde no todos los miembros tienen la propiedad.

**Solucion**: Usar cast `as unknown as InterfazLocal` (ver seccion "Casts en paquetes"):

```typescript
const user = (await payload.findByID({
  collection: config.usersCollectionSlug,
  id: userId,
})) as unknown as UserWithStripe | null
```

### "Referenced project must have setting composite: true"

**Causa**: El `tsconfig.json` del paquete esta sobreescribiendo `composite: false`, anulando el `composite: true` heredado de `tsconfig.base.json`.

**Solucion**: Eliminar el override `"composite": false` del tsconfig del paquete. La configuracion correcta se hereda del base.

---

## Referencias

- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [TypeScript `${configDir}` (5.5+)](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html)
- [TypeScript #52295 - Module augmentation leaks across packages](https://github.com/microsoft/TypeScript/issues/52295)
- [PayloadCMS repo - tsconfig patterns](https://github.com/payloadcms/payload)
- [PayloadCMS - Generating Types docs](https://payloadcms.com/docs/typescript/generating-types)
