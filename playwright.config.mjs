import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './browser-tests',
  use: { baseURL: 'http://127.0.0.1:5191', channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5191 --strictPort', url: 'http://127.0.0.1:5191' },
})
