import { siteBounds } from './selectors.mjs'

// Illustrative chart projection only: site-local meters are never treated as
// geographic coordinates or evidence of a track at the fictional sector.
export function incidentProjection(tracks, operationalSiteId, fictionalCenter, radius) {
  if (!fictionalCenter || !radius) return []
  return tracks.flatMap(track => {
    const belongs = track.observations.some(item => item.site_id === operationalSiteId)
    if (!belongs) return []
    const observations = track.observations.filter(item => item.site_position_m &&
      (item.site_id === operationalSiteId || (item.source === 'synthetic' && !item.site_id)))
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    if (!observations.length) return []
    const coordinates = observations.map(item => {
      const [x, y] = item.site_position_m
      return [fictionalCenter.longitude + ((x - siteBounds.xmin) / (siteBounds.xmax - siteBounds.xmin) - .5) * radius * 1.2,
        fictionalCenter.latitude + ((y - siteBounds.ymin) / (siteBounds.ymax - siteBounds.ymin) - .5) * radius * 1.2]
    })
    return [{ track_id: track.track_id, class_name: observations.at(-1).class_name,
      coordinates, source: 'illustrative_site_local_projection', observations }]
  })
}
