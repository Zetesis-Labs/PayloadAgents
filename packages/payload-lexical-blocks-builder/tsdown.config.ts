import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/builder.ts', 'src/renderer.ts'],
  format: ['esm'],
  dts: {
    resolve: true,
  },
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  tsconfig: './tsconfig.json',
  external: [
    'payload',
    '@payloadcms/ui',
    '@payloadcms/richtext-lexical',
    'react',
  ],
})

