import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset paths so dist/ works on GitHub Pages or any folder
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  build: { chunkSizeWarningLimit: 1000 },
});
