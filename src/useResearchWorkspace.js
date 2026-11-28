import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, request, uploadResearchMedia } from './api'
import { neighboringZones } from './researchUtils.mjs'

export function useResearchWorkspace() {
  const [data, setData] = useState({ loading: true, scenario: null, models: null, sensors: [], media: [], health: null, error: '' })
  const [focus, setFocus] = useState(null)
  const [showIncidents, setShowIncidents] = useState(false)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [renderMs, setRenderMs] = useState(null)
  const [selectedMediaId, setSelectedMediaId] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [visualization, setVisualization] = useState(null)
  const [hybrid, setHybrid] = useState({ loading: true })
  const frameStarted = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const [scenario, models, sensors, media, health] = await Promise.all([
        api.researchScenario(), api.researchModels(), api.researchSensors(), api.researchMedia(), api.researchHealth(),
      ])
      setData(previous => ({ loading: false,
        scenario: previous.scenario?.scenario_id === scenario.scenario_id ? previous.scenario : scenario,
        models, sensors, media, health, error: '' }))
    } catch (error) {
      setData(previous => ({ ...previous, loading: false, error: error.message }))
    }
  }, [])
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer) }, [refresh])
  const runHybrid = useCallback(async () => {
    setHybrid({ loading: true })
    try { setHybrid({ result: await request('/api/experiments/hybrid-replay') }) }
    catch { setHybrid({ error: true }) }
  }, [])
  useEffect(() => { void runHybrid() }, [runHybrid])

  const scenario = data.scenario
  const visibleIds = useMemo(() => scenario ? focus ? neighboringZones(scenario.sites, focus) : scenario.default_visible : [], [scenario, focus])
  const observation = scenario?.observations[step] ?? null
  const selectedMedia = data.media.find(item => item.id === selectedMediaId) ?? null

  useEffect(() => {
    if (!playing || !scenario) return
    const timer = setInterval(() => {
      frameStarted.current = performance.now()
      setStep(previous => (previous + 1) % scenario.observations.length)
    }, scenario.refresh_interval_ms)
    return () => clearInterval(timer)
  }, [playing, scenario])
  useEffect(() => {
    if (frameStarted.current == null) return
    const id = requestAnimationFrame(() => {
      setRenderMs(Number((performance.now() - frameStarted.current).toFixed(2)))
      frameStarted.current = null
    })
    return () => cancelAnimationFrame(id)
  }, [step])
  useEffect(() => {
    if (!selectedMediaId) { setAnnotations([]); setVisualization(null); return }
    let active = true
    api.researchMediaDetail(selectedMediaId).then(value => { if (active) setAnnotations(value.annotations) }).catch(() => { if (active) setAnnotations([]) })
    if (selectedMedia?.extension === 'wav') api.researchVisualization(selectedMediaId).then(value => { if (active) setVisualization(value) }).catch(() => { if (active) setVisualization(null) })
    else setVisualization(null)
    return () => { active = false }
  }, [selectedMediaId, selectedMedia?.extension])

  const refreshModels = async () => {
    const models = await api.refreshResearchModels()
    setData(previous => ({ ...previous, models }))
    return models
  }
  const addSensor = async value => {
    const sensor = await api.createResearchSensor(value)
    setData(previous => ({ ...previous, sensors: [...previous.sensors, sensor] }))
    return sensor
  }
  const deleteSensor = async id => {
    await api.deleteResearchSensor(id)
    setData(previous => ({ ...previous, sensors: previous.sensors.filter(item => item.id !== id) }))
  }
  const upload = async (file, sensor) => {
    const saved = await uploadResearchMedia(file, sensor.site_id, sensor.id)
    setData(previous => ({ ...previous, media: [saved, ...previous.media] }))
    setSelectedMediaId(saved.id)
    return saved
  }
  const annotate = async (mediaId, value) => {
    const saved = await api.researchAnnotate(mediaId, value)
    setAnnotations(previous => [...previous, saved])
    return saved
  }

  return { data, scenario, visibleIds, observation, focus, setFocus, showIncidents, setShowIncidents, step, setStep, playing, setPlaying,
    renderMs, selectedMediaId, setSelectedMediaId, selectedMedia, annotations, visualization,
    refresh, refreshModels, addSensor, deleteSensor, upload, annotate, hybrid, runHybrid }
}
