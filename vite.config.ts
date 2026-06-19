import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
   const env = loadEnv(mode, '.', '');
   return {
     plugins: [
       react(),
       tailwindcss(),
       {
         name: 'architex-build-info-meta',
         transformIndexHtml(html) {
           try {
             const buildInfo = JSON.parse(readFileSync(path.resolve(__dirname, 'public/build-info.json'), 'utf8'));
             return html.replace(
               '</head>',
               `    <meta name="architex-build-version" content="${buildInfo.version || 'unknown'}" />\n    <meta name="architex-build-commit" content="${buildInfo.shortCommit || buildInfo.commit || 'unknown'}" />\n    <meta name="architex-build-timestamp" content="${buildInfo.builtAt || 'unknown'}" />\n  </head>`
             );
           } catch {
             return html;
           }
         },
       },
     ],
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        'process.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || ''),
        'process.env.VITE_DEMO_MODE': JSON.stringify(process.env.VITE_DEMO_MODE || ''),
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
      include: ['framer-motion'],
    },
    build: {
      // Increase chunk size warning limit – some agent bundles are large
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
         manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
            if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark') || id.includes('node_modules/unist') || id.includes('node_modules/mdast') || id.includes('node_modules/hast') || id.includes('node_modules/micromark')) return 'markdown-vendor';
            if (/node_modules\/(react|react-dom|scheduler)(\/|$)/.test(id)) return 'react';
            if (id.includes('node_modules/framer-motion')) return 'framer';
            if (id.includes('node_modules/@radix-ui') || id.includes('node_modules/@base-ui')) return 'ui-vendor';
            if (id.includes('node_modules/@google/genai')) return 'ai-vendor';
            if (id.includes('node_modules/pdf-lib')) return 'pdf-vendor';
            if (id.includes('node_modules/lucide-react')) return 'icons';
            if (id.includes('node_modules/date-fns')) return 'date-vendor';
         },
       },
     },
    },
  };
});
