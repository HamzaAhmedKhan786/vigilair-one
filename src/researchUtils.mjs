export function neighboringZones(sites, focusId, count = 4) {
  const focus = sites.find(site => site.site_id === focusId) ?? sites[0]
  if (!focus) return []
  return [...sites].sort((a, b) => {
    const da = (a.longitude - focus.longitude) ** 2 + (a.latitude - focus.latitude) ** 2
    const db = (b.longitude - focus.longitude) ** 2 + (b.latitude - focus.latitude) ** 2
    return da - db || a.site_id.localeCompare(b.site_id)
  }).slice(0, count).map(site => site.site_id)
}

export function compassPoint(degrees) {
  if (!Number.isFinite(degrees)) return '—'
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return names[Math.round(((degrees % 360) + 360) % 360 / 45) % 8]
}

export function fileKind(filename = '') {
  const extension = filename.split('.').pop()?.toLowerCase()
  if (['wav', 'mp3'].includes(extension)) return 'audio'
  if (['mp4', 'webm'].includes(extension)) return 'video'
  if (['jpg', 'jpeg', 'png'].includes(extension)) return 'image'
  return 'unsupported'
}
