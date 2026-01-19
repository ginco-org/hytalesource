import { defineConfig } from 'vitest/config';
import { comlink } from "vite-plugin-comlink";
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [comlink(), react()],
  worker: {
    plugins: () => [comlink()],
    format: 'es',
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/**'],
  },
  // For javadoc API during development
  server: {
    proxy: {
      '/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/oauth2': {
        target: 'https://oauth.accounts.hytale.com',
        changeOrigin: true,
        secure: true,
      },
      '/game-assets': {
        target: 'https://account-data.hytale.com',
        changeOrigin: true,
        secure: true,
      },
      '/r2-proxy': {
        target: 'https://ht-game-assets-release.de7106a42bcf6cf632edbccda3ea1394.r2.cloudflarestorage.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/r2-proxy/, ''),
      },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'inheritance': ['@xyflow/react', 'dagre'],
        },
      },
    },
  },
});
