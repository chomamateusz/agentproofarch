import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./core', import.meta.url)),
      '@adapters': fileURLToPath(new URL('./adapters', import.meta.url)),
    },
  },
  test: {
    include: ['core/**/*.test.ts', 'adapters/**/*.test.ts', 'apps/**/*.test.ts'],
  },
});
