import { useRef, useState } from 'react'
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio'

const MAX_DURATION_MS = 20000

export type RecorderState = 'idle' | 'recording' | 'done' | 'error'

export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [uri, setUri] = useState<string | null>(null)
  const [durationMs, setDurationMs] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)

  async function startRecording() {
    try {
      const { granted } = await requestRecordingPermissionsAsync()
      if (!granted) return

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()

      startTimeRef.current = Date.now()
      setState('recording')
      setDurationMs(0)

      timerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current)
      }, 100)

      autoStopRef.current = setTimeout(() => stopRecording(), MAX_DURATION_MS)
    } catch (e) {
      console.error('Recording error:', e)
      setState('error')
    }
  }

  async function stopRecording() {
    clearInterval(timerRef.current!)
    clearTimeout(autoStopRef.current!)
    try {
      await recorder.stop()
      const fileUri = recorder.uri
      if (fileUri) {
        setUri(fileUri)
        setState('done')
      } else {
        setState('error')
      }
    } catch (e) {
      console.error('Stop error:', e)
      setState('error')
    }
  }

  function reset() {
    setUri(null)
    setDurationMs(0)
    setState('idle')
  }

  return { state, uri, durationMs, startRecording, stopRecording, reset }
}
