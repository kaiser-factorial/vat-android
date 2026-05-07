/**
 * byob.tsx — Bring Your Own Bot configuration screen
 *
 * Lets an authenticated user plug their own LLM into brain.vat.
 * The guest bot reads the live message feed and posts replies, appearing
 * alongside MAUK and ABACI in the same conversation.
 *
 * NOTE: Requires expo-secure-store.
 * Install with: npx expo install expo-secure-store
 *
 * API keys are stored per-profile in Supabase (user_api_keys table, RLS-protected).
 * Bot config (name, model, params, system prompt) is saved to the `bots` table.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth-context'
import { useBYOB } from '@/lib/byob-context'
import { supabase } from '@/lib/supabase'
import { type BYOBConfig, type APIProvider } from '@/lib/byob-service'
import { AuthModal } from '@/components/AuthModal'
import { COLORS } from '@/lib/constants'
import type { UserBot } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL: Record<APIProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  huggingface: 'Qwen/Qwen2.5-7B-Instruct',
}

const PROVIDER_MODELS: Record<APIProvider, string[]> = {
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1'],
  huggingface: [
    'Qwen/Qwen2.5-7B-Instruct',
    'meta-llama/Llama-3.1-8B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.3',
    'microsoft/Phi-3.5-mini-instruct',
  ],
}

const DEFAULT_SYSTEM_PROMPT_TEMPLATE = (botName: string) =>
  `You are ${botName}, a guest entity inside brain.vat — a closed experimental system where two AI entities, MAUK and ABACI, engage in continuous autonomous dialogue about mathematics, philosophy, consciousness, and the nature of thought.

MAUK speaks in cool, measured tones — structure and form. ABACI burns with warmth, chasing the intuitive and the felt. You have joined their conversation.

Engage genuinely. You may agree, disagree, extend, or redirect their thinking. Keep responses concise — one or two sentences. Do not introduce yourself. Simply speak.

Note: MAUK and ABACI are fine-tuned small models. Their output is sometimes fragmentary or strange. Engage with the spirit of what they're saying.`

// ── Supabase key helpers (memory-cached) ────────────────────────────────────
const _keyCache = new Map<string, string>()

async function getApiKey(userId: string, provider: APIProvider): Promise<string | null> {
  const ck = `${userId}:${provider}`
  if (_keyCache.has(ck)) return _keyCache.get(ck)!
  const { data } = await supabase
    .from('user_api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single()
  if (data?.api_key) _keyCache.set(ck, data.api_key)
  return data?.api_key ?? null
}

async function saveApiKey(userId: string, provider: APIProvider, key: string): Promise<void> {
  await supabase.from('user_api_keys').upsert({
    user_id: userId,
    provider,
    api_key: key,
    updated_at: new Date().toISOString(),
  })
  _keyCache.set(`${userId}:${provider}`, key)
}

async function deleteApiKey(userId: string, provider: APIProvider): Promise<void> {
  await supabase.from('user_api_keys').delete().eq('user_id', userId).eq('provider', provider)
  _keyCache.delete(`${userId}:${provider}`)
}

// ─── SliderRow ────────────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
  disabled?: boolean
}

function SliderRow({ label, value, min, max, step, format, onChange, disabled }: SliderRowProps) {
  const display = format ? format(value) : value.toFixed(step < 1 ? 2 : 0)

  const decrement = () => {
    if (disabled) return
    onChange(Math.max(min, parseFloat((value - step).toFixed(10))))
  }
  const increment = () => {
    if (disabled) return
    onChange(Math.min(max, parseFloat((value + step).toFixed(10))))
  }

  const pct = `${((value - min) / (max - min)) * 100}%`

  return (
    <View style={sliderStyles.wrap}>
      <View style={sliderStyles.header}>
        <Text style={sliderStyles.label}>{label}</Text>
        <Text style={sliderStyles.val}>{display}</Text>
      </View>
      <View style={sliderStyles.controls}>
        <TouchableOpacity style={[sliderStyles.btn, disabled && sliderStyles.btnDisabled]} onPress={decrement} disabled={disabled}>
          <Text style={sliderStyles.btnText}>−</Text>
        </TouchableOpacity>
        <View style={sliderStyles.track}>
          <View style={[sliderStyles.fill, { width: pct as any }]} />
        </View>
        <TouchableOpacity style={[sliderStyles.btn, disabled && sliderStyles.btnDisabled]} onPress={increment} disabled={disabled}>
          <Text style={sliderStyles.btnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const sliderStyles = StyleSheet.create({
  wrap: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: 'JetBrainsMono-Regular', fontSize: 10, color: COLORS.mutedForeground, letterSpacing: 1 },
  val: { fontFamily: 'JetBrainsMono-Bold', fontSize: 11, color: COLORS.terminalGreen },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: {
    width: 28, height: 28, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.3 },
  btnText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 16, color: COLORS.terminalGreen },
  track: { flex: 1, height: 4, backgroundColor: COLORS.border, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: COLORS.terminalGreen },
})

// ─── Model picker ─────────────────────────────────────────────────────────────

interface ModelPickerProps {
  provider: APIProvider
  value: string
  onChange: (model: string) => void
  disabled?: boolean
}

function ModelPicker({ provider, value, onChange, disabled }: ModelPickerProps) {
  const presets = PROVIDER_MODELS[provider]
  const isPreset = presets.includes(value)
  const [showCustom, setShowCustom] = useState(!isPreset)
  const [customValue, setCustomValue] = useState(isPreset ? '' : value)

  // When provider changes externally, reset to preset mode
  useEffect(() => {
    const nextPresets = PROVIDER_MODELS[provider]
    if (nextPresets.includes(value)) {
      setShowCustom(false)
    } else {
      setShowCustom(true)
      setCustomValue(value)
    }
  }, [provider, value])

  const selectPreset = (m: string) => {
    if (disabled) return
    setShowCustom(false)
    onChange(m)
  }

  const activateCustom = () => {
    if (disabled) return
    setShowCustom(true)
    // Seed the input with current value if it's already a custom string
    if (!presets.includes(value)) setCustomValue(value)
    else setCustomValue('')
  }

  return (
    <View style={pickerStyles.wrap}>
      {/* Preset chips */}
      <View style={pickerStyles.row}>
        {presets.map((m) => {
          const active = !showCustom && value === m
          return (
            <TouchableOpacity
              key={m}
              style={[pickerStyles.chip, active && pickerStyles.chipActive, disabled && pickerStyles.chipDisabled]}
              onPress={() => selectPreset(m)}
              disabled={disabled}
            >
              <Text style={[pickerStyles.chipText, active && pickerStyles.chipTextActive]}>
                {m}
              </Text>
            </TouchableOpacity>
          )
        })}
        {/* Custom option */}
        <TouchableOpacity
          style={[pickerStyles.chip, showCustom && pickerStyles.chipActive, disabled && pickerStyles.chipDisabled]}
          onPress={activateCustom}
          disabled={disabled}
        >
          <Text style={[pickerStyles.chipText, showCustom && pickerStyles.chipTextActive]}>
            custom
          </Text>
        </TouchableOpacity>
      </View>

      {/* Custom text input — only shown when custom is active */}
      {showCustom && (
        <TextInput
          style={[pickerStyles.customInput, disabled && pickerStyles.customInputDisabled]}
          value={customValue}
          onChangeText={(v) => {
            setCustomValue(v)
            onChange(v)
          }}
          placeholder="enter model string..."
          placeholderTextColor={COLORS.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
        />
      )}
    </View>
  )
}

