import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Шаблоны Obsidian лежат в ../obsidian и подключаются в приложение как текст.
    fs: { allow: ['..'] },
  },
})
