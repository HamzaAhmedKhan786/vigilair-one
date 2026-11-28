import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const sites = Array.from({ length: 4 }, (_, index) => ({ site_id: `FIC-0${index + 1}`, name: `Fictional sector 0${index + 1}`, latitude: 0, longitude: index * .018 }))
const scenario = {
  scenario_id: 'browser-fixture', source: 'synthetic', refresh_interval_ms: 200,
  sites, default_visible: sites.map(site => site.site_id),
  zones: { type: 'FeatureCollection', features: sites.map(site => ({ type: 'Feature', properties: { site_id: site.site_id }, geometry: { type: 'Polygon', coordinates: [[[site.longitude - .006, -.006], [site.longitude + .006, -.006], [site.longitude + .006, .006], [site.longitude - .006, .006], [site.longitude - .006, -.006]]] } })) },
  observations: Array.from({ length: 5 }, (_, index) => ({ step: index, elapsed_ms: index * 10_000, site_id: sites[Math.min(index, 3)].site_id, latitude: 0, longitude: index * .018, altitude_m: 30, speed_mps: index ? 3 : null, heading_deg: 90, distance_from_previous_m: index ? 30 : null, position_uncertainty_m: 5 })),
  activation_events: [{ step: 2, elapsed_ms: 20_000, kind: 'simulated_acoustic_cue', description: 'Fixture cue' }],
  validation: { distance_mae_m: 0.5, distance_rmse_m: 0.6, circular_heading_mae_deg: 0.1 },
}
scenario.observations.forEach((item, index) => {
  item.track_id = 'SYN-HEX-01'
  item.prediction = { heading_deg: 90, estimated: true, next_zone_ids: [sites[Math.min(index + 1, 3)].site_id], coordinates: [[item.longitude, item.latitude], [item.longitude + .018, 0]] }
  item.active_neighbor_ids = [sites[Math.min(index + 1, 3)].site_id]
  item.handoff_phase = index === 2 ? 'active_handoff' : 'predicted_handoff'
  item.zone_states = Object.fromEntries(sites.map(site => [site.site_id, { state: site.site_id === item.site_id ? 'tracked' : site.site_id === item.prediction.next_zone_ids[0] ? 'predicted_next' : 'inactive', operational_state: site.site_id === item.site_id ? 'active' : 'alerted', handoff: item.handoff_phase }]))
})

