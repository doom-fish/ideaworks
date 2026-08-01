import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves a project site from /<repo>/, while the self-hosted Caddy
// vhost serves from the root. Everything that builds a URL at runtime goes
// through import.meta.env.BASE_URL, so this is the only value that changes.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  // The embedder runs in a module worker. Vite bundles workers as IIFE by
  // default, which breaks transformers.js — its tokenizers rely on ESM class
  // semantics that do not survive the IIFE wrapper.
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
})
