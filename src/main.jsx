import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertTriangle, Camera, Check, ChevronDown, Clock3, Download, Eye, MapPin, Pause, Play, Radio, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { api } from './api'
import { detectionStatus, visibleForecast } from './selectors.mjs'
import { RegionalTracks } from './RegionalTracks'
import { ThermalEvidence } from './ThermalEvidence'
import { AnnotatedVideo } from './AnnotatedVideo'
import { useConsoleData } from './useConsoleData'
import { decisionPayload, demoFrame, demoZones, fallbackSites, fallbackCameras, latest, observationsForSite, pointFor, siteBounds, sortTracks } from './scenario'
import './styles.css'
import './console-layout.css'

const TABS = ['Overview', 'Video replay', 'Analytics', 'Evidence', 'Incident history', 'Model evaluation', 'System health']
const time = value => value ? new Date(value).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false }) + ' UTC' : '—'
const label = value => value?.replaceAll('_', ' ') ?? '—'

function Panel({ title, eyebrow, aside, children, className = '' }) {
  return <section className={'panel ' + className}><div className="panel-heading"><div><small>{eyebrow}</small><h2>{title}</h2></div>{aside}</div>{children}</section>
}
function Badge({ children, tone = 'neutral' }) { return <span className={'badge ' + tone}>{children}</span> }
function Metric({ label: name, value, tone }) { return <div className="metric"><small>{name}</small><strong className={tone || ''}>{value}</strong></div> }

function SiteMap({ tracks, selectedId, selectedObservation, onSelectObservation, zones, forecast }) {
  return <Panel className="map-panel" eyebrow="SYNTHETIC SCENARIO · SITE COORDINATES" title="Perimeter overview" aside={<Badge tone="cyan">Advisory view</Badge>}>
    <div className="map-canvas" role="group" aria-label="Synthetic site map">
      {zones.map(zone => {
        const corners = zone.polygon_m.map(site_position_m => pointFor({ site_position_m }, siteBounds))
        const left = Math.min(...corners.map(p => p.x)), top = Math.min(...corners.map(p => p.y))
        const width = Math.max(...corners.map(p => p.x)) - left, height = Math.max(...corners.map(p => p.y)) - top
        return <div key={zone.zone_id} className={'zone ' + (zone.severity === 'critical' ? 'restricted-zone' : 'fuel-zone')} style={{ left: left + '%', top: top + '%', width: width + '%', height: height + '%' }}>{zone.name}</div>
      })}
      <svg className="map-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {forecast && <polyline className="forecast-path" points={forecast.points.map(site_position_m => pointFor({ site_position_m }, siteBounds)).map(point => point.x + "," + point.y).join(" ")} /> }
        {tracks.map(track => {
          const points = track.observations.map(o => pointFor(o, siteBounds)).filter(Boolean)
          return <polyline key={track.track_id} points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={'var(--' + (detectionStatus(latest(track)?.class_name).tone === 'neutral' ? 'muted' : detectionStatus(latest(track)?.class_name).tone) + ')'} strokeWidth=".65" strokeDasharray={track.track_id === selectedId ? 'none' : '1.3 1.3'} />
        })}
      </svg>
      {tracks.map(track => track.observations.map((observation, index) => {
        const point = pointFor(observation, siteBounds); if (!point) return null
        return <button type="button" key={track.track_id + index} className={'map-point ' + ('tone-' + detectionStatus(observation.class_name, observation.confidence).tone) + (selectedObservation?.timestamp === observation.timestamp && selectedId === track.track_id ? ' active' : '')} style={{ left: `${point.x}%`, top: `${point.y}%` }} aria-label={`Inspect ${track.track_id} observation at ${time(observation.timestamp)}`} onClick={() => onSelectObservation(track.track_id, index)}><span>{index === track.observations.length - 1 ? track.track_id : ''}</span></button>
      }))}
      <div className="map-scale">LOCAL SITE METERS · 0–220 E / 0–230 N</div>
    </div>
    <div className="legend"><span><i className="swatch amber" /> drone candidate</span><span><i className="swatch green" /> wildlife</span><span><i className="swatch cyan" /> other airborne objects</span><span>Solid · observed</span><span className="forecast-key">{forecast ? "Dashed · " + forecast.horizon + " s " + (forecast.synthetic ? "replay estimate" : "estimated path") : "Forecast unavailable for this observation"}</span></div>
  </Panel>
}

