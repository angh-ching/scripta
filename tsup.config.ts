import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['server/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist-server',
  clean: true,
  sourcemap: true,
  splitting: false,
  minify: false,
})
