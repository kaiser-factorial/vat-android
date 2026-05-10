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
 * Voice cloning:
 *  Reference clips live in assets/voices/. getReferenceUri() resolves
 *  them to local file:// URIs via expo-asset (cached after first load).
 * ─────────────────────────────────────────────────────────────────
 */

import * as FileSystem from 'expo-file-system'
import { Asset } from 'expo-asset'

// ── Constants ────────────────────────────────────────────────────

const MISTRAL_TTS_URL = 'https://api.mistral.ai/v1/audio/speech'
const VOXTRAL_MODEL = 'mistralai/Voxtral-4B-TTS-2603'
const API_KEY = process.env.EXPO_PUBLIC_MISTRAL_API_KEY ?? ''

// ── Saved voice IDs ──────────────────────────────────────────────
//
// Run voice_draft/register_voices.mjs ONCE to upload the reference
// clips to Mistral and get permanent voice IDs. Paste them here.
//
// Until then, leave as empty strings — the service will fall back
// to sending the reference audio clip directly each request.
//
// MAUK: M.C. Escher archival footage (1999 CINEMEDIA documentary)
// ABACI: Lady Bitch Ray / Reyhan Şahin (Willkommen Österreich)
const BOT_VOICE_IDS: Record<BotKey, string> = {
  a: 'baae5f35-6ffe-4c15-ad55-96bdd6542b11',   // MAUK
  b: '03f9d324-0989-4a8f-ad03-a6068397e749',   // ABACI
}

// Bundled reference clips (fallback if voice IDs not yet registered)
const REFERENCE_CLIPS: Record<BotKey, number> = {
  a: require('../assets/voices/mauk_ref.mp3'),
  b: require('../assets/voices/abaci_ref.mp3'),
}

const _refUriCache: Partial<Record<BotKey, string>> = {}

export async function getReferenceUri(bot: BotKey): Promise<string> {
  if (_refUriCache[bot]) return _refUriCache[bot]!
  const asset = Asset.fromModule(REFERENCE_CLIPS[bot])
  await asset.downloadAsync()
  _refUriCache[bot] = asset.localUri!
  return _refUriCache[bot]!
}

// ── Types ────────────────────────────────────────────────────────

export type BotKey = 'a' | 'b'

export interface TTSResult {
  uri: string
  cleanup: () => Promise<void>
}

// ── Voice cloning synthesis ───────────────────────────────────────

/**
 * Synthesize `text` in the voice of `bot`.
 * Uses saved voice_id if registered, falls back to reference clip upload.
 * Returns a local file URI that expo-av can play directly.
 * Always resolves — never throws. Returns null on error.
 */
export async function synthesizeWithVoiceClone(
  text: string,
  referenceAudioUri: string,
  bot?: BotKey
): Promise<TTSResult | null> {
  const clean = text.trim()
  if (clean.length < 2) return null

  // If a saved voice ID exists for this bot, use it (faster, no audio upload)
  const voiceId = bot ? BOT_VOICE_IDS[bot] : ''
  if (voiceId) {
    return synthesizeSpeechWithId(clean, voiceId)
  }

  try {
    const refBase64 = await FileSystem.readAsStringAsync(referenceAudioUri, {
      encoding: FileSystem.EncodingType.Base64,
    })

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
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: formData,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown')
      console.warn(`[VoxtralService] API error ${response.status}:`, errText)
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

// ── Saved voice ID synthesis ─────────────────────────────────────

async function synthesizeSpeechWithId(
  text: string,
  voiceId: string
): Promise<TTSResult | null> {
  try {
    const response = await fetch(MISTRAL_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VOXTRAL_MODEL,
        input: text,
        voice: voiceId,
        response_format: 'mp3',
        stream: false,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown')
      console.warn(`[VoxtralService] ID synthesis error ${response.status}:`, errText)
      return null
    }

    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const base64 = arrayBufferToBase64(arrayBuffer)
    const filename = `tts_id_${Date.now()}.mp3`
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
    console.warn('[VoxtralService] ID synthesis failed:', err)
    return null
  }
}

// ── Preset fallback (kept for reference / testing) ────────────────

export async function synthesizeSpeech(
  text: string,
  bot: BotKey
): Promise<TTSResult | null> {
  const clean = text.trim()
  if (clean.length < 2) return null

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
        voice: bot === 'a' ? 'MAUK_VOICE_PRESET' : 'ABACI_VOICE_PRESET',
        response_format: 'mp3',
        stream: false,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown')
      console.warn(`[VoxtralService] API error ${response.status}:`, errText)
      return null
    }

    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const base64 = arrayBufferToBase64(arrayBuffer)
    const filename = `tts_${bot}_${Date.now()}.mp3`
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
    console.warn('[VoxtralService] fetch failed:', err)
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
