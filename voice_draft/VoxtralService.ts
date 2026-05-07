/**
 * VoxtralService.ts
 * ─────────────────────────────────────────────────────────────────
 * Thin wrapper around the Mistral TTS API (Voxtral-4B-TTS-2603).
 *
 * Responsibilities:
 *  - Accept text + bot identifier → return a local file URI for expo-av
 *  - Manage temp file lifecycle (write to cache, clean up after playback)
 *  - Handle API errors gracefully (no error should crash voice mode)
 *
 * NOT responsible for:
 *  - Playback (that lives in PlaybackQueue)
 *  - Voice mode on/off state (that lives in VoiceModeContext)
 *
 * PLACEHOLDERS:
 *  - EXPO_PUBLIC_MISTRAL_API_KEY  — add to .env
 *  - MAUK_VOICE_PRESET            — replace with preset ID or reference URI
 *  - ABACI_VOICE_PRESET           — replace with preset ID or reference URI
 *
 * STREAMING UPGRADE NOTE:
 *  This implementation uses non-streaming MP3 for simplicity.
 *  To upgrade to streaming PCM (TTFA ~0.8s), see the comment block
 *  at the bottom of this file.
 * ─────────────────────────────────────────────────────────────────
 */

import * as FileSystem from 'expo-file-system'

// ── Constants ────────────────────────────────────────────────────

const MISTRAL_TTS_URL = 'https://api.mistral.ai/v1/audio/speech'
const VOXTRAL_MODEL = 'mistralai/Voxtral-4B-TTS-2603'

// Voice presets for each bot.
// These are placeholders — swap for actual preset IDs from Mistral's
// voice list, or replace with reference audio URIs for voice cloning.
//
// MAUK: Refined Dutch/Continental male. Escher-like precision.
//   → ideal source: 10–20s clip of a formal older Dutch male academic
//   → placeholder: closest available preset (formal European male)
//
// ABACI: Turkish woman, British primary + slight American influence.
//   → ideal source: 10–20s clip of a Turkish-British female speaker
//   → placeholder: closest available preset (neutral British female)
const BOT_VOICES: Record<'a' | 'b', string> = {
  a: 'MAUK_VOICE_PRESET',   // MAUK — placeholder, see above
  b: 'ABACI_VOICE_PRESET',  // ABACI — placeholder, see above
}

const API_KEY = process.env.EXPO_PUBLIC_MISTRAL_API_KEY ?? 'EXPO_PUBLIC_MISTRAL_API_KEY'

// ── Types ────────────────────────────────────────────────────────

export type BotKey = 'a' | 'b'

export interface TTSResult {
  uri: string        // local file:// URI for expo-av
  cleanup: () => Promise<void>  // call after playback finishes
}

// ── Main function ────────────────────────────────────────────────

/**
 * Synthesize `text` in the voice of bot `bot`.
 * Returns a local file URI that expo-av can play directly.
 * Always resolves — never throws. Returns null on error.
 */
export async function synthesizeSpeech(
  text: string,
  bot: BotKey
): Promise<TTSResult | null> {
  // Trim whitespace. Skip empty/very short strings.
  const clean = text.trim()
  if (clean.length < 2) return null

  const voice = BOT_VOICES[bot]

  try {
    const response = await fetch(MISTRAL_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VOXTRAL_MODEL,
        input: clean,
        voice,
        response_format: 'mp3',
        stream: false,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown')
      console.warn(`[VoxtralService] API error ${response.status}:`, errText)
      return null
    }

    // Write binary MP3 to the app's cache directory
    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const base64 = arrayBufferToBase64(arrayBuffer)

    const filename = `tts_${bot}_${Date.now()}.mp3`
    const uri = `${FileSystem.cacheDirectory}${filename}`

    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    })

    const cleanup = async () => {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true })
      } catch {
        // cleanup failure is not critical
      }
    }

    return { uri, cleanup }
  } catch (err) {
    console.warn('[VoxtralService] fetch failed:', err)
    return null
  }
}

// ── Voice cloning variant ────────────────────────────────────────
/**
 * Synthesize using a reference audio clip for voice cloning.
 * Pass a local file URI for the reference clip (e.g. from expo-document-picker
 * or bundled assets). The model will derive speaking style from it.
 *
 * Use this once you have reference clips for MAUK and ABACI.
 * Swap the call in PlaybackQueue to use this instead of synthesizeSpeech.
 */
export async function synthesizeWithVoiceClone(
  text: string,
  referenceAudioUri: string
): Promise<TTSResult | null> {
  const clean = text.trim()
  if (clean.length < 2) return null

  try {
    // Read the reference clip as base64
    const refBase64 = await FileSystem.readAsStringAsync(referenceAudioUri, {
      encoding: FileSystem.EncodingType.Base64,
    })

    // Build multipart form data
    const formData = new FormData()
    formData.append('model', VOXTRAL_MODEL)
    formData.append('input', clean)
    formData.append('response_format', 'mp3')
    formData.append('voice', new Blob(
      [base64ToArrayBuffer(refBase64)],
      { type: 'audio/mpeg' }
    ) as any, 'reference.mp3')

    const response = await fetch(MISTRAL_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: formData,
    })

    if (!response.ok) {
      console.warn('[VoxtralService] Clone API error:', response.status)
      return null
    }

    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const base64 = arrayBufferToBase64(arrayBuffer)
    const filename = `tts_clone_${Date.now()}.mp3`
    const uri = `${FileSystem.cacheDirectory}${filename}`

    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    })

    return {
      uri,
      cleanup: async () => {
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})
      },
    }
  } catch (err) {
    console.warn('[VoxtralService] clone fetch failed:', err)
    return null
  }
}

// ── Utilities ────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ── STREAMING UPGRADE PATH (future) ─────────────────────────────
/*
To upgrade to streaming PCM (TTFA ~0.8s instead of ~3s):

1. Set response_format: 'pcm' and stream: true in the request body
2. Read response as a ReadableStream
3. Each SSE chunk arrives as:
      { "type": "speech.audio.delta", "delta": "<base64 16-bit LE PCM>" }
4. Accumulate decoded PCM chunks
5. Feed into Android AudioTrack via a bridge module (requires a native module)
   OR write to a growing temp file and use expo-av with progressive loading

The main complexity is that expo-av does not support streaming playback from
a growing file on Android. For true streaming you'd need:
  - react-native-track-player (supports streams natively) OR
  - A custom native module exposing AudioTrack

For now, non-streaming MP3 is the right tradeoff.
*/
