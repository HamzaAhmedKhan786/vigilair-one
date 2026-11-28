import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './browser-tests',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5191', channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5191 --strictPort', url: 'http://127.0.0.1:5191' },
})
