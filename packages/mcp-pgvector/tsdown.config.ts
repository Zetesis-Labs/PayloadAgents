import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/standalone.ts'],
  format: ['esm'],
  dts: { resolve: true },
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  tsconfig: './tsconfig.json',
  // Bundle the workspace @zetesis/* deps (their dev exports point at TS source,
  // which Node can't load) so the compiled artifact actually runs. Keep real npm
  // deps external — Node resolves them from node_modules at runtime.
  noExternal: [/^@zetesis\//],
  external: ['@modelcontextprotocol/sdk', 'pg', 'zod', 'payload']
})
