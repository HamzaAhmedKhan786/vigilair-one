export function parseReplay(text) {
  const bundle = JSON.parse(text)
  if (!bundle || bundle.version !== 1 || !['yolo', 'manual'].includes(bundle.source) ||
      !/^[a-f0-9]{64}$/.test(bundle.video_sha256 ?? '') ||
      !Number.isFinite(bundle.fps) || bundle.fps <= 0 ||
      ![bundle.width, bundle.height].every(value => Number.isInteger(value) && value > 0) ||
      !Array.isArray(bundle.frames) || !bundle.frames.length) {
    throw new Error('Expected a version 1 YOLO or manual replay bundle.')
  }
  if (bundle.source === 'yolo' && !/^[a-f0-9]{64}$/.test(bundle.weights_sha256 ?? '')) {
    throw new Error('YOLO replay is missing its checkpoint digest.')
  }
  let previous = -1
  for (const frame of bundle.frames) {
    if (!Number.isInteger(frame.index) || frame.index <= previous ||
        !Number.isFinite(frame.offset_s) || Math.abs(frame.offset_s - frame.index / bundle.fps) > 1e-6 ||
        !Array.isArray(frame.boxes)) throw new Error('Replay frame timing is invalid.')
    previous = frame.index
    for (const box of frame.boxes) {
      const [left, top, right, bottom] = box.xyxy ?? []
      if (typeof box.label !== 'string' || !box.label.trim() ||
          ![left, top, right, bottom].every(Number.isFinite) ||
          !(0 <= left && left < right && right <= bundle.width &&
            0 <= top && top < bottom && bottom <= bundle.height) ||
          (bundle.source === 'yolo' && !(typeof box.confidence === 'number' && box.confidence >= 0 && box.confidence <= 1))) {
        throw new Error('Replay contains an invalid detection box.')
      }
    }
  }
  return { ...bundle, byIndex: new Map(bundle.frames.map(frame => [frame.index, frame])) }
}

export function frameAtTime(bundle, seconds) {
  return bundle.byIndex.get(Math.floor(seconds * bundle.fps + 1e-6)) ?? null
}

export function linkedTrack(box, tracks) {
  if (!box.track_id || !box.camera_id || !box.observation_timestamp) return null
  const track = tracks.find(item => item.track_id === box.track_id)
  const index = track?.observations.findIndex(item =>
    item.camera_id === box.camera_id &&
    (!box.site_id || item.site_id === box.site_id) &&
    Date.parse(item.timestamp) === Date.parse(box.observation_timestamp))
  return index >= 0 ? { id: track.track_id, index } : null
}
