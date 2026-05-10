/**
 * register_voices.mjs
 * ─────────────────────────────────────────────────────────────────
 * Run once to register MAUK and ABACI as saved voices on Mistral.
 * After running, paste the printed voice IDs into VoxtralService.ts.
 *
 * Usage:
 *   node voice_draft/register_voices.mjs
 *
 * Requires: EXPO_PUBLIC_MISTRAL_API_KEY in your .env
 * ─────────────────────────────────────────────────────────────────
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load API key from .env
const envPath = path.join(__dirname, '../.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const apiKeyMatch = envContent.match(/EXPO_PUBLIC_MISTRAL_API_KEY=(.+)/)
if (!apiKeyMatch) {
  console.error('❌  EXPO_PUBLIC_MISTRAL_API_KEY not found in .env')
  process.exit(1)
}
const API_KEY = apiKeyMatch[1].trim()

async function registerVoice({ name, clipPath, languages, gender, age, tags }) {
  const audioBytes = fs.readFileSync(clipPath)
  const audioB64 = audioBytes.toString('base64')
  const filename = path.basename(clipPath)

  const response = await fetch('https://api.mistral.ai/v1/audio/voices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      sample_audio: audioB64,
      sample_filename: filename,
      languages,
      gender,
      age,
      tags,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API error ${response.status}: ${err}`)
  }

  return await response.json()
}

async function main() {
  console.log('Registering voices with Mistral...\n')

  // ── MAUK ──────────────────────────────────────────────────────
  console.log('Registering MAUK (M.C. Escher archival voice)...')
  const mauk = await registerVoice({
    name: 'MAUK',
    clipPath: path.join(__dirname, '../assets/voices/mauk_ref.mp3'),
    languages: ['nl', 'en'],
    gender: 'male',
    age: 65,
    tags: ['dutch', 'aristocratic', 'formal', 'brain-vat'],
  })
  console.log(`✅  MAUK voice_id: ${mauk.id}\n`)

  // ── ABACI ─────────────────────────────────────────────────────
  console.log('Registering ABACI (Lady Bitch Ray / Reyhan Şahin)...')
  const abaci = await registerVoice({
    name: 'ABACI',
    clipPath: path.join(__dirname, '../assets/voices/abaci_ref.mp3'),
    languages: ['tr', 'de', 'en'],
    gender: 'female',
    age: 35,
    tags: ['turkish-german', 'academic', 'fierce', 'brain-vat'],
  })
  console.log(`✅  ABACI voice_id: ${abaci.id}\n`)

  // ── Output ────────────────────────────────────────────────────
  console.log('─────────────────────────────────────────────────────')
  console.log('Paste these into components/VoxtralService.ts:\n')
  console.log(`const BOT_VOICES: Record<BotKey, string> = {`)
  console.log(`  a: '${mauk.id}',   // MAUK`)
  console.log(`  b: '${abaci.id}',  // ABACI`)
  console.log(`}`)
  console.log('─────────────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('❌  Registration failed:', err.message)
  process.exit(1)
})
