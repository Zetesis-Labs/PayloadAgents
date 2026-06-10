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
  external: ['payload', 'drizzle-orm', 'node:crypto', '@toon-format/toon', '@payloadcms/ui', 'react', 'react/jsx-runtime']
})
