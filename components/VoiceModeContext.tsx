/**
 * VoiceModeContext.tsx
 * ─────────────────────────────────────────────────────────────────
 * App-wide React context for voice mode state.
 *
 * Provides:
 *   isVoiceActive     — whether voice mode is currently on
 *   toggleVoice       — turn voice on/off
 *   speakMessage      — called by MessageFeed when a new bot message arrives
 *
 * Integration:
 *   Wrap around the app in _layout.tsx (inside AuthProvider/SystemStatusProvider):
 *     <VoiceModeProvider>
 *       ...rest of app
 *     </VoiceModeProvider>
 *
 *   Then in MessageFeed (or wherever new messages are detected), call:
 *     const { speakMessage } = useVoiceMode()
 *     speakMessage(message)
 * ─────────────────────────────────────────────────────────────────
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { BotVoiceManager } from './PlaybackQueue'
import type { Message } from '@/lib/types'

// ── Context shape ─────────────────────────────────────────────────

interface VoiceModeContextValue {
  isVoiceActive: boolean
  toggleVoice: () => void
  speakMessage: (message: Message) => void
}

const VoiceModeContext = createContext<VoiceModeContextValue>({
  isVoiceActive: false,
  toggleVoice: () => {},
  speakMessage: () => {},
})

// ── Provider ──────────────────────────────────────────────────────

export function VoiceModeProvider({ children }: { children: React.ReactNode }) {
  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const isVoiceActiveRef = useRef(false)   // ref mirror so speakMessage closure never goes stale
  const managerRef = useRef<BotVoiceManager | null>(null)

  // Track which bots have items in their queues (for overlap detection)
  // We approximate this by tracking the last speak time per bot.
  const lastSpeakTime = useRef<Record<string, number>>({ a: 0, b: 0 })

  useEffect(() => {
    managerRef.current = new BotVoiceManager()
    return () => {
      managerRef.current?.destroy()
    }
  }, [])

  const toggleVoice = () => {
    const manager = managerRef.current
    if (!manager) return

    setIsVoiceActive((prev) => {
      const next = !prev
      isVoiceActiveRef.current = next
      if (prev) {
        manager.disable()
      } else {
        manager.enable()
      }
      return next
    })
  }

  const speakMessage = (message: Message) => {
    if (!isVoiceActiveRef.current) return
    const manager = managerRef.current
    if (!manager) return

    // Only speak MAUK (bot 'a') and ABACI (bot 'b') messages.
    // Skip user messages, system messages, etc.
    const speaker = (message.speaker || '').toUpperCase()
    let bot: 'a' | 'b' | null = null
    if (speaker === 'MAUK') bot = 'a'
    if (speaker === 'ABACI') bot = 'b'
    if (!bot) return

    // Extract the clean spoken text from the message
    const text = extractSpeakableText(message.text)
    if (!text) return

    // Determine if the other bot recently spoke (overlap detection)
    const other = bot === 'a' ? 'b' : 'a'
    const now = Date.now()
    const otherRecentlySpeaking = (now - lastSpeakTime.current[other]) < 8000
    lastSpeakTime.current[bot] = now

    manager.speak(text, bot, otherRecentlySpeaking)
  }

  return (
    <VoiceModeContext.Provider value={{ isVoiceActive, toggleVoice, speakMessage }}>
      {children}
    </VoiceModeContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────

export function useVoiceMode() {
  return useContext(VoiceModeContext)
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Extract the spoken portion of a message.
 * - Strips the [SPEAKER]: prefix that bot messages use
 * - Strips thought blocks and continuation markers
 * - Collapses whitespace
 */
function extractSpeakableText(rawText: string): string {
  let text = rawText

  // Remove [SPEAKER]: prefix (e.g. "[MAUK]: hello" → "hello")
  text = text.replace(/^\[?[A-Z_]+\]?:\s*/i, '')

  // Remove <think-in>...</think-out> blocks (internal monologue, not spoken)
  text = text.replace(/<think-in>[\s\S]*?<think-out>/gi, '')

  // Remove [CONTINUITY] blocks (metadata, not speech)
  text = text.replace(/\[CONTINUITY\][^\n]*/gi, '')

  // Remove any remaining XML-style tags
  text = text.replace(/<[^>]+>/g, '')

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim()

  return text
}
