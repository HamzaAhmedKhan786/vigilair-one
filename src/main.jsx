import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, AlertTriangle, Camera, Check, ChevronRight, CircleDot, Download, Eye, Focus, MapPin, Radio, ShieldCheck, Siren, X } from 'lucide-react'
import './styles.css'

const initialTracks = [
  { id: 'VIG-042', label: 'UAS / likely quadcopter', camera: 'CAM-02', zone: 'Fuel depot perimeter', risk: 86, status: 'Escalating', dwell: '03:12', speed: '4.8 m/s', direction: '→ restricted zone', points: '12 / 12' },
  { id: 'VIG-038', label: 'Bird / low confidence', camera: 'CAM-04', zone: 'North service road', risk: 18, status: 'Review', dwell: '00:08', speed: '11.2 m/s', direction: '↗ away from site', points: '4 / 12' },
]

function App() {
  const [tracks, setTracks] = useState(initialTracks)
  const [selected, setSelected] = useState('VIG-042')
  const [banner, setBanner] = useState('Live simulation · 4 camera feeds · 12 FPS edge pipeline')
  const active = useMemo(() => tracks.find(t => t.id === selected) ?? tracks[0], [tracks, selected])

  useEffect(() => {
    fetch('http://localhost:8000/api/replay/reset', { method: 'POST' })
      .then(() => fetch('http://localhost:8000/api/tracks'))
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(items => setTracks(items.map(item => {
        const last = item.observations[item.observations.length - 1]
        return { id: item.track_id, label: `${last.class_name} / live backend`, camera: last.camera_id, zone: item.risk.level === 'critical' ? 'Restricted-zone proximity' : 'North service road', risk: item.risk.score, status: item.risk.level === 'critical' ? 'Escalating' : 'Review', dwell: 'replay', speed: `${last.speed_mps} m/s`, direction: `heading ${last.heading_deg}°`, points: `${item.observations.length} observations` }
      })))
      .then(() => setBanner('Backend replay connected · live API data'))
      .catch(() => setBanner('Demo mode · backend unavailable, using local simulation'))
  }, [])

  const act = (message, id = selected) => {
    setBanner(message)
    setTracks(items => items.map(t => t.id === id ? { ...t, status: 'Operator action logged' } : t))
    fetch(`http://localhost:8000/api/tracks/${id}/decisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: message.includes('police') ? 'notify_police' : 'preserve_evidence', decision: message.includes('rejected') ? 'rejected' : message.includes('modified') ? 'modified' : 'accepted', operator_id: 'demo-operator', note: message }) }).catch(() => {})
  }

  const safeControl = (message) => setBanner(`${message} · observation-only control logged`)

  const exportReport = () => {
    const report = `VIGILAIR ONE INCIDENT REPORT\nTrack: ${active.id}\nRisk: ${active.risk}/100\nZone: ${active.zone}\nDwell: ${active.dwell}\nRecommendation: Notify police liaison; pause affected zone; preserve evidence.\nOperator decision: Accepted\nGenerated: ${new Date().toISOString()}`
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain' }))
    const a = document.createElement('a'); a.href = url; a.download = `${active.id}-incident-report.txt`; a.click(); URL.revokeObjectURL(url)
    setBanner('Timestamped incident report exported')
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">V</div><div><div className="brand-name">VIGILAIR<span>ONE</span></div><div className="tagline">NEUROMORPHIC AERIAL INTELLIGENCE</div></div></div><div className="top-status"><span className="pulse" /> SYSTEM ONLINE <span className="divider" /> SITE: BERLIN-BRANDENBURG <span className="divider" /> <span className="muted">25 NOV 2026 · 21:14:08 CET</span></div></header>
    <main>
      <section className="hero"><div><div className="eyebrow">OPERATIONS CONSOLE / DECISION SUPPORT ONLY</div><h1>Continuous awareness<br/><em>across every camera.</em></h1><p>Track, explain, and coordinate a response to aerial threats before a single frame becomes an incident.</p></div><div className="hero-meta"><div className="meta-card"><span>ACTIVE TRACKS</span><strong>02</strong></div><div className="meta-card"><span>CAMERAS</span><strong>04</strong></div><div className="meta-card"><span>EDGE LATENCY</span><strong>84<span>ms</span></strong></div></div></section>
      <div className="grid-layout">
        <section className="panel map-panel"><div className="panel-head"><div><div className="eyebrow">SITE OVERVIEW</div><h2>Brandenburg perimeter</h2></div><span className="live-chip"><Radio size={13}/> LIVE SIMULATION</span></div><div className="map"><div className="map-grid"/><div className="restricted"><span>RESTRICTED ZONE</span></div><div className="depot"><span>FUEL DEPOT</span></div><div className="route route-a"/><div className="route route-b"/>{tracks.map((t, i) => <button key={t.id} className={`track-dot track-${i} ${selected === t.id ? 'selected' : ''}`} onClick={() => setSelected(t.id)}><span>{t.id}</span></button>)}<div className="camera-pin pin-1"><Camera size={12}/> 01</div><div className="camera-pin pin-2"><Camera size={12}/> 02</div><div className="camera-pin pin-3"><Camera size={12}/> 03</div><div className="camera-pin pin-4"><Camera size={12}/> 04</div><div className="map-legend"><span><i className="dot red"/> high risk</span><span><i className="dot amber"/> review</span><span><i className="line"/> predicted path</span></div></div><div className="map-foot"><span><MapPin size={14}/> 52.3667° N, 13.5033° E</span><span>4 synchronized streams <ChevronRight size={14}/></span></div></section>
        <section className="panel alert-panel"><div className="panel-head"><div><div className="eyebrow">RISK INTELLIGENCE</div><h2>Why this matters</h2></div><div className="risk-score"><strong>{active.risk}</strong><span>/ 100 RISK</span></div></div><div className="risk-bar"><span style={{width:`${active.risk}%`}}/></div><div className="signal-list"><Signal title="Dwell time" value={active.dwell} detail="threshold exceeded" high/><Signal title="Trajectory" value={active.direction} detail="restricted zone vector" high/><Signal title="Object confidence" value={active.id === 'VIG-042' ? '91%' : '34%'} detail={active.id === 'VIG-042' ? 'drone morphology' : 'bird-like motion'}/></div><div className="explain"><Activity size={16}/><span>Risk is explainable: dwell time + directional change + geofence proximity. No autonomous action is taken.</span></div></section>
      </div>
      <section className="panel tracks-panel"><div className="panel-head"><div><div className="eyebrow">TRACK MANAGER</div><h2>Persistent targets</h2></div><div className="stream-status"><CircleDot size={14}/> ingesting 4 feeds</div></div><div className="track-table"><div className="table-row table-head"><span>TRACK</span><span>CLASSIFICATION</span><span>CAMERA / ZONE</span><span>BEHAVIOUR</span><span>STATUS</span></div>{tracks.map(t => <button className={`table-row ${selected === t.id ? 'active' : ''}`} key={t.id} onClick={() => setSelected(t.id)}><span className="track-name"><span className={`track-icon ${t.risk > 50 ? 'red-bg' : 'amber-bg'}`}><Siren size={14}/></span><strong>{t.id}</strong></span><span>{t.label}</span><span>{t.camera}<small>{t.zone}</small></span><span><strong>{t.dwell}</strong> dwell · {t.speed}<small>{t.direction}</small></span><span><b className={t.risk > 50 ? 'status-red' : 'status-amber'}>{t.status}</b></span></button>)}</div></section>
      <section className="panel fusion-panel"><div className="panel-head"><div><div className="eyebrow">MULTI-SENSOR CORROBORATION</div><h2>Evidence confidence</h2></div><span className="live-chip"><span className="pulse"/> FUSION ACTIVE</span></div><div className="fusion-grid"><div className="fusion-card strong"><span>CAMERA VISION</span><strong>{active.id === 'VIG-042' ? '91%' : '34%'}</strong><small>CAM-02 · morphology + trajectory</small></div><div className="fusion-card"><span>ACOUSTIC</span><strong>{active.id === 'VIG-042' ? '62%' : '18%'}</strong><small>MIC-ARRAY-01 · rotor-band evidence</small></div><div className="fusion-card"><span>RADAR / RID</span><strong>{active.id === 'VIG-042' ? '86%' : '—'}</strong><small>{active.id === 'VIG-042' ? 'corroborated · 184 m range' : 'no match available'}</small></div><div className="fusion-card"><span>DATA QUALITY</span><strong>94%</strong><small>3 online · 1 degraded stream</small></div></div><div className="fusion-foot"><span>Low-noise mode: weak audio is down-weighted, not treated as proof.</span><span>fused confidence <b>{active.id === 'VIG-042' ? '88%' : '34%'}</b></span></div></section>
      <section className="bottom-grid"><div className="panel actions-panel"><div className="panel-head"><div><div className="eyebrow">HUMAN-IN-THE-LOOP</div><h2>Recommended response</h2></div><span className="review-chip">REVIEW REQUIRED</span></div><div className="recommendation"><div className="recommendation-icon"><ShieldCheck size={22}/></div><div><strong>Escalate to site security lead</strong><p>Notify the police liaison, pause operations in the affected zone, and preserve the camera evidence package.</p><div className="reason-tags"><span>+ high dwell</span><span>+ restricted vector</span><span>+ high confidence</span></div></div></div><div className="action-row"><button className="primary" onClick={() => act('Recommendation accepted · police liaison notification simulated')}><Check size={16}/> ACCEPT & LOG</button><button onClick={() => act('Recommendation modified · site security lead selected')}><ChevronRight size={16}/> MODIFY</button><button onClick={() => act('Recommendation rejected by operator')}><X size={16}/> REJECT</button></div></div><div className="panel evidence-panel"><div className="panel-head"><div><div className="eyebrow">EVIDENCE & HANDOFF</div><h2>Incident package</h2></div><Download size={18}/></div><div className="evidence-items"><div><span>TRACK PATH</span><strong>12 observations · 03:12</strong></div><div><span>CAMERA CLIPS</span><strong>CAM-01 → CAM-02 → CAM-03</strong></div><div><span>AUDIT TRAIL</span><strong>Operator review required</strong></div></div><button className="export" onClick={exportReport}><Download size={15}/> EXPORT TIMESTAMPED REPORT</button></div></section>
      <section className="panel control-panel"><div className="panel-head"><div><div className="eyebrow">SAFE OBSERVATION CONTROLS</div><h2>Track {active.id}</h2></div><span className="review-chip">NO PHYSICAL CONTROL LINK</span></div><div className="safe-controls"><button onClick={() => safeControl(`Focused ${active.camera} feed`)}><Focus size={16}/> FOCUS CAMERA</button><button onClick={() => safeControl('Evidence replay queued')}><Eye size={16}/> REPLAY EVIDENCE</button><button onClick={() => safeControl('Operator summary requested')}><Activity size={16}/> REQUEST SUMMARY</button><button onClick={() => safeControl('Track annotation saved')}><MapPin size={16}/> ANNOTATE TRACK</button></div><div className="control-notice"><ShieldCheck size={15}/> Monitoring and coordination only. The app cannot pilot, redirect, disable, intercept, or physically respond to a drone.</div></section>
      </main><footer><span>{banner}</span><span><span className="pulse"/> policy engine ready · no physical control link</span></footer>
  </div>
}
function Signal({title,value,detail,high}) { return <div className="signal"><span className="signal-title">{title}</span><strong className={high ? 'high' : ''}>{value}</strong><small>{detail}</small></div> }
createRoot(document.getElementById('root')).render(<App />)
