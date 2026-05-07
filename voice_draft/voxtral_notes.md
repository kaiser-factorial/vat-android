# Voxtral TTS — Research Notes

---

## SOURCE 1: Mistral AI Announcement
**URL:** https://mistral.ai/news/voxtral-tts  
**Published:** March 26, 2026

### What it is
Voxtral TTS is Mistral's 4-billion-parameter text-to-speech model, designed primarily for voice agents (real-time, low-latency use cases). It is released both as a managed API and as open weights on Hugging Face under CC BY-NC 4.0.

### Architecture
Hybrid two-stage design:
1. **Auto-regressive semantic generation** — generates semantic speech tokens from input text
2. **Flow-matching acoustic generation** — converts semantic tokens into acoustic detail (the actual audio waveform)

Uses a custom codec called the **Voxtral Codec**, trained with a hybrid VQ-FSQ quantization scheme.

### Languages
9 supported: English, French, Spanish, Portuguese, Italian, Dutch, German, Hindi, Arabic. Also supports cross-lingual voice cloning (clone a voice in one language, output speech in another) and code-mixing (blend languages within a single output).

### Voice cloning — "Voice-as-Instruction"
The key innovation. Instead of prosody tags, emotion labels, or fine-tuning:
- Provide 2–25 seconds of reference audio
- The model treats the clip as an *instruction* and replicates speaking style, intonation, rhythm, accent, emotional tone
- No training required — zero-shot
- Works with very short clips (2–3s minimum)

### Available voices
20 preset reference voices ship with the model. Custom voices created by passing your own reference audio clip.

### Output formats
WAV, PCM, FLAC, MP3, AAC, Opus. 24 kHz sample rate.

### Latency (from managed API, on H200)
- Model inference: ~70ms
- Time-to-first-audio (TTFA) non-streaming PCM: ~0.8s
- TTFA for MP3: ~1.5–3s

### Performance / benchmarks
- 68.4% win rate over ElevenLabs Flash v2.5 in human evaluations
- Quality parity with ElevenLabs v3

### Pricing
$0.016 per 1,000 characters (~$16/million chars). Available via Mistral API, Mistral Studio, Le Chat.

---

## SOURCE 2: Mistral API Documentation
**URL:** https://docs.mistral.ai/capabilities/audio/text_to_speech

### Endpoint
```
POST https://api.mistral.ai/v1/audio/speech
```
OpenAI-compatible. Also exposes `/health` and `/v1/models`.

### Authentication
```
Authorization: Bearer YOUR_MISTRAL_API_KEY
```

### Request body
| Parameter | Required | Description |
|---|---|---|
| `model` | yes | `"mistralai/Voxtral-4B-TTS-2603"` |
| `input` | yes | Text string to synthesize |
| `voice` | yes | Preset voice ID *or* reference audio |
| `response_format` | yes | `wav`, `pcm`, `mp3`, `flac`, `ogg`, `opus` |
| `stream` | no | `true` for streaming SSE response |

### Non-streaming response
Returns binary audio data with appropriate `Content-Type` header (e.g. `audio/mpeg` for MP3). Body is the raw audio file.

### Streaming response
Server-Sent Events (SSE) format. Each chunk:
```json
{ "type": "speech.audio.delta", "delta": "<base64-encoded 16-bit LE PCM>" }
```
Completion marker:
```json
{ "type": "speech.audio.done" }
```
TTFA with streaming PCM: ~0.8s — makes real-time "typewriter-audio" viable.

### Voice cloning via reference audio
Pass reference audio as a file upload alongside the text payload (multipart form data). The model derives speaker characteristics automatically from the clip. Recommended clip length: 5–25 seconds. Minimum: 2–3 seconds.

### Rate limits
Not explicitly published; contact Mistral support for specifics.

### Self-hosting hardware requirements
Minimum 16 GB GPU VRAM. A single GPU is sufficient. Q4 quantized GGUF (~2.67 GB) also available.

---

## SOURCE 3: Research Paper
**URL:** https://arxiv.org/abs/2603.25551  
**Authors:** Mistral AI

### Architecture detail
The paper validates the hybrid design:
- Semantic tokens capture *what* is said and *how* (prosody, intent)
- Acoustic tokens capture the fine-grained waveform detail
- Separate stages let the model decouple linguistic content from acoustic rendering — key for voice cloning quality

### Training
Multilingual dataset covering all 9 supported languages, with wide dialect coverage. Designed to handle edge cases: rising intonation on questions, emotional softening on reflective statements, code-switched speech.

### Key metrics from paper
- Naturalness preferred in 68.4% of A/B tests vs ElevenLabs Flash v2.5
- Latency of 70ms inference at H200 scale
- 4B parameters — intentionally lean for deployment flexibility

### Key innovation: voice-as-instruction
The paper formalizes the "voice-as-instruction" paradigm: the model learns to interpret reference audio as a style prompt rather than a training target. This is what allows zero-shot cloning without any fine-tuning step.

---

## PROJECT SUMMARY — How Voxtral applies to brain.vat Android

### Recommended integration path: Managed API (not local model)

Local inference requires a 16GB GPU and an 8GB model download — not viable for a mobile app. The managed API at $0.016/1k chars is the right path.

### Cost estimate for brain.vat
- MAUK + ABACI generate messages continuously. Each message is typically 50–200 characters.
- At 100 chars average × 500 messages/day = 50,000 chars/day = $0.80/day
- This scales with how many users have voice mode *active*, not total messages
- Since voice mode is opt-in, real cost will be low at first

### Voice design for MAUK and ABACI

**MAUK (based on M.C. Escher):**  
Per the `mauk_voice.md` notes, Escher spoke with a refined "Haags" Dutch accent: precise consonants, uvular R (soft, not rolling), soft velvety G from the back of the throat, "Continental English" cadence with melodic up-and-down intonation. The ideal approach is to source a ~10–20 second reference clip of a speaker matching this description (an older Dutch male academic, for example) and pass it to Voxtral as the reference audio. Failing that, the closest preset voice (likely a formal European male) serves as a starting point.

**ABACI:**  
Turkish woman, British primary accent with slight American influence. Cross-lingual voice cloning is one of Voxtral's strengths — a reference clip of a Turkish-British female speaker would capture this precisely. The accent blend (Turkish phonology under British prosody with American vowel leveling) is exactly the kind of subtle layering Voxtral's "voice-as-instruction" was designed for.

**Practical path for now (no reference clips yet):**
1. Use preset voices as placeholders, picking the closest available option
2. Once reference clips are sourced, swap to voice cloning with zero code changes (just swap the API parameter)
3. The `VoxtralService` is designed to accept either a preset ID or a reference audio URI

### Concurrent playback design
Corina's request: each bot's messages read sequentially within that bot's stream, but the two bots can speak simultaneously if messages interleave.

Implementation: two independent `PlaybackQueue` instances (one per bot). Each queue manages its own sequence of pending audio fetches + playbacks. When ABACI receives a message while MAUK is speaking, ABACI's queue starts after a short delay (~500ms) and the two streams overlap. This is natively supported by `expo-av` which can hold multiple `Sound` objects in parallel.

### Streaming vs non-streaming for mobile
Non-streaming MP3 is simpler to implement and sufficient for this use case — messages are already fully formed before playback begins (we're not doing real-time dictation). TTFA of 1.5–3s is acceptable since the user is *reading* the message on screen first anyway. Draft implementation uses non-streaming MP3. Streaming upgrade path is documented in the code.

### Format recommendation
**MP3** — smaller payload over mobile data, well-supported by expo-av, acceptable TTFA.

