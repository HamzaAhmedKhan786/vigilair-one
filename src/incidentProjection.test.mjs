import test from 'node:test'
import assert from 'node:assert/strict'
import { incidentProjection } from './incidentProjection.mjs'

test('projects synthetic drone and bird paths only as fictional sector illustrations', () => {
  const tracks = ['drone', 'bird'].map((class_name, index) => ({ track_id: index ? 'VIG-038' : 'VIG-042', observations: [
    { site_id: 'demo', site_position_m: [40, 80, 10], class_name, timestamp: '2026-01-01T00:00:00Z' },
    { site_id: 'demo', site_position_m: [80, 100, 10], class_name, timestamp: '2026-01-01T00:00:10Z' },
  ] }))
  const output = incidentProjection(tracks, 'demo', { longitude: 0, latitude: 0 }, .008)
  assert.deepEqual(output.map(item => item.track_id), ['VIG-042', 'VIG-038'])
  assert.ok(output.every(item => item.coordinates.length === 2 && item.source === 'illustrative_site_local_projection'))
  assert.deepEqual(incidentProjection(tracks, 'different', { longitude: 0, latitude: 0 }, .008), [])
})
