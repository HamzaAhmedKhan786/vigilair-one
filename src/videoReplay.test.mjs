import assert from 'node:assert/strict'
import test from 'node:test'
import { frameAtTime, linkedTrack, parseReplay } from './videoReplay.mjs'

const box = { label: 'bird', xyxy: [1, 1, 9, 9] }
const bundle = {
  version: 1, source: 'manual', video_sha256: 'a'.repeat(64), fps: 10, width: 20, height: 20,
  frames: [{ index: 0, offset_s: 0, boxes: [] }, { index: 2, offset_s: .2, boxes: [box] }],
}

test('replay overlays follow the requested frame and clear across missing frames', () => {
  const replay = parseReplay(JSON.stringify(bundle))
  assert.equal(frameAtTime(replay, .10), null)
  assert.deepEqual(frameAtTime(replay, .25).boxes, [box])
})

test('rejects invalid boxes before opening replay', () => {
  const invalid = structuredClone(bundle)
  invalid.frames[1].boxes[0].xyxy[2] = 100
  assert.throws(() => parseReplay(JSON.stringify(invalid)), /invalid detection box/)
})

test('only links detections with matching track, camera and time', () => {
  const timestamp = '2026-11-25T21:00:00Z'
  const tracks = [{ track_id: 'T-1', observations: [{ camera_id: 'CAM-01', timestamp }] }]
  const linked = { ...box, track_id: 'T-1', camera_id: 'CAM-01', observation_timestamp: timestamp }
  assert.deepEqual(linkedTrack(linked, tracks), { id: 'T-1', index: 0 })
  assert.equal(linkedTrack({ ...linked, camera_id: 'CAM-02' }, tracks), null)
  assert.equal(linkedTrack(box, tracks), null)
})
