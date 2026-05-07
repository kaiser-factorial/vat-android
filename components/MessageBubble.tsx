import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { Message } from '@/lib/types'
import { parse_message_for_frontend_display } from '@/lib/message-handlers'
import { COLORS } from '@/lib/constants'

interface MessageBubbleProps {
  message: Message
  /** Called when the user taps a bot speaker name (MAUK or ABACI). */
  onSpeakerPress?: (speaker: string, message: Message) => void
}

export function MessageBubble({ message, onSpeakerPress }: MessageBubbleProps) {
  const parsed = parse_message_for_frontend_display(message.text)

  const timestamp = new Date(message.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  let speaker = (message.speaker || parsed.speaker || 'UNKNOWN').toUpperCase()
  if (speaker === 'ARCHITECT') speaker = 'ARCHIE'
  if (speaker === 'CORINA') speaker = 'BRICK.FACTORIAL'

  const isBotSpeaker = speaker === 'MAUK' || speaker === 'ABACI'

  const getSpeakerColor = () => {
    switch (speaker) {
      case 'MAUK': return COLORS.mauk
      case 'ABACI': return COLORS.abaci
      case 'ARCHIE': return COLORS.white
      default: return COLORS.user
    }
  }

  const speakerLabel = (
    <Text style={[styles.speaker, { color: getSpeakerColor() }]}>
      {speaker.toLowerCase()}:
    </Text>
  )

  return (
    <View style={styles.container}>
      <Text style={styles.timestamp}>{timestamp}</Text>

      <View style={styles.body}>
        <View style={styles.speakerRow}>
          {/* Bot speaker names are tappable to show param info */}
          {isBotSpeaker && onSpeakerPress ? (
            <TouchableOpacity
              onPress={() => onSpeakerPress(speaker, message)}
              activeOpacity={0.6}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 12 }}
            >
              {speakerLabel}
            </TouchableOpacity>
          ) : (
            speakerLabel
          )}

          {speaker === 'ARCHIE' && (
            <View style={styles.architectBadge}>
              <Text style={styles.architectBadgeText}>architect</Text>
            </View>
          )}
        </View>

        <Text style={styles.text}>{parsed.text}</Text>

        {/* Architect thoughts */}
        {message.thoughts && message.thoughts.split('\n').map((thought, i) => {
          const isThinkIn = thought.includes('<think-in>')
          const isThinkOut = thought.includes('<think-out>')
          if (!isThinkIn && !isThinkOut) return null
          const cleanThought = thought.replace(/<[^>]+>/g, '').trim()
          if (!cleanThought) return null
          return (
            <View key={i} style={styles.thought}>
              <Text style={styles.thoughtLabel}>ARCHITECT_THOUGHTS</Text>
              <Text style={styles.thoughtText}>
                {isThinkIn ? `[${cleanThought}]` : cleanThought}
              </Text>
            </View>
          )
        })}

        {/* Continuation */}
        {parsed.continuation && (
          <View style={styles.continuation}>
            <Text style={styles.continuationLabel}>[CONTINUITY]</Text>
            <Text style={styles.continuationText}> {parsed.continuation}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  timestamp: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9,
    color: COLORS.mutedForeground,
    opacity: 0.35,
    paddingTop: 3,
    width: 40,
    flexShrink: 0,
  },
  body: {
    flex: 1,
  },
  speakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  speaker: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 12,
    textTransform: 'lowercase',
  },
  architectBadge: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  architectBadgeText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 8,
    color: COLORS.black,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  text: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 13,
    color: COLORS.foreground,
    lineHeight: 20,
  },
  thought: {
    marginTop: 6,
    padding: 8,
    backgroundColor: COLORS.foreground,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.white,
  },
  thoughtLabel: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 8,
    color: COLORS.background,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 3,
    opacity: 0.6,
  },
  thoughtText: {
    fontFamily: 'JetBrainsMono-Italic',
    fontSize: 11,
    color: COLORS.background,
    lineHeight: 16,
  },
  continuation: {
    marginTop: 4,
    marginLeft: 12,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.border,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  continuationLabel: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 9,
    color: COLORS.mutedForeground,
    textTransform: 'uppercase',
    opacity: 0.5,
  },
  continuationText: {
    fontFamily: 'JetBrainsMono-Italic',
    fontSize: 11,
    color: `${COLORS.foreground}b0`,
  },
})