function IncidentQueue({ tracks, selectedId, onInspect, onDecision, busy }) {
  return <Panel className="queue-panel" eyebrow="SORTED BY RISK" title="Incident queue" aside={<Badge tone="amber">{tracks.length} tracks</Badge>}>
    <div className="queue-list">{tracks.length ? tracks.map(track => {
      const observation = latest(track)
      return <article className={'queue-item ' + (selectedId === track.track_id ? 'selected' : '')} key={track.track_id}>
        <div className="queue-title"><strong>{track.track_id} · {observation?.class_name?.toUpperCase() || 'UNKNOWN'}</strong><Badge tone={track.risk.score >= 50 ? 'amber' : 'cyan'}>{track.risk.score}/100</Badge></div>
        <div className="queue-tags"><Badge tone={detectionStatus(observation?.class_name, observation?.confidence).tone}>{detectionStatus(observation?.class_name, observation?.confidence).label}</Badge></div>
        <p>{track.risk.reasons?.slice(0, 2).join(' · ') || 'No risk reasons available'}</p><div className="queue-meta">{observation?.camera_id} · {time(observation?.timestamp)} · {Math.round((observation?.confidence || 0) * 100)}% confidence</div>
        <div className="queue-actions"><button onClick={() => onInspect(track.track_id)}><Eye size={13}/> Inspect</button><button disabled={busy} onClick={() => onDecision(track, 'accepted')}>Accept</button><button disabled={busy} onClick={() => onDecision(track, 'rejected')}>Reject</button><button disabled={busy} onClick={() => onDecision(track, 'modified')}>Modify</button></div>
      </article>
    }) : <p className="empty">No tracks for this site.</p>}</div>
  </Panel>
}

