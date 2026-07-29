import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import pkg from '../../package.json' with { type: 'json' };

export default defineConfig({
  root: 'apps/web',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT_SHA__: JSON.stringify(process.env['APP_COMMIT_SHA'] ?? 'unknown'),
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 47180,
    // Tenant subdomains must reach the dev server too: acme.localhost:47180
    allowedHosts: ['.localhost'],
    proxy: {
      // changeOrigin stays false so the API sees the original Host header —
      // tenant resolution depends on it.
      '/api': { target: 'http://localhost:47100', changeOrigin: false },
    },
  },
});
