import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts'],
  format: ['esm'],
  dts: {
    resolve: true
  },
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  tsconfig: './tsconfig.json',
  // Force the automatic JSX runtime regardless of any inherited
  // `"jsx": "preserve"` from a parent tsconfig. Without this, tsdown emits
  // literal JSX into the .mjs output, which Next/Turbopack will not transform
  // when the package is consumed from node_modules — the `'use client'`
  // boundary is lost so admin field components (e.g. ModelSelectField) render
  // server-side and crash with "Functions are not valid as a React child".
  inputOptions: {
    transform: {
      jsx: { runtime: 'automatic' }
    }
  },
  external: ['payload', 'drizzle-orm', 'node:crypto', '@toon-format/toon', '@payloadcms/ui', 'react', 'react/jsx-runtime']
})
