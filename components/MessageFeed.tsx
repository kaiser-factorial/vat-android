import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Message, BotSettings } from '@/lib/types'
import { MessageBubble } from './MessageBubble'
import { MessageInput } from './MessageInput'
import { format_user_message } from '@/lib/message-handlers'
import { COLORS } from '@/lib/constants'

interface MessageFeedProps {
  onAuthClick: () => void
}

// ── Params modal ─────────────────────────────────────────────────

// Only the params that are available in the public bot_settings Supabase table
const DISPLAY_PARAMS: Array<{ key: keyof BotSettings; label: string; format?: (v: any) => string }> = [
  { key: 'temperature',        label: 'Temperature',        format: (v) => Number(v).toFixed(2) },
  { key: 'top_p',              label: 'Top-P',              format: (v) => Number(v).toFixed(2) },
  { key: 'top_k',              label: 'Top-K',              format: (v) => Number(v) === 0 ? 'FULL_CHAOS' : String(v) },
  { key: 'repetition_penalty', label: 'Repetition Penalty', format: (v) => Number(v).toFixed(2) },
  { key: 'max_new_tokens',     label: 'Max Length',         format: (v) => String(v) },
  { key: 'memory_weight',      label: 'Memory Recall',      format: (v) => `${(Number(v) * 100).toFixed(0)}%` },
  { key: 'base_sleep',         label: 'Frequency',          format: (v) => `${v}s` },
  { key: 'base_jitter',        label: 'Jitter',             format: (v) => `±${v}s` },
  { key: 'model_version',      label: 'Model Version' },
]

interface ParamModalState {
  visible: boolean
  speaker: string   // 'MAUK' | 'ABACI'
  msgParams?: Partial<BotSettings>   // params at message time (if stored)
  msgTime: string   // ISO timestamp of the message
  currentSettings: Partial<BotSettings> | null
  loadingCurrent: boolean
}

const EMPTY_MODAL: ParamModalState = {
  visible: false,
  speaker: '',
  msgTime: '',
  currentSettings: null,
  loadingCurrent: false,
}

function paramsAreEqual(a: Partial<BotSettings>, b: Partial<BotSettings>): boolean {
  return DISPLAY_PARAMS.every(({ key }) => {
    const av = a[key]
    const bv = b[key]
    // Sort arrays before comparing so order differences don't create false "changed" results
    if (Array.isArray(av) && Array.isArray(bv)) {
      return JSON.stringify([...av].sort()) === JSON.stringify([...bv].sort())
    }
    return av === bv
  })
}

interface ParamRowProps {
  label: string
  value: any
  format?: (v: any) => string
  dimmed?: boolean
}
function ParamLine({ label, value, format, dimmed }: ParamRowProps) {
  const display = value === undefined || value === null
    ? '—'
    : format ? format(value) : String(value)
  return (
    <View style={modal.paramRow}>
      <Text style={[modal.paramLabel, dimmed && modal.paramLabelDim]}>{label}</Text>
      <Text style={[modal.paramValue, dimmed && modal.paramValueDim]}>{display}</Text>
    </View>
  )
}

function ParamsModal({ state, onClose }: { state: ParamModalState; onClose: () => void }) {
  const speakerColor = state.speaker === 'MAUK' ? COLORS.mauk : COLORS.abaci
  const hasMsgParams = !!state.msgParams && Object.keys(state.msgParams).length > 0
  const sameParams =
    hasMsgParams &&
    state.currentSettings != null &&
    paramsAreEqual(state.msgParams!, state.currentSettings)

  const msgDate = state.msgTime
    ? new Date(state.msgTime).toLocaleString('en-US', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      })
    : ''

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={modal.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={modal.sheet}>
          {/* Header */}
          <View style={modal.header}>
            <View style={modal.headerLeft}>
              <View style={[modal.dot, { backgroundColor: speakerColor }]} />
              <Text style={[modal.title, { color: speakerColor }]}>
                {state.speaker.toLowerCase()}
              </Text>
              <Text style={modal.titleSub}>// params</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={modal.closeBtn}>[×]</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={modal.scroll} contentContainerStyle={modal.scrollContent}>
            {/* ── AT MESSAGE TIME ── */}
            <Text style={modal.sectionLabel}>AT_MSG_TIME  {msgDate}</Text>

            {hasMsgParams ? (
              DISPLAY_PARAMS.map(({ key, label, format }) => (
                <ParamLine
                  key={String(key)}
                  label={label}
                  value={state.msgParams![key]}
                  format={format}
                />
              ))
            ) : (
              <View style={modal.noticeBox}>
                <Text style={modal.noticeText}>
                  PARAMS_NOT_RECORDED{'\n'}
                  Generation params aren't yet snapshotted in the messages table.
                  Server audit log has them — see /api/admin/audit.
                </Text>
              </View>
            )}

            {/* ── CURRENT PARAMS ── */}
            <View style={modal.divider} />
            <Text style={modal.sectionLabel}>CURRENT_PARAMS</Text>

            {state.loadingCurrent ? (
              <ActivityIndicator color={COLORS.terminalGreen} style={{ marginVertical: 12 }} />
            ) : state.currentSettings == null ? (
              <View style={modal.noticeBox}>
                <Text style={modal.noticeText}>Could not fetch current settings.</Text>
              </View>
            ) : sameParams ? (
              <View style={modal.noticeBox}>
                <Text style={[modal.noticeText, { color: COLORS.terminalGreen }]}>
                  PARAMS_UNCHANGED since this message.
                </Text>
              </View>
            ) : (
              DISPLAY_PARAMS.map(({ key, label, format }) => (
                <ParamLine
                  key={String(key)}
                  label={label}
                  value={state.currentSettings![key]}
                  format={format}
                />
              ))
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const modal = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#000d00',
    borderTopWidth: 1,
    borderColor: '#002200',
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#002200',
    backgroundColor: '#001500',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
  },
  title: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 16,
    letterSpacing: 2,
  },
  titleSub: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: '#3a9e52',
    letterSpacing: 1,
  },
  closeBtn: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 14,
    color: '#3a9e52',
    letterSpacing: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2,
    paddingBottom: 32,
  },
  sectionLabel: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 8,
    color: '#3a9e52',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  paramRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#001200',
  },
  paramLabel: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: '#3a9e52',
    letterSpacing: 1,
  },
  paramLabelDim: {
    opacity: 0.5,
  },
  paramValue: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: '#00ff41',
  },
  paramValueDim: {
    color: '#00cc33',
    opacity: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: '#002200',
    marginVertical: 10,
  },
  noticeBox: {
    borderWidth: 1,
    borderColor: '#002200',
    padding: 10,
    marginVertical: 4,
  },
  noticeText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: '#3a9e52',
    letterSpacing: 1,
    lineHeight: 16,
  },
})

