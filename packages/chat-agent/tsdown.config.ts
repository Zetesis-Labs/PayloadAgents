import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/react.ts', 'src/server.ts'],
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
    '@payloadcms/richtext-lexical',
    '@nexo-labs/payload-stripe-inventory',
    '@nexo-labs/payload-typesense',
    'react',
    'react-dom',
    'framer-motion',
    'react-markdown',
  ],
})

