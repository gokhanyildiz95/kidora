import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  // The shared package ships TypeScript source, so bundle it into the server build.
  noExternal: ['@kidora/shared'],
});
