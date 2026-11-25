import React from 'react'
import { Thermometer } from 'lucide-react'
import thermalFixture from '../testsampledata/thermal_observations.jsonl?raw'

const samples = thermalFixture.trim().split(/\r?\n/).map(line => JSON.parse(line))

export function ThermalEvidence({ observation }) {
  const sample = samples[0]
  return <section className="panel thermal-panel" aria-label="Thermal evidence">
    <div className="panel-heading">
      <div><small>INFRARED SENSOR</small><h2>Thermal evidence</h2></div>
      <Thermometer size={18} aria-hidden="true"/>
    </div>
    <p className="padded">Verified thermal match {observation ? `for ${observation.track_id}` : 'for this observation'}: <strong>Unavailable</strong></p>
    <div className="thermal-sample">
      <div><strong>Synthetic sample</strong><small>{sample.sensor_id} · {sample.track_id} · unassociated</small></div>
      <div><strong>+{sample.temperature_delta_c} °C</strong><small>Simulated contrast above background</small></div>
      <div><strong>{Math.round(sample.confidence * 100)}%</strong><small>Simulated detection confidence</small></div>
      <div><strong>{new Date(sample.timestamp).toISOString().slice(11, 19)} UTC</strong><small>Sample timestamp</small></div>
    </div>
    <p className="padded muted">A heat signature can support review after sensor association. It cannot identify a drone by itself.</p>
  </section>
}