test('research replay, missing models, theme and human annotation', async ({ page }) => {
  const media = { id: 'media-fixture', original_name: 'sample.png', extension: 'png', site_id: 'FIC-01', state: 'ready', sha256: 'a'.repeat(64), bytes: 34, metadata: {} }
  const annotations = []
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/research/scenario') return route.fulfill({ json: scenario })
    if (path === '/api/research/models' || path === '/api/research/models/refresh') return route.fulfill({ json: { packages: [{ id: 'acoustic-hybrid', name: 'CNN + LIF/SNN acoustic research', family: 'acoustic_hybrid', version: '0.0.0', status: 'missing', issues: ['artifact missing'], inputs: {}, outputs: {}, classes: [], provenance: {} }] } })
    if (path === '/api/research/sensors') return route.fulfill({ json: [{ id: 'FIC-01-MIC', site_id: 'FIC-01', name: 'Fixture microphone', kind: 'microphone' }] })
    if (path === '/api/research/media') return route.fulfill({ json: [media] })
    if (path === '/api/research/media/media-fixture') return route.fulfill({ json: { ...media, annotations } })
    if (path === '/api/research/media/media-fixture/annotations') {
      const saved = { id: `annotation-${annotations.length}`, ...route.request().postDataJSON() }
      annotations.push(saved)
      return route.fulfill({ json: saved })
    }
    if (path === '/api/research/health') return route.fulfill({ json: { mode: 'offline_research', preserved_media: 1 } })
    if (path === '/api/experiments/hybrid-replay') return route.fulfill({ status: 503 })
    return route.fulfill({ status: 503 })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Research lab', exact: true }).click()
  await expect(page.getByText('Hybrid awareness laboratory')).toBeVisible()
  await expect(page.getByText('Missing artifacts')).toBeVisible()
  await page.getByRole('button', { name: /simulated acoustic cue/i }).click()
  await expect(page.getByRole('slider', { name: 'Synthetic replay step' })).toHaveValue('2')
  await expect(page.locator('.research-drone-marker .drone-marker-label')).toHaveText('SYN-HEX-01')
  await expect(page.getByText('SYN-HEX-01 · Fictional sector 03')).toBeVisible()
  await expect(page.locator('.research-zone-label.tracked')).toContainText('FIC-03')
  await expect(page.locator('.research-zone-label.predicted_next')).toContainText('FIC-04')
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const zoomBefore = await page.locator('.research-map').getAttribute('data-zoom')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(() => page.locator('.research-map').getAttribute('data-zoom')).not.toBe(zoomBefore)
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: /sample.png/ }).click()
  await page.getByRole('combobox', { name: 'Human annotation label' }).selectOption('uncertain')
  await page.getByRole('textbox', { name: 'Annotation note' }).fill('Fixture uncertain')
  await page.getByRole('button', { name: 'Save annotation' }).click()
  await expect(page.getByText('Fixture uncertain')).toBeVisible()
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('Overview and Research Lab share site, replay, sensors, media, models and review history', async ({ page }) => {
  const sensors = [{ id: 'FIC-01-MIC', site_id: 'FIC-01', name: 'Fixture microphone', kind: 'microphone' }]
  const media = []
  const annotations = []
  let modelStatus = 'missing'
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64')
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (path === '/api/research/scenario') return route.fulfill({ json: scenario })
    if (path === '/api/research/models/refresh') { modelStatus = 'incompatible'; return route.fulfill({ json: { packages: [{ id: 'acoustic-hybrid', name: 'CNN + LIF/SNN acoustic research', status: modelStatus, family: 'acoustic_hybrid', version: '0.0.0', issues: ['Fixture package incomplete'] }] } }) }
    if (path === '/api/research/models') return route.fulfill({ json: { packages: [{ id: 'acoustic-hybrid', name: 'CNN + LIF/SNN acoustic research', status: modelStatus, family: 'acoustic_hybrid', version: '0.0.0', issues: ['Fixture package incomplete'] }] } })
    if (path === '/api/research/sensors' && method === 'POST') { const saved = { id: 'VS-FIC-02-CAM', ...route.request().postDataJSON() }; sensors.push(saved); return route.fulfill({ json: saved }) }
    if (path === '/api/research/sensors') return route.fulfill({ json: sensors })
    if (path === '/api/research/media' && method === 'POST') { const saved = { id: 'new-media', original_name: 'evidence.png', extension: 'png', site_id: 'FIC-02', sensor_id: 'VS-FIC-02-CAM', state: 'ready', sha256: 'b'.repeat(64), bytes: png.length, metadata: {} }; media.unshift(saved); return route.fulfill({ json: saved }) }
    if (path === '/api/research/media') return route.fulfill({ json: media })
    if (path === '/api/research/media/new-media/annotations') { const saved = { id: 'review-1', ...route.request().postDataJSON() }; annotations.push(saved); return route.fulfill({ json: saved }) }
    if (path === '/api/research/media/new-media') return route.fulfill({ json: { ...media[0], annotations } })
    if (path === '/api/research/media/new-media/content') return route.fulfill({ body: png, contentType: 'image/png' })
    if (path === '/api/research/health') return route.fulfill({ json: { mode: 'offline_research', preserved_media: media.length } })
    return route.fulfill({ status: 503 })
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Synthetic regional zone map' })).toBeVisible()
  await page.getByRole('button', { name: 'Research lab', exact: true }).click()
  await page.getByRole('combobox', { name: 'Focus fictional site' }).selectOption('FIC-02')
  await page.getByRole('textbox', { name: 'New virtual sensor name' }).fill('Lab camera')
  await page.getByRole('combobox', { name: 'Virtual sensor kind' }).selectOption('camera')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Lab camera', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh model packages' }).click()
  await expect(page.getByText('Package incomplete', { exact: true })).toBeVisible()
  await page.getByLabel('Research media file').setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('combobox', { name: 'Virtual sensor for upload' }).selectOption('VS-FIC-02-CAM')
  await page.getByRole('button', { name: 'Preserve upload' }).click()
  await expect(page.getByRole('button', { name: /evidence.png/ })).toBeVisible()
  await page.getByRole('textbox', { name: 'Annotation note' }).fill('Cross-tab review')
  await page.getByRole('button', { name: 'Save annotation' }).click()
  await expect(page.getByText('Cross-tab review')).toBeVisible()
  await page.getByRole('slider', { name: 'Synthetic replay step' }).fill('2')
  await page.getByRole('button', { name: 'Play synthetic replay' }).click()
  await page.getByRole('button', { name: 'Overview' }).click()
  await expect(page.getByRole('combobox', { name: 'Overview fictional site' })).toHaveValue('FIC-02')
  await expect(page.getByRole('button', { name: 'Pause synthetic replay' })).toBeVisible()
  await expect(page.getByText('Lab camera')).toHaveCount(0)
  await expect(page.getByText('1 virtual sensors')).toBeVisible()
  await expect(page.getByText('incompatible')).toBeVisible()
  await expect(page.getByRole('button', { name: /evidence.png/ })).toBeVisible()
  await expect(page.getByText('1 human review annotations', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Research lab', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Focus fictional site' })).toHaveValue('FIC-02')
  await expect(page.getByText('Cross-tab review')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause synthetic replay' })).toBeVisible()
})

