import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * IIFE-сборка плеера для file:// (без ES modules).
 * npm run build:standalone
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist/standalone-runtime'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'resources/js/player/main.js'),
      output: {
        format: 'iife',
        name: 'UniTestPlayer',
        entryFileNames: 'player.js',
        assetFileNames: 'player[extname]',
        inlineDynamicImports: true,
      },
    },
  },
});
