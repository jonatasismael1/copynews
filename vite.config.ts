import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom)/, priority: 30 },
            { name: 'data-vendor', test: /node_modules[\\/](@supabase|@tanstack)/, priority: 20 },
            { name: 'form-vendor', test: /node_modules[\\/](react-hook-form|@hookform|zod)/, priority: 15 },
            { name: 'ui-vendor', test: /node_modules[\\/](@radix-ui|lucide-react|sonner)/, priority: 10, maxSize: 400_000 },
          ],
        },
      },
    },
  },
})
