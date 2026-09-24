import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    target: 'es2020',
    // Vite 8 uses oxc for minification — do not set minify: 'esbuild'
    cssMinify: true,
    // Do not modulepreload heavy lazy chunks in index.html head
    modulePreload: false,
    // Raise the warning limit — we have intentional large async chunks
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split vendor libraries into separate cacheable chunks.
        // Each group only loads on the route that actually needs it.
        manualChunks(id) {
          // three.js + r3f + drei — only needed on dashboard topology view
          if (
            id.includes('node_modules/three') ||
            id.includes('node_modules/@react-three/fiber') ||
            id.includes('node_modules/@react-three/drei')
          ) {
            return 'vendor-3d'
          }
          // recharts — only needed on dashboard activity graph
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts'
          }
          // xyflow / reactflow — only needed on specific dashboard views
          if (
            id.includes('node_modules/@xyflow') ||
            id.includes('node_modules/reactflow') ||
            id.includes('node_modules/@reactflow')
          ) {
            return 'vendor-flow'
          }
          // gsap — only needed on landing page sections
          if (id.includes('node_modules/gsap')) {
            return 'vendor-gsap'
          }
          // framer-motion — shared but large
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion'
          }
          // react + react-dom + router — always needed, small
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react'
          }
          // zustand + immer — small state layer
          if (
            id.includes('node_modules/zustand') ||
            id.includes('node_modules/immer')
          ) {
            return 'vendor-state'
          }
          // lucide-react icons — shared
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons'
          }
        },
      },
    },
  },
})
