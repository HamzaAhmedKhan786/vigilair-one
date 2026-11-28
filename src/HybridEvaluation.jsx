import React, { useEffect, useState } from 'react'
import { request } from './api'

const outcomes = {
  vision_with_temporal_support: 'Vision + temporal support',
  vision_only: 'Vision only',
  activity_only: 'Activity without a vision label',
  insufficient_evidence: 'Insufficient evidence',
}

export function HybridEvaluation({ evaluation }) {
  const [localState, setState] = useState({ loading: true })
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (evaluation) return
    const controller = new AbortController()
    request('/api/experiments/hybrid-replay', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) })
      .then(result => { if (!controller.signal.aborted) setState({ result }) })
      .catch(() => { if (!controller.signal.aborted) setState({ error: true }) })
    return () => controller.abort()
  }, [run, evaluation])

  const state = evaluation ? evaluation.state : localState
  const { result, loading, error } = state
  return <section className="panel hybrid-panel" aria-label="Hybrid YOLO and SNN evaluation">
    <div className="panel-heading">
      <div><small>EXPERIMENTAL REPLAY</small><h2>Hybrid YOLO + SNN evaluation</h2></div>
      <button disabled={loading} onClick={() => evaluation ? evaluation.run() : (setState({ loading: true }), setRun(value => value + 1))}>Run again</button>
    </div>
    {loading && <p className="padded" role="status">Running the spiking activity model…</p>}
    {error && <p className="padded" role="alert">Hybrid replay unavailable. Check the API connection and run again.</p>}
    {result && <>
      <p className="padded hybrid-summary">Synthetic vision labels + simulated events. Vision proposes the class, and the spiking model reports activity within the paired window.</p>
      <div className="thermal-sample">
        <div><strong>{result.window_count}</strong><small>Fixture windows</small></div>
        <div><strong>{result.activity_accuracy == null ? 'Unavailable' : Math.round(result.activity_accuracy * 100) + '%'}</strong><small>Activity agreement on {result.labeled_windows} labeled fixture windows</small></div>
        <div><strong>{result.snn_compute_ms_per_window.toFixed(4)} ms</strong><small>SNN CPU compute per window</small></div>
        <div><strong>Unavailable</strong><small>Hardware power and field accuracy</small></div>
      </div>
      <div className="hybrid-raster" role="img" aria-label="Measured spike times from synthetic fixture windows">
        <strong>Spike raster · simulated event input</strong>
        {result.windows.map((window, row) => <div key={window.window_id} className="hybrid-raster-row"><span>{window.window_id}</span><svg viewBox="0 0 100 14" preserveAspectRatio="none">{window.spike_times_ms.map((time, index) => <line key={index} x1={Math.max(0, Math.min(100, time / 10))} x2={Math.max(0, Math.min(100, time / 10))} y1="2" y2="12" stroke="currentColor" strokeWidth=".6" />)}</svg></div>)}
        <small>Membrane potential trace unavailable; the current replay exports spike times only.</small>
      </div>
      <div className="hybrid-results">
        <table>
          <thead><tr><th>Window</th><th>Vision</th><th>Events → spikes</th><th>Activity check</th><th>Combined evidence</th></tr></thead>
          <tbody>{result.windows.map(window => <tr key={window.window_id}>
            <td>{window.window_id}</td>
            <td>{window.vision_label ? `${window.vision_label} · ${Math.round(window.vision_confidence * 100)}%` : 'Unavailable'}</td>
            <td>{window.event_count} → {window.spike_times_ms.length}</td>
            <td>{window.expected_activity == null ? 'Unlabeled' : window.activity === window.expected_activity ? 'Agrees with label' : window.expected_activity ? 'Missed activity' : 'Extra activity'}</td>
            <td>{outcomes[window.outcome]}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="padded muted">Compute timing excludes sensing, decoding, YOLO and network time. Activity can be present for both birds and drones. Experiment results are separate from incident scoring.</p>
    </>}
  </section>
}
