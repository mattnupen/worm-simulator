import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The page is built into dist/ and the Node server (server/main.ts) serves it with the API.
// In development, `npm run dev` runs Vite here and sends /api to the server on port 8787.
export default defineConfig({
  root: 'client',
  // Served at wormsimulator.com/burrow/ (the server also answers without the prefix).
  base: '/burrow/',
  publicDir: false,
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2020' },
  server: {
    port: 5180,
    proxy: { '/burrow/api': 'http://localhost:8787' },
    // The teacher's fact picker reads the game's lessons in ../src/content.
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
  },
  test: { root: '.', include: ['tests/**/*.test.ts'], testTimeout: 20_000 },
});