test('optional local camera and microphone measure input and preserve five-second WAV', async ({ page, context }) => {
  await context.grantPermissions(['camera', 'microphone'])
  const saved = []
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/research/scenario') return route.fulfill({ json: scenario })
    if (path === '/api/research/models') return route.fulfill({ json: { packages: [] } })
    if (path === '/api/research/sensors') return route.fulfill({ json: [{ id: 'FIC-01-MIC', site_id: 'FIC-01', name: 'Fixture microphone', kind: 'microphone' }] })
    if (path === '/api/research/media' && route.request().method() === 'POST') { saved.push(route.request().postDataBuffer()); return route.fulfill({ json: { id: 'captured', original_name: 'microphone-test.wav', extension: 'wav', site_id: 'FIC-01', sha256: 'a'.repeat(64), bytes: saved[0].length, metadata: {}, state: 'ready' } }) }
    if (path === '/api/research/media') return route.fulfill({ json: [] })
    if (path === '/api/research/health') return route.fulfill({ json: { mode: 'offline_research', preserved_media: 0 } })
    return route.fulfill({ status: 503 })
  })
  await page.goto('/')
  await page.getByRole('checkbox', { name: 'Live video' }).click()
  await expect(page.getByRole('checkbox', { name: 'Live video' })).toBeChecked()
  await expect(page.getByText('laptop camera')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Live microphone' }).click()
  await expect(page.getByRole('checkbox', { name: 'Live microphone' })).toBeChecked()
  await expect(page.getByText(/Measured sound level .* dBFS/)).toBeVisible()
  await page.getByRole('button', { name: 'Capture 5 s WAV' }).click()
  await expect(page.getByText(/Five-second 16 kHz mono WAV preserved/)).toBeVisible({ timeout: 15000 })
  expect(saved).toHaveLength(1)
  expect(saved[0].subarray(0, 4).toString()).toBe('RIFF')
})

test('selected fictional sector shows synthetic drone and bird trails linked to camera replay', async ({ page }) => {
  const operations = JSON.parse(await readFile(new URL('../data/scenario.json', import.meta.url), 'utf8'))
  const extendedScenario = structuredClone(scenario)
  extendedScenario.sites.push({ site_id: 'FIC-10', name: 'Fictional sector 10', latitude: .02, longitude: .05 })
  extendedScenario.zones.features.push({ type: 'Feature', properties: { site_id: 'FIC-10' }, geometry: { type: 'Polygon', coordinates: [[[.044, .014], [.056, .014], [.056, .026], [.044, .026], [.044, .014]]] } })
  const tracks = Object.entries(Object.groupBy(operations.observations, item => item.track_id)).map(([track_id, observations]) => ({
    track_id, observations, risk: { score: track_id === 'VIG-042' ? 80 : 10, reasons: [], recommended_actions: ['preserve_evidence'] },
  }))
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/sites') return route.fulfill({ json: [{ site_id: 'berlin-brandenburg-demo', name: 'Brandenburg Perimeter' }] })
    if (path === '/api/cameras') return route.fulfill({ json: [] })
    if (path === '/api/tracks') return route.fulfill({ json: tracks })
    if (path === '/api/global-tracks') return route.fulfill({ json: [] })
    if (path === '/api/research/scenario') return route.fulfill({ json: extendedScenario })
    if (path === '/api/research/models') return route.fulfill({ json: { packages: [] } })
    if (path === '/api/research/sensors' || path === '/api/research/media') return route.fulfill({ json: [] })
    if (path === '/api/research/health') return route.fulfill({ json: { mode: 'offline_research', preserved_media: 0 } })
    return route.fulfill({ status: 503 })
  })
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Overview fictional site' }).selectOption('FIC-10')
  await expect(page.locator('.research-incident-marker.drone')).toHaveText('VIG-042 · DRONE')
  await expect(page.locator('.research-incident-marker.bird')).toHaveText('VIG-038 · BIRD')
  await expect(page.locator('.research-overview-map .research-drone-marker')).toBeHidden()
  await expect(page.locator('.research-overview-map .research-prediction-target')).toBeHidden()
  await expect(page.locator('.research-overview-map .research-map-tools')).toContainText('FIC-10')
  await expect(page.locator('.research-overview-map .research-overview-facts')).toContainText('FIC-10')
  await page.locator('.queue-item').filter({ hasText: 'VIG-038' }).getByRole('button', { name: 'Inspect' }).click()
  await expect(page.getByText(/projected inside FIC-10/)).toBeVisible()
  await expect(page.locator('.research-incident-marker.bird')).toHaveClass(/selected/)
  await expect(page.getByRole('heading', { name: 'Camera replay' })).toBeVisible()
  await expect(page.getByText('VIG-038 · CAM-04')).toBeVisible()
  await expect(page.getByText('bird', { exact: true })).toBeVisible()
  const bird = page.locator('.research-incident-marker.bird')
  const latestTime = await bird.getAttribute('data-observation-time')
  await page.getByRole('slider', { name: 'Replay observation' }).fill('0')
  await expect(bird).not.toHaveAttribute('data-observation-time', latestTime)
  await expect(page.locator('.research-overview-map .research-drone-marker')).toBeHidden()
  await page.getByRole('button', { name: 'Hide synthetic incident tracks' }).click()
  await expect(page.locator('.research-overview-map .research-drone-marker')).toBeVisible()
  await expect(page.locator('.research-overview-map .research-map-tools')).toContainText('SYN-HEX-01')
})
