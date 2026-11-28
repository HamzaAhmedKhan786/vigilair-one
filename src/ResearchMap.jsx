import React, { useEffect, useRef, useState } from 'react'
import { Map, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(workerUrl)

const empty = { type: 'FeatureCollection', features: [] }

export function ResearchMap({ scenario, visibleIds, observation, theme, onZoneSelect }) {
  const element = useRef(null)
  const mapRef = useRef(null)
  const selectRef = useRef(onZoneSelect)
  selectRef.current = onZoneSelect
  const [mapState, setMapState] = useState('loading')

  useEffect(() => {
    if (!element.current || !scenario) return
    let map
    try {
      map = new Map({ container: element.current, center: [0.027, 0], zoom: 10,
        attributionControl: false, dragRotate: false, pitchWithRotate: false,
        style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background',
          paint: { 'background-color': '#101a21' } }] } })
      mapRef.current = map
      map.on('load', () => {
        map.addSource('zones', { type: 'geojson', data: empty })
        map.addSource('trajectory', { type: 'geojson', data: empty })
        map.addSource('position', { type: 'geojson', data: empty })
        map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zones', paint: { 'fill-color': '#73806a', 'fill-opacity': .22 } })
        map.addLayer({ id: 'zone-line', type: 'line', source: 'zones', paint: { 'line-color': '#b4b98c', 'line-width': 2 } })
        map.addLayer({ id: 'trajectory-line', type: 'line', source: 'trajectory', paint: { 'line-color': '#d1ae77', 'line-width': 3 } })
        map.addLayer({ id: 'position-dot', type: 'circle', source: 'position', paint: { 'circle-radius': 7, 'circle-color': '#e1bb7c', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } })
        map.on('click', 'zone-fill', event => {
          const id = event.features?.[0]?.properties?.site_id
          if (id) selectRef.current(id)
        })
        setMapState('ready')
      })
      map.on('error', () => setMapState(previous => previous === 'ready' ? previous : 'unavailable'))
    } catch {
      setMapState('unavailable')
    }
    return () => { mapRef.current = null; map?.remove() }
  }, [scenario?.scenario_id])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapState !== 'ready' || !scenario) return
    const features = scenario.zones.features.filter(feature => visibleIds.includes(feature.properties.site_id))
    map.getSource('zones').setData({ type: 'FeatureCollection', features })
    const centers = visibleIds.map(id => scenario.sites.find(site => site.site_id === id)).filter(Boolean)
    if (centers.length) {
      const west = Math.min(...centers.map(site => site.longitude)) - .012
      const east = Math.max(...centers.map(site => site.longitude)) + .012
      const south = Math.min(...centers.map(site => site.latitude)) - .012
      const north = Math.max(...centers.map(site => site.latitude)) + .012
      map.fitBounds([[west, south], [east, north]], { padding: 32, duration: 0 })
    }
  }, [scenario, visibleIds, mapState])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapState !== 'ready' || !scenario || !observation) return
    const history = scenario.observations.slice(0, observation.step + 1)
    map.getSource('trajectory').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: history.map(item => [item.longitude, item.latitude]) } }] })
    map.getSource('position').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [observation.longitude, observation.latitude] } }] })
  }, [scenario, observation, mapState])

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapState !== 'ready') return
    map.setPaintProperty('background', 'background-color', theme === 'light' ? '#e5e8e2' : '#101a21')
  }, [theme, mapState])

  return <div className="research-map-wrap"><div className="research-map" ref={element} role="img" aria-label="MapLibre map of four neighboring fictional hexagonal zones" />
    {mapState === 'unavailable' && <p className="research-map-fallback">WebGL map unavailable. Use the zone selector and observation history below.</p>}
    <span className="research-map-watermark">FICTIONAL GEOJSON · NO BASEMAP · OFFLINE</span>
  </div>
}
