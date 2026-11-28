import { test, expect } from '@playwright/test'

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
