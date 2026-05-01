import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const role = process.env.TEST_ROLE || 'client';

export default defineConfig(({ mode }) => {
  loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'firebase/app': path.resolve(__dirname, './test-harness/firebase-app.ts'),
        'firebase/auth': path.resolve(__dirname, './test-harness/firebase-auth.ts'),
        'firebase/firestore': path.resolve(__dirname, './test-harness/firebase-firestore.ts'),
        'firebase/analytics': path.resolve(__dirname, './test-harness/firebase-analytics.ts'),
      },
    },
    server: {
      port: Number(process.env.TEST_PORT || 4175),
      strictPort: true,
      hmr: false,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react')) return 'react';
            if (id.includes('node_modules/framer-motion')) return 'framer';
          },
        },
      },
    },
  };
});
