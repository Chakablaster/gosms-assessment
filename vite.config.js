/// <reference types="vitest/config" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  root: 'frontend',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  test: {
    root: '.',
    projects: [
      {
        extends: true,
        test: {
          name: 'frontend-ui',
          environment: 'jsdom',
          include: ['frontend/src/tests/**/*.test.jsx'],
          setupFiles: ['./frontend/src/tests/setup.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'backend-and-logic',
          environment: 'node',
          include: [
            'backend/tests/**/*.test.js',
            'frontend/src/tests/**/*.test.js',
          ],
        },
      },
    ],
  },
})
