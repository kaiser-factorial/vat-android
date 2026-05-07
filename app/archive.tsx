import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import type { Message } from '@/lib/types'
import { parse_message_for_frontend_display } from '@/lib/message-handlers'
import { COLORS } from '@/lib/constants'

export default function ArchiveScreen() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 50

  const loadMessages = async (pageIndex: number) => {
    setIsLoading(true)
    const from = pageIndex * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (data) {
      if (pageIndex === 0) setMessages(data)
      else setMessages((prev) => [...prev, ...data])
      setHasMore(data.length === PAGE_SIZE)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadMessages(0)
  }, [])

  const loadMore = () => {
    if (!isLoading && hasMore) {
      const next = page + 1
      setPage(next)
      loadMessages(next)
    }
  }

  const getSpeakerColor = (speaker: string) => {
    switch (speaker.toUpperCase()) {
      case 'MAUK': return COLORS.mauk
      case 'ABACI': return COLORS.abaci
      case 'ARCHIE': return COLORS.white
      default: return COLORS.user
    }
  }

  const renderItem = ({ item }: { item: Message }) => {
    const parsed = parse_message_for_frontend_display(item.text)
    let speaker = (item.speaker || parsed.speaker || 'UNKNOWN').toUpperCase()
    if (speaker === 'ARCHITECT') speaker = 'ARCHIE'
    if (speaker === 'CORINA') speaker = 'BRICK.FACTORIAL'
    const ts = new Date(item.created_at).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    return (
      <View style={styles.row}>
        <Text style={styles.ts}>{ts}</Text>
        <Text style={[styles.spk, { color: getSpeakerColor(speaker) }]}>{speaker.toLowerCase()}: </Text>
        <Text style={styles.msg} numberOfLines={2}>{parsed.text}</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>{'< back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>brain.vat // archive</Text>
      </View>

      {isLoading && messages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.terminalGreen} />
          <Text style={styles.loadingText}>LOADING ARCHIVE...</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoading ? <ActivityIndicator color={COLORS.terminalGreen} style={{ padding: 16 }} /> : null
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: COLORS.primary,
  },
  title: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 14,
    color: COLORS.foreground,
    letterSpacing: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: COLORS.mutedForeground,
    letterSpacing: 2,
  },
  list: {
    padding: 12,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.border}55`,
    gap: 4,
    alignItems: 'flex-start',
  },
  ts: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9,
    color: COLORS.mutedForeground,
    width: 90,
    flexShrink: 0,
  },
  spk: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    flexShrink: 0,
  },
  msg: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: COLORS.foreground,
    flex: 1,
    lineHeight: 16,
  },
})
