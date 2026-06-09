import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native'
import * as Location from 'expo-location'
import MapboxGL from '@rnmapbox/maps'
import { useRecorder } from '../hooks/useRecorder'
import { usePlayer } from '../hooks/usePlayer'
import {
  checkCanPost,
  fetchMapMessages,
  fetchMyMessages,
  fetchNearbyMessages,
  fetchReplyCounts,
  postMessage,
  uploadAudio,
} from '../lib/messages'
import { Message } from '../types'

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!)

const { width } = Dimensions.get('window')
const BUTTON_SIZE = width * 0.32
const MAX_DURATION_MS = 20000

type Props = {
  deviceId: string
  onSelectMessage: (msg: Message) => void
}
type Tab = 'map' | 'play' | 'record' | 'mine'

export default function HomeScreen({ deviceId, onSelectMessage }: Props) {
  const [location, setLocation] = useState<Location.LocationObject | null>(null)
  const [permissionError, setPermissionError] = useState(false)
  const [mapMessages, setMapMessages] = useState<Message[]>([])
  const [nearbyMessages, setNearbyMessages] = useState<Message[]>([])
  const [myMessages, setMyMessages] = useState<Message[]>([])
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({})
  const [mineLoading, setMineLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('map')
  const mineLoadedRef = useRef(false)

  const { state, uri, durationMs, startRecording, stopRecording, reset } = useRecorder()
  const { play, stop, playingId, state: playerState } = usePlayer()

  const pulseAnim = useRef(new Animated.Value(1)).current
  const progressAnim = useRef(new Animated.Value(0)).current
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => { requestLocation() }, [])
  useEffect(() => { if (location) loadNearby() }, [location])

  useEffect(() => {
    if (state === 'recording') { startPulse(); startProgress() }
    else { stopPulse(); progressAnim.setValue(0) }
  }, [state])

  useEffect(() => { if (state === 'done' && uri) handleUpload() }, [state, uri])

  async function requestLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') { setPermissionError(true); return }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    setLocation(loc)
  }

  async function loadNearby() {
    if (!location) return
    try {
      const [map, nearby] = await Promise.all([
        fetchMapMessages(location.coords.latitude, location.coords.longitude),
        fetchNearbyMessages(location.coords.latitude, location.coords.longitude),
      ])
      setMapMessages(map)
      setNearbyMessages(nearby)
    } catch {}
  }

  async function loadMine() {
    setMineLoading(true)
    try {
      const msgs = await fetchMyMessages(deviceId)
      setMyMessages(msgs)
      const counts = await fetchReplyCounts(msgs.map(m => m.id))
      setReplyCounts(counts)
    } catch {}
    setMineLoading(false)
    mineLoadedRef.current = true
  }

  function handleMineTab() {
    setActiveTab('mine')
    if (!mineLoadedRef.current) loadMine()
  }

  async function handlePressIn() {
    if (!location) return
    const canPost = await checkCanPost(deviceId, location.coords.latitude, location.coords.longitude)
    if (!canPost) {
      Alert.alert('Already have a note here', 'You already have an active voice note within 25m.')
      return
    }
    startRecording()
  }

  function handlePressOut() {
    if (state !== 'recording') return
    if (durationMs < 1000) { reset(); return }
    stopRecording()
  }

  async function handleUpload() {
    if (!uri || !location) return
    setUploading(true)
    try {
      const audioPath = await uploadAudio(deviceId, uri)
      await postMessage(deviceId, audioPath, location.coords.latitude, location.coords.longitude)
      await loadNearby()
      mineLoadedRef.current = false
      setActiveTab('map')
    } catch {
      Alert.alert('Failed to post', 'Something went wrong. Please try again.')
    } finally {
      setUploading(false)
      reset()
    }
  }

  function startPulse() {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    )
    pulseLoop.current.start()
  }

  function stopPulse() {
    pulseLoop.current?.stop()
    Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start()
  }

  function startProgress() {
    progressAnim.setValue(0)
    Animated.timing(progressAnim, { toValue: 1, duration: MAX_DURATION_MS, useNativeDriver: false }).start()
  }

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
  const isRecording = state === 'recording'
  const isDisabled = uploading || state === 'done'

  if (permissionError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Location access is required to find nearby notes.</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Map — always mounted so state persists across tab switches */}
      <MapboxGL.MapView
        style={[StyleSheet.absoluteFillObject, (activeTab !== 'map') && styles.hidden]}
        styleURL={MapboxGL.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
      >
        {location && (
          <MapboxGL.Camera
            zoomLevel={17}
            centerCoordinate={[location.coords.longitude, location.coords.latitude]}
            animationMode="flyTo"
            animationDuration={800}
          />
        )}
        <MapboxGL.UserLocation visible renderMode="native" />
        {mapMessages.map(msg => (
          <MapboxGL.PointAnnotation
            key={msg.id}
            id={msg.id}
            coordinate={[msg.longitude, msg.latitude]}
            onSelected={() => onSelectMessage(msg)}
          >
            <View style={[styles.pin, playingId === msg.id && styles.pinPlaying]} />
          </MapboxGL.PointAnnotation>
        ))}
      </MapboxGL.MapView>

      {/* Record page */}
      {activeTab === 'record' && (
        <View style={styles.recordPage}>
          <Text style={styles.recordPageTitle}>Leave a note</Text>
          <View style={styles.recordPageBody}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[styles.recordButton, isRecording && styles.recordButtonActive]}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={1}
                disabled={isDisabled}
              >
                {uploading ? (
                  <ActivityIndicator color="#4444ff" size="large" />
                ) : (
                  <View style={[styles.recordInner, isRecording && styles.recordInnerActive]} />
                )}
              </TouchableOpacity>
            </Animated.View>
            {isRecording && (
              <View style={styles.progressContainer}>
                <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
              </View>
            )}
            <Text style={styles.hint}>
              {isRecording
                ? `${Math.ceil((MAX_DURATION_MS - durationMs) / 1000)}s remaining`
                : uploading ? 'Posting...' : 'Hold to record · release to post'}
            </Text>
          </View>
        </View>
      )}

      {/* Play page */}
      {activeTab === 'play' && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Nearby Notes</Text>
          {nearbyMessages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No voice notes nearby</Text>
            </View>
          ) : (
            <FlatList
              data={nearbyMessages}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isPlaying = playingId === item.id && playerState === 'playing'
                const isLoadingPlay = playingId === item.id && playerState === 'loading'
                return (
                  <View style={[styles.card, isPlaying && styles.cardActive]}>
                    <TouchableOpacity
                      style={styles.cardMain}
                      onPress={() => play(item.id, item.audio_url)}
                      activeOpacity={0.8}
                    >
                      <View>
                        <Text style={styles.cardLabel}>Voice note</Text>
                        <Text style={styles.cardTime}>{formatExpiry(item.expires_at)}</Text>
                      </View>
                      <View style={styles.cardActions}>
                        {isLoadingPlay ? (
                          <ActivityIndicator size="small" color="#4444ff" />
                        ) : (
                          <Text style={[styles.playIcon, isPlaying && styles.playIconActive]}>
                            {isPlaying ? '■' : '▶'}
                          </Text>
                        )}
                        <TouchableOpacity
                          style={styles.replyBtn}
                          onPress={() => onSelectMessage(item)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.replyIcon}>↩</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  </View>
                )
              }}
            />
          )}
        </View>
      )}

      {/* Mine page */}
      {activeTab === 'mine' && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>My Notes</Text>
          {mineLoading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator color="#4444ff" />
            </View>
          ) : myMessages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>You haven't left any notes yet</Text>
            </View>
          ) : (
            <FlatList
              data={myMessages}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const count = replyCounts[item.id] ?? 0
                return (
                  <TouchableOpacity
                    style={styles.card}
                    onPress={() => onSelectMessage(item)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cardMain}>
                      <View>
                        <Text style={styles.cardLabel}>Voice note</Text>
                        <Text style={styles.cardTime}>{formatExpiry(item.expires_at)}</Text>
                      </View>
                      <View style={styles.cardActions}>
                        {count > 0 && (
                          <View style={styles.replyBadge}>
                            <Text style={styles.replyBadgeText}>{count}</Text>
                          </View>
                        )}
                        <Text style={styles.chevron}>›</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )
              }}
            />
          )}
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBarWrapper} pointerEvents="box-none">
        <View style={styles.tabPill}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'map' && styles.tabBtnActive]}
            onPress={() => { stop(); setActiveTab('map') }}
          >
            <Text style={[styles.tabLabel, activeTab === 'map' && styles.tabLabelActive]}>Map</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'play' && styles.tabBtnActive]}
            onPress={() => setActiveTab('play')}
          >
            <Text style={[styles.tabLabel, activeTab === 'play' && styles.tabLabelActive]}>
              {`Play${nearbyMessages.length > 0 ? `  ${nearbyMessages.length}` : ''}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'record' && styles.tabBtnActive]}
            onPress={() => setActiveTab('record')}
          >
            <Text style={[styles.tabLabel, activeTab === 'record' && styles.tabLabelActive]}>Record</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'mine' && styles.tabBtnActive]}
            onPress={handleMineTab}
          >
            <Text style={[styles.tabLabel, activeTab === 'mine' && styles.tabLabelActive]}>
              {`Mine${Object.values(replyCounts).some(c => c > 0) ? '  ●' : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
  container: { flex: 1, backgroundColor: '#111111' },
  hidden: { opacity: 0 },
  center: {
    flex: 1, backgroundColor: '#111111',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  errorText: { color: '#888', textAlign: 'center', fontSize: 16 },

  pin: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#4444ff', borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#4444ff', shadowOpacity: 0.8, shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  pinPlaying: { backgroundColor: '#ff4444', shadowColor: '#ff4444' },

  // Record page
  recordPage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0d0d1a',
    paddingBottom: 100,
  },
  recordPageTitle: {
    color: '#fff', fontSize: 22, fontWeight: '700',
    paddingHorizontal: 20, paddingTop: 64, paddingBottom: 12,
  },
  recordPageBody: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20,
  },
  recordButton: {
    width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2,
    backgroundColor: 'rgba(15, 15, 40, 0.88)', borderWidth: 3, borderColor: '#4444ff',
    alignItems: 'center', justifyContent: 'center',
  },
  recordButtonActive: { borderColor: '#6666ff', backgroundColor: 'rgba(15, 15, 60, 0.92)' },
  recordInner: {
    width: BUTTON_SIZE * 0.45, height: BUTTON_SIZE * 0.45,
    borderRadius: BUTTON_SIZE * 0.225, backgroundColor: '#4444ff',
  },
  recordInnerActive: {
    backgroundColor: '#ff4444', borderRadius: 6,
    width: BUTTON_SIZE * 0.35, height: BUTTON_SIZE * 0.35,
  },
  progressContainer: {
    width: BUTTON_SIZE, height: 3, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2, overflow: 'hidden',
  },
  progressBar: { height: 3, backgroundColor: '#4444ff', borderRadius: 2 },
  hint: { color: '#888', fontSize: 13, letterSpacing: 0.3 },

  // Shared panel (Play + Mine)
  panel: {
    ...StyleSheet.absoluteFillObject, backgroundColor: '#f5f5f0', paddingBottom: 100,
  },
  panelTitle: {
    color: '#111', fontSize: 22, fontWeight: '700',
    paddingHorizontal: 20, paddingTop: 64, paddingBottom: 12,
  },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#999', fontSize: 15 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#e8e8e8', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardActive: { borderColor: '#4444ff' },
  cardMain: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
  },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardLabel: { color: '#111', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  cardTime: { color: '#999', fontSize: 12 },
  playIcon: { color: '#4444ff', fontSize: 18 },
  playIconActive: { color: '#ff4444' },
  replyBtn: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
    borderRadius: 15, backgroundColor: '#f0f0f0',
  },
  replyIcon: { fontSize: 15, color: '#888' },
  replyBadge: {
    backgroundColor: '#4444ff', borderRadius: 10,
    minWidth: 22, height: 22, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  replyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  chevron: { fontSize: 22, color: '#ccc' },

  // Tab bar
  tabBarWrapper: {
    position: 'absolute', bottom: 36, left: 0, right: 0, alignItems: 'center',
  },
  tabPill: {
    flexDirection: 'row', backgroundColor: 'rgba(15, 15, 25, 0.93)',
    borderRadius: 32, padding: 4, borderWidth: 1, borderColor: '#252535', gap: 2,
  },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 13, borderRadius: 28 },
  tabBtnActive: { backgroundColor: '#4444ff' },
  tabLabel: { color: '#666', fontSize: 14, fontWeight: '600', letterSpacing: 0.2 },
  tabLabelActive: { color: '#fff' },
})
