import React, { useEffect, useState } from 'react'
import { api } from './api'

export function RegionalTracks({ sites, siteId, localTrackId, status, updatedAt, onInspectSite }) {
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState('')

  useEffect(() => {
    if (status !== 'connected') return
    let active = true
    async function refresh() {
      try {
        const summaries = await api.globalTracks()
        const current = summaries.find(item => item.global_track_id === selected)
          ?? summaries.find(item => item.latest.site_id === siteId && item.latest.local_track_id === localTrackId)
          ?? summaries[0]
        const detail = current ? await api.globalTrack(current.global_track_id) : null
        if (active) setResult({ summaries, detail })
      } catch {
        if (active) setResult({ error: true })
      }
    }
    refresh()
    return () => { active = false }
  }, [status, updatedAt, selected, siteId, localTrackId])

  const observations = result?.detail?.observations ?? []
  const history = observations.slice(-20).reverse()
  return <section className="panel regional-panel" aria-label="Regional track history">
    <div className="panel-heading">
      <div><small>MULTISITE</small><h2>Regional track history</h2></div>
      {status === 'connected' && result?.summaries?.length > 0 &&
        <select className="regional-select" aria-label="Global track" value={result.detail?.global_track_id || ''}
          onChange={event => setSelected(event.target.value)}>
          {result.summaries.map(item => <option key={item.global_track_id}>{item.global_track_id}</option>)}
        </select>}
    </div>
    {status !== 'connected' ? <p className="empty">Regional feed unavailable.</p>
      : !result ? <p className="empty">Loading regional tracks…</p>
      : result.error ? <p className="empty">Could not refresh regional tracks.</p>
      : history.length === 0 ? <p className="empty">No global tracks reported.</p>
      : <><p className="regional-note">Latest {history.length} of {observations.length} reports. Site changes can include gaps in coverage.</p>
        <div className="regional-scroll"><table>
          <thead><tr><th>Site</th><th>Observed (UTC)</th><th>Local track</th><th>Latitude / longitude</th><th>Association</th></tr></thead>
          <tbody>{history.map((item, index) => {
            const name = sites.find(site => site.site_id === item.site_id)?.name ?? item.site_id
            const state = item.handoff_status
            return <tr key={item.timestamp + ':' + index}>
              <td>{state === 'confirmed' ? <button type="button" onClick={() => onInspectSite(item.site_id, item.local_track_id)}>{name}</button> : name}</td>
              <td>{new Date(item.timestamp).toISOString().replace('T', ' ').replace('Z', '')}</td>
              <td>{item.local_track_id}</td>
              <td>{item.position.latitude.toFixed(5)}, {item.position.longitude.toFixed(5)}</td>
              <td><span className={`badge ${state === 'confirmed' ? 'green' : state === 'candidate' ? 'amber' : 'neutral'}`}>{state}</span></td>
            </tr>
          })}</tbody>
        </table></div></>}
  </section>
}
