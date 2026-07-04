import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['web-ifc']
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  },
  preview: {
    allowedHosts: true
  }
});
