import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { fallbackCameras, fallbackSites, syntheticTracks } from './scenario'

export function useConsoleData() {
  const [data, setData] = useState({ sites: fallbackSites, cameras: fallbackCameras, tracks: syntheticTracks, mode: 'synthetic', status: 'loading', updatedAt: null, error: null })
  const refresh = useCallback(async () => {
    try {
      const [sites, cameras, tracks] = await Promise.all([api.sites(), api.cameras(), api.tracks()])
      const mode = !tracks.length ? 'synthetic preview'
        : tracks.every(track => track.observations.every(item => item.source === 'synthetic')) ? 'api replay' : 'api observations'
      setData({ sites, cameras, tracks: tracks.length ? tracks : syntheticTracks, mode, status: 'connected', updatedAt: Date.now(), error: null })
    } catch (error) {
      setData(previous => ({ ...previous, status: previous.updatedAt ? 'stale' : 'disconnected', mode: previous.updatedAt ? previous.mode : 'synthetic', error: error.message }))
    }
  }, [])
  useEffect(() => { refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer) }, [refresh])
  const reset = async () => { await api.reset(); await refresh() }
  return { ...data, refresh, reset }
}
