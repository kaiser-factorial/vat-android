/**
 * PlaybackQueue.ts
 * ─────────────────────────────────────────────────────────────────
 * Per-bot audio playback queue.
 *
 * Each bot (MAUK, ABACI) gets its own PlaybackQueue instance.
 * Messages within a bot's queue play sequentially.
 * The two queues run independently — both bots can speak simultaneously.
 * ─────────────────────────────────────────────────────────────────
 */

import { Audio } from 'expo-av'
import { synthesizeWithVoiceClone, getReferenceUri, BotKey } from './VoxtralService'

const OVERLAP_ENTRY_DELAY_MS = 500
const INTER_MESSAGE_GAP_MS = 200

interface QueueItem {
  text: string
}

export class PlaybackQueue {
  private bot: BotKey
  private queue: QueueItem[] = []
  private isProcessing = false
  private destroyed = false
  private currentSound: Audio.Sound | null = null

  constructor(bot: BotKey) {
    this.bot = bot
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
    }).catch(() => {})
  }

  enqueue(text: string) {
    if (this.destroyed) return
    const clean = text.trim()
    if (!clean) return
    this.queue.push({ text: clean })
    if (!this.isProcessing) this.processNext()
  }

  async clear() {
    this.queue = []
    if (this.currentSound) {
      try {
        await this.currentSound.stopAsync()
        await this.currentSound.unloadAsync()
      } catch {}
      this.currentSound = null
    }
    this.isProcessing = false
  }

  async destroy() {
    this.destroyed = true
    await this.clear()
  }

  private async processNext() {
    if (this.destroyed || this.queue.length === 0) {
      this.isProcessing = false
      return
    }

    this.isProcessing = true
    const item = this.queue.shift()!

    try {
      // 1. Resolve reference clip URI and synthesize via voice cloning
      const refUri = await getReferenceUri(this.bot)
      const result = await synthesizeWithVoiceClone(item.text, refUri, this.bot)

      if (!result || this.destroyed) {
        this.processNext()
        return
      }

      // 2. Load into expo-av
      const { sound } = await Audio.Sound.createAsync(
        { uri: result.uri },
        { shouldPlay: false, volume: 1.0 }
      )
      this.currentSound = sound

      if (this.destroyed) {
        await sound.unloadAsync()
        await result.cleanup()
        return
      }

      // 3. Play and await completion
      await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return
          if (status.didJustFinish) resolve()
        })
        sound.playAsync().catch(() => resolve())
      })

      // 4. Cleanup
      try { await sound.unloadAsync() } catch {}
      await result.cleanup()
      this.currentSound = null

      // 5. Gap before next message from same bot
      if (this.queue.length > 0 && !this.destroyed) {
        await delay(INTER_MESSAGE_GAP_MS)
      }
    } catch (err) {
      console.warn(`[PlaybackQueue:${this.bot}] playback error:`, err)
      this.currentSound = null
    }

    this.processNext()
  }
}

// ── BotVoiceManager ───────────────────────────────────────────────

export class BotVoiceManager {
  private queues: Record<BotKey, PlaybackQueue>
  private active = false

  constructor() {
    this.queues = {
      a: new PlaybackQueue('a'),
      b: new PlaybackQueue('b'),
    }
  }

  enable() { this.active = true }

  async disable() {
    this.active = false
    await this.queues.a.clear()
    await this.queues.b.clear()
  }

  speak(text: string, bot: BotKey, otherBotIsActive: boolean) {
    if (!this.active) return
    if (otherBotIsActive) {
      setTimeout(() => {
        if (this.active) this.queues[bot].enqueue(text)
      }, OVERLAP_ENTRY_DELAY_MS)
    } else {
      this.queues[bot].enqueue(text)
    }
  }

  async destroy() {
    await this.queues.a.destroy()
    await this.queues.b.destroy()
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
