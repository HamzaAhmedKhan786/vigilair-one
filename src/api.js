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
}
