import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const data = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'))

test('loads replay, scrubs a track, records the chosen recommendation and exports it', async ({ page }) => {
  const [scenario, sites, cameras] = await Promise.all(['scenario', 'sites', 'cameras'].map(data))
  const tracks = Object.entries(Object.groupBy(scenario.observations, item => item.track_id))
    .map(([track_id, observations]) => ({
      track_id, observations: observations.map(item => ({ site_id: scenario.site_id, ...item })),
      risk: { score: track_id === 'VIG-042' ? 100 : 5, reasons: [], recommended_actions: ['preserve_evidence', 'allocate_camera'] },
    }))
  const saved = []
  let loaded = false
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/reset')) { loaded = true; return route.fulfill({ json: { loaded_observations: 7 } }) }
    if (path === '/api/sites') return route.fulfill({ json: sites.sites })
    if (path === '/api/cameras') return route.fulfill({ json: cameras })
    if (path === '/api/tracks') return route.fulfill({ json: loaded ? tracks : [] })
    if (path === '/api/global-tracks') return route.fulfill({ json: [] })
    if (path.endsWith('/decisions')) {
      const decision = { ...route.request().postDataJSON(), decided_at: '2026-11-25T21:02:00Z' }
      saved.push(decision)
      return route.fulfill({ json: decision })
    }
    if (path.startsWith('/api/incidents/')) {
      const id = path.split('/').at(-1)
      return route.fulfill({ json: { incident_id: `INC-${id}`, track_id: id, decisions: id === 'VIG-038' ? saved : [] } })
    }
    return route.fulfill({ status: 404 })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Overview' }).click()
  await page.getByRole('button', { name: 'Load replay' }).click()
  await expect(page.getByText('API REPLAY')).toBeVisible()
  const slider = page.getByRole('slider', { name: 'Replay observation' })
  await slider.focus()
  await slider.press('Home')
  await expect(page.getByText('1/6')).toBeVisible()
  await page.locator('.queue-item').filter({ hasText: 'VIG-038' }).getByRole('button', { name: 'Reject' }).click()
  const form = page.getByRole('form', { name: 'Record operator decision' })
  await form.getByLabel('Recommendation').selectOption('allocate_camera')
  await form.getByLabel('Operator note').fill('Wildlife candidate.')
  await form.getByRole('button', { name: 'Record decision' }).click()
  await expect(page.getByText('Decision recorded for VIG-038.')).toBeVisible()
  await page.getByRole('button', { name: 'Incident history' }).click()
  await expect(page.getByText('Wildlife candidate.')).toBeVisible()
  await page.getByRole('button', { name: 'Evidence', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('INC-VIG-038.json')
  const report = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(report.decisions).toMatchObject([{ decision: 'rejected', action: 'allocate_camera', note: 'Wildlife candidate.' }])
})

test('rejects annotations paired with the wrong local media file', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 503 }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Video replay' }).click()
  await page.getByLabel('Video', { exact: true }).setInputFiles({
    name: 'local.mp4', mimeType: 'video/mp4', buffer: Buffer.from('different bytes'),
  })
  await page.getByLabel('Replay JSON').setInputFiles({
    name: 'replay.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      version: 1, source: 'manual', video_sha256: 'a'.repeat(64), fps: 10, width: 64, height: 64,
      frames: [{ index: 0, offset_s: 0, boxes: [] }],
    })),
  })
  await page.getByRole('button', { name: 'Open replay' }).click()
  await expect(page.getByRole('alert')).toHaveText('This annotation bundle belongs to a different video.')
})

test('regional history distinguishes confirmed, candidate, and rejected reports', async ({ page }) => {
  const { sites } = await data('sites')
  const observations = ['confirmed', 'candidate', 'rejected'].map((handoff_status, index) => ({
    handoff_status, site_id: sites[index].site_id, local_track_id: `LOCAL-${index}`,
    timestamp: `2026-11-25T21:0${index}:00Z`, position: { latitude: 52.4, longitude: 13.5 },
  }))
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/sites') return route.fulfill({ json: sites })
    if (path === '/api/tracks' || path === '/api/cameras') return route.fulfill({ json: [] })
    if (path === '/api/global-tracks') {
      return route.fulfill({ json: [{ global_track_id: 'REG-1', latest: observations.at(-1) }] })
    }
    if (path === '/api/global-tracks/REG-1') return route.fulfill({ json: { global_track_id: 'REG-1', observations } })
    return route.fulfill({ status: 404 })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Overview' }).click()
  const history = page.getByRole('region', { name: 'Regional track history' })
  await expect(history.getByText('Site changes can include gaps in coverage.', { exact: false })).toBeVisible()
  await expect(history.getByRole('row').filter({ hasText: 'LOCAL-0' }).getByRole('button')).toHaveCount(1)
  await expect(history.getByRole('row').filter({ hasText: 'LOCAL-1' })).toContainText('candidate')
  await expect(history.getByRole('row').filter({ hasText: 'LOCAL-2' }).getByRole('button')).toHaveCount(0)
})