function CameraReplay({ observation, cameras, playing, setPlaying, frameIndex, setFrameIndex, track }) {
  const points = track?.observations || []
  const age = observation ? (Date.now() - Date.parse(observation.timestamp)) / 1000 : NaN
  const ageLabel = observation?.source === 'synthetic' ? 'Synthetic replay'
    : Number.isFinite(age) && age >= 0 ? `${Math.floor(age)} s` : 'Unavailable'
  return <Panel eyebrow="ILLUSTRATIVE FRAME · SYNTHETIC" title="Camera replay" aside={<Badge tone="cyan">{observation?.camera_id || 'No camera'}</Badge>}>
    <div className="replay-body">
    <div className="feed"><img src={demoFrame.asset} alt="Synthetic night CCTV scene with a drone and bird" /><span className="feed-stamp">{time(observation?.timestamp)} · SYNTHETIC</span>{observation && demoFrame.annotations.filter(item => item.class_name === observation.class_name).map(item => <span key={item.class_name} className={'feed-box ' + (item.class_name === 'bird' ? 'bird' : 'drone')} style={{ left: `${item.bbox_xyxy[0] / demoFrame.width * 100}%`, top: `${item.bbox_xyxy[1] / demoFrame.height * 100}%`, width: `${(item.bbox_xyxy[2] - item.bbox_xyxy[0]) / demoFrame.width * 100}%`, height: `${(item.bbox_xyxy[3] - item.bbox_xyxy[1]) / demoFrame.height * 100}%` }}>{track?.track_id} · {Math.round(observation.confidence * 100)}%</span>)}</div>
    <div className="replay-details">
    <div className="transport"><button onClick={() => { setPlaying(!playing) }} disabled={points.length < 2} aria-label={playing ? 'Pause replay' : 'Play replay'}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button><input aria-label="Replay observation" type="range" min="0" max={Math.max(0, points.length - 1)} value={Math.min(frameIndex, Math.max(0, points.length - 1))} onChange={event => { setPlaying(false); setFrameIndex(Number(event.target.value)) }}/><span>{points.length ? Math.min(frameIndex + 1, points.length) : 0}/{points.length}</span></div>
    <div className="detail-grid"><Metric label="CLASS" value={observation?.class_name || '—'}/><Metric label="CONFIDENCE" value={observation ? `${Math.round(observation.confidence * 100)}%` : '—'}/><Metric label="CAMERA" value={observation?.camera_id || '—'}/><Metric label="SOURCE" value={observation?.source || '—'}/></div>
    <div className="detail-grid">
      <Metric label="SPEED" value={observation?.speed_mps != null ? observation.speed_mps + " m/s" : "—"}/>
      <Metric label="HEADING" value={observation?.heading_deg != null ? observation.heading_deg + "°" : "—"}/>
      <Metric label="ALTITUDE" value={observation?.altitude_m != null ? observation.altitude_m + " m" : "—"}/>
      <Metric label="LAT / LON" value={observation?.latitude != null && observation?.longitude != null ? observation.latitude.toFixed(5) + ", " + observation.longitude.toFixed(5) : "—"}/>
    </div>
    <div className="detail-grid">
      <Metric label="OBSERVATION AGE" value={ageLabel}/>
      <Metric label="POSITION UNCERTAINTY" value={observation?.position_uncertainty_m != null ? `${observation.position_uncertainty_m} m` : 'Unavailable'}/>
    </div>
    <div className="camera-availability">{cameras.map(camera => <span key={camera.camera_id} className={camera.camera_id === observation?.camera_id ? 'current' : ''}><Camera size={12}/>{camera.camera_id} <i>{camera.status}</i></span>)}</div>
    </div></div>
  </Panel>
}

function Review({ track, incident, analytics, allocation, onDecision, busy, notice }) {
  return <Panel eyebrow="HUMAN REVIEW REQUIRED" title="Operator decision" aside={<ShieldCheck size={18} color="var(--cyan)"/>}>
    <div className="review-body"><h3>{track?.track_id || 'Select a track'}</h3><p>{track?.risk?.reasons?.join(' · ') || 'No assessment available.'}</p>
      <div className="decision-actions"><button className="primary" disabled={!track || busy} onClick={() => onDecision(track, 'accepted')}><Check size={14}/> Accept</button><button disabled={!track || busy} onClick={() => onDecision(track, 'modified')}>Modify</button><button disabled={!track || busy} onClick={() => onDecision(track, 'rejected')}><X size={14}/> Reject</button></div>
      <div className="review-metrics"><Metric label="PATH" value={analytics ? `${analytics.path_length_m} m` : 'Unavailable'}/><Metric label="ZONE DISTANCE" value={analytics?.distance_to_restricted_zone_m != null ? `${analytics.distance_to_restricted_zone_m} m` : 'Unavailable'}/><Metric label="BEHAVIOR" value={analytics?.behaviors?.map(label).join(', ') || 'Unavailable'}/></div>
      <div className="recommendations"><small>RECOMMENDED · SIMULATED</small><p>{track?.risk?.recommended_actions?.map(label).join(' · ') || 'No recommendations'}</p><p>{allocation?.allocations?.map(a => a.resource_id).join(' · ') || 'Observation resources unavailable'}</p></div>
      {notice && <p className="notice" role="status">{notice}</p>}<small className="muted">Logged decisions: {incident?.decisions?.length ?? 'unavailable'} · no physical control link</small>
    </div>
  </Panel>
}

