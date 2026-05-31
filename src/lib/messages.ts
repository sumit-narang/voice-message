import { supabase } from './supabase'
import { Message } from '../types'
import * as FileSystem from 'expo-file-system/legacy'

const DISCOVERY_RADIUS_METERS = 100
const POSTING_RADIUS_METERS = 25

export async function fetchNearbyMessages(
  latitude: number,
  longitude: number
): Promise<Message[]> {
  const { data, error } = await supabase.rpc('get_nearby_messages', {
    lat: latitude,
    lon: longitude,
    radius: DISCOVERY_RADIUS_METERS,
  })
  if (error) throw error
  return (data ?? []).map(extractCoords).filter(
    (m: any) => typeof m.latitude === 'number' && typeof m.longitude === 'number'
  ) as Message[]
}

function extractCoords(msg: any): any {
  if (typeof msg.latitude === 'number' && typeof msg.longitude === 'number') return msg
  // location is a PostGIS EWKB hex string — decode it
  if (typeof msg.location !== 'string') return msg
  try {
    let offset = 2 // skip byte order byte
    const geomType = parseInt(msg.location.slice(offset, offset + 8), 16)
    offset += 8
    if (geomType & 0x20000000) offset += 8 // skip SRID if present
    const buf = new ArrayBuffer(8)
    const view = new DataView(buf)
    const readDouble = (hex: string) => {
      for (let i = 0; i < 8; i++) view.setUint8(i, parseInt(hex.slice(i * 2, i * 2 + 2), 16))
      return view.getFloat64(0, true)
    }
    return {
      ...msg,
      longitude: readDouble(msg.location.slice(offset, offset + 16)),
      latitude: readDouble(msg.location.slice(offset + 16, offset + 32)),
    }
  } catch {
    return msg
  }
}

export async function checkCanPost(
  deviceId: string,
  latitude: number,
  longitude: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_post_message', {
    p_device_id: deviceId,
    lat: latitude,
    lon: longitude,
    radius: POSTING_RADIUS_METERS,
  })
  if (error) throw error
  return data === true
}

export async function uploadAudio(
  deviceId: string,
  uri: string
): Promise<string> {
  const filename = `${deviceId}/${Date.now()}.m4a`
  const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/audio/${filename}`

  // Upload raw binary directly — avoids base64 corruption from JS blob pipeline
  const result = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
      'Content-Type': 'audio/mp4',
    },
  })

  if (result.status !== 200) {
    throw new Error(`Upload failed: ${result.status} ${result.body}`)
  }

  return filename
}

export async function uploadPhoto(
  deviceId: string,
  uri: string
): Promise<string> {
  const filename = `${deviceId}/${Date.now()}.jpg`
  const response = await fetch(uri)
  const blob = await response.blob()

  const { error } = await supabase.storage
    .from('photos')
    .upload(filename, blob, { contentType: 'image/jpeg', upsert: false })

  if (error) throw error
  return filename
}

export async function postMessage(
  deviceId: string,
  audioPath: string,
  latitude: number,
  longitude: number,
  photoPath?: string,
  parentId?: string,
  rootId?: string
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      device_id: deviceId,
      audio_url: audioPath,
      photo_url: photoPath ?? null,
      location: `POINT(${longitude} ${latitude})`,
      parent_id: parentId ?? null,
      root_id: rootId ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function incrementPlayCount(messageId: string): Promise<void> {
  await supabase.rpc('increment_play_count', { message_id: messageId })
}

export async function getSignedUrl(
  bucket: 'audio' | 'photos',
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}
