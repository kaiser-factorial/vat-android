/**
 * PlaybackQueue.ts
 * ─────────────────────────────────────────────────────────────────
 * Per-bot audio playback queue.
 *
 * Design:
 *  - Each bot (MAUK, ABACI) gets its own PlaybackQueue instance.
 *  - Messages within a bot's queue play sequentially (one after the other).
 *  - The two bot queues run completely independently — MAUK and ABACI
 *    can speak at the same time if their messages interleave.
 *
 * Concurrency model (matching Corina's request):
 *  "If MAUK sends 4 messages in a row → all 4 play sequentially under MAUK."
 *  "If ABACI sends while MAUK is still speaking → after a small delay,
 *   ABACI's voice starts regardless. Interesting overlap."
 *
 * This is achieved simply by having two independent queues. expo-av supports
 * multiple Sound objects playing in parallel natively.
 *
 * Usage:
 *   const maukQueue = new PlaybackQueue('a')
 *   const ababciQueue = new PlaybackQueue('b')
 *
 *   maukQueue.enqueue("words going to MAUK's voice")
 *   abaciQueue.enqueue("words going to ABACI's voice")
 *
 *   // On unmount / voice mode off:
 *   maukQueue.destroy()
 *   ababciQueue.destroy()
 * ─────────────────────────────────────────────────────────────────
 */

import { Audio } from 'expo-av'
import { synthesizeSpeech, BotKey } from './VoxtralService'

// Delay before a new bot "interrupts" with overlap (ms)
// When ABACI's queue starts while MAUK is still playing, this small gap
// makes the overlap feel intentional rather than jarring.
const OVERLAP_ENTRY_DELAY_MS = 500

// Silence gap between sequential messages from the same bot (ms)
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
    // Configure audio mode once per queue (no need to do it per-message)
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,   // don't duck other audio — let both bots play at full volume
    }).catch(() => {})
  }

  /**
   * Add a new message to the end of this bot's playback queue.
   * If nothing is currently playing, starts immediately.
   * If something is playing, this message waits its turn.
   */
  enqueue(text: string) {
    if (this.destroyed) return
    const clean = text.trim()
    if (!clean) return

    this.queue.push({ text: clean })

    if (!this.isProcessing) {
      this.processNext()
    }
  }

  /**
   * Stop current playback and clear the queue.
   * Called when voice mode is turned off or the component unmounts.
   */
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

  /**
   * Full teardown — call on unmount.
   */
  async destroy() {
    this.destroyed = true
    await this.clear()
  }

  // ── Private ───────────────────────────────────────────────────

  private async processNext() {
    if (this.destroyed || this.queue.length === 0) {
      this.isProcessing = false
      return
    }

    this.isProcessing = true
    const item = this.queue.shift()!

    try {
      // 1. Synthesize via Voxtral API
      const result = await synthesizeSpeech(item.text, this.bot)
      if (!result || this.destroyed) {
        // Skip this item, try next
        this.processNext()
        return
      }

      // 2. Load into expo-av Sound object
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
      try {
        await sound.unloadAsync()
      } catch {}
      await result.cleanup()
      this.currentSound = null

      // 5. Small gap before next message from same bot
      if (this.queue.length > 0 && !this.destroyed) {
        await delay(INTER_MESSAGE_GAP_MS)
      }
    } catch (err) {
      console.warn(`[PlaybackQueue:${this.bot}] playback error:`, err)
      this.currentSound = null
    }

    // Continue with next item
    this.processNext()
  }
}

// ── BotVoiceManager ──────────────────────────────────────────────
/**
 * Manages the two PlaybackQueue instances for MAUK and ABACI.
 * This is what VoiceModeContext holds — one shared manager for the whole app.
 */
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

  /**
   * Called when a new message arrives in the feed.
   * bot: 'a' = MAUK, 'b' = ABACI
   * isFirstFromThisBot: if false (i.e. the other bot is currently speaking),
   *   apply a short delay before starting so the overlap feels intentional.
   */
  speak(text: string, bot: BotKey, otherBotIsActive: boolean) {
    if (!this.active) return

    if (otherBotIsActive) {
      // Overlap entry — small delay so both bots don't slam into each other
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

// ── Helpers ───────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
