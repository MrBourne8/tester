import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'resources',
  base: '/build/',
  build: {
    outDir: resolve(__dirname, 'public/build'),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'resources/js/app.js'),
        editor: resolve(__dirname, 'resources/js/editor/main.js'),
        player: resolve(__dirname, 'resources/js/player/main.js'),
        session: resolve(__dirname, 'resources/js/session/main.js'),
        join: resolve(__dirname, 'resources/js/join/main.js'),
        reports: resolve(__dirname, 'resources/js/reports/main.js'),
      },
    },
  },
  server: {
    origin: 'http://127.0.0.1:5173',
  },
  test: {
    environment: 'node',
    include: ['../resources/js/**/*.test.js', '../tests/js/**/*.test.js'],
  },
});
