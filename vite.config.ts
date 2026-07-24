import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
      manifest: {
        id: '/',
        name: 'Copy News',
        short_name: 'Copy News',
        description: 'Central editorial para produção e acompanhamento de notícias.',
        theme_color: '#1f7358',
        background_color: '#f9f7f2',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        categories: ['productivity', 'news'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/, priority: 30 },
            { name: 'data-vendor', test: /node_modules[\\/](@supabase|@tanstack)/, priority: 20 },
            { name: 'form-vendor', test: /node_modules[\\/](react-hook-form|@hookform|zod)/, priority: 15 },
            { name: 'ui-vendor', test: /node_modules[\\/](@radix-ui|lucide-react|sonner)/, priority: 10, maxSize: 400_000 },
          ],
        },
      },
    },
  },
})
