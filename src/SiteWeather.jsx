import React, { useEffect, useMemo, useState } from 'react'
import { CloudSun, Clock3 } from 'lucide-react'
import { request } from './api'

const format = (value, unit, decimals = 1) =>
  typeof value === 'number' && Number.isFinite(value) ? `${Number(value.toFixed(decimals))} ${unit}` : '—'

export function SiteWeather({ site }) {
  const [now, setNow] = useState(Date.now)
  const [lookup, setLookup] = useState(null)
  const siteId = site?.site_id
  const timezone = site?.timezone ?? 'UTC'
  const clock = useMemo(() => {
    const options = { dateStyle: 'medium', timeStyle: 'medium' }
    try {
      return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: timezone })
    } catch {
      return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' })
    }
  }, [timezone])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!siteId) return
    const controller = new AbortController()
    let timer
    async function refresh() {
      let delay = 60_000
      try {
        const data = await request(`/api/sites/${encodeURIComponent(siteId)}/weather`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
        })
        if (controller.signal.aborted) return
        setLookup({ siteId, data })
        if (data.status !== 'stale') delay = 900_000
      } catch {
        if (controller.signal.aborted) return
        setLookup({ siteId, error: true })
      }
      timer = setTimeout(refresh, delay)
    }
    refresh()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [siteId])

  const reading = lookup?.siteId === siteId ? lookup : null
  const data = reading?.data
  const interval = data?.interval_seconds ? data.interval_seconds / 60 : null
  return <section className="site-weather panel" aria-label="Site clock and regional weather">
    <div className="weather-clock">
      <Clock3 size={17} aria-hidden="true"/>
      <div>
        <small>Site local time · {clock.resolvedOptions().timeZone}</small>
        <time dateTime={new Date(now).toISOString()}>{clock.format(now)}</time>
      </div>
    </div>
    <div className="weather-readings">
      <div className="weather-title"><CloudSun size={17} aria-hidden="true"/>
        {site && <strong>{site.name}</strong>}
        {data?.source && <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>}
      </div>
      {!site ? <span>No site selected</span>
        : !reading ? <span>Loading regional weather…</span>
        : reading.error ? <span>Regional weather unavailable</span>
        : data.status === 'disabled' ? <span>Regional weather disabled</span>
        : <>
          <div className="weather-fields">
            <span><small>Temperature</small><strong>{format(data.temperature_c, '°C')}</strong></span>
            <span><small>Wind / direction</small><strong>{format(data.wind_speed_mps, 'm/s')} · {format(data.wind_direction_deg, '°', 0)}</strong></span>
            <span><small>Gust</small><strong>{format(data.wind_gust_mps, 'm/s')}</strong></span>
            <span><small>Visibility</small><strong>{format(data.visibility_m == null ? null : data.visibility_m / 1000, 'km')}</strong></span>
            <span><small>Precipitation{interval ? ` / ${interval} min` : ''}</small><strong>{format(data.precipitation_mm, 'mm')}</strong></span>
            <span><small>Daylight</small><strong>{data.is_day == null ? '—' : data.is_day ? 'Day' : 'Night'}</strong></span>
          </div>
          <small>{data.status === 'stale' ? 'Stale · ' : ''}Regional model estimate · valid {clock.format(new Date(data.valid_at))} · retrieved {clock.format(new Date(data.retrieved_at))}</small>
        </>}
    </div>
  </section>
}
