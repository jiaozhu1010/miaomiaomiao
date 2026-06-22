import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: '/www/auth/',
  plugins: [
    react(),
    tailwindcss(),
    // Vite always outputs type="module" in built HTML regardless of output.format.
    // This plugin strips it so the IIFE bundle loads as a regular script.
    {
      name: 'remove-module-type',
      enforce: 'post',
      transformIndexHtml(html) {
        return html.replace(/<script type="module" crossorigin /g, '<script ')
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../www/auth',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/miaosite-auth.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
})
