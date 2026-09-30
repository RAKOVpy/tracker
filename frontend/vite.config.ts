import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Сервер трекера (backend/). Нужен, только если приложение собрано с VITE_API_URL=/api.
// Host не подменяется: Django сверяет его с заголовком Origin, когда проверяет CSRF.
const backend = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000'
const proxy = { '/api': { target: backend, changeOrigin: false } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Шаблоны Obsidian лежат в ../obsidian и подключаются в приложение как текст.
    fs: { allow: ['..'] },
    proxy,
  },
  preview: { proxy },
})
