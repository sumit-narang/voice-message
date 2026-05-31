import { useRef, useState } from 'react'
import { Alert } from 'react-native'
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { getSignedUrl, incrementPlayCount } from '../lib/messages'

export type PlayerState = 'idle' | 'loading' | 'playing' | 'done' | 'error'

export function usePlayer() {
  const [state, setState] = useState<PlayerState>('idle')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null)

  function stop() {
    if (playerRef.current) {
      try { playerRef.current.remove() } catch {}
      playerRef.current = null
    }
    setState('idle')
    setPlayingId(null)
  }

  async function play(messageId: string, audioPath: string) {
    if (playingId === messageId && state === 'playing') {
      stop()
      return
    }

    stop()
    setState('loading')
    setPlayingId(messageId)

    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })

      const url = await getSignedUrl('audio', audioPath)
      const cacheUri = `${FileSystem.cacheDirectory}audio_${messageId}.m4a`

      const existing = await FileSystem.getInfoAsync(cacheUri)
      if (!existing.exists) {
        await FileSystem.downloadAsync(url, cacheUri)
      }

      const player = createAudioPlayer({ uri: cacheUri })
      playerRef.current = player

      player.addListener('playbackStatusUpdate', (status: any) => {
        if (status.playing) setState('playing')
        if (status.didJustFinish) {
          setState('done')
          setPlayingId(null)
          player.remove()
          playerRef.current = null
        }
      })

      player.play()
      await incrementPlayCount(messageId)
    } catch (e: any) {
      Alert.alert('Playback failed', e?.message ?? 'Could not play this note.')
      setState('error')
      setPlayingId(null)
    }
  }

  return { play, stop, state, playingId }
}
