import { siteBounds } from './selectors.mjs'

// Explicit demo placements, independent of operational geography. These IDs
// must never be interpreted as measured locations or used for sensor control.
export const DEMO_INCIDENT_SECTORS = Object.freeze({ 'VIG-042': 'FIC-10', 'VIG-038': 'FIC-17' })

export function incidentSectorId(trackId, sites) {
  const sectorId = DEMO_INCIDENT_SECTORS[trackId]
  return sites?.some(site => site.site_id === sectorId) ? sectorId : null
}

// Illustrative chart projection only: site-local meters are never treated as
// geographic coordinates or evidence of a track at the fictional sector.
export function incidentProjection(tracks, operationalSiteId, sites, radius) {
  if (!sites?.length || !radius) return []
  return tracks.flatMap(track => {
    const sectorId = incidentSectorId(track.track_id, sites)
    const fictionalCenter = sites.find(site => site.site_id === sectorId)
    if (!fictionalCenter) return []
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
    return [{ track_id: track.track_id, sector_id: sectorId, class_name: observations.at(-1).class_name,
      coordinates, source: 'illustrative_site_local_projection', observations }]
  })
}
