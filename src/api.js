const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(4000), ...options, headers: { 'Content-Type': 'application/json', ...options.headers } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

export const api = {
  sites: () => request('/api/sites'),
  cameras: () => request('/api/cameras'),
  tracks: () => request('/api/tracks'),
  reset: () => request('/api/replay/reset', { method: 'POST' }),
  analytics: (id, site) => request(`/api/tracks/${encodeURIComponent(id)}/analytics?site_id=${encodeURIComponent(site)}`),
  globalTracks: () => request('/api/global-tracks'),
  globalTrack: id => request(`/api/global-tracks/${encodeURIComponent(id)}`),
  incident: id => request(`/api/incidents/${encodeURIComponent(id)}`),
  allocation: id => request(`/api/tracks/${encodeURIComponent(id)}/resource-allocation`),
  brief: id => request(`/api/tracks/${encodeURIComponent(id)}/brief`),
  decide: (id, decision) => request(`/api/tracks/${encodeURIComponent(id)}/decisions`, { method: 'POST', body: JSON.stringify(decision) }),
  researchScenario: () => request('/api/research/scenario'),
  researchModels: () => request('/api/research/models'),
  refreshResearchModels: () => request('/api/research/models/refresh', { method: 'POST' }),
  researchSensors: () => request('/api/research/sensors'),
  createResearchSensor: sensor => request('/api/research/sensors', { method: 'POST', body: JSON.stringify(sensor) }),
  deleteResearchSensor: id => request(`/api/research/sensors/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  researchMedia: () => request('/api/research/media'),
  researchMediaDetail: id => request(`/api/research/media/${encodeURIComponent(id)}`),
  researchVisualization: id => request(`/api/research/media/${encodeURIComponent(id)}/visualization`),
  researchAnnotate: (id, value) => request(`/api/research/media/${encodeURIComponent(id)}/annotations`, { method: 'POST', body: JSON.stringify(value) }),
  researchHealth: () => request('/api/research/health'),
}

export const researchContentUrl = id => `${BASE}/api/research/media/${encodeURIComponent(id)}/content`

export async function uploadResearchMedia(file, siteId, sensorId) {
  const params = new URLSearchParams({ filename: file.name, site_id: siteId, sensor_id: sensorId })
  const response = await fetch(`${BASE}/api/research/media?${params}`, {
    method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' },
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(detail.detail || `${response.status} ${response.statusText}`)
  }
  return response.json()
}
