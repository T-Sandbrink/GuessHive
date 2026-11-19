import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  // In watch mode (pnpm dev) never wipe dist/: web and api are reading it.
  clean: !options.watch,
  target: 'es2024',
}));
