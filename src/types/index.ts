export type Message = {
  id: string
  user_device_id: string
  audio_url: string
  photo_url: string | null
  latitude: number
  longitude: number
  parent_id: string | null
  root_id: string | null
  expires_at: string
  created_at: string
  play_count: number
}

export type Thread = {
  original: Message
  replies: {
    reply: Message
    response: Message | null
  }[]
}
