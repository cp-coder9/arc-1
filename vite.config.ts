import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
   const env = loadEnv(mode, '.', '');
   return {
     plugins: [react(), tailwindcss()],
     define: {
       // No sensitive environment variables exposed to client
     },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    optimizeDeps: {
      entries: ['index.html'],
    },
    build: {
      // Increase chunk size warning limit – some agent bundles are large
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
         manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler')) return 'react';
            if (id.includes('node_modules/framer-motion')) return 'framer';
            if (id.includes('node_modules/@radix-ui') || id.includes('node_modules/@base-ui')) return 'ui-vendor';
            if (id.includes('node_modules/@google/genai')) return 'ai-vendor';
            if (id.includes('node_modules/pdf-lib')) return 'pdf-vendor';
            if (id.includes('node_modules/lucide-react')) return 'icons';
            if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark') || id.includes('node_modules/unist') || id.includes('node_modules/mdast') || id.includes('node_modules/hast') || id.includes('node_modules/micromark')) return 'markdown-vendor';
            if (id.includes('node_modules/date-fns')) return 'date-vendor';
         },
       },
     },
    },
  };
});
