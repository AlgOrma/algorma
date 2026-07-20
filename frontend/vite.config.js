import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: Number(process.env.PORT) || 5199,
  },
  // Vitest (npm test). Explicit imports (no globals) keep tests lint-friendly;
  // RTL cleanup + jest-dom matchers are wired up in the setup file.
  test: {
    environment: 'jsdom',
    // A real (non-opaque) origin so window.localStorage exists in tests.
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    setupFiles: './src/test/setup.js',
    css: false,
  },
})
