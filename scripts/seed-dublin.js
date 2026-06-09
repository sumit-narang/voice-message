#!/usr/bin/env node
// Seeds Dublin voice notes using macOS built-in TTS (no API keys needed).
// Run: node scripts/seed-dublin.js
// Requires SUPABASE_SERVICE_ROLE_KEY in .env

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const { execSync } = require('child_process')
const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')
const fs = require('fs')
const os = require('os')
const path = require('path')

// Service role key bypasses RLS so we can set a custom expires_at
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
)

const SEED_DEVICE_ID = 'seed-dublin-v1'
const EXPIRES_AT = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

// macOS voices — run `say -v ?` in terminal to see all available voices
const NOTES = [
  {
    voice: 'Moira', // Irish female — perfect for Dublin
    lat: 53.3461, lon: -6.2586,
    text: "Just so you know, the Long Room inside the Old Library at Trinity is stunning. You can peek through the door for free. Worth it just for the vaulted ceiling, and the Book of Kells is right next door.",
  },
  {
    voice: 'Daniel', // British male
    lat: 53.3408, lon: -6.2631,
    text: "Skip the chain coffee on Grafton Street. There's a tiny place tucked inside the arcade on the left heading south. Incredible flat whites and no queue. You'll thank me later.",
  },
  {
    voice: 'Moira',
    lat: 53.3462, lon: -6.2657,
    text: "This bridge opened in 1816 and you used to pay half a penny to cross. That's where the Ha'penny name comes from. Standing here at dusk with the Liffey lit up is honestly one of the best views in the city.",
  },
  {
    voice: 'Samantha', // US female
    lat: 53.3474, lon: -6.2597,
    text: "Random Dublin fact. O'Connell Bridge is wider than it is long, which apparently makes it the only bridge in Europe with that distinction. Also one of the busiest pedestrian crossings in the country.",
  },
  {
    voice: 'Moira',
    lat: 53.3382, lon: -6.2596,
    text: "Best kept secret about Saint Stephen's Green. Come before nine in the morning. The duck pond is peaceful, the flower beds are gorgeous, and you'll have the whole place to yourself before the crowds arrive.",
  },
  {
    voice: 'Karen', // Australian female
    lat: 53.3382, lon: -6.2480,
    text: "Oscar Wilde grew up on this square. His statue is in the northwest corner. He's reclining on a rock looking thoroughly amused. Each side of the plinth has one of his quotes. Worth the five minute detour.",
  },
  {
    voice: 'Daniel',
    lat: 53.3415, lon: -6.3086,
    text: "If you're planning to visit Kilmainham Gaol, book online before you come. You cannot just walk in. It's one of the most powerful historical experiences in Ireland. The 1916 leaders were executed in the stone breakers yard.",
  },
  {
    voice: 'Moira',
    lat: 53.3559, lon: -6.3332,
    text: "There are over six hundred wild deer roaming Phoenix Park completely free. Best chance of spotting them is early morning near the Visitor Centre end. Walk quietly and they'll let you get surprisingly close.",
  },
  {
    voice: 'Samantha',
    lat: 53.3432, lon: -6.2700,
    text: "Underneath Christchurch Cathedral there's a Viking exhibition called Dublinia. A bit touristy but the history is genuinely fascinating if you want to understand how this city started as a Viking settlement around 841 AD.",
  },
  {
    voice: 'Karen',
    lat: 53.3426, lon: -6.2405,
    text: "The Bord Gais Energy Theatre here in the docklands gets world class touring shows. Musicals, comedy, everything. The building itself is stunning. Check what's on, tickets go fast.",
  },
  {
    voice: 'Daniel',
    lat: 53.3309, lon: -6.2686,
    text: "Portobello is the best neighbourhood in Dublin that most tourists miss. Camden Street and Rathmines Road have brilliant independent restaurants and pubs without the tourist markup. Locals actually eat here.",
  },
  {
    voice: 'Moira',
    lat: 53.3456, lon: -6.2672,
    text: "Temple Bar is worth one visit just to see it, but most of what you see here is built for tourists. The Olympia Theatre just around the corner does intimate gigs in a beautiful Victorian building. Check the listings.",
  },
]

function generateAudio(text, voice) {
  const tmpDir = os.tmpdir()
  const aiffPath = path.join(tmpDir, `seed_${Date.now()}.aiff`)
  const m4aPath = path.join(tmpDir, `seed_${Date.now()}.m4a`)
  const textPath = path.join(tmpDir, `seed_${Date.now()}.txt`)

  // Write text to file to avoid shell escaping issues
  fs.writeFileSync(textPath, text, 'utf8')

  // Generate AIFF using macOS say command
  execSync(`say -v "${voice}" -f "${textPath}" -o "${aiffPath}"`)

  // Convert AIFF to M4A (AAC) using macOS afconvert — no external tools needed
  execSync(`afconvert -f m4af -d aac "${aiffPath}" "${m4aPath}"`)

  const buffer = fs.readFileSync(m4aPath)

  // Clean up temp files
  fs.unlinkSync(aiffPath)
  fs.unlinkSync(m4aPath)
  fs.unlinkSync(textPath)

  return buffer
}

async function generateAndUpload(note, index) {
  const filename = `${SEED_DEVICE_ID}/${Date.now()}-${index}.m4a`

  console.log(`[${index + 1}/${NOTES.length}] ${note.voice} @ ${note.lat}, ${note.lon}`)

  const buffer = generateAudio(note.text, note.voice)

  console.log(`  Generated ${(buffer.length / 1024).toFixed(1)}KB — uploading...`)

  const { error: uploadError } = await supabase.storage
    .from('audio')
    .upload(filename, buffer, { contentType: 'audio/mp4', upsert: true })

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

  const { error: insertError } = await supabase.from('messages').insert({
    device_id: SEED_DEVICE_ID,
    audio_url: filename,
    photo_url: null,
    location: `SRID=4326;POINT(${note.lon} ${note.lat})`,
    parent_id: null,
    root_id: null,
    expires_at: EXPIRES_AT,
  })

  if (insertError) throw new Error(`Insert failed: ${insertError.message}`)

  console.log(`  ✓ Done`)
}

async function clearExistingSeed() {
  const { data: files } = await supabase.storage.from('audio').list(SEED_DEVICE_ID)
  if (files && files.length > 0) {
    await supabase.storage
      .from('audio')
      .remove(files.map(f => `${SEED_DEVICE_ID}/${f.name}`))
  }
  await supabase.from('messages').delete().eq('device_id', SEED_DEVICE_ID)
  console.log('Cleared existing seed data.\n')
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env')
    console.error('Get it from: Supabase dashboard → Settings → API → service_role key')
    process.exit(1)
  }

  console.log('Seeding Dublin voice notes using macOS TTS...\n')
  await clearExistingSeed()

  for (let i = 0; i < NOTES.length; i++) {
    await generateAndUpload(NOTES[i], i)
  }

  console.log(`\n✅ Seeded ${NOTES.length} voice notes across Dublin.`)
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
