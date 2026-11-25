export function sortTracks(tracks) { return [...tracks].sort((a, b) => b.risk.score - a.risk.score || a.track_id.localeCompare(b.track_id)) }
export function observationsForSite(tracks, siteId) {
  return tracks.flatMap(track => {
    const observations = track.observations.filter(observation => observation.site_id === siteId)
    observations.sort((first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp))
    return observations.length ? [{ ...track, observations }] : []
  })
}
export function latest(track) { return track?.observations.at(-1) }
export function detectionStatus(className, confidence) {
  const kind = String(className ?? '').trim().toLowerCase()
  if (['bird', 'birds', 'wildlife'].includes(kind)) {
    return { tone: 'green', label: confidence >= .75 ? 'Wildlife' : 'Wildlife candidate' }
  }
  if (['drone', 'uav', 'uas', 'quadcopter'].includes(kind)) {
    return { tone: 'amber', label: 'Drone candidate' }
  }
  if (['aircraft', 'airplane', 'helicopter', 'balloon', 'kite'].includes(kind)) {
    return { tone: 'cyan', label: 'Other airborne object' }
  }
  return { tone: 'neutral', label: 'Unclassified' }
}
export const siteBounds = { xmin: 0, xmax: 220, ymin: 0, ymax: 230 }
export function pointFor(observation, bounds) {
  if (!observation?.site_position_m) return null
  const [x, y] = observation.site_position_m
  return { x: ((x - bounds.xmin) / (bounds.xmax - bounds.xmin)) * 100, y: 100 - ((y - bounds.ymin) / (bounds.ymax - bounds.ymin)) * 100 }
}
export function decisionPayload(decision, action, note = '') { return { action, decision, operator_id: 'demo-operator', note: note || null } }

export function visibleForecast(analytics, observation, connected, now = Date.now()) {
  const anchor = analytics?.forecast_anchor
  if (!connected || !anchor || !observation || analytics.metric_observation_count < 2) return null
  if (anchor.track_id !== observation.track_id || anchor.site_id !== observation.site_id ||
      Date.parse(anchor.timestamp) !== Date.parse(observation.timestamp)) return null
  const age = now - Date.parse(anchor.timestamp)
  const synthetic = anchor.source === 'synthetic'
  if (!synthetic && (!Number.isFinite(age) || age < 0 || age > 15000)) return null
  const points = [anchor.site_position_m, ...analytics.predicted_path_m]
  return { points, synthetic, horizon: analytics.forecast_horizon_seconds }
}
