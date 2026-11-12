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
    // The page CSP allows only same-origin fonts. A font under the default
    // 4 KiB limit was inlined as data: and the console blocked it.
    assetsInlineLimit: 0,
    // Raise the warning limit — we have intentional large async chunks
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Vite 8 bundles with Rolldown. Only shared, always-needed code gets a
        // named group; heavy libraries (three, recharts, gsap, framer-motion)
        // are left to normal code splitting so they only load with the lazy
        // route or section that imports them.
        codeSplitting: {
          groups: [
            {
              // React runtime first, so it never lands inside a library chunk.
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|zustand|use-sync-external-store)[\\/]/,
              priority: 30,
            },
            {
              // three core: the landing background scene and the auth visual.
              name: 'vendor-three',
              test: /[\\/]node_modules[\\/]three[\\/]/,
              priority: 15,
            },
            {
              // Auth page visual only. Kept apart so it does not merge into
              // the shared api chunk.
              name: 'vendor-r3f',
              test: /[\\/]node_modules[\\/](@react-three|three-stdlib|troika|maath|camera-controls|meshline|zustand[\\/]vanilla)/,
              priority: 10,
            },
            {
              name: 'vendor-icons',
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
})
