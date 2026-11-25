import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/]react(?:-dom)?/ },
            { name: 'router-vendor', test: /node_modules[\\/]react-router(?:-dom)?/ },
            { name: 'supabase-vendor', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'chart-vendor', test: /node_modules[\\/]recharts(?:[\\/]|$)/ },
            { name: 'icons-vendor', test: /node_modules[\\/]lucide-react[\\/]/ },
          ],
        },
      },
    },
  },
})
