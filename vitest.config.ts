import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@jest/globals': path.resolve(__dirname, './src/test/vitest-jest-globals.ts'),
      'firebase/firestore': path.resolve(__dirname, './src/test/__mocks__/firebase-firestore.ts'),
      'firebase/auth': path.resolve(__dirname, './src/test/__mocks__/firebase-auth.ts'),
      'firebase/app': path.resolve(__dirname, './src/test/__mocks__/firebase-app.ts'),
      'firebase/storage': path.resolve(__dirname, './src/test/__mocks__/firebase-storage.ts'),
      'firebase/analytics': path.resolve(__dirname, './src/test/__mocks__/firebase-analytics.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    css: false,
    clearMocks: true,
    server: {
      deps: {
        inline: [/firebase/],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx', 'src/test/**'],
      thresholds: {
        branches: 50,
        functions: 50,
        lines: 50,
        statements: 50,
      },
    },
  },
});
