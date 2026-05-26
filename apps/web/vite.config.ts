import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@travel-os/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react:    ['react', 'react-dom'],
          router:   ['react-router-dom'],
          query:    ['@tanstack/react-query'],
          motion:   ['framer-motion'],
          charts:   ['recharts'],
          three:    ['three', '@react-three/fiber', '@react-three/drei'],
          ui:       ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
