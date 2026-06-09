import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { getDeviceId } from './src/lib/identity'
import HomeScreen from './src/screens/HomeScreen'
import MessageDetailScreen from './src/screens/MessageDetailScreen'
import { Message } from './src/types'

export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)

  useEffect(() => {
    getDeviceId().then(setDeviceId)
  }, [])

  if (!deviceId) return <View style={styles.container} />

  if (selectedMessage) {
    return (
      <>
        <StatusBar style="dark" />
        <MessageDetailScreen
          message={selectedMessage}
          deviceId={deviceId}
          onBack={() => setSelectedMessage(null)}
        />
      </>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <HomeScreen deviceId={deviceId} onSelectMessage={setSelectedMessage} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111111' },
})
