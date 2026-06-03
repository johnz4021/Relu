import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '..',
  server: {
    proxy: {
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
      },
      // Dev-only: route /api/* to the node server so VizRequestBanner,
      // viz-error reporter, bug-report, and register_interest all work in dev.
      // In prod the client + API serve from the same origin so this is unused.
      '/api': {
        target: 'http://localhost:3001',
      },
    },
  },
});
