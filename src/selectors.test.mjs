import test from 'node:test'
import assert from 'node:assert/strict'
import { detectionStatus, visibleForecast } from './selectors.mjs'
import { decisionPayload, observationsForSite, pointFor, siteBounds, sortTracks } from './selectors.mjs'

test('incident queue sorts risk and filters to selected site', () => {
  const tracks = [{ track_id: 'bird', risk: { score: 18 }, observations: [{ site_id: 'A' }] }, { track_id: 'drone', risk: { score: 86 }, observations: [{ site_id: 'A' }] }, { track_id: 'other', risk: { score: 99 }, observations: [{ site_id: 'B' }] }]
  assert.deepEqual(sortTracks(observationsForSite(tracks, 'A')).map(t => t.track_id), ['drone', 'bird'])
})
test('map placement uses site coordinates', () => {
  assert.deepEqual(pointFor({ site_position_m: [110, 115] }, siteBounds), { x: 50, y: 50 })
  assert.equal(pointFor({ centroid_xy: [100, 100] }, siteBounds), null)
})
test('site selection keeps only local observations in replay order', () => {
  const track = { observations: [
    { site_id: 'A', timestamp: '2026-11-25T10:02:00Z' },
    { site_id: 'B', timestamp: '2026-11-25T10:01:00Z' },
    { site_id: 'A', timestamp: '2026-11-25T10:00:00Z' },
  ] }
  const [selected] = observationsForSite([track], 'A')
  assert.deepEqual(selected.observations.map(item => item.timestamp), [
    '2026-11-25T10:00:00Z', '2026-11-25T10:02:00Z',
  ])
})
test('operator decision preserves explicit choice and note', () => {
  assert.deepEqual(decisionPayload('modified', 'preserve_evidence', 'Escalate to supervisor'), { action: 'preserve_evidence', decision: 'modified', operator_id: 'demo-operator', note: 'Escalate to supervisor' })
})

test('wildlife stays green without confirming low confidence detections', () => {
  assert.deepEqual(detectionStatus('Bird', .34), { tone: 'green', label: 'Wildlife candidate' })
  assert.equal(detectionStatus('quadcopter', .91).tone, 'amber')
  assert.equal(detectionStatus('kite', .84).tone, 'cyan')
  assert.equal(detectionStatus('unrecognized label', .99).label, 'Unclassified')
})

test('forecast only follows the matching current observation and hides stale live data', () => {
  const anchor = { track_id: 'track-1', site_id: 'site-a', timestamp: '2026-11-25T12:00:00Z', source: 'camera', site_position_m: [5, 10] }
  const analytics = { forecast_anchor: anchor, metric_observation_count: 2, predicted_path_m: [[7, 12]], forecast_horizon_seconds: 5 }
  const now = Date.parse(anchor.timestamp) + 1000
  assert.deepEqual(visibleForecast(analytics, anchor, true, now).points, [[5, 10], [7, 12]])
  assert.equal(visibleForecast(analytics, { ...anchor, site_id: 'site-b' }, true, now), null)
  assert.equal(visibleForecast(analytics, anchor, true, now + 15000), null)
  assert.equal(visibleForecast(analytics, anchor, false, now), null)
  assert.equal(visibleForecast({ ...analytics, metric_observation_count: 1 }, anchor, true, now), null)
})
