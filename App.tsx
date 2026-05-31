import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { getDeviceId } from './src/lib/identity'
import HomeScreen from './src/screens/HomeScreen'

export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null)

  useEffect(() => {
    getDeviceId().then(setDeviceId)
  }, [])

  if (!deviceId) return <View style={styles.container} />

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <HomeScreen deviceId={deviceId} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
})
