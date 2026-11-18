import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // A plain Node server in .output/ (rule 10: nothing host-specific).
    // boot.ts runs once when the server starts: table changes, the wall
    // check and the first invites. In TanStack Start that work belongs in a
    // Nitro plugin, because the server entry loads lazily on first request.
    nitro({
      preset: 'node-server',
      plugins: ['./server/boot.ts', './server/never-keep-errors.ts'],
    }),
    // React's Vite plugin must come after Start's plugin.
    viteReact(),
  ],
})
