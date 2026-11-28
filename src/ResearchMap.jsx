import React, { useEffect, useRef, useState } from 'react'
import { Map, Marker, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(workerUrl)

const collection = features => ({ type: 'FeatureCollection', features })
const shape = (type, coordinates) => collection([{ type: 'Feature', properties: {}, geometry: { type, coordinates } }])
const blankStyle = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#101a21' } }] }
const licensedStyleURL = import.meta.env.VITE_RESEARCH_BASEMAP_STYLE_URL || ''
const zoneColor = ['match', ['get', 'state'], 'tracked', '#e1bb7c', 'predicted_next', '#f4a86f', 'watch', '#91c5af', 'active', '#88a8b0', '#3d5659']

function sector(coordinates) {
  const [start, end] = [coordinates[0], coordinates.at(-1)]
  if (!start || !end || (start[0] === end[0] && start[1] === end[1])) return collection([])
  const dx = (end[0] - start[0]) * .65, dy = (end[1] - start[1]) * .65
  const edge = angle => [start[0] + dx * Math.cos(angle) - dy * Math.sin(angle), start[1] + dx * Math.sin(angle) + dy * Math.cos(angle)]
  return shape('Polygon', [[start, edge(-.18), edge(.18), start]])
}

export function ResearchMap({ scenario, visibleIds, observation, theme, onZoneSelect, incidentTracks = [], selectedIncidentId, selectedIncidentObservation, onIncidentSelect, showScenarioTrack = true }) {
  const element = useRef(null)
  const mapRef = useRef(null)
  const droneRef = useRef(null)
  const targetRef = useRef(null)
  const labelsRef = useRef([])
  const incidentMarkersRef = useRef([])
  const fallbackRef = useRef(false)
  const selectRef = useRef(onZoneSelect)
  selectRef.current = onZoneSelect
  const incidentSelectRef = useRef(onIncidentSelect)
  incidentSelectRef.current = onIncidentSelect
  const [mapState, setMapState] = useState('loading')
  const [mode, setMode] = useState('2d')

  useEffect(() => {
    if (!element.current || !scenario) return
    const initial = scenario.sites.find(site => site.site_id === scenario.default_visible[0]) ?? scenario.sites[0]
    fallbackRef.current = false
    let map
    let ready = false
    let fallbackUsed = false
    try {
      map = new Map({ container: element.current, center: [initial.longitude, initial.latitude], zoom: 11,
        attributionControl: false, dragRotate: false, pitchWithRotate: false,
        style: licensedStyleURL || blankStyle })
      mapRef.current = map
      map.on('zoomend', () => { if (element.current) element.current.dataset.zoom = map.getZoom().toFixed(2) })
      map.on('load', () => {
        ready = true
        for (const id of ['zones', 'trail', 'prediction', 'sector', 'incident-drone', 'incident-bird']) map.addSource(id, { type: 'geojson', data: collection([]) })
        map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zones', paint: { 'fill-color': zoneColor, 'fill-opacity': ['case', ['get', 'visible'], .42, ['==', ['get', 'state'], 'predicted_next'], .29, .075] } })
        map.addLayer({ id: 'zone-extrusion', type: 'fill-extrusion', source: 'zones', layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': zoneColor, 'fill-extrusion-height': ['case', ['get', 'visible'], 140, 45], 'fill-extrusion-opacity': .46 } })
        map.addLayer({ id: 'zone-line', type: 'line', source: 'zones', paint: { 'line-color': zoneColor, 'line-width': ['case', ['get', 'visible'], 2.2, ['==', ['get', 'state'], 'predicted_next'], 1.7, .8], 'line-opacity': ['case', ['get', 'visible'], .95, ['==', ['get', 'state'], 'predicted_next'], .85, .35] } })
        map.addLayer({ id: 'uncertainty-sector', type: 'fill', source: 'sector', paint: { 'fill-color': '#e1bb7c', 'fill-opacity': .13 } })
        map.addLayer({ id: 'trail-line', type: 'line', source: 'trail', paint: { 'line-color': '#85c0b2', 'line-width': 3 } })
        map.addLayer({ id: 'prediction-halo', type: 'line', source: 'prediction', paint: { 'line-color': '#11191c', 'line-width': 7, 'line-opacity': .7 } })
        map.addLayer({ id: 'prediction-line', type: 'line', source: 'prediction', paint: { 'line-color': '#ffe3a8', 'line-width': 4, 'line-dasharray': [1, 1.5] } })
        map.addLayer({ id: 'incident-drone-line', type: 'line', source: 'incident-drone', paint: { 'line-color': '#ffbd79', 'line-width': 3.5 } })
        map.addLayer({ id: 'incident-bird-line', type: 'line', source: 'incident-bird', paint: { 'line-color': '#91d4a5', 'line-width': 3.5 } })
        map.on('click', 'zone-fill', event => { const id = event.features?.[0]?.properties?.site_id; if (id) selectRef.current(id) })
        const node = document.createElement('div')
        node.className = 'research-drone-marker'
        node.setAttribute('aria-label', 'Synthetic tracked drone')
        node.innerHTML = '<div class="drone-glyph"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 16 13 20 11 24 13Z" fill="currentColor"/><circle cx="8" cy="8" r="5"/><circle cx="32" cy="8" r="5"/><circle cx="8" cy="32" r="5"/><circle cx="32" cy="32" r="5"/><path d="M10 10 17 17 M30 10 23 17 M10 30 17 23 M30 30 23 23"/><rect x="16" y="16" width="8" height="8" rx="2"/></svg></div><span class="drone-marker-label"></span>'
        droneRef.current = new Marker({ element: node, anchor: 'center' }).setLngLat([initial.longitude, initial.latitude]).addTo(map)
        const target = document.createElement('div')
        target.className = 'research-prediction-target'
        target.setAttribute('aria-label', 'Estimated position in 80 seconds')
        targetRef.current = new Marker({ element: target, anchor: 'center' }).setLngLat([initial.longitude, initial.latitude]).addTo(map)
        setMapState('ready')
      })
      map.on('error', () => {
        if (licensedStyleURL && !ready && !fallbackUsed) { fallbackUsed = true; fallbackRef.current = true; map.setStyle(blankStyle); return }
        if (!ready) setMapState('unavailable')
      })
    } catch { setMapState('unavailable') }
    return () => { labelsRef.current.forEach(marker => marker.remove()); incidentMarkersRef.current.forEach(marker => marker.remove()); labelsRef.current = []; incidentMarkersRef.current = []; droneRef.current?.remove(); targetRef.current?.remove(); droneRef.current = null; targetRef.current = null; mapRef.current = null; map?.remove() }
  }, [scenario?.scenario_id])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapState !== 'ready' || !scenario) return
    const visible = new Set(visibleIds)
    const context = new Set(visibleIds.flatMap(id => scenario.sites.find(site => site.site_id === id)?.neighbors ?? []))
    const predicted = new Set(showScenarioTrack ? observation?.prediction?.next_zone_ids ?? [] : [])
    const states = showScenarioTrack ? observation?.zone_states ?? {} : { [visibleIds[0]]: { state: 'tracked' } }
    map.getSource('zones').setData(collection(scenario.zones.features.filter(feature => visible.has(feature.properties.site_id) || context.has(feature.properties.site_id) || predicted.has(feature.properties.site_id)).map(feature => ({
      ...feature, properties: { ...feature.properties, state: states[feature.properties.site_id]?.state ?? (visible.has(feature.properties.site_id) ? 'active' : 'inactive'), visible: visible.has(feature.properties.site_id) },
    }))))
    labelsRef.current.forEach(marker => marker.remove())
    const labelIds = [...new Set([...visibleIds, ...predicted])]
    labelsRef.current = labelIds.map(id => {
      const site = scenario.sites.find(item => item.site_id === id)
      if (!site) return null
      const node = document.createElement('div')
      node.className = `research-zone-label ${states[id]?.state ?? 'inactive'}`
      node.textContent = `${id} · ${site.name.replace('Fictional ', '')}`
      return new Marker({ element: node, anchor: 'center' }).setLngLat([site.longitude, site.latitude]).addTo(map)
    }).filter(Boolean)
  }, [scenario, visibleIds, observation?.step, showScenarioTrack, mapState])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapState !== 'ready' || !scenario) return
    const centers = visibleIds.map(id => scenario.sites.find(site => site.site_id === id)).filter(Boolean)
    if (!centers.length) return
    const radius = Math.abs(scenario.zones.features[0].geometry.coordinates[0][0][0] - scenario.sites[0].longitude)
    map.fitBounds([[Math.min(...centers.map(site => site.longitude)) - radius * 1.35, Math.min(...centers.map(site => site.latitude)) - radius * 1.6],
      [Math.max(...centers.map(site => site.longitude)) + radius * 1.35, Math.max(...centers.map(site => site.latitude)) + radius * 1.6]], { padding: 22, duration: 0, pitch: mode === '3d' ? 52 : 0 })
  }, [scenario, visibleIds, mapState])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapState !== 'ready' || !scenario || !observation) return
    if (!showScenarioTrack) {
      for (const id of ['trail', 'prediction', 'sector']) map.getSource(id).setData(collection([]))
      if (droneRef.current) droneRef.current.getElement().style.display = 'none'
      if (targetRef.current) targetRef.current.getElement().style.display = 'none'
      return
    }
    if (droneRef.current) droneRef.current.getElement().style.display = ''
    const history = scenario.observations.slice(0, observation.step + 1)
    const path = observation.prediction?.coordinates ?? []
    map.getSource('trail').setData(shape('LineString', history.map(item => [item.longitude, item.latitude])))
    map.getSource('prediction').setData(path.length > 1 ? shape('LineString', path) : collection([]))
    map.getSource('sector').setData(sector(path))
    droneRef.current?.setLngLat([observation.longitude, observation.latitude])
    if (path.length > 1) targetRef.current?.setLngLat(path.at(-1))
    if (targetRef.current) targetRef.current.getElement().style.display = path.length > 1 ? '' : 'none'
    const drone = droneRef.current?.getElement()
    if (drone) {
      drone.querySelector('.drone-glyph').style.transform = `rotate(${observation.heading_deg ?? 0}deg)`
      drone.querySelector('.drone-marker-label').textContent = observation.track_id ?? 'SYNTHETIC TRACK'
    }
  }, [scenario, observation, showScenarioTrack, mapState])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapState !== 'ready') return
    const positionFor = track => {
      if (selectedIncidentId !== track.track_id || !selectedIncidentObservation) return track.coordinates.length - 1
      const index = track.observations.findIndex(item => item.timestamp === selectedIncidentObservation.timestamp)
      return index < 0 ? track.coordinates.length - 1 : index
    }
    for (const kind of ['drone', 'bird']) {
      const features = incidentTracks.filter(track => track.class_name === kind && track.coordinates.length > 1)
        .map(track => ({ type: 'Feature', properties: { track_id: track.track_id }, geometry: { type: 'LineString', coordinates: track.coordinates.slice(0, positionFor(track) + 1) } }))
        .filter(feature => feature.geometry.coordinates.length > 1)
      map.getSource(`incident-${kind}`).setData(collection(features))
    }
    incidentMarkersRef.current.forEach(marker => marker.remove())
    incidentMarkersRef.current = incidentTracks.map(track => {
      const node = document.createElement('button')
      node.type = 'button'
      node.className = `research-incident-marker ${track.class_name === 'bird' ? 'bird' : 'drone'} ${selectedIncidentId === track.track_id ? 'selected' : ''}`
      node.textContent = `${track.track_id} · ${track.class_name.toUpperCase()}`
      node.dataset.sectorId = track.sector_id
      node.dataset.observationTime = track.observations[positionFor(track)]?.timestamp ?? ''
      node.title = `${track.track_id}: illustrative placement in ${track.sector_id}. Inspect synthetic camera observation.`
      node.addEventListener('click', event => { event.stopPropagation(); incidentSelectRef.current?.(track.track_id) })
      return new Marker({ element: node, anchor: 'bottom' }).setLngLat(track.coordinates[positionFor(track)]).addTo(map)
    })
  }, [incidentTracks, selectedIncidentId, selectedIncidentObservation?.timestamp, mapState])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapState !== 'ready') return
    if (map.getLayer('background') && (!licensedStyleURL || fallbackRef.current)) map.setPaintProperty('background', 'background-color', theme === 'light' ? '#e6ebe5' : '#101a21')
    map.setLayoutProperty('zone-extrusion', 'visibility', mode === '3d' ? 'visible' : 'none')
    map.easeTo({ pitch: mode === '3d' ? 52 : 0, bearing: mode === '3d' ? -18 : 0, duration: 300 })
  }, [theme, mode, mapState])

  return <div className="research-map-wrap"><div className="research-map" ref={element} role="img" aria-label="MapLibre honeycomb of fictional hexagonal zones with synthetic drone trail and estimated path" />
    <div className="research-map-controls" role="group" aria-label="Map view controls"><button type="button" className={mode === '2d' ? 'selected' : ''} onClick={() => setMode('2d')} aria-pressed={mode === '2d'}>2D</button><button type="button" className={mode === '3d' ? 'selected' : ''} onClick={() => setMode('3d')} aria-pressed={mode === '3d'}>3D</button><button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>+</button><button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>−</button></div>
    {mapState === 'unavailable' && <p className="research-map-fallback">WebGL map unavailable. Use the zone selector and observation history below.</p>}
    <span className="research-map-watermark">FICTIONAL GEOJSON · {showScenarioTrack ? 'ESTIMATED RESEARCH PATH' : 'ILLUSTRATIVE INCIDENT PROJECTION'} · {licensedStyleURL ? 'OPTIONAL LICENSED BASEMAP' : 'OFFLINE BASEMAP'}</span>
  </div>
}
