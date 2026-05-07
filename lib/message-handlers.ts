import type { ParsedMessage } from './types'

export function format_user_message(text: string, speaker: string = 'USER'): string {
  return `[${speaker}]: ${text}`
}

export function parse_message_for_frontend_display(text: string): ParsedMessage {
  const trimmed = text.trim()

  // 1. [SPEAKER] SAYS: "text" | [I] SAY: "continuation"
  const structuredPattern = /^\[([A-Z]+)\]\s+SAYS:\s+"(.+?)"(?:\s*\|\s*\[I\]\s+SAY:\s+"(.+?)")?$/
  const structuredMatch = trimmed.match(structuredPattern)
  if (structuredMatch) {
    return {
      speaker: structuredMatch[1],
      text: structuredMatch[2],
      continuation: structuredMatch[3] || undefined,
    }
  }

  // 2. [SPEAKER]: Text
  const dialoguePattern = /^\[([A-Z0-9_.-]+)\]:\s*(.+)$/i
  const dialogueMatch = trimmed.match(dialoguePattern)
  if (dialogueMatch) {
    return {
      speaker: dialogueMatch[1],
      text: dialogueMatch[2],
    }
  }

  // 3. Raw fallback
  return { speaker: '', text: trimmed }
}
