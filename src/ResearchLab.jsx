import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AudioLines, Camera, FileAudio, FileImage, FileVideo, Pause, Play, RefreshCw, Upload } from 'lucide-react'
import { api, researchContentUrl, uploadResearchMedia } from './api'
import { HybridEvaluation } from './HybridEvaluation'
import { ResearchMap } from './ResearchMap'
import { compassName, fileKind, neighboringZones } from './researchUtils.mjs'
import './research.css'

function Section({ eyebrow, title, aside, children, className = '' }) {
  return <section className={`panel research-section ${className}`}><div className="panel-heading"><div><small>{eyebrow}</small><h2>{title}</h2></div>{aside}</div>{children}</section>
}

function MiniLine({ values, color = 'var(--olive)' }) {
  if (!values?.length) return <p className="research-empty">No measured samples yet.</p>
  const min = Math.min(...values), max = Math.max(...values), range = Math.max(max - min, 1e-9)
  const points = values.map((value, index) => `${index / Math.max(1, values.length - 1) * 100},${42 - (value - min) / range * 37}`).join(' ')
  return <svg className="research-chart" viewBox="0 0 100 45" preserveAspectRatio="none" role="img" aria-label="Audio feature plot"><polyline points={points} fill="none" stroke={color} strokeWidth="1.3" vectorEffect="non-scaling-stroke" /></svg>
}

function MelHeatmap({ rows }) {
  const canvas = useRef(null)
  useEffect(() => {
    if (!rows?.length || !canvas.current) return
    const context = canvas.current.getContext('2d')
    const height = rows.length, width = rows[0]?.length ?? 0
    if (!width) return
    const maximum = Math.max(...rows.flat())
    const cellWidth = canvas.current.width / width, cellHeight = canvas.current.height / height
    rows.forEach((row, y) => row.forEach((value, x) => {
      const intensity = Math.max(0, Math.min(1, (value - maximum + 80) / 80))
      context.fillStyle = `hsl(${180 - intensity * 142} 42% ${12 + intensity * 64}%)`
      context.fillRect(x * cellWidth, (height - y - 1) * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight))
    }))
  }, [rows])
  return <canvas ref={canvas} width="560" height="175" className="research-mel" role="img" aria-label="Log-Mel spectrogram computed from uploaded WAV" />
}

const statusLabel = { missing: 'Missing artifacts', incompatible: 'Package incomplete', package_complete_unverified: 'Package verified · inference untested' }