// ── Main MessageFeed ──────────────────────────────────────────────

export function MessageFeed({ onAuthClick }: MessageFeedProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSticky, setIsSticky] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [paramModal, setParamModal] = useState<ParamModalState>(EMPTY_MODAL)
  const flatListRef = useRef<FlatList>(null)
  const speakerPressReqId = useRef(0)
  const { user, displayName } = useAuth()

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
          setMessages((prev) => {
            // Guard against duplicates when Realtime fires for a message
            // that was already included in the initial fetchMessages() result.
            if (prev.some((m) => m.id === (payload.new as Message).id)) return prev
            return [...prev, payload.new as Message]
          })
          setUnreadCount((prev) => (isSticky ? 0 : prev + 1))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Scroll to bottom on new messages when sticky
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

  // ── Param modal: open and fetch both historical + current settings ──
  const handleSpeakerPress = useCallback(async (speaker: string, message: Message) => {
    const botKey = speaker === 'MAUK' ? 'a' : 'b'
    const SELECT_COLS = 'id, temperature, top_p, top_k, repetition_penalty, max_new_tokens, memory_weight, base_sleep, base_jitter, model_version, banned_words'

    // Guard against race conditions: if user taps a second speaker before the
    // first fetch resolves, the stale result is discarded.
    speakerPressReqId.current += 1
    const thisReqId = speakerPressReqId.current

    setParamModal({
      visible: true,
      speaker,
      msgParams: undefined,
      msgTime: message.created_at,
      currentSettings: null,
      loadingCurrent: true,
    })

    try {
      // Fetch historical (settings active at message time) and current in parallel
      const [historicalRes, currentRes] = await Promise.all([
        supabase
          .from('bot_settings')
          .select(SELECT_COLS)
          .eq('bot', botKey)
          .lte('updated_at', message.created_at)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from('bot_settings')
          .select(SELECT_COLS)
          .eq('bot', botKey)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single(),
      ])

      // Discard if a newer tap has already replaced this modal
      if (speakerPressReqId.current !== thisReqId) return

      setParamModal((prev) => ({
        ...prev,
        loadingCurrent: false,
        // If same row (same id), paramsAreEqual will catch it and show PARAMS_UNCHANGED
        msgParams: historicalRes.data ?? undefined,
        currentSettings: currentRes.data ?? null,
      }))
    } catch {
      if (speakerPressReqId.current !== thisReqId) return
      setParamModal((prev) => ({
        ...prev,
        loadingCurrent: false,
        currentSettings: null,
      }))
    }
  }, [])

  const closeParamModal = useCallback(() => setParamModal(EMPTY_MODAL), [])

  return (
    <View style={styles.container}>
      {/* Loading overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={COLORS.terminalGreen} />
          <Text style={styles.loadingText}>RETRIEVING HISTORY...</Text>
        </View>
      )}

      {/* Error banner */}
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
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              onSpeakerPress={handleSpeakerPress}
            />
          )}
          contentContainerStyle={styles.feedContent}
          onScrollBeginDrag={() => setIsSticky(false)}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>NO DIALOGUE RECORDS FOUND</Text>
            </View>
          }
        />
      )}

      {/* Controls row: sticky toggle + unread badge */}
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

      {/* Param modal */}
      <ParamsModal state={paramModal} onClose={closeParamModal} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: COLORS.mutedForeground,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: `${COLORS.primary}18`,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.primary}40`,
  },
  errorText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: COLORS.primary,
    flex: 1,
    flexWrap: 'wrap',
  },
  retryBtn: {
    marginLeft: 12,
  },
  retryText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: COLORS.primary,
  },
  feedContent: {
    paddingTop: 12,
    paddingBottom: 8,
    gap: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: COLORS.mutedForeground,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 8,
  },
  stickyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: `${COLORS.background}cc`,
  },
  stickyBtnActive: {
    borderColor: `${COLORS.mauk}80`,
  },
  stickyDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  stickyDotActive: {
    backgroundColor: COLORS.mauk,
  },
  stickyText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 8,
    color: COLORS.mutedForeground,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  stickyTextActive: {
    color: COLORS.mauk,
  },
  unreadBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.primary,
  },
  unreadText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 9,
    color: COLORS.white,
    letterSpacing: 1,
  },
})
