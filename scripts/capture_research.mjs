import { chromium } from '@playwright/test'

const baseURL = process.env.VIGILAIR_SCREENSHOT_URL || 'http://127.0.0.1:5192/'
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' })
try {
  for (const [width, height, theme, name] of [
    [1440, 900, 'dark', 'research-1440.png'],
    [1920, 1080, 'light', 'research-1920-light.png'],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.goto(baseURL)
    await page.getByText('Hybrid awareness laboratory').waitFor()
    await page.locator('.research-map canvas').first().waitFor()
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `docs/screenshots/${name}`, animations: 'disabled' })
    await page.close()
  }
} finally {
  await browser.close()
}
