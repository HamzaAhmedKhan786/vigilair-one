import { chromium } from '@playwright/test'

const baseURL = process.env.VIGILAIR_SCREENSHOT_URL || 'http://127.0.0.1:5192/'
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' })
try {
  for (const [width, height, theme, name, tab] of [
    [1440, 900, 'dark', 'overview-1440.png', 'Overview'],
    [1920, 1080, 'light', 'overview-1920-light.png', 'Overview'],
    [1440, 900, 'dark', 'research-1440.png', 'Research lab'],
    [1920, 1080, 'light', 'research-1920-light.png', 'Research lab'],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.goto(baseURL)
    if (tab === 'Research lab') await page.getByRole('button', { name: 'Research lab', exact: true }).click()
    else {
      await page.getByRole('region', { name: 'Synthetic regional zone map' }).waitFor()
      await page.getByRole('combobox', { name: 'Overview fictional site' }).selectOption('FIC-10')
    }
    await page.locator('.research-map canvas').first().waitFor()
    await page.getByRole('slider', { name: 'Synthetic replay step' }).fill('4')
    if (theme === 'light') {
      await page.getByRole('button', { name: 'Switch to light mode' }).click()
      await page.getByRole('button', { name: '3D', exact: true }).click()
    }
    await page.waitForTimeout(600)
    await page.screenshot({ path: `docs/screenshots/${name}`, animations: 'disabled' })
    await page.close()
  }
} finally {
  await browser.close()
}
