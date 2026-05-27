import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.emulator.test.{ts,tsx,js,jsx}'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