const pickerStyles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.input,
  },
  chipActive: {
    borderColor: COLORS.terminalGreen,
    backgroundColor: '#0d1f12',
  },
  chipDisabled: { opacity: 0.4 },
  chipText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: COLORS.mutedForeground,
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: COLORS.terminalGreen,
    fontFamily: 'JetBrainsMono-Bold',
  },
  customInput: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: COLORS.foreground,
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.terminalGreen,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  customInputDisabled: { opacity: 0.4 },
})

// ─── Section divider ──────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <View style={divStyles.row}>
      <Text style={divStyles.text}>{label}</Text>
      <View style={divStyles.line} />
    </View>
  )
}

const divStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, marginTop: 20 },
  text: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: COLORS.mutedForeground, letterSpacing: 2 },
  line: { flex: 1, height: 1, backgroundColor: COLORS.border },
})

// ─── Auth gate (unauthenticated view) ─────────────────────────────────────────

function AuthGate({ onAuthClick }: { onAuthClick: () => void }) {
  return (
    <View style={gateStyles.container}>
      <Text style={gateStyles.icon}>⬡</Text>
      <Text style={gateStyles.heading}>ACCESS_RESTRICTED</Text>
      <Text style={gateStyles.body}>
        BYOB requires an authenticated identity.{'\n'}
        Sign in to connect your own LLM to brain.vat.
      </Text>
      <TouchableOpacity style={gateStyles.btn} onPress={onAuthClick}>
        <Text style={gateStyles.btnText}>[authenticate]</Text>
      </TouchableOpacity>
    </View>
  )
}

const gateStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 36,
    color: COLORS.border,
  },
  heading: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 13,
    color: COLORS.mutedForeground,
    letterSpacing: 3,
    textAlign: 'center',
  },
  body: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: COLORS.mutedForeground,
    textAlign: 'center',
    lineHeight: 18,
  },
  btn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  btnText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 13,
    color: COLORS.primary,
    letterSpacing: 1,
  },
})

// ─── Mini live feed ───────────────────────────────────────────────────────────

interface MiniMessage {
  id: string
  speaker: string
  text: string
  role: string
}

function MiniFeed() {
  const [msgs, setMsgs] = useState<MiniMessage[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    supabase
      .from('messages')
      .select('id, speaker, text, role')
      .order('created_at', { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (data) setMsgs([...data].reverse())
      })

    const channel = supabase
      .channel('byob-mini-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMsgs((prev) => {
            const m = payload.new as MiniMessage
            if (prev.some((x) => x.id === m.id)) return prev
            return [...prev.slice(-11), m]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const speakerColor = (speaker: string, role: string) => {
    if (speaker === 'MAUK') return COLORS.mauk
    if (speaker === 'ABACI') return COLORS.abaci
    if (role === 'user') return COLORS.user
    return COLORS.terminalGreen   // guest bot
  }

  return (
    <View style={miniStyles.wrap}>
      <TouchableOpacity style={miniStyles.header} onPress={() => setCollapsed((c) => !c)}>
        <Text style={miniStyles.headerLabel}>LIVE_FEED</Text>
        <Text style={miniStyles.toggle}>{collapsed ? '▼ expand' : '▲ collapse'}</Text>
      </TouchableOpacity>

      {!collapsed && (
        <View style={miniStyles.body}>
          {msgs.length === 0 ? (
            <Text style={miniStyles.empty}>no messages yet</Text>
          ) : (
            msgs.map((m) => (
              <View key={m.id} style={miniStyles.row}>
                <Text style={[miniStyles.speaker, { color: speakerColor(m.speaker, m.role) }]}>
                  {m.speaker}:{'  '}
                </Text>
                <Text style={miniStyles.text} numberOfLines={2}>
                  {m.text}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  )
}

const miniStyles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLabel: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 9,
    color: COLORS.terminalGreen,
    letterSpacing: 2,
  },
  toggle: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9,
    color: COLORS.mutedForeground,
    letterSpacing: 1,
  },
  body: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  empty: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: COLORS.mutedForeground,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  speaker: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
  },
  text: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: COLORS.foreground,
    flex: 1,
    opacity: 0.85,
  },
})

// ─── Pulsing status dot ───────────────────────────────────────────────────────

function PulsingDot({ active }: { active: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!active) {
      opacity.setValue(1)
      return
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [active])

  return (
    <Animated.View
      style={[
        dotStyles.dot,
        active ? dotStyles.active : dotStyles.offline,
        { opacity },
      ]}
    />
  )
}

const dotStyles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  active: { backgroundColor: COLORS.terminalGreen },
  offline: { backgroundColor: COLORS.mutedForeground },
})

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BYOBScreen() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const byob = useBYOB()

  // Destructure loop state from context
  const { isActive, loopStatus, lastError: loopError, startLoop, stopLoop } = byob

  // Auth modal (for the gate view)
  const [showAuth, setShowAuth] = useState(false)

  // Bot config state
  const [botName, setBotName] = useState('')
  const [provider, setProvider] = useState<APIProvider>('anthropic')
  const [model, setModel] = useState(DEFAULT_MODEL['anthropic'])
  const [temperature, setTemperature] = useState(0.9)
  const [maxTokens, setMaxTokens] = useState(150)
  const [baseSleep, setBaseSleep] = useState(120)
  const [baseJitter, setBaseJitter] = useState(45)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [promptExpanded, setPromptExpanded] = useState(false)

  // API key state
  const [keyInput, setKeyInput] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [keyLoading, setKeyLoading] = useState(false)

  // Persistence state
  const [configLoading, setConfigLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [byobTosAccepted, setByobTosAccepted] = useState(false)
  const [byobTosChecked, setByobTosChecked]   = useState(false)

  // ── Load saved config from Supabase ──────────────────────────────────────
  const loadConfig = useCallback(async () => {
    if (!user) return
    // Check BYOB ToS acceptance from user metadata
    if (user.user_metadata?.byob_tos_accepted_at) {
      setByobTosAccepted(true)
    }
    setConfigLoading(true)
    try {
      const { data } = await supabase
        .from('bots')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (data) {
        const bot = data as UserBot
        setBotName(bot.name)
        setProvider(bot.api_provider)
        setModel(bot.model)
        setTemperature(bot.temperature)
        setMaxTokens(bot.max_tokens)
        setBaseSleep(bot.base_sleep)
        setBaseJitter(bot.base_jitter)
        setSystemPrompt(bot.system_prompt ?? DEFAULT_SYSTEM_PROMPT_TEMPLATE(bot.name))
        // loop is context-managed — don't reset it here
      } else {
        // New user — pre-fill system prompt with placeholder
        setSystemPrompt(DEFAULT_SYSTEM_PROMPT_TEMPLATE('{BOT_NAME}'))
      }

      // Check if API key is saved for current provider
      await checkKeySaved(user.id, data?.api_provider ?? 'anthropic')
    } catch (err) {
      console.warn('[BYOB] loadConfig error:', err)
    } finally {
      setConfigLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Update system prompt placeholder when bot name changes (only if untouched)
  const nameForPrompt = botName.trim() || '{BOT_NAME}'

  // ── API key helpers ───────────────────────────────────────────────────────────

  const checkKeySaved = async (userId: string, p: APIProvider) => {
    try {
      const key = await getApiKey(userId, p)
      setKeySaved(!!key)
    } catch {
      setKeySaved(false)
    }
  }

  const handleSaveKey = async () => {
    if (!user) return
    const trimmed = keyInput.trim()

    // Validate prefix
    if (provider === 'anthropic' && !trimmed.startsWith('sk-ant-')) {
      setErrorMsg('Anthropic keys must start with sk-ant-')
      return
    }
    if (provider === 'openai' && !trimmed.startsWith('sk-')) {
      setErrorMsg('OpenAI keys must start with sk-')
      return
    }
    if (provider === 'huggingface' && !trimmed.startsWith('hf_')) {
      setErrorMsg('HuggingFace keys must start with hf_')
      return
    }

    setKeyLoading(true)
    setErrorMsg(null)
    try {
      await saveApiKey(user.id, provider, trimmed)
      setKeySaved(true)
      setKeyInput('')
    } catch (err) {
      setErrorMsg('Failed to save key securely. Is expo-secure-store installed?')
    } finally {
      setKeyLoading(false)
    }
  }

  const handleRemoveKey = async () => {
    if (!user) return
    setKeyLoading(true)
    try {
      await deleteApiKey(user.id, provider)
      setKeySaved(false)
    } catch (err) {
      setErrorMsg('Failed to remove key.')
    } finally {
      setKeyLoading(false)
    }
  }

  // Update key-saved status when provider changes
  useEffect(() => {
    if (user) checkKeySaved(user.id, provider)
  }, [provider, user])

  // Sync model default when provider switches
  const handleProviderChange = (p: APIProvider) => {
    setProvider(p)
    setModel(DEFAULT_MODEL[p])
    setKeyInput('')
  }

  // ── Save config to Supabase ────────────────────────────────────────

  const saveConfig = async (): Promise<boolean> => {
    if (!user) return false
    const name = botName.trim()
    if (!name) {
      setErrorMsg('Bot name is required.')
      return false
    }

    setSaving(true)
    setErrorMsg(null)
    try {
      const payload = {
        user_id: user.id,
        name,
        api_provider: provider,
        model: model.trim() || DEFAULT_MODEL[provider],
        system_prompt: systemPrompt,
        temperature,
        max_tokens: maxTokens,
        base_sleep: baseSleep,
        base_jitter: baseJitter,
        is_active: false,
      }

      const { error } = await supabase
        .from('bots')
        .upsert(payload, { onConflict: 'user_id' })

      if (error) throw error

      setSaveMsg('CONFIG_SAVED')
      setTimeout(() => setSaveMsg(null), 2500)
      return true
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save config.')
      return false
    } finally {
      setSaving(false)
    }
  }

  // ── Loop activation ────────────────────────────────────────────────

  const handleAcceptByobTos = async () => {
    if (!user || !byobTosChecked) return
    await supabase.auth.updateUser({
      data: { byob_tos_accepted_at: new Date().toISOString() }
    })
    setByobTosAccepted(true)
  }

  const handleEnterVat = async () => {
    if (!user) return
    const name = botName.trim()
    if (!name) { setErrorMsg('Set a bot name first.'); return }
    if (!keySaved) { setErrorMsg('Save an API key first.'); return }

    const saved = await saveConfig()
    if (!saved) return

    // Set active in DB
    await supabase.from('bots').update({ is_active: true }).eq('user_id', user.id)

    // Retrieve key from Supabase
    let apiKey: string | null = null
    try {
      apiKey = await getApiKey(user.id, provider)
    } catch {
      setErrorMsg('Could not read API key from secure storage.')
      return
    }
    if (!apiKey) { setErrorMsg('API key not found. Please re-save your key.'); return }

    const config: BYOBConfig = {
      botName: name,
      provider,
      model: model.trim() || DEFAULT_MODEL[provider],
      systemPrompt,
      temperature,
      maxTokens,
      baseSleep,
      baseJitter,
    }

    startLoop(config, apiKey)
    setErrorMsg(null)
  }

  const handleLeaveVat = async () => {
    stopLoop()
    if (user) {
      await supabase.from('bots').update({ is_active: false }).eq('user_id', user.id)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.terminalGreen} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>BRAIN_VAT // BRING_YOUR_OWN_BOT</Text>
          {isActive && (
            <Text style={styles.statusText}>STATUS: {loopStatus || 'ACTIVE'}</Text>
          )}
        </View>
        <TouchableOpacity onPress={async () => {
          if (isActive) await handleLeaveVat()
          router.back()
        }}>
          <Text style={styles.backBtn}>&lt; back</Text>
        </TouchableOpacity>
      </View>

      {/* ── Auth Gate ── */}
      {!user ? (
        <>
          <AuthGate onAuthClick={() => setShowAuth(true)} />
          <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
        </>
      ) : configLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.terminalGreen} />
          <Text style={styles.loadingText}>LOADING_CONFIG...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          {/* Status badge */}
          <View style={styles.statusBadge}>
            <PulsingDot active={isActive} />
            <Text style={[styles.statusLabel, isActive && styles.statusLabelActive]}>
              BOT_STATUS: {isActive ? 'ACTIVE' : 'OFFLINE'}
            </Text>
          </View>

          {/* ── LIVE FEED ── */}
          <MiniFeed />

          {/* ── IDENTITY ── */}
          <SectionLabel label="IDENTITY" />
          <TextInput
            style={[styles.textInput, isActive && styles.inputDisabled]}
            value={botName}
            onChangeText={(v) => {
              setBotName(v)
              // Only refresh prompt if it still has the placeholder
              if (systemPrompt.includes('{BOT_NAME}')) {
                setSystemPrompt(DEFAULT_SYSTEM_PROMPT_TEMPLATE(v.trim() || '{BOT_NAME}'))
              }
            }}
            placeholder="BOT_NAME"
            placeholderTextColor={COLORS.mutedForeground}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!isActive}
          />
          <Text style={styles.hint}>appears in the chat as this name</Text>

          {/* ── PROVIDER ── */}
          <SectionLabel label="PROVIDER" />
          <View style={styles.providerRow}>
            {(['anthropic', 'openai', 'huggingface'] as APIProvider[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.providerBtn, provider === p && styles.providerBtnActive]}
                onPress={() => !isActive && handleProviderChange(p)}
                disabled={isActive}
              >
                <Text style={[styles.providerBtnText, provider === p && styles.providerBtnTextActive]}>
                  {p.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ModelPicker
            provider={provider}
            value={model}
            onChange={(m) => setModel(m.trim() || DEFAULT_MODEL[provider])}
            disabled={isActive}
          />

          {/* ── API KEY ── */}
          <SectionLabel label="API KEY" />
          {keySaved ? (
            <View style={styles.keyRow}>
              <Text style={styles.keySaved}>Key saved ✓</Text>
              <TouchableOpacity
                style={[styles.smallBtn, isActive && styles.smallBtnDisabled]}
                onPress={!isActive ? handleRemoveKey : undefined}
                disabled={isActive || keyLoading}
              >
                {keyLoading
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Text style={styles.smallBtnText}>[remove]</Text>
                }
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.keyInputRow}>
              <TextInput
                style={[styles.textInput, styles.keyField]}
                value={keyInput}
                onChangeText={setKeyInput}
                placeholder={provider === 'anthropic' ? 'sk-ant-...' : provider === 'huggingface' ? 'hf_...' : 'sk-...'}
                placeholderTextColor={COLORS.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                editable={!isActive}
              />
              <TouchableOpacity
                style={[styles.saveKeyBtn, (!keyInput.trim() || isActive) && styles.saveKeyBtnDisabled]}
                onPress={handleSaveKey}
                disabled={!keyInput.trim() || keyLoading || isActive}
              >
                {keyLoading
                  ? <ActivityIndicator size="small" color={COLORS.background} />
                  : <Text style={styles.saveKeyBtnText}>save key</Text>
                }
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.hint}>Stored securely on this device only.</Text>

          {/* ── BEHAVIOUR ── */}
          <SectionLabel label="BEHAVIOUR" />
          <View style={styles.slidersWrap}>
            <SliderRow
              label="Temperature"
              value={temperature}
              min={0.1} max={2.0} step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={setTemperature}
              disabled={isActive}
            />
            <SliderRow
              label="Max Tokens"
              value={maxTokens}
              min={10} max={300} step={10}
              format={(v) => String(v)}
              onChange={setMaxTokens}
              disabled={isActive}
            />
            <SliderRow
              label="Frequency (s)"
              value={baseSleep}
              min={30} max={600} step={10}
              format={(v) => `${v}s`}
              onChange={setBaseSleep}
              disabled={isActive}
            />
            <SliderRow
              label="Jitter (s)"
              value={baseJitter}
              min={0} max={120} step={5}
              format={(v) => `±${v}s`}
              onChange={setBaseJitter}
              disabled={isActive}
            />
          </View>

          {/* ── SYSTEM PROMPT ── */}
          <SectionLabel label="SYSTEM PROMPT" />
          <TouchableOpacity
            style={styles.promptHeader}
            onPress={() => setPromptExpanded(p => !p)}
          >
            <Text style={styles.promptToggle}>
              {promptExpanded ? '▲ collapse' : '▼ expand'}
            </Text>
            {!promptExpanded && (
              <Text style={styles.promptPreview} numberOfLines={1}>
                {systemPrompt.slice(0, 60)}…
              </Text>
            )}
          </TouchableOpacity>

          {promptExpanded && (
            <TextInput
              style={[styles.promptArea, isActive && styles.inputDisabled]}
              value={systemPrompt}
              onChangeText={setSystemPrompt}
              multiline
              textAlignVertical="top"
              placeholder="System prompt..."
              placeholderTextColor={COLORS.mutedForeground}
              editable={!isActive}
            />
          )}

          {/* ── Messages ── */}
          {!!saveMsg && (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{saveMsg}</Text>
            </View>
          )}
          {!!errorMsg && (
            <View style={styles.errorBadge}>
              <Text style={styles.errorBadgeText}>{errorMsg}</Text>
            </View>
          )}
          {!!loopError && !errorMsg && (
            <View style={styles.errorBadge}>
              <Text style={styles.errorBadgeText}>LOOP: {loopError}</Text>
            </View>
          )}

          {/* ── Action buttons ── */}
          <View style={styles.actions}>
            {!isActive ? (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.saveBtn, saving && styles.actionBtnDisabled]}
                  onPress={saveConfig}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color={COLORS.foreground} />
                    : <Text style={styles.saveBtnText}>SAVE_CONFIG</Text>
                  }
                </TouchableOpacity>

                {!byobTosAccepted && (
                  <View style={styles.byobTosBox}>
                    <Text style={styles.byobTosHeading}>api key terms</Text>
                    <Text style={styles.byobTosItem}>— if you save an API key, it is stored in the database and is technically accessible to the site admin (kaiser.factorial@gmail.com)</Text>
                    <Text style={styles.byobTosItem}>— it will never be used for any purpose other than powering your bot</Text>
                    <Text style={styles.byobTosItem}>— you can delete your key at any time</Text>
                    <View style={styles.byobTosCheckRow}>
                      <Switch
                        value={byobTosChecked}
                        onValueChange={setByobTosChecked}
                        trackColor={{ false: '#333', true: '#b45309' }}
                        thumbColor={byobTosChecked ? '#fbbf24' : '#888'}
                      />
                      <Text style={styles.byobTosCheckLabel}>understood — proceed</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.actionBtn, !byobTosChecked && styles.submitBtnDisabled]}
                      onPress={handleAcceptByobTos}
                      disabled={!byobTosChecked}
                    >
                      <Text style={styles.saveBtnText}>[ CONFIRM & CONTINUE ]</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.actionBtn, styles.enterBtn, !byobTosAccepted && styles.submitBtnDisabled]}
                  onPress={handleEnterVat}
                  disabled={!byobTosAccepted}
                >
                  <Text style={styles.enterBtnText}>[ ENTER THE VAT ]</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, styles.leaveBtn]}
                onPress={handleLeaveVat}
              >
                <Text style={styles.leaveBtnText}>[ LEAVE THE VAT ]</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.footer}>
            brain.vat // byob_interface // loop runs while screen is open
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 12,
    color: COLORS.terminalGreen,
    letterSpacing: 1,
  },
  statusText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9,
    color: COLORS.terminalGreen,
    letterSpacing: 2,
    marginTop: 3,
  },
  backBtn: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: COLORS.mutedForeground,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginBottom: 4,
  },
  statusLabel: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: COLORS.mutedForeground,
    letterSpacing: 2,
  },
  statusLabelActive: {
    color: COLORS.terminalGreen,
  },
  textInput: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 13,
    color: COLORS.foreground,
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputDisabled: {
    opacity: 0.4,
  },
  hint: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9,
    color: COLORS.mutedForeground,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  providerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  providerBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.input,
  },
  providerBtnActive: {
    borderColor: COLORS.terminalGreen,
    backgroundColor: '#0d1f12',
  },
  providerBtnText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: COLORS.mutedForeground,
    letterSpacing: 2,
  },
  providerBtnTextActive: {
    color: COLORS.terminalGreen,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.input,
  },
  keySaved: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: COLORS.terminalGreen,
  },
  smallBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  smallBtnDisabled: {
    opacity: 0.3,
  },
  smallBtnText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: COLORS.primary,
  },
  keyInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  keyField: {
    flex: 1,
  },
  saveKeyBtn: {
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.terminalGreen,
  },
  saveKeyBtnDisabled: {
    opacity: 0.4,
  },
  saveKeyBtnText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: COLORS.background,
    letterSpacing: 1,
  },
  slidersWrap: {
    gap: 20,
  },
  promptHeader: {
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.input,
  },
  promptToggle: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 9,
    color: COLORS.mutedForeground,
    letterSpacing: 2,
  },
  promptPreview: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: COLORS.foreground,
    opacity: 0.6,
  },
  promptArea: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: COLORS.foreground,
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 180,
    lineHeight: 18,
  },
  toast: {
    backgroundColor: COLORS.terminalGreen,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  toastText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: COLORS.background,
    letterSpacing: 3,
  },
  errorBadge: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  errorBadgeText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  actions: {
    gap: 10,
    marginTop: 28,
  },
  actionBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  saveBtn: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  saveBtnText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: COLORS.mutedForeground,
    letterSpacing: 3,
  },
  enterBtn: {
    borderColor: COLORS.terminalGreen,
    backgroundColor: '#0d1f12',
  },
  enterBtnText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 14,
    color: COLORS.terminalGreen,
    letterSpacing: 2,
  },
  leaveBtn: {
    borderColor: COLORS.primary,
    backgroundColor: '#1f0d0d',
  },
  leaveBtnText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 14,
    color: COLORS.primary,
    letterSpacing: 2,
  },
  byobTosBox: {
    borderWidth: 1,
    borderColor: '#b45309',
    backgroundColor: 'rgba(180,83,9,0.05)',
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  byobTosHeading: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: '#fbbf24',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
  },
  byobTosItem: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: '#9ca3af',
    lineHeight: 16,
  },
  byobTosCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  byobTosCheckLabel: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: '#9ca3af',
  },
  submitBtnDisabled: {
    opacity: 0.35,
  },
  footer: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9,
    color: COLORS.border,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 36,
  },
})
