import test from 'node:test'
import assert from 'node:assert/strict'
import { neighboringZones, compassPoint, compassName, fileKind } from './researchUtils.mjs'

const sites = Array.from({ length: 7 }, (_, index) => ({ site_id: `FIC-0${index + 1}`, longitude: index * .018, latitude: 0 }))

test('fictional zone focus chooses four nearby sites', () => {
  const chosen = neighboringZones(sites, 'FIC-03')
  assert.equal(chosen.length, 4)
  assert.equal(chosen[0], 'FIC-03')
  assert.ok(chosen.includes('FIC-02'))
})

test('compass and media kind preserve unavailable states', () => {
  assert.equal(compassPoint(90), 'E')
  assert.equal(compassPoint(null), '—')
  assert.equal(compassName(225), 'Southwest')
  assert.equal(fileKind('clip.WAV'), 'audio')
  assert.equal(fileKind('scene.webm'), 'video')
  assert.equal(fileKind('blob.exe'), 'unsupported')
})

test('focused hex selection uses declared adjacency', () => {
  const network = [
    { site_id: 'FIC-01', longitude: 0, latitude: 0, neighbors: ['FIC-02'] },
    { site_id: 'FIC-02', longitude: .012, latitude: 0, neighbors: ['FIC-01', 'FIC-03'] },
    { site_id: 'FIC-03', longitude: .024, latitude: 0, neighbors: ['FIC-02'] },
    { site_id: 'FIC-04', longitude: .001, latitude: .001, neighbors: [] },
  ]
  assert.deepEqual(neighboringZones(network, 'FIC-02'), ['FIC-02', 'FIC-01', 'FIC-03'])
})
