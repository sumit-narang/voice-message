# Voice Message

Leave ephemeral voice notes tied to GPS coordinates. Walk past a spot and hear what people left behind — notes disappear after 24 hours.

## How it works

- Hold the record button to leave a voice note (up to 20 seconds) at your current location
- See nearby notes as pins on the map — tap a pin to play it
- Notes expire after 24 hours and are permanently deleted
- One active note per person within 25m — no spamming the same spot
- Discover notes within 100m of you

## Tech stack

- **React Native** + Expo SDK 54
- **Supabase** — Postgres + PostGIS for geo queries, Storage for audio files
- **Mapbox** — interactive map with voice note pins
- **expo-audio** — recording and playback
- **EAS Build** — cloud builds for iOS

## Getting started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- A Supabase project
- A Mapbox account

### Environment variables

Create a `.env` file in the root:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token
```

### Install dependencies

```bash
npm install
```

### Run locally (Metro only)

```bash
expo start
```

> Requires an EAS development build installed on your device — Expo Go is not supported due to native modules (Mapbox, expo-audio).

### Build for device

```bash
eas build --platform ios --profile development
```

Scan the QR code from the EAS dashboard to install on your iPhone.

## Project structure

```
src/
  screens/      # HomeScreen — map, record button, play list
  hooks/        # useRecorder, usePlayer
  lib/          # supabase client, messages API, device identity
  types/        # shared TypeScript types
assets/         # app icons and splash screen
```

## Notes

- Audio is stored privately in Supabase Storage with signed URLs (1-hour expiry)
- Device identity is anonymous — a UUID generated on first launch and stored in secure storage
- PostGIS handles all geo queries (nearby discovery, posting radius check)
