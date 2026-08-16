import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), tanstackRouter()],
  // The repo-root assets folder is the public directory, so the logo lives in one place instead
  // of being copied into frontend/ and drifting from it. Everything in there is served at the
  // site root and copied into dist - it is a public folder, so nothing private goes in it.
  publicDir: path.resolve(__dirname, '../assets'),
  server: {
    // Deliberately far from the usual 5173 so nothing else local fights for it.
    port: 49173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
