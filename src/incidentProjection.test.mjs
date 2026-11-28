import test from 'node:test'
import assert from 'node:assert/strict'
import { incidentProjection, incidentSectorId } from './incidentProjection.mjs'

test('projects synthetic drone and bird paths only as fictional sector illustrations', () => {
  const tracks = ['drone', 'bird'].map((class_name, index) => ({ track_id: index ? 'VIG-038' : 'VIG-042', observations: [
    { site_id: 'demo', site_position_m: [40, 80, 10], class_name, timestamp: '2026-01-01T00:00:00Z' },
    { site_id: 'demo', site_position_m: [80, 100, 10], class_name, timestamp: '2026-01-01T00:00:10Z' },
  ] }))
  const sites = [{ site_id: 'FIC-10', longitude: 0, latitude: 0 }, { site_id: 'FIC-17', longitude: .02, latitude: 0 }]
  const output = incidentProjection(tracks, 'demo', sites, .008)
  assert.deepEqual(output.map(item => item.track_id), ['VIG-042', 'VIG-038'])
  assert.deepEqual(output.map(item => item.sector_id), ['FIC-10', 'FIC-17'])
  assert.ok(output[0].coordinates[0][0] !== output[1].coordinates[0][0])
  assert.ok(output.every(item => item.coordinates.length === 2 && item.source === 'illustrative_site_local_projection'))
  assert.deepEqual(incidentProjection(tracks, 'different', sites, .008), [])
  assert.equal(incidentSectorId('VIG-038', sites), 'FIC-17')
  assert.equal(incidentSectorId('unknown', sites), null)
  assert.deepEqual(incidentProjection(tracks, 'demo', sites.slice(0, 1), .008).map(item => item.track_id), ['VIG-042'])
})
