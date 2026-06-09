import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { usePlayer } from '../hooks/usePlayer'
import { useRecorder } from '../hooks/useRecorder'
import { fetchReplies, postMessage, uploadAudio } from '../lib/messages'
import { Message } from '../types'

const MAX_DURATION_MS = 20000
const RECORD_BTN_SIZE = 64

type Props = {
  message: Message
  deviceId: string
  onBack: () => void
}

export default function MessageDetailScreen({ message, deviceId, onBack }: Props) {
  const [replies, setReplies] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const { play, stop, playingId, state: playerState } = usePlayer()
  const { state: recState, uri, durationMs, startRecording, stopRecording, reset } = useRecorder()
  const pulseAnim = useRef(new Animated.Value(1)).current
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => { loadReplies() }, [])
  useEffect(() => {
    if (recState === 'recording') startPulse()
    else stopPulse()
  }, [recState])
  useEffect(() => {
    if (recState === 'done' && uri) handleUpload()
  }, [recState, uri])

  async function loadReplies() {
    try {
      const data = await fetchReplies(message.root_id ?? message.id)
      setReplies(data)
    } catch {}
    setLoading(false)
  }

  async function handlePressIn() {
    startRecording()
  }

  function handlePressOut() {
    if (recState !== 'recording') return
    if (durationMs < 1000) { reset(); return }
    stopRecording()
  }

  async function handleUpload() {
    if (!uri) return
    setUploading(true)
    try {
      const rootId = message.root_id ?? message.id
      const audioPath = await uploadAudio(deviceId, uri)
      await postMessage(deviceId, audioPath, message.latitude, message.longitude, undefined, message.id, rootId)
      await loadReplies()
    } catch {
      Alert.alert('Failed to post reply', 'Something went wrong.')
    } finally {
      setUploading(false)
      reset()
    }
  }

  function startPulse() {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    )
    pulseLoop.current.start()
  }

  function stopPulse() {
    pulseLoop.current?.stop()
    Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start()
  }

  const isRecording = recState === 'recording'
  const isDisabled = uploading || recState === 'done'

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => { stop(); onBack() }}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Note</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={replies}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <Text style={styles.sectionLabel}>Original</Text>
            <NoteCard item={message} playingId={playingId} playerState={playerState} onPlay={() => play(message.id, message.audio_url)} />
            <Text style={styles.sectionLabel}>
              {loading ? 'Loading replies...' : `Replies${replies.length > 0 ? ` (${replies.length})` : ''}`}
            </Text>
          </>
        }
        ListEmptyComponent={
          !loading ? <Text style={styles.emptyText}>No replies yet. Be the first!</Text> : null
        }
        renderItem={({ item }) => (
          <NoteCard item={item} playingId={playingId} playerState={playerState} onPlay={() => play(item.id, item.audio_url)} />
        )}
      />

      <View style={styles.footer}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={1}
            disabled={isDisabled}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={[styles.recordInner, isRecording && styles.recordInnerActive]} />
            )}
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.recordHint}>
          {isRecording
            ? `${Math.ceil((MAX_DURATION_MS - durationMs) / 1000)}s`
            : uploading ? 'Posting...' : 'Hold to reply'}
        </Text>
      </View>
    </SafeAreaView>
  )
}

function NoteCard({
  item,
  playingId,
  playerState,
  onPlay,
}: {
  item: Message
  playingId: string | null
  playerState: string
  onPlay: () => void
}) {
  const isPlaying = playingId === item.id && playerState === 'playing'
  const isLoading = playingId === item.id && playerState === 'loading'

  return (
    <TouchableOpacity
      style={[styles.card, isPlaying && styles.cardActive]}
      onPress={onPlay}
      activeOpacity={0.8}
    >
      <View>
        <Text style={styles.cardLabel}>Voice note</Text>
        <Text style={styles.cardTime}>{formatExpiry(item.expires_at)}</Text>
      </View>
      <View style={styles.playSlot}>
        {isLoading ? (
          <ActivityIndicator size="small" color="#4444ff" />
        ) : (
          <Text style={[styles.playIcon, isPlaying && styles.playIconActive]}>
            {isPlaying ? '■' : '▶'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

function formatExpiry(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  const hours = Math.floor(ms / 1000 / 60 / 60)
  const mins = Math.floor((ms / 1000 / 60) % 60)
  if (hours > 0) return `${hours}h left`
  if (mins > 0) return `${mins}m left`
  return 'expiring soon'
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f0' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  backBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 36, color: '#4444ff', lineHeight: 44 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111' },

  listContent: { padding: 16, paddingBottom: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#999',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4,
  },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: '#e8e8e8',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardActive: { borderColor: '#4444ff' },
  cardLabel: { color: '#111', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  cardTime: { color: '#999', fontSize: 12 },
  playSlot: { width: 32, alignItems: 'center' },
  playIcon: { fontSize: 20, color: '#4444ff' },
  playIconActive: { color: '#ff4444' },

  emptyText: { color: '#bbb', fontSize: 14, textAlign: 'center', paddingVertical: 24 },

  footer: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e8e8e8',
    alignItems: 'center', paddingVertical: 20, paddingBottom: 32, gap: 10,
  },
  recordBtn: {
    width: RECORD_BTN_SIZE, height: RECORD_BTN_SIZE, borderRadius: RECORD_BTN_SIZE / 2,
    backgroundColor: '#4444ff', alignItems: 'center', justifyContent: 'center',
  },
  recordBtnActive: { backgroundColor: '#2222cc' },
  recordInner: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  recordInnerActive: { backgroundColor: '#ff4444', borderRadius: 4, width: 18, height: 18 },
  recordHint: { color: '#888', fontSize: 13 },
})
