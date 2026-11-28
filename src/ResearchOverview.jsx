import React, { useMemo } from 'react'
import { Pause, Play, Radio } from 'lucide-react'
import { researchContentUrl } from './api'
import { ResearchMap } from './ResearchMap'
import { MelHeatmap, MiniLine } from './ResearchPlots'
import { compassName, fileKind } from './researchUtils.mjs'
import { incidentProjection } from './incidentProjection.mjs'
import './research.css'

export function ResearchOverviewMap({ workspace, theme, operationTracks = [], operationalSiteId, selectedIncidentId, selectedIncidentObservation, onIncidentSelect }) {
  const { data, scenario, visibleIds, observation, focus, setFocus, showIncidents, setShowIncidents, step, setStep, playing, setPlaying } = workspace
  const selectedZone = scenario?.sites.find(site => site.site_id === (focus ?? scenario.default_visible[0]))
  const radius = scenario && Math.abs(scenario.zones.features[0].geometry.coordinates[0][0][0] - scenario.sites[0].longitude)
  const incidentTracks = useMemo(() => showIncidents ? incidentProjection(operationTracks, operationalSiteId, selectedZone, radius) : [], [showIncidents, operationTracks, operationalSiteId, selectedZone, radius])
  const selectZone = id => { setFocus(id); setShowIncidents(true) }
  if (data.loading) return <section className="panel padded" role="status">Loading fictional zone network…</section>
  if (!scenario) return <section className="panel padded" role="alert">Fictional map unavailable: {data.error}. Incident review remains available. <button onClick={workspace.refresh}>Retry</button></section>
  return <section className="panel research-section research-overview-map" aria-label="Synthetic regional zone map">
    <div className="panel-heading"><div><small>FICTIONAL ZONES · ADVISORY REPLAY</small><h2>Regional honeycomb awareness</h2></div><span className="badge green">{visibleIds.length} focused cells</span></div>
    <div className="research-map-tools"><label>Fictional site <select aria-label="Overview fictional site" value={focus ?? scenario.default_visible[0]} onChange={event => selectZone(event.target.value)}>{scenario.sites.map(site => <option key={site.site_id} value={site.site_id}>{site.name}</option>)}</select></label><button type="button" onClick={() => setShowIncidents(value => !value)} aria-pressed={showIncidents}>{showIncidents ? 'Hide' : 'Show'} synthetic incident tracks</button><span>{showIncidents ? `${selectedZone?.site_id ?? 'Sector unavailable'} · ${selectedIncidentId ?? 'synthetic incidents'}` : `${observation?.track_id ?? 'Synthetic track unavailable'} · ${observation?.site_id ?? '—'}`}</span></div>
    <ResearchMap scenario={scenario} visibleIds={visibleIds} observation={observation} theme={theme} onZoneSelect={selectZone} incidentTracks={incidentTracks} selectedIncidentId={selectedIncidentId} selectedIncidentObservation={selectedIncidentObservation} onIncidentSelect={onIncidentSelect} showScenarioTrack={!showIncidents}/>
    {showIncidents && <p className="research-projection-note">VIG-042 drone and VIG-038 bird: illustrative site-local paths projected inside {selectedZone?.site_id}. They are not geolocated to this fictional sector. Select a marker for its camera replay.</p>}
    <div className="research-map-legend" aria-label="Map legend">{showIncidents ? <><span><i className="tracked"/>Selected sector</span><span><i className="trail"/>Illustrative drone trail</span><span><i className="watch"/>Illustrative bird trail</span></> : <><span><i className="tracked"/>Tracked</span><span><i className="predicted"/>Predicted</span><span><i className="watch"/>Watch</span><span><i className="trail"/>Past trail</span><span><i className="estimate"/>Estimated path</span></>}</div>
    {showIncidents ? <div className="research-overview-facts"><span>SELECTED SECTOR <strong>{selectedZone?.site_id ?? 'Unavailable'}</strong></span><span>SELECTED TRACK <strong>{selectedIncidentId ?? 'None'}</strong></span><span>CAMERA <strong>{selectedIncidentObservation?.camera_id ?? 'Unavailable'}</strong></span><span>MAP BASIS <strong>Illustrative site-local projection</strong></span></div> : <><div className="research-transport"><button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause synthetic replay' : 'Play synthetic replay'}>{playing ? <Pause size={15}/> : <Play size={15}/>} {playing ? 'Pause' : 'Play'}</button><input type="range" aria-label="Synthetic replay step" min="0" max={scenario.observations.length - 1} value={step} onChange={event => { setPlaying(false); setStep(Number(event.target.value)) }}/><span>{step + 1}/{scenario.observations.length}</span></div><div className="research-overview-facts"><span>POSITION <strong>{observation?.latitude.toFixed(5)}, {observation?.longitude.toFixed(5)}</strong></span><span>HEADING <strong>{compassName(observation?.prediction?.heading_deg)}</strong></span><span>EST. NEXT <strong>{observation?.prediction?.next_zone_ids?.join(', ') || 'None'}</strong></span><span>HANDOFF <strong>{observation?.handoff_phase?.replaceAll('_', ' ') ?? 'Unavailable'}</strong></span></div></>}
  </section>
}

export function ResearchOverviewStatus({ workspace, onOpenLab }) {
  const { data, selectedMedia, setSelectedMediaId, annotations, visualization } = workspace
  const media = data.media.slice(0, 6)
  const kind = fileKind(selectedMedia?.original_name)
  return <div className="research-overview-status">
    <section className="panel research-section"><div className="panel-heading"><div><small>SHARED RESEARCH SERVICES</small><h2>Model and virtual sensor status</h2></div><button onClick={onOpenLab}>Open Research Lab</button></div>
      <div className="research-status-grid"><div><small>REQUIRED RESEARCH</small>{data.models?.packages.filter(item => ['acoustic-hybrid', 'rfdetr-nano'].includes(item.id)).map(item => <p key={item.id}><strong>{item.name}</strong><span>{item.status.replaceAll('_', ' ')}</span></p>) ?? <p>Unavailable</p>}</div><div><small>COMPARISON / BASELINE</small>{data.models?.packages.filter(item => ['yolo-comparison', 'mobilenetv3-baseline'].includes(item.id)).map(item => <p key={item.id}><strong>{item.name}</strong><span>{item.status.replaceAll('_', ' ')}</span></p>) ?? <p>Unavailable</p>}</div><div><small>FICTIONAL SITE SENSORS</small><p><strong>{data.sensors.filter(sensor => sensor.site_id === (workspace.focus ?? workspace.scenario?.default_visible[0])).length} virtual sensors</strong><span>Configured locally</span></p><p><strong>{data.media.length} preserved media</strong><span>Recorded uploads only</span></p></div></div>
    </section>
    <section className="panel research-section"><div className="panel-heading"><div><small>RECORDED MEDIA · HUMAN LABELS</small><h2>Evidence preview</h2></div><span className="badge neutral">{media.length} recent</span></div>
      <div className="research-overview-evidence"><div className="research-overview-files">{media.length ? media.map(item => <button key={item.id} className={item.id === selectedMedia?.id ? 'selected' : ''} onClick={() => setSelectedMediaId(item.id)}>{item.original_name}<small>{item.site_id} · {item.extension.toUpperCase()}</small></button>) : <p className="research-empty">No recorded media yet. Upload approved audio, image or video in Research Lab.</p>}</div>
        <div className="research-overview-preview">{selectedMedia ? <>{kind === 'audio' ? <audio controls preload="metadata" src={researchContentUrl(selectedMedia.id)}/> : kind === 'video' ? <video controls preload="metadata" src={researchContentUrl(selectedMedia.id)}/> : <img src={researchContentUrl(selectedMedia.id)} alt={`Recorded evidence ${selectedMedia.original_name}`}/>}<small>{selectedMedia.original_name} · {annotations.length} human review annotations · model prediction unavailable</small></> : <p className="research-empty">Select recorded evidence for a preview.</p>}</div>
        {visualization && <div className="research-overview-spectra"><div><small>Measured WAV waveform</small><MiniLine values={visualization.waveform_rms}/></div><div><small>Measured log-Mel spectrogram</small><MelHeatmap rows={visualization.log_mel_db}/></div></div>}
      </div>
    </section>
  </div>
}
