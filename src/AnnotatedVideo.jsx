import React, { useEffect, useRef, useState } from 'react'
import { detectionStatus } from './selectors.mjs'
import { frameAtTime, linkedTrack, parseReplay } from './videoReplay.mjs'

export function AnnotatedVideo({ active, tracks, onSelectObservation, onEvidence }) {
  const [clip, setClip] = useState(null)
  const [frame, setFrame] = useState(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const video = useRef(null)

  useEffect(() => { if (!active) video.current?.pause() }, [active])

  useEffect(() => {
    if (!clip) return
    return () => URL.revokeObjectURL(clip.url)
  }, [clip])

  useEffect(() => {
    const player = video.current
    if (!player || !ready || !player.requestVideoFrameCallback) return
    let callback
    function render(_now, metadata) {
      setFrame(frameAtTime(clip.bundle, metadata.mediaTime))
      callback = player.requestVideoFrameCallback(render)
    }
    callback = player.requestVideoFrameCallback(render)
    return () => player.cancelVideoFrameCallback(callback)
  }, [clip, ready])

  async function load(event) {
    event.preventDefault()
    const { footage, annotations } = event.currentTarget.elements
    setBusy(true)
    setError('')
    try {
      const file = footage.files[0]
      const manifest = annotations.files[0]
      if (!file || !manifest || file.size > 128 * 1024 ** 2 || manifest.size > 16 * 1024 ** 2) {
        throw new Error('Select a video up to 128 MiB and a JSON bundle up to 16 MiB.')
      }
      if (!globalThis.crypto?.subtle) throw new Error('Open the console on localhost or HTTPS.')
      const bundle = parseReplay(await manifest.text())
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
      const digest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')
      if (digest !== bundle.video_sha256) throw new Error('This annotation bundle belongs to a different video.')
      setReady(false)
      setFrame(null)
      setClip({ bundle, url: URL.createObjectURL(file), name: file.name })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  const sync = event => {
    if (ready) setFrame(frameAtTime(clip.bundle, event.currentTarget.currentTime))
  }
  return <section className="panel regional-panel annotated-panel">
    <div className="panel-heading"><div><small>LOCAL FILES</small><h2>Annotated video replay</h2></div>
      {clip && <span className="badge cyan">{clip.bundle.source === 'yolo' ? 'YOLO predictions' : 'Manual annotations'}</span>}
    </div>
    <form className="video-inputs" onSubmit={load}>
      <label>Video <input type="file" name="footage" accept="video/*" required /></label>
      <label>Replay JSON <input type="file" name="annotations" accept=".json" required /></label>
      <button disabled={busy}>{busy ? 'Verifying…' : 'Open replay'}</button>
    </form>
    {error && <p className="padded" role="alert">{error}</p>}
    {clip && <div className="annotated-content">
      <div className="annotated-stage" style={{ aspectRatio: clip.bundle.width + '/' + clip.bundle.height }}>
        <video key={clip.url} ref={video} src={clip.url} controls muted playsInline onSeeked={sync}
          onTimeUpdate={event => { if (!video.current?.requestVideoFrameCallback) sync(event) }}
          onError={() => { setReady(false); setError('This browser could not decode the video.') }}
          onLoadedMetadata={event => {
            const player = event.currentTarget
            if (player.videoWidth !== clip.bundle.width || player.videoHeight !== clip.bundle.height ||
                !Number.isFinite(player.duration) || clip.bundle.frames.at(-1).offset_s >= player.duration) {
              setError('Video dimensions or duration do not match the replay bundle.')
              return
            }
            setReady(true)
            setFrame(frameAtTime(clip.bundle, player.currentTime))
          }}/>
        {ready && frame?.boxes.map((box, index) => {
          const [left, top, right, bottom] = box.xyxy
          const { width, height } = clip.bundle
          const tone = detectionStatus(box.label, box.confidence).tone
          return <span className={'video-box ' + tone} key={index} style={{
            left: left / width * 100 + '%', top: top / height * 100 + '%',
            width: (right - left) / width * 100 + '%', height: (bottom - top) / height * 100 + '%',
          }}><span>{box.label}</span></span>
        })}
      </div>
      <div className="video-observations">
        <p>{ready && frame ? `Frame ${frame.index} · +${frame.offset_s.toFixed(3)} s` : 'No annotation for this frame'}</p>
        {ready && frame?.boxes.map((box, index) => {
          const link = linkedTrack(box, tracks)
          return <button key={index} title={link ? 'Inspect linked observation' : 'Select this frame as local evidence'}
            onClick={() => {
              if (link) onSelectObservation(link.id, link.index)
              onEvidence({ video: clip.name, video_sha256: clip.bundle.video_sha256,
                source: clip.bundle.source, frame: frame.index, offset_s: frame.offset_s, label: box.label,
                linked_track_id: link?.id ?? null, camera_id: link ? box.camera_id : null,
                observation_timestamp: link ? box.observation_timestamp : null })
            }}>{box.label}{box.confidence != null ? ` · ${Math.round(box.confidence * 100)}%` : ''} · {link ? 'Inspect track' : 'Select evidence'}</button>
        })}
      </div>
    </div>}
  </section>
}
