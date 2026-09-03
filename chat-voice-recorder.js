(() => {
  const MAX_AUDIO_BYTES = 20 * 1024 * 1024
  const preferredMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return ''
    return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => {
      try { return MediaRecorder.isTypeSupported(type) } catch (_) { return false }
    }) || ''
  }
  const friendlyError = (error) => {
    const name = String(error?.name || '')
    const code = String(error?.code || error?.message || '').toUpperCase()
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Permita o acesso ao microfone para gravar uma mensagem de voz.'
    if (code.includes('MISSING_PERMISSION')) return 'Permita o acesso ao microfone para gravar uma mensagem de voz.'
    if (code.includes('MICROPHONE_BEING_USED')) return 'O microfone está sendo usado por outro aplicativo.'
    if (code.includes('DEVICE_CANNOT_VOICE_RECORD')) return 'Este aparelho não oferece gravação pelo microfone.'
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Nenhum microfone foi encontrado neste dispositivo.'
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'O microfone está sendo usado por outro aplicativo.'
    return error?.message || 'Não foi possível iniciar o microfone.'
  }
  let registeredNativeRecorder = null
  const nativeVoiceRecorder = () => {
    const capacitor = window.Capacitor
    const platform = String(capacitor?.getPlatform?.() || '').toLowerCase()
    const isNative = typeof capacitor?.isNativePlatform === 'function'
      ? capacitor.isNativePlatform()
      : platform === 'android' || platform === 'ios'
    if (!isNative) return null
    if (capacitor?.Plugins?.VoiceRecorder) return capacitor.Plugins.VoiceRecorder
    if (!registeredNativeRecorder && typeof capacitor?.registerPlugin === 'function') {
      registeredNativeRecorder = capacitor.registerPlugin('VoiceRecorder')
    }
    return registeredNativeRecorder
  }
  const asPayload = (blob, durationSeconds) => new Promise((resolve, reject) => {
    if (!blob?.size) return reject(new Error('A gravação ficou vazia. Tente novamente.'))
    if (blob.size > MAX_AUDIO_BYTES) return reject(new Error('A mensagem de voz deve ter no máximo 20 MB.'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível preparar a mensagem de voz.'))
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : ''
      if (!base64) return reject(new Error('A gravação ficou inválida. Tente novamente.'))
      resolve({ kind: 'audio', recorded: true, mimeType: String(blob.type || 'audio/wav').split(';')[0].toLowerCase(), base64, dataUrl, durationSeconds })
    }
    reader.readAsDataURL(blob)
  })
  const encodeWav = (chunks, sampleRate) => {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
    const buffer = new ArrayBuffer(44 + length * 2)
    const view = new DataView(buffer)
    const text = (offset, value) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)) }
    text(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); text(8, 'WAVE'); text(12, 'fmt ')
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
    text(36, 'data'); view.setUint32(40, length * 2, true)
    let offset = 44
    chunks.forEach((chunk) => { for (let i = 0; i < chunk.length; i += 1) { const sample = Math.max(-1, Math.min(1, chunk[i])); view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2 } })
    return new Blob([buffer], { type: 'audio/wav' })
  }
  class VoiceRecorder {
    constructor() { this.stream = null; this.recorder = null; this.nativeRecorder = null; this.chunks = []; this.audioContext = null; this.sourceNode = null; this.processorNode = null; this.silentGain = null; this.pcmChunks = []; this.sampleRate = 48000; this.startedAt = 0; this.active = false }
    async start() {
      if (this.active) return
      const nativeRecorder = nativeVoiceRecorder()
      if (nativeRecorder) {
        try {
          const capable = await nativeRecorder.canDeviceVoiceRecord()
          if (capable?.value !== true) throw new Error('DEVICE_CANNOT_VOICE_RECORD')
          let permission = await nativeRecorder.hasAudioRecordingPermission()
          if (permission?.value !== true) permission = await nativeRecorder.requestAudioRecordingPermission()
          if (permission?.value !== true) throw new Error('MISSING_PERMISSION')
          await nativeRecorder.startRecording()
          this.nativeRecorder = nativeRecorder
          this.startedAt = performance.now()
          this.active = true
          return
        } catch (error) {
          this.nativeRecorder = null
          throw new Error(friendlyError(error))
        }
      }
      throw new Error('Mensagens de voz estão disponíveis somente no app instalado.')
      /* O restante é mantido apenas como compatibilidade de código legado e não é alcançado no navegador. */
      if (!navigator.mediaDevices?.getUserMedia) {
        const insecurePage = window.isSecureContext === false
        throw new Error(insecurePage
          ? 'A gravação exige uma conexão segura. Atualize o aplicativo VS Hook para liberar o microfone.'
          : 'O microfone não está disponível neste aparelho. Atualize o VS Hook e o componente WebView do sistema.')
      }
      try { this.stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) }
      catch (error) { throw new Error(friendlyError(error)) }
      this.startedAt = performance.now(); this.active = true
      const mimeType = preferredMimeType()
      if (typeof MediaRecorder !== 'undefined') {
        try {
          this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType, audioBitsPerSecond: 64000 }) : new MediaRecorder(this.stream)
          this.chunks = []; this.recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) this.chunks.push(event.data) }); this.recorder.start(250); return
        } catch (_) { this.recorder = null; this.chunks = [] }
      }
      const Context = window.AudioContext || window.webkitAudioContext
      if (!Context) { this.cleanup(); throw new Error('A gravação de voz não é compatível com este dispositivo.') }
      this.audioContext = new Context(); if (this.audioContext.state === 'suspended') await this.audioContext.resume()
      this.sampleRate = this.audioContext.sampleRate || 48000; this.pcmChunks = []; this.sourceNode = this.audioContext.createMediaStreamSource(this.stream); this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1); this.silentGain = this.audioContext.createGain(); this.silentGain.gain.value = 0
      this.processorNode.onaudioprocess = (event) => { if (this.active) this.pcmChunks.push(new Float32Array(event.inputBuffer.getChannelData(0))) }
      this.sourceNode.connect(this.processorNode); this.processorNode.connect(this.silentGain); this.silentGain.connect(this.audioContext.destination)
    }
    elapsedSeconds() { return this.startedAt ? Math.max(0, (performance.now() - this.startedAt) / 1000) : 0 }
    async stop() {
      if (!this.active) throw new Error('Nenhuma gravação está ativa.')
      const duration = this.elapsedSeconds(); let blob
      if (this.nativeRecorder) {
        const recorder = this.nativeRecorder
        try {
          const result = await recorder.stopRecording()
          const value = result?.value || result || {}
          const rawBase64 = String(value.recordDataBase64 || '')
          const base64 = rawBase64.includes(',') ? rawBase64.slice(rawBase64.indexOf(',') + 1) : rawBase64
          const mimeType = String(value.mimeType || 'audio/aac').split(';')[0].toLowerCase()
          const durationSeconds = Number(value.msDuration) > 0 ? Number(value.msDuration) / 1000 : duration
          if (!base64) throw new Error('A gravação ficou vazia. Tente novamente.')
          if (Math.ceil(base64.length * 3 / 4) > MAX_AUDIO_BYTES) throw new Error('A mensagem de voz deve ter no máximo 20 MB.')
          this.active = false
          this.cleanup()
          return { kind: 'audio', recorded: true, mimeType, base64, dataUrl: `data:${mimeType};base64,${base64}`, durationSeconds }
        } catch (error) {
          this.active = false
          this.cleanup()
          throw new Error(friendlyError(error))
        }
      }
      if (this.recorder) {
        blob = await new Promise((resolve, reject) => {
          const recorder = this.recorder
          recorder.addEventListener('stop', () => resolve(new Blob(this.chunks, { type: String(recorder.mimeType || this.chunks[0]?.type || 'audio/webm') })), { once: true })
          recorder.addEventListener('error', () => reject(new Error('A gravação de voz foi interrompida.')), { once: true })
          try { if (recorder.state === 'recording') recorder.requestData(); recorder.stop() } catch (error) { reject(error) }
        })
      } else blob = encodeWav(this.pcmChunks, this.sampleRate)
      this.active = false; this.cleanup(); return asPayload(blob, duration)
    }
    cancel() { this.active = false; if (this.nativeRecorder) this.nativeRecorder.stopRecording().catch(() => {}); if (this.recorder && this.recorder.state !== 'inactive') try { this.recorder.stop() } catch (_) {}; this.cleanup() }
    cleanup() {
      if (this.processorNode) { this.processorNode.onaudioprocess = null; try { this.processorNode.disconnect() } catch (_) {} }
      if (this.sourceNode) try { this.sourceNode.disconnect() } catch (_) {}; if (this.silentGain) try { this.silentGain.disconnect() } catch (_) {}
      if (this.audioContext) this.audioContext.close().catch(() => {}); if (this.stream) this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null; this.recorder = null; this.nativeRecorder = null; this.audioContext = null; this.sourceNode = null; this.processorNode = null; this.silentGain = null; this.chunks = []; this.pcmChunks = []; this.startedAt = 0
    }
  }
  window.VSHookVoiceRecorder = VoiceRecorder
})()