export function ResearchLab({ theme }) {
  const [state, setState] = useState({ loading: true, scenario: null, models: null, sensors: [], media: [], health: null, error: '' })
  const [focus, setFocus] = useState(null)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [renderMs, setRenderMs] = useState(null)
  const frameStarted = useRef(null)
  const [selectedMediaId, setSelectedMediaId] = useState(null)
  const [visualization, setVisualization] = useState(null)
  const [annotation, setAnnotation] = useState({ label: 'uncertain', reviewer: 'research-operator', note: '' })
  const [annotations, setAnnotations] = useState([])
  const [file, setFile] = useState(null)
  const [sensorId, setSensorId] = useState('')
  const [sensorName, setSensorName] = useState('')
  const [sensorKind, setSensorKind] = useState('microphone')
  const [uploadState, setUploadState] = useState('idle')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [scenario, models, sensors, media, health] = await Promise.all([
        api.researchScenario(), api.researchModels(), api.researchSensors(), api.researchMedia(), api.researchHealth(),
      ])
      setState({ loading: false, scenario, models, sensors, media, health, error: '' })
    } catch (error) {
      setState(previous => ({ ...previous, loading: false, error: error.message }))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const scenario = state.scenario
  const visibleIds = useMemo(() => scenario ? focus ? neighboringZones(scenario.sites, focus) : scenario.default_visible : [], [scenario, focus])
  const observation = scenario?.observations[step] ?? null
  const currentZone = scenario?.sites.find(site => site.site_id === observation?.site_id)
  const selectedMedia = state.media.find(item => item.id === selectedMediaId) ?? null
  const kind = fileKind(file?.name)
  const allowedSensors = state.sensors.filter(sensor => visibleIds.includes(sensor.site_id) && (kind === 'audio' ? sensor.kind === 'microphone' : sensor.kind === 'camera'))
  const chosenSensor = allowedSensors.find(sensor => sensor.id === sensorId) ?? allowedSensors[0]

  useEffect(() => {
    if (!playing || !scenario) return
    const timer = setInterval(() => { frameStarted.current = performance.now(); setStep(previous => (previous + 1) % scenario.observations.length) }, scenario.refresh_interval_ms)
    return () => clearInterval(timer)
  }, [playing, scenario])
  useEffect(() => {
    if (frameStarted.current == null) return
    const id = requestAnimationFrame(() => { setRenderMs(Number((performance.now() - frameStarted.current).toFixed(2))); frameStarted.current = null })
    return () => cancelAnimationFrame(id)
  }, [step])
  useEffect(() => {
    if (!selectedMediaId) { setVisualization(null); setAnnotations([]); return }
    let active = true
    api.researchMediaDetail(selectedMediaId).then(value => { if (active) setAnnotations(value.annotations) }).catch(() => { if (active) setAnnotations([]) })
    if (selectedMedia?.extension === 'wav') api.researchVisualization(selectedMediaId).then(value => { if (active) setVisualization(value) }).catch(() => { if (active) setVisualization(null) })
    else setVisualization(null)
    return () => { active = false }
  }, [selectedMediaId, selectedMedia?.extension])

  async function refreshModels() {
    try { const models = await api.refreshResearchModels(); setState(previous => ({ ...previous, models })); setNotice('Model packages refreshed.') }
    catch (error) { setNotice(`Model refresh failed: ${error.message}`) }
  }
  async function addSensor(event) {
    event.preventDefault()
    try {
      const sensor = await api.createResearchSensor({ site_id: focus ?? visibleIds[0], name: sensorName, kind: sensorKind })
      setState(previous => ({ ...previous, sensors: [...previous.sensors, sensor] }))
      setSensorName(''); setNotice(`Virtual ${sensorKind} added.`)
    } catch (error) { setNotice(`Sensor could not be added: ${error.message}`) }
  }
  async function deleteSensor(id) {
    try { await api.deleteResearchSensor(id); setState(previous => ({ ...previous, sensors: previous.sensors.filter(item => item.id !== id) })); setNotice('Virtual sensor removed.') }
    catch (error) { setNotice(`Sensor could not be removed: ${error.message}`) }
  }
  async function upload(event) {
    event.preventDefault()
    if (!file || !chosenSensor) return
    setUploadState('validating')
    try {
      const saved = await uploadResearchMedia(file, chosenSensor.site_id, chosenSensor.id)
      setState(previous => ({ ...previous, media: [saved, ...previous.media] }))
      setSelectedMediaId(saved.id); setFile(null); setUploadState('ready'); setNotice(`Original ${saved.extension.toUpperCase()} preserved. SHA256 recorded.`)
      event.target.reset()
    } catch (error) { setUploadState('error'); setNotice(`Media rejected: ${error.message}`) }
  }
  async function saveAnnotation(event) {
    event.preventDefault()
    if (!selectedMedia) return
    try {
      const saved = await api.researchAnnotate(selectedMedia.id, annotation)
      setAnnotations(previous => [...previous, saved]); setAnnotation(previous => ({ ...previous, note: '' })); setNotice('Human annotation saved separately from model outputs.')
    } catch (error) { setNotice(`Annotation failed: ${error.message}`) }
  }

  if (state.loading) return <section className="panel padded" role="status">Loading fictional sites and local research services…</section>
  if (state.error && !scenario) return <section className="panel padded" role="alert">Research API unavailable: {state.error}. The existing synthetic operations console remains available. <button onClick={load}>Retry</button></section>

  return <div className="research-lab">
    <div className="research-intro"><div><small>HARDWARE-FREE RESEARCH · FICTIONAL GEOGRAPHY</small><h2>Hybrid awareness laboratory</h2><p>Acoustic cue, optional visual review and independent temporal activity research. All motion here is predefined synthetic replay.</p></div><div className="research-pills"><span>28 fictional sites</span><span>200 ms replay refresh</span><span>Advisory only</span></div></div>
    {notice && <div className="research-notice" role="status">{notice}</div>}
    <div className="research-main-grid">
      <Section eyebrow="GEOJSON · MAPLIBRE · OFFLINE" title="Fictional zone network" className="research-map-panel" aside={<span className="badge green">{visibleIds.length} neighboring zones</span>}>
        <div className="research-map-tools"><label>Focus site <select aria-label="Focus fictional site" value={focus ?? scenario.default_visible[0]} onChange={event => setFocus(event.target.value)}>{scenario.sites.map(site => <option key={site.site_id} value={site.site_id}>{site.name}</option>)}</select></label><span>All {scenario.sites.length} sites are configurable in the local research grid.</span></div>
        <ResearchMap scenario={scenario} visibleIds={visibleIds} observation={observation} theme={theme} onZoneSelect={setFocus}/>
        <div className="research-map-legend" aria-label="Map legend"><span><i className="tracked"/>Tracked zone</span><span><i className="predicted"/>Predicted next</span><span><i className="watch"/>Neighbor watch</span><span><i className="inactive"/>Inactive</span><span><i className="trail"/>Past trail</span><span><i className="estimate"/>Estimated path</span></div>
        <div className="research-zone-list">{visibleIds.map(id => <button key={id} className={observation?.zone_states?.[id]?.state ?? 'inactive'} onClick={() => setFocus(id)}>{id} <small>{scenario.sites.find(site => site.site_id === id)?.name}</small><em>{observation?.zone_states?.[id]?.operational_state?.replaceAll('_', ' ') ?? 'normal'} · {observation?.zone_states?.[id]?.handoff?.replaceAll('_', ' ') ?? 'monitoring'}</em></button>)}</div>
        <div className="research-transport"><button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause synthetic replay' : 'Play synthetic replay'}>{playing ? <Pause size={15}/> : <Play size={15}/>} {playing ? 'Pause' : 'Play'}</button><input type="range" aria-label="Synthetic replay step" min="0" max={scenario.observations.length - 1} value={step} onChange={event => { setPlaying(false); setStep(Number(event.target.value)) }}/><span>{step + 1}/{scenario.observations.length}</span></div>
        <div className="research-event-strip" aria-label="Predefined synthetic activation events">{scenario.activation_events.map(event => <button type="button" key={event.step} className={step >= event.step ? 'reached' : ''} onClick={() => { setPlaying(false); setStep(event.step) }} title={event.description}><strong>T+{event.elapsed_ms / 1000}s</strong> {event.kind.replaceAll('_', ' ')}</button>)}</div>
        <div className="research-facts"><div><small>TRACK / ZONE</small><strong>{observation?.track_id ?? 'SYNTHETIC'} · {currentZone?.name ?? '—'}</strong></div><div><small>POSITION · SYNTHETIC</small><strong>{observation?.latitude.toFixed(5)}, {observation?.longitude.toFixed(5)} · {observation?.altitude_m} m</strong></div><div><small>SPEED / HEADING</small><strong>{observation?.speed_mps ?? '—'} m/s · {compassName(observation?.prediction?.heading_deg)}</strong></div><div><small>ESTIMATED NEXT / WATCH</small><strong>{observation?.prediction?.next_zone_ids?.join(', ') || 'None'} · {observation?.active_neighbor_ids?.join(', ') || 'None'}</strong></div><div><small>HANDOFF / UNCERTAINTY</small><strong>{observation?.handoff_phase?.replaceAll('_', ' ') ?? 'Monitoring'} · ±{observation?.position_uncertainty_m.toFixed(1)} m</strong></div></div>
      </Section>
      <div className="research-rail">
        <Section eyebrow="LOCAL PACKAGES · NO EXECUTION" title="Model readiness" aside={<button onClick={refreshModels} aria-label="Refresh model packages"><RefreshCw size={14}/> Refresh</button>}>
          <div className="research-models">{state.models?.packages.map(item => <details key={item.id} className="research-model"><summary><span><strong>{item.name}</strong><small>{item.family} · v{item.version}</small></span><span className={`research-status ${item.status}`}>{statusLabel[item.status]}</span></summary><div className="research-model-detail"><p>{item.issues.length ? item.issues.join(' · ') : 'Package metadata and checksums verified. Runtime evaluation pending.'}</p><p><b>Inputs:</b> {Object.values(item.inputs || {}).join('; ')}</p><p><b>Outputs:</b> {Object.values(item.outputs || {}).flat().join(', ')}</p><p><b>Classes:</b> {item.classes?.join(', ') || 'Unspecified'}</p><p><b>Provenance:</b> {item.provenance?.training_source} · {item.provenance?.license}</p></div></details>)}</div>
        </Section>
        <Section eyebrow="SIMULATED INPUTS ONLY" title="Virtual sensors" aside={<span className="badge neutral">{state.sensors.length} registered</span>}>
          <div className="research-sensor-list">{state.sensors.filter(sensor => visibleIds.includes(sensor.site_id)).map(sensor => <div key={sensor.id}><span>{sensor.kind === 'camera' ? <Camera size={14}/> : <AudioLines size={14}/>} <strong>{sensor.name}</strong><small>{sensor.site_id}</small></span><button onClick={() => deleteSensor(sensor.id)} aria-label={`Remove ${sensor.name} at ${sensor.site_id}`}>Remove</button></div>)}</div>
          <form className="research-sensor-form" onSubmit={addSensor}><label>New virtual sensor <input aria-label="New virtual sensor name" value={sensorName} maxLength={80} onChange={event => setSensorName(event.target.value)} placeholder="Research microphone" required /></label><select aria-label="Virtual sensor kind" value={sensorKind} onChange={event => setSensorKind(event.target.value)}><option value="microphone">Microphone</option><option value="camera">Camera</option></select><button>Add</button></form>
        </Section>
      </div>
    </div>
    <div className="research-below-grid">
      <Section eyebrow="LOCAL MEDIA · ORIGINAL PRESERVED" title="Media library" aside={<span className="badge neutral">{state.media.length} items</span>}>
        <form className="research-upload" onSubmit={upload}><label><Upload size={14}/> Choose WAV, MP3, MP4, WebM, JPEG or PNG<input aria-label="Research media file" type="file" accept=".wav,.mp3,.mp4,.webm,.jpg,.jpeg,.png" onChange={event => setFile(event.target.files?.[0] ?? null)}/></label><select aria-label="Virtual sensor for upload" value={chosenSensor?.id ?? ''} onChange={event => setSensorId(event.target.value)}>{allowedSensors.map(sensor => <option key={sensor.id} value={sensor.id}>{sensor.site_id} · {sensor.name}</option>)}</select><button disabled={!file || kind === 'unsupported' || !chosenSensor || uploadState === 'validating'}>Preserve upload</button><span role="status">{uploadState === 'validating' ? 'Validating…' : uploadState === 'ready' ? 'Ready' : uploadState === 'error' ? 'Rejected' : 'Awaiting media'}</span></form>
        <div className="research-media-list">{state.media.length ? state.media.map(item => <button key={item.id} className={selectedMediaId === item.id ? 'active' : ''} onClick={() => setSelectedMediaId(item.id)}>{fileKind(item.original_name) === 'audio' ? <FileAudio size={16}/> : fileKind(item.original_name) === 'video' ? <FileVideo size={16}/> : <FileImage size={16}/>}<span><strong>{item.original_name}</strong><small>{item.site_id} · {item.extension.toUpperCase()} · {item.state}</small></span></button>) : <p className="research-empty">No uploaded media. Use an approved recording or image to begin evidence review.</p>}</div>
      </Section>
      <Section eyebrow="HUMAN LABELS · SEPARATE FROM PREDICTIONS" title="Evidence review">
        {selectedMedia ? <div className="research-evidence"><div className="research-preview">{fileKind(selectedMedia.original_name) === 'audio' ? <audio controls preload="metadata" src={researchContentUrl(selectedMedia.id)}/> : fileKind(selectedMedia.original_name) === 'video' ? <video controls preload="metadata" src={researchContentUrl(selectedMedia.id)}/> : <img src={researchContentUrl(selectedMedia.id)} alt={`Uploaded evidence ${selectedMedia.original_name}`}/>}</div><div className="research-media-meta"><span>SHA256 {selectedMedia.sha256.slice(0, 16)}…</span><span>{selectedMedia.bytes.toLocaleString()} bytes</span><span>{selectedMedia.metadata.duration_s != null ? `${selectedMedia.metadata.duration_s} s` : 'Duration unavailable'}</span><span>Model output: unavailable</span></div><form className="research-annotation" onSubmit={saveAnnotation}><select aria-label="Human annotation label" value={annotation.label} onChange={event => setAnnotation({ ...annotation, label: event.target.value })}><option value="positive">Positive</option><option value="negative">Negative</option><option value="uncertain">Uncertain</option></select><input aria-label="Reviewer name" maxLength={80} value={annotation.reviewer} onChange={event => setAnnotation({ ...annotation, reviewer: event.target.value })}/><input aria-label="Annotation note" maxLength={1000} placeholder="Source and uncertainty notes" value={annotation.note} onChange={event => setAnnotation({ ...annotation, note: event.target.value })}/><button>Save annotation</button></form><div className="research-annotation-list">{annotations.map(item => <p key={item.id}><strong>{item.label}</strong> · {item.reviewer} · {item.note || 'No note'}</p>)}</div></div> : <p className="research-empty">Select preserved media to review playback, provenance and human annotations.</p>}
      </Section>
    </div>
    <Section eyebrow="AUDIO FEATURES · COMPUTED FROM UPLOADED PCM" title="Waveform, FFT and log-Mel" className="research-audio-panel" aside={<span className="badge neutral">{visualization ? 'Processed WAV' : 'Awaiting WAV'}</span>}>
      {visualization ? <div className="research-audio-grid"><div><h3>Waveform RMS</h3><MiniLine values={visualization.waveform_rms}/></div><div><h3>FFT spectrum</h3><MiniLine values={visualization.fft_spectrum.map(point => point.db)} color="var(--sand)"/></div><div><h3>Log-Mel spectrogram</h3><MelHeatmap rows={visualization.log_mel_db}/></div><p>{visualization.note}</p></div> : <p className="research-empty">Upload and select a PCM WAV file for measured waveform and spectral plots. MP3 remains playable but server plots need PCM WAV.</p>}
    </Section>
    <div className="research-below-grid">
      <Section eyebrow="SYNTHETIC TRUTH · INDEPENDENT CHECK" title="Trajectory and zone history"><div className="research-metrics"><span>Distance MAE <strong>{scenario.validation.distance_mae_m} m</strong></span><span>Distance RMSE <strong>{scenario.validation.distance_rmse_m} m</strong></span><span>Heading circular MAE <strong>{scenario.validation.circular_heading_mae_deg}°</strong></span></div><div className="research-history">{scenario.observations.slice(Math.max(0, step - 6), step + 1).reverse().map(item => <div key={item.step}><span>T+{Math.round(item.elapsed_ms / 1000)} s</span><strong>{item.site_id}</strong><span>{item.distance_from_previous_m ?? '—'} m</span><span>{item.speed_mps ?? '—'} m/s</span><span>±{item.position_uncertainty_m.toFixed(1)} m</span></div>)}</div><p className="research-note">Ground truth uses an independent local metric plane. Geographic values are synthetic and never inferred from uploaded media.</p></Section>
      <Section eyebrow="MEASURED PROCESSING · SIMULATED REPLAY" title="Performance and health"><div className="research-metrics"><span>Replay interval <strong>{scenario.refresh_interval_ms} ms</strong></span><span>UI frame latency <strong>{renderMs == null ? 'Awaiting replay' : `${renderMs} ms`}</strong></span><span>WAV processing <strong>{visualization ? `${visualization.processing_ms} ms` : 'Unavailable'}</strong></span><span>Field accuracy <strong>Unavailable</strong></span><span>Power use <strong>Unavailable</strong></span></div><p className="research-note">UI timing, WAV processing, model inference and sensor latency are separate measurements. No model benchmark or energy saving is inferred from this scenario.</p><div className="research-health"><Activity size={15}/> {state.health?.mode || 'Offline research'} · {state.health?.preserved_media ?? 0} preserved media · No physical controls</div></Section>
    </div>
    <HybridEvaluation />
  </div>
}
