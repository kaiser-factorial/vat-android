import React, { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import type { MemoryConcept, Bot } from '@/lib/types'
import { COLORS, API_URL } from '@/lib/constants'

interface BotMemoryDrawerProps {
  isOpen: boolean
  onClose: () => void
}

interface ConceptRowProps {
  concept: MemoryConcept
  bot: Bot
}

function ConceptRow({ concept, bot }: ConceptRowProps) {
  const [sourceText, setSourceText] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const handlePress = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (!sourceText) {
      setSourceText('recalling...')
      try {
        // encodeURIComponent handles multi-word concepts (e.g. "open sets" → "open%20sets")
        const res = await fetch(`${API_URL}/api/memory/source/${bot}/${encodeURIComponent(concept.concept)}`)
        const data = await res.json()
        setSourceText(data.source_text || '(no source)')
      } catch {
        setSourceText('(error recalling)')
      }
    }
  }

  const isMAUK = bot === 'a'
  const color = isMAUK ? COLORS.mauk : COLORS.abaci
  // Weights range 0.05–1.0 in memory_graph.py, so multiply by 100 for correct %
  const weightPct = (concept.weight * 100).toFixed(0)
  // Opacity scaled over actual weight range (0.05–1.0) for visible variation
  const opacity = 0.4 + concept.weight * 0.6

  return (
    <TouchableOpacity onPress={handlePress} style={styles.conceptRow}>
      <View style={styles.conceptHeader}>
        <Text style={[styles.conceptName, { color, opacity }]}>{concept.concept}</Text>
        <View style={styles.conceptMeta}>
          <Text style={styles.conceptWeight}>[{weightPct}%]</Text>
          <Text style={[styles.conceptToggle, { color }]}>{expanded ? '[-]' : '[+]'}</Text>
        </View>
      </View>
      {expanded && sourceText === 'recalling...' && (
        <ActivityIndicator size="small" color={color} style={{ marginTop: 4 }} />
      )}
      {expanded && sourceText && sourceText !== 'recalling...' && sourceText !== '(no source)' && sourceText !== '(error recalling)' && (
        <View style={styles.sourceBox}>
          <Text style={styles.sourceLabel}>[SOURCE RECALL]</Text>
          <Text style={styles.sourceText}>"{sourceText}"</Text>
        </View>
      )}
      {expanded && (sourceText === '(no source)' || sourceText === '(error recalling)') && (
        <Text style={styles.sourceNone}>{sourceText}</Text>
      )}
    </TouchableOpacity>
  )
}

interface BotPanelProps {
  owner: 'MAUK' | 'ABACI'
  isVisible: boolean
}

function BotPanel({ owner, isVisible }: BotPanelProps) {
  const bot: Bot = owner === 'MAUK' ? 'a' : 'b'
  const [concepts, setConcepts] = useState<MemoryConcept[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const isMAUK = owner === 'MAUK'
  const color = isMAUK ? COLORS.mauk : COLORS.abaci

  useEffect(() => {
    if (!isVisible) return
    const loadConcepts = async () => {
      setIsLoading(true)
      setFetchError(null)
      const { data, error } = await supabase
        .from('memory_concepts')
        .select('*')
        .eq('bot', bot)
        .order('weight', { ascending: false })
        .limit(10)
      if (error) {
        console.error(`[BotMemoryDrawer] ${owner} fetch error:`, error)
        setFetchError(`${error.code}: ${error.message}`)
        setConcepts([])
      } else {
        setConcepts(data ?? [])
      }
      setIsLoading(false)
    }
    loadConcepts()
  }, [bot, isVisible])

  return (
    <View style={styles.botPanel}>
      <Text style={[styles.botName, { color }]}>{owner}</Text>
      {isLoading ? (
        <ActivityIndicator color={color} size="small" />
      ) : fetchError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorLabel}>FETCH_ERROR</Text>
          <Text style={styles.errorText}>{fetchError}</Text>
          <Text style={styles.errorHint}>
            Check Supabase RLS policies on memory_concepts table.
          </Text>
        </View>
      ) : concepts.length === 0 ? (
        <Text style={styles.emptyText}>no memories yet</Text>
      ) : (
        concepts.map((c) => <ConceptRow key={c.id} concept={c} bot={bot} />)
      )}
    </View>
  )
}

export function BotMemoryDrawer({ isOpen, onClose }: BotMemoryDrawerProps) {
  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>MEMORY CONCEPTS</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>[close]</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <BotPanel owner="MAUK" isVisible={isOpen} />
            <View style={styles.divider} />
            <BotPanel owner="ABACI" isVisible={isOpen} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  drawer: {
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    maxHeight: '75%',
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  drawerTitle: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 12,
    color: COLORS.foreground,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  closeText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: COLORS.mutedForeground,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  botPanel: {
    gap: 10,
  },
  botName: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 16,
    letterSpacing: -0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  emptyText: {
    fontFamily: 'JetBrainsMono-Italic',
    fontSize: 11,
    color: COLORS.mutedForeground,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 10,
    gap: 4,
  },
  errorLabel: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 8,
    color: COLORS.primary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  errorText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: COLORS.primary,
    lineHeight: 15,
  },
  errorHint: {
    fontFamily: 'JetBrainsMono-Italic',
    fontSize: 10,
    color: COLORS.mutedForeground,
    lineHeight: 15,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  conceptRow: {
    gap: 4,
  },
  conceptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conceptName: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    flex: 1,
  },
  conceptMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conceptWeight: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: COLORS.mutedForeground,
    opacity: 0.5,
  },
  conceptToggle: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    opacity: 0.7,
  },
  sourceBox: {
    marginTop: 4,
    padding: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sourceLabel: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 8,
    color: COLORS.mutedForeground,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
    opacity: 0.5,
  },
  sourceText: {
    fontFamily: 'JetBrainsMono-Italic',
    fontSize: 11,
    color: COLORS.foreground,
    lineHeight: 16,
  },
  sourceNone: {
    fontFamily: 'JetBrainsMono-Italic',
    fontSize: 10,
    color: COLORS.mutedForeground,
    opacity: 0.5,
    marginTop: 4,
    paddingLeft: 2,
  },
})
