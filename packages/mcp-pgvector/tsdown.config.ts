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
  external: ['@zetesis/payload-pgvector', '@modelcontextprotocol/sdk', 'pg']
})
