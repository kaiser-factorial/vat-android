/**
 * MessageFeed.voice-patch.tsx
 * ─────────────────────────────────────────────────────────────────
 * This is NOT a standalone file — it shows exactly what changes to
 * make to the existing MessageFeed.tsx to wire in voice mode.
 *
 * Changes are marked with  // ← VOICE PATCH  comments.
 *
 * Summary of changes:
 *  1. Import useVoiceMode
 *  2. Call speakMessage() inside the realtime subscription callback
 *     when a new message arrives and it's a bot message
 *  3. That's it — the queue handles everything else
 *
 * NOTE: We intentionally do NOT speak messages that arrive from
 * fetchMessages() (the initial history load). Voice only triggers
 * for new real-time arrivals. This prevents a flood of audio on
 * app open and matches the "live conversation" feel.
 * ─────────────────────────────────────────────────────────────────
 */

// ── Diff view ─────────────────────────────────────────────────────

/*

BEFORE (in MessageFeed.tsx):

  import { format_user_message } from '@/lib/message-handlers'


AFTER:

  import { format_user_message } from '@/lib/message-handlers'
  import { useVoiceMode } from './VoiceModeContext'    // ← VOICE PATCH

─────────────────────────────────────────────────────────────────

BEFORE (inside MessageFeed component, after existing hooks):

  const { user, displayName } = useAuth()


AFTER:

  const { user, displayName } = useAuth()
  const { speakMessage } = useVoiceMode()              // ← VOICE PATCH

─────────────────────────────────────────────────────────────────

BEFORE (the realtime subscription callback):

  (payload: { new: Message }) => {
    setMessages((prev) => [...prev, payload.new as Message])
    setUnreadCount((prev) => (isSticky ? 0 : prev + 1))
  }


AFTER:

  (payload: { new: Message }) => {
    const msg = payload.new as Message
    setMessages((prev) => [...prev, msg])
    setUnreadCount((prev) => (isSticky ? 0 : prev + 1))
    speakMessage(msg)                                  // ← VOICE PATCH
  }

─────────────────────────────────────────────────────────────────
That's all. Three small additions.
*/

// ── Full patched MessageFeed for reference ────────────────────────
// (Copy-pasteable version with all patches applied)

import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Message } from '@/lib/types'
import { MessageBubble } from './MessageBubble'
import { MessageInput } from './MessageInput'
import { format_user_message } from '@/lib/message-handlers'
import { COLORS } from '@/lib/constants'
import { useVoiceMode } from '../voice_draft/VoiceModeContext'  // ← VOICE PATCH (adjust path when merged)

interface MessageFeedProps {
  onAuthClick: () => void
}

export function MessageFeedWithVoice({ onAuthClick }: MessageFeedProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSticky, setIsSticky] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const flatListRef = useRef<FlatList>(null)
  const { user, displayName } = useAuth()
  const { speakMessage } = useVoiceMode()              // ← VOICE PATCH

  const fetchMessages = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      setMessages(data ? [...data].reverse() : [])
    } catch (err: any) {
      setError(err.message || 'Connection error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMessages()

    const channel = supabase
      .channel('messages-mobile')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: { new: Message }) => {
          const msg = payload.new as Message
          setMessages((prev) => [...prev, msg])
          setUnreadCount((prev) => (isSticky ? 0 : prev + 1))
          speakMessage(msg)                            // ← VOICE PATCH
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (isSticky && messages.length > 0) {
      setUnreadCount(0)
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [messages, isSticky])

  const scrollToBottom = () => {
    setIsSticky(true)
    setUnreadCount(0)
    flatListRef.current?.scrollToEnd({ animated: true })
  }

  const handleSend = async (text: string) => {
    if (!user) return
    const speakerName = displayName || 'USER'
    const formattedText = format_user_message(text, speakerName)
    const { error } = await supabase.from('messages').insert({
      speaker: speakerName,
      text: formattedText,
      role: 'user',
      user_id: user.id,
    })
    if (error) throw error
  }

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.terminalGreen} />
          <Text style={styles.loadingText}>RETRIEVING HISTORY...</Text>
        </View>
      )}

      {error && !isLoading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>FETCH ERROR: {error}</Text>
          <TouchableOpacity onPress={fetchMessages} style={styles.retryBtn}>
            <Text style={styles.retryText}>[retry]</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !error && (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.feedContent}
          onScrollBeginDrag={() => setIsSticky(false)}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>NO DIALOGUE RECORDS FOUND</Text>
            </View>
          }
        />
      )}

      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={[styles.stickyBtn, isSticky && styles.stickyBtnActive]}
          onPress={() => {
            setIsSticky(!isSticky)
            if (!isSticky) scrollToBottom()
          }}
        >
          <View style={[styles.stickyDot, isSticky && styles.stickyDotActive]} />
          <Text style={[styles.stickyText, isSticky && styles.stickyTextActive]}>
            {isSticky ? 'STICKY: AUTO' : 'STICKY: MANUAL'}
          </Text>
        </TouchableOpacity>

        {!isSticky && unreadCount > 0 && (
          <TouchableOpacity style={styles.unreadBtn} onPress={scrollToBottom}>
            <Text style={styles.unreadText}>↓ {unreadCount} new</Text>
          </TouchableOpacity>
        )}
      </View>

      <MessageInput onSend={handleSend} disabled={!user} onAuthClick={onAuthClick} />
    </View>
  )
}

// Styles are identical to existing MessageFeed.tsx — omitted here for brevity.
// When merging, just add the three VOICE PATCH lines to the original file.
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: COLORS.mutedForeground, letterSpacing: 2 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: `${COLORS.primary}18`, borderBottomWidth: 1, borderBottomColor: `${COLORS.primary}40` },
  errorText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: COLORS.primary, flex: 1, flexWrap: 'wrap' },
  retryBtn: { marginLeft: 12 },
  retryText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: COLORS.primary },
  feedContent: { paddingTop: 12, paddingBottom: 8, gap: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 10, color: COLORS.mutedForeground, letterSpacing: 2 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  stickyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.border, backgroundColor: `${COLORS.background}cc` },
  stickyBtnActive: { borderColor: `${COLORS.mauk}80` },
  stickyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.border },
  stickyDotActive: { backgroundColor: COLORS.mauk },
  stickyText: { fontFamily: 'JetBrainsMono-Regular', fontSize: 8, color: COLORS.mutedForeground, letterSpacing: 1.5, textTransform: 'uppercase' },
  stickyTextActive: { color: COLORS.mauk },
  unreadBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: COLORS.primary },
  unreadText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: COLORS.white, letterSpacing: 1 },
})