function Secondary({ tab, track, analytics, incident, cameras, status, mode, updatedAt, onExport }) {
  if (tab === 'Analytics') return <div className="secondary-grid"><Panel eyebrow="TRACK KINEMATICS" title="Trajectory analytics"><div className="detail-grid large"><Metric label="PATH LENGTH" value={analytics ? `${analytics.path_length_m} m` : 'Unavailable'}/><Metric label="DISPLACEMENT" value={analytics ? `${analytics.displacement_m} m` : 'Unavailable'}/><Metric label="SPEED" value={analytics ? `${analytics.current_speed_mps} m/s` : 'Unavailable'}/><Metric label="HEADING" value={analytics ? `${analytics.heading_deg}°` : 'Unavailable'}/><Metric label="LOITER / DWELL" value={analytics ? `${analytics.dwell_seconds} s` : 'Unavailable'}/><Metric label="ZONE ETA" value={analytics?.eta_to_restricted_zone_s != null ? `${analytics.eta_to_restricted_zone_s} s` : 'Unavailable'}/></div><p className="muted padded">Metrics use synthetic site coordinates. Camera calibration and uncertainty need field validation.</p></Panel><Panel eyebrow="SENSOR FUSION" title="Evidence sources"><p className="padded">Video classification and confidence are available in the replay scenario. Acoustic, radar, thermal and Remote ID fixtures exist but are not synchronized into a measured fused score here.</p></Panel></div>
  if (tab === 'Evidence') return <Panel eyebrow="TIMESTAMPED HANDOFF" title="Evidence package" aside={<button disabled={!incident} onClick={onExport}><Download size={14}/> Export JSON</button>}><pre>{JSON.stringify(incident || { state: 'Incident unavailable' }, null, 2)}</pre></Panel>
  if (tab === 'Incident history') return <Panel eyebrow="OPERATOR AUDIT" title="Decision history">{incident?.decisions?.length ? incident.decisions.map((d, i) => <div className="history-row" key={i}><Badge tone="cyan">{d.decision}</Badge><span>{label(d.action)}</span><span>{time(d.decided_at)}</span><span>{d.note}</span></div>) : <p className="empty">No recorded decisions for this track.</p>}</Panel>
  if (tab === 'Model evaluation') return <div className="secondary-grid"><Panel eyebrow="DETECTOR OUTPUT" title="YOLO / vision results"><p className="padded">The synthetic scenario contains labeled detection confidence. A trained detector has not been run on this image.</p><div className="detail-grid"><Metric label="SCENARIO CLASS" value={latest(track)?.class_name || '—'}/><Metric label="SCENARIO CONFIDENCE" value={latest(track) ? `${Math.round(latest(track).confidence * 100)}%` : '—'}/><Metric label="PRECISION / RECALL" value="Unavailable"/><Metric label="MODEL VERSION" value="Unavailable"/></div></Panel><Panel eyebrow="EXPERIMENTAL · NOT INTEGRATED" title="SNN evaluation"><p className="padded">No SNN predictions or benchmarks are available. Reserve this panel for future event stream experiments with measured latency, power and accuracy.</p></Panel></div>
  return <Panel eyebrow="SITE TELEMETRY" title="System health"><div className="detail-grid large"><Metric label="API" value={status}/><Metric label="DATA MODE" value={mode}/><Metric label="LAST SYNC" value={updatedAt ? new Date(updatedAt).toLocaleTimeString() : 'Never'}/><Metric label="CAMERAS CONFIGURED" value={cameras.length}/></div><p className="padded muted">Camera availability comes from configuration. Live stream health and latency are unavailable until hardware is connected.</p></Panel>
}

