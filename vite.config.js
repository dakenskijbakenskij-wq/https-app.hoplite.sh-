import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // Inline all JS/CSS into dist/index.html: the whole game is one file that opens offline, even from file://.
  plugins: [viteSingleFile()],
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  build: { chunkSizeWarningLimit: 1000 },
});
