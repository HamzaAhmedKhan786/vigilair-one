import React, { useEffect, useRef, useState } from 'react'

const cameraURL = import.meta.env.VITE_LIVE_CAMERA_URL || ''

function pcmWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
  write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true))
  return new Blob([buffer], { type: 'audio/wav' })
}

async function recordedWav(blob) {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const length = 80_000
    const offline = new OfflineAudioContext(1, length, 16000)
    const mono = context.createBuffer(1, decoded.length, decoded.sampleRate)
    const merged = mono.getChannelData(0)
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const source = decoded.getChannelData(channel)
      for (let index = 0; index < source.length; index++) merged[index] += source[index] / decoded.numberOfChannels
    }
    const node = offline.createBufferSource()
    node.buffer = mono
    node.connect(offline.destination)
    node.start()
    const rendered = await offline.startRendering()
    return pcmWav(rendered.getChannelData(0), 16000)
  } finally { await context.close() }
}

export function LiveInputs({ workspace }) {
  const videoRef = useRef(null)
  const cameraStream = useRef(null)
  const micStream = useRef(null)
  const audioContext = useRef(null)
  const animation = useRef(null)
  const recorder = useRef(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [cameraSource, setCameraSource] = useState('off')
  const [level, setLevel] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const [message, setMessage] = useState('Enable a source to review local input. No model prediction is available.')
  const siteId = workspace.focus ?? workspace.scenario?.default_visible[0]
  const microphone = workspace.data.sensors.find(sensor => sensor.site_id === siteId && sensor.kind === 'microphone')

  const stopCamera = () => {
    cameraStream.current?.getTracks().forEach(track => track.stop())
    cameraStream.current = null
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; videoRef.current.removeAttribute('src') }
    setCameraOn(false); setCameraSource('off')
  }
  const startLaptopCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    cameraStream.current = stream
    if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
    setCameraOn(true); setCameraSource('laptop camera')
  }
  const toggleCamera = async () => {
    if (cameraOn) { stopCamera(); return }
    try {
      if (cameraURL) {
        if (videoRef.current) { videoRef.current.src = cameraURL; await videoRef.current.play() }
        setCameraOn(true); setCameraSource('configured browser video')
      } else await startLaptopCamera()
    } catch (error) { stopCamera(); setMessage(`Camera unavailable: ${error.message}`) }
  }
  const stopMic = () => {
    if (animation.current) cancelAnimationFrame(animation.current)
    if (recorder.current?.state === 'recording') recorder.current.stop()
    micStream.current?.getTracks().forEach(track => track.stop())
    micStream.current = null
    void audioContext.current?.close()
    audioContext.current = null
    setMicOn(false); setLevel(null)
  }
  const toggleMic = async () => {
    if (micOn) { stopMic(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
      micStream.current = stream
      const context = new AudioContext()
      audioContext.current = context
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      const samples = new Float32Array(analyser.fftSize)
      const update = () => {
        analyser.getFloatTimeDomainData(samples)
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)
        setLevel(Math.max(-90, Math.round(20 * Math.log10(Math.max(rms, 1e-6)))))
        animation.current = requestAnimationFrame(update)
      }
      update(); setMicOn(true)
    } catch (error) { stopMic(); setMessage(`Microphone unavailable: ${error.message}`) }
  }
  const capture = async () => {
    if (!micStream.current || !microphone || capturing) return
    try {
      const recorderInstance = new MediaRecorder(micStream.current)
      recorder.current = recorderInstance
      const chunks = []
      setCapturing(true); setMessage('Capturing five seconds from the selected laptop microphone…')
      recorderInstance.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorderInstance.onstop = async () => {
        try {
          const wav = await recordedWav(new Blob(chunks, { type: recorderInstance.mimeType }))
          const file = new File([wav], `microphone-${Date.now()}.wav`, { type: 'audio/wav' })
          await workspace.upload(file, microphone)
          setMessage('Five-second 16 kHz mono WAV preserved. Inspect the measured spectrogram in Research Lab; drone classification is unavailable.')
        } catch (error) { setMessage(`Capture could not be preserved: ${error.message}`) }
        finally { setCapturing(false) }
      }
      recorderInstance.start()
      setTimeout(() => { if (recorderInstance.state === 'recording') recorderInstance.stop() }, 5000)
    } catch (error) { setCapturing(false); setMessage(`Capture unavailable: ${error.message}`) }
  }
  useEffect(() => () => {
    cameraStream.current?.getTracks().forEach(track => track.stop())
    micStream.current?.getTracks().forEach(track => track.stop())
    if (animation.current) cancelAnimationFrame(animation.current)
    void audioContext.current?.close()
  }, [])

  return <section className="panel research-section live-inputs" aria-label="Optional local live inputs"><div className="panel-heading"><div><small>OPT-IN LOCAL INPUT · NO AUTOMATED CLASSIFICATION</small><h2>Live camera and microphone</h2></div><span className="badge neutral">{siteId ?? 'No fictional site'}</span></div>
    <div className="live-input-grid"><div><label><input type="checkbox" checked={cameraOn} onChange={toggleCamera}/> Live video</label><small>{cameraOn ? cameraSource : cameraURL ? 'Configured browser source available' : 'Falls back to laptop camera'}</small><video ref={videoRef} muted playsInline controls={false} onError={() => { if (cameraURL && !cameraStream.current) { void startLaptopCamera().catch(error => setMessage(`Camera unavailable: ${error.message}`)) } }}/></div>
      <div><label><input type="checkbox" checked={micOn} onChange={toggleMic}/> Live microphone</label><small>{micOn ? `Measured sound level ${level ?? '—'} dBFS · ${level != null && level > -50 ? 'sound activity' : 'quiet'}` : 'Laptop microphone, with permission'}</small><meter min="-90" max="0" value={level ?? -90} aria-label="Measured microphone level in dBFS"/><button disabled={!micOn || !microphone || capturing} onClick={capture}>{capturing ? 'Capturing…' : 'Capture 5 s WAV'}</button><small>{microphone ? `Virtual sensor: ${microphone.name}` : 'Add a virtual microphone for this fictional site in Research Lab to preserve a capture.'}</small></div></div>
    <p className="research-note" role="status">{message}</p>
  </section>
}