function App() {
  const consoleData = useConsoleData()
  const [siteId, setSiteId] = useState('berlin-brandenburg-demo')
  const [selectedId, setSelectedId] = useState('VIG-042')
  const [tab, setTab] = useState('Overview')
  const [frameIndex, setFrameIndex] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [incident, setIncident] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [allocation, setAllocation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [review, setReview] = useState(null)
  const [videoEvidence, setVideoEvidence] = useState(null)
  const tracks = useMemo(() => sortTracks(observationsForSite(consoleData.tracks, siteId)), [consoleData.tracks, siteId])
  const track = tracks.find(t => t.track_id === selectedId) || tracks[0]
  const observation = (frameIndex == null ? null : track?.observations[frameIndex]) || latest(track)
  const replayIndex = frameIndex ?? Math.max(0, (track?.observations.length ?? 1) - 1)
  const forecast = visibleForecast(analytics, observation, consoleData.status === "connected")
  const selectObservation = (id, index) => { setSelectedId(id); setFrameIndex(index); setPlaying(false) }
  useEffect(() => { if (!playing || !track) return; const timer = setInterval(() => setFrameIndex(index => ((index ?? -1) + 1) % track.observations.length), 900); return () => clearInterval(timer) }, [playing, track])
  useEffect(() => { if (consoleData.status !== 'connected' || !track) { setIncident(null); setAnalytics(null); setAllocation(null); return }; let active = true; Promise.allSettled([api.incident(track.track_id), api.analytics(track.track_id, siteId), api.allocation(track.track_id)]).then(results => { if (!active) return; setIncident(results[0].status === 'fulfilled' ? results[0].value : null); setAnalytics(results[1].status === 'fulfilled' ? results[1].value : null); setAllocation(results[2].status === 'fulfilled' ? results[2].value : null) }); return () => { active = false } }, [track?.track_id, siteId, consoleData.status, consoleData.updatedAt])
  const inspect = id => { selectObservation(id, Math.max(0, (tracks.find(item => item.track_id === id)?.observations.length ?? 1) - 1)); setTab('Overview'); setNotice('') }
  const beginReview = (target, decision) => {
    const actions = target.risk.recommended_actions ?? []
    setReview({ id: target.track_id, decision, actions, action: actions[0] ?? '', note: '' })
    selectObservation(target.track_id, null)
    setNotice('')
  }
  async function saveReview(event) {
    event.preventDefault()
    if (!review?.action || (review.decision === 'modified' && !review.note.trim())) return
    setBusy(true)
    try {
      await api.decide(review.id, decisionPayload(review.decision, review.action, review.note.trim()))
      setReview(null)
      setNotice(`Decision recorded for ${review.id}.`)
      void consoleData.refresh()
    } catch (error) {
      setNotice(`Decision could not be recorded: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }
  const report = incident?.track_id === track?.track_id && incident
    ? { ...incident, ...(videoEvidence?.linked_track_id === track?.track_id && track.observations.some(item =>
      item.camera_id === videoEvidence.camera_id && Date.parse(item.timestamp) === Date.parse(videoEvidence.observation_timestamp))
      ? { video_evidence: videoEvidence } : {}) }
    : null
  const exportReport = () => { if (!report) return; const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${report.incident_id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
  return <div className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark">V</span><div><strong>VIGILAIR<span>ONE</span></strong><small>Beyond Detection. Continuous Awareness.</small></div></div><div className="topbar-right"><Badge tone={consoleData.status === 'connected' ? 'green' : 'amber'}><Radio size={12}/>{consoleData.status}</Badge><span>DECISION SUPPORT ONLY</span></div></header>
    <main className="workspace"><div className="toolbar"><div className="toolbar-title"><small>OPERATIONS CONSOLE</small><h1>Regional awareness</h1></div><label className="site-select"><MapPin size={15}/><select aria-label="Select site" value={siteId} onChange={event => (setSiteId(event.target.value), selectObservation(null, null))}>{consoleData.sites.map(site => <option key={site.site_id} value={site.site_id}>{site.name}</option>)}</select><ChevronDown size={14}/></label><Badge tone="cyan">{consoleData.mode.toUpperCase()}</Badge><span className="toolbar-stat"><Camera size={15}/>{consoleData.cameras.filter(c => c.status === 'online').length}/{consoleData.cameras.length} cameras configured</span><button onClick={() => consoleData.refresh()} aria-label="Refresh data"><RefreshCw size={15}/></button><button className="replay-reset" onClick={() => consoleData.reset().then(() => setNotice('Synthetic replay loaded')).catch(e => setNotice(`Replay unavailable: ${e.message}`))}><Play size={14}/> Load replay</button></div>
      {consoleData.status !== 'connected' && <div className="state-banner" role="status"><AlertTriangle size={15}/>{consoleData.status === 'loading' ? 'Connecting to API…' : consoleData.status === 'stale' ? 'API data is stale. Last known data shown.' : 'API disconnected. Synthetic local scenario shown; decisions cannot be recorded.'}{consoleData.error && <span>{consoleData.error}</span>}</div>}
      <nav className="tabs" aria-label="Console sections">{TABS.map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)} aria-current={tab === item ? 'page' : undefined}>{item}</button>)}</nav>
      {tab === 'Overview' ? <><div className="primary-grid"><SiteMap forecast={forecast} tracks={tracks} selectedId={track?.track_id} selectedObservation={observation} onSelectObservation={selectObservation} zones={siteId === fallbackSites[0].site_id ? demoZones : []}/><IncidentQueue tracks={tracks} selectedId={track?.track_id} onInspect={inspect} onDecision={beginReview} busy={busy}/></div><div className="lower-grid"><CameraReplay observation={observation} track={track} cameras={consoleData.cameras.length ? consoleData.cameras : fallbackCameras} playing={playing} setPlaying={setPlaying} frameIndex={replayIndex} setFrameIndex={setFrameIndex}/><Review track={track} incident={incident} analytics={analytics} allocation={allocation} onDecision={beginReview} busy={busy} notice={notice}/></div><RegionalTracks sites={consoleData.sites} siteId={siteId} localTrackId={track?.track_id} status={consoleData.status} updatedAt={consoleData.updatedAt} onInspectSite={(site, id) => { setSiteId(site); selectObservation(id, null) }}/><ThermalEvidence observation={observation}/></> : tab !== 'Video replay' ? <Secondary tab={tab} track={track} analytics={analytics} incident={report} cameras={consoleData.cameras} status={consoleData.status} mode={consoleData.mode} updatedAt={consoleData.updatedAt} onExport={exportReport}/> : null}
      <div hidden={tab !== 'Video replay'}><AnnotatedVideo active={tab === 'Video replay'} tracks={tracks} onSelectObservation={selectObservation} onEvidence={setVideoEvidence}/>{videoEvidence && <p className="padded" role="status">Evidence selected · frame {videoEvidence.frame} · {videoEvidence.linked_track_id || 'No verified track link'}</p>}</div>
      {review && <form className="panel review-form" onSubmit={saveReview} aria-label="Record operator decision">
        <strong>{label(review.decision)} · {review.id}</strong>
        <label>Recommendation <select required value={review.action} onChange={event => setReview({ ...review, action: event.target.value })}>
          <option value="" disabled>Choose a recommendation</option>
          {review.actions.map(action => <option key={action} value={action}>{label(action)}</option>)}
        </select></label>
        <label>Operator note <input maxLength={500} value={review.note} required={review.decision === 'modified'}
          onChange={event => setReview({ ...review, note: event.target.value })}/></label>
        <button disabled={busy || !review.action || consoleData.status !== 'connected'}>Record decision</button>
        <button type="button" disabled={busy} onClick={() => setReview(null)}>Cancel</button>
      </form>}
      <footer><span><ShieldCheck size={14}/> Advisory only · human review required</span><span><Clock3 size={14}/> {consoleData.updatedAt ? `Updated ${new Date(consoleData.updatedAt).toLocaleTimeString()}` : 'Local synthetic scenario'}</span></footer>
    </main></div>
}
createRoot(document.getElementById('root')).render(<App />)
