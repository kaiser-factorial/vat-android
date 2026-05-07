import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '@/lib/auth-context'
import { useSystemStatus } from '@/lib/system-status-context'
import type { BotSettings } from '@/lib/types'
import { COLORS, API_URL, ADMIN_EMAIL } from '@/lib/constants'

const DEFAULTS: Omit<BotSettings, 'bot' | 'updated_at'> = {
  temperature: 0.9,
  top_p: 0.95,
  repetition_penalty: 1.3,
  max_new_tokens: 55,
  banned_words: [],
  model_version: 'v1',
  base_sleep: 120,
  base_jitter: 30,
  top_k: 0,
  memory_weight: 0.7,
}

// ── Slider stepper ────────────────────────────────────────────────
interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  leftLabel?: string
  rightLabel?: string
  format?: (v: number) => string
  onChange: (v: number) => void
}

function SliderRow({ label, value, min, max, step, leftLabel, rightLabel, format, onChange }: SliderRowProps) {
  const displayVal = format ? format(value) : String(value)

  const decrement = () => {
    const next = Math.max(min, parseFloat((value - step).toFixed(10)))
    onChange(next)
  }
  const increment = () => {
    const next = Math.min(max, parseFloat((value + step).toFixed(10)))
    onChange(next)
  }

  return (
    <View style={slider.container}>
      <View style={slider.header}>
        <Text style={slider.label}>{label}</Text>
        <Text style={slider.value}>{displayVal}</Text>
      </View>
      <View style={slider.controls}>
        <TouchableOpacity style={slider.btn} onPress={decrement}>
          <Text style={slider.btnText}>−</Text>
        </TouchableOpacity>
        <View style={slider.track}>
          <View
            style={[
              slider.fill,
              { width: `${((value - min) / (max - min)) * 100}%` },
            ]}
          />
        </View>
        <TouchableOpacity style={slider.btn} onPress={increment}>
          <Text style={slider.btnText}>+</Text>
        </TouchableOpacity>
      </View>
      {(leftLabel || rightLabel) && (
        <View style={slider.legends}>
          <Text style={slider.legend}>{leftLabel}</Text>
          <Text style={slider.legend}>{rightLabel}</Text>
        </View>
      )}
    </View>
  )
}

const slider = StyleSheet.create({
  container: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: 'JetBrainsMono-Bold', fontSize: 9, color: '#3a9e52', letterSpacing: 2, textTransform: 'uppercase' },
  value: { fontFamily: 'JetBrainsMono-Regular', fontSize: 11, color: '#00ff41' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: {
    width: 28, height: 28, borderWidth: 1, borderColor: '#002200',
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontFamily: 'JetBrainsMono-Bold', fontSize: 16, color: '#3a9e52' },
  track: { flex: 1, height: 4, backgroundColor: '#002200', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#00ff41' },
  legends: { flexDirection: 'row', justifyContent: 'space-between' },
  legend: { fontFamily: 'JetBrainsMono-Bold', fontSize: 8, color: '#002200', textTransform: 'uppercase' },
})

// ── Param config ──────────────────────────────────────────────────
type ParamType = 'slider' | 'text' | 'textarea'

interface ParamConfig {
  key: keyof BotSettings
  label: string
  type: ParamType
  // slider-specific
  min?: number
  max?: number
  step?: number
  leftLabel?: string
  rightLabel?: string
  format?: (v: number) => string
}

const PARAM_CONFIGS: ParamConfig[] = [
  {
    key: 'model_version', label: 'Model Version', type: 'text',
  },
  {
    key: 'base_sleep', label: 'Frequency (s)', type: 'slider',
    min: 10, max: 600, step: 10, format: (v) => `${v}s`,
  },
  {
    key: 'base_jitter', label: 'Jitter (s)', type: 'slider',
    min: 0, max: 120, step: 5, format: (v) => `±${v}s`,
  },
  {
    key: 'temperature', label: 'Temperature', type: 'slider',
    min: 0.1, max: 2.0, step: 0.05,
    leftLabel: 'Stability', rightLabel: 'Creativity',
    format: (v) => v.toFixed(2),
  },
  {
    key: 'top_p', label: 'Top-P (Nucleus)', type: 'slider',
    min: 0.1, max: 1.0, step: 0.01,
    leftLabel: 'Strict', rightLabel: 'Diverse',
    format: (v) => v.toFixed(2),
  },
  {
    key: 'repetition_penalty', label: 'Repetition Penalty', type: 'slider',
    min: 1.0, max: 2.5, step: 0.05,
    leftLabel: 'Fluid', rightLabel: 'Diverse',
    format: (v) => v.toFixed(2),
  },
  {
    key: 'max_new_tokens', label: 'Max Response Length', type: 'slider',
    min: 10, max: 200, step: 1,
    leftLabel: 'Concise', rightLabel: 'Verbose',
    format: (v) => String(v),
  },
  {
    key: 'memory_weight', label: 'Memory Recall Power', type: 'slider',
    min: 0, max: 1, step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: 'top_k', label: 'Top-K (Entropy Floor)', type: 'slider',
    min: 0, max: 100, step: 1,
    leftLabel: 'Unleashed', rightLabel: 'Focused',
    format: (v) => (v === 0 ? 'FULL_CHAOS' : String(v)),
  },
  {
    key: 'banned_words', label: 'Banned Words', type: 'textarea',
  },
]

function formatParamSummary(config: ParamConfig, value: any): string {
  if (config.type === 'slider' && config.format) return config.format(Number(value))
  if (config.key === 'banned_words') {
    const arr = Array.isArray(value) ? value.filter(Boolean) : []
    return arr.length === 0 ? 'none' : `${arr.length} word${arr.length !== 1 ? 's' : ''}`
  }
  return String(value ?? '')
}

// ── Individual param row (tappable, expands to editor) ────────────
interface ParamRowProps {
  config: ParamConfig
  value: any
  isOpen: boolean
  onTap: () => void
  onUpdate: (v: any) => void
}

function ParamRow({ config, value, isOpen, onTap, onUpdate }: ParamRowProps) {
  const displayValue = formatParamSummary(config, value)

  return (
    <View style={paramRow.wrapper}>
      <TouchableOpacity style={paramRow.row} onPress={onTap} activeOpacity={0.7}>
        <Text style={paramRow.label}>{config.label}</Text>
        <View style={paramRow.right}>
          <Text style={[paramRow.value, isOpen && paramRow.valueOpen]}>{displayValue}</Text>
          <Text style={paramRow.chevron}>{isOpen ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {isOpen && (
        <View style={paramRow.editor}>
          {config.type === 'slider' && (
            <SliderRow
              label={config.label}
              value={Number(value)}
              min={config.min!}
              max={config.max!}
              step={config.step!}
              leftLabel={config.leftLabel}
              rightLabel={config.rightLabel}
              format={config.format}
              onChange={onUpdate}
            />
          )}
          {config.type === 'text' && (
            <TextInput
              style={paramRow.textInput}
              value={String(value ?? '')}
              onChangeText={onUpdate}
              placeholder="e.g. v1"
              placeholderTextColor={COLORS.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
          {config.type === 'textarea' && (
            <TextInput
              style={[paramRow.textInput, paramRow.textArea]}
              value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
              onChangeText={(v) =>
                onUpdate(v.split(',').map((w) => w.trim()).filter(Boolean))
              }
              multiline
              numberOfLines={3}
              placeholder="word1, phrase1, ..."
              placeholderTextColor={COLORS.mutedForeground}
            />
          )}
        </View>
      )}
    </View>
  )
}

const paramRow = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#001200',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: '#3a9e52',
    letterSpacing: 1,
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  value: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: '#00cc33',
  },
  valueOpen: {
    color: '#00ff41',
  },
  chevron: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 8,
    color: '#3a9e52',
    width: 10,
    textAlign: 'center',
  },
  editor: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#000a00',
    borderTopWidth: 1,
    borderTopColor: '#002200',
  },
  textInput: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: '#00ff41',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#002200',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
    color: '#00cc33',
  },
})

// ── Bot Card (collapsed by default, expands on tap) ───────────────
interface BotCardProps {
  settings: BotSettings
  isLoopActive: boolean
  isSaving: boolean
  onUpdate: (bot: string, field: keyof BotSettings, value: any) => void
  onSave: (bot: string) => void
}

function BotCard({ settings, isLoopActive, isSaving, onUpdate, onSave }: BotCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [openParam, setOpenParam] = useState<keyof BotSettings | null>(null)

  const botName = settings.bot === 'a' ? 'MAUK' : 'ABACI'

  // Compact one-line summary shown when collapsed
  const summary = [
    `FREQ:${settings.base_sleep}s`,
    `TEMP:${settings.temperature.toFixed(2)}`,
    `TOP-P:${settings.top_p.toFixed(2)}`,
    `LEN:${settings.max_new_tokens}`,
  ].join('  ')

  const handleToggleExpand = () => {
    setIsExpanded((p) => !p)
    setOpenParam(null) // close any open editor when collapsing
  }

  const handleParamTap = (key: keyof BotSettings) => {
    setOpenParam((prev) => (prev === key ? null : key))
  }

  return (
    <View style={card.container}>
      {/* ── Header + summary row: always visible, tap to expand ── */}
      <TouchableOpacity onPress={handleToggleExpand} activeOpacity={0.8}>
        {/* Bot identity + loop status */}
        <View style={card.header}>
          <View style={card.headerLeft}>
            <View style={[card.dot, isLoopActive && card.dotActive]} />
            <Text style={card.botName}>{botName}</Text>
            <Text style={card.nodeLabel}>Node_{settings.bot.toUpperCase()}</Text>
          </View>
          <View style={[card.loopPill, isLoopActive && card.loopPillActive]}>
            <Text style={[card.loopText, isLoopActive && card.loopTextActive]}>
              {isLoopActive ? 'LOOP_ACTIVE' : 'LOOP_OFFLINE'}
            </Text>
          </View>
        </View>

        {/* Compact params summary + expand chevron */}
        <View style={card.summaryRow}>
          <Text style={card.summaryText} numberOfLines={1}>{summary}</Text>
          <Text style={card.summaryChevron}>{isExpanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {/* ── Expanded body: param list ── */}
      {isExpanded && (
        <View>
          {PARAM_CONFIGS.map((config) => (
            <ParamRow
              key={String(config.key)}
              config={config}
              value={settings[config.key]}
              isOpen={openParam === config.key}
              onTap={() => handleParamTap(config.key)}
              onUpdate={(v) => onUpdate(settings.bot, config.key, v)}
            />
          ))}

          {/* Apply button */}
          <TouchableOpacity
            style={[card.saveBtn, isSaving && card.saveBtnDisabled]}
            onPress={() => onSave(settings.bot)}
            disabled={isSaving}
          >
            <Text style={card.saveText}>
              {isSaving ? 'PUSHING_HYPERPARAMETERS...' : 'APPLY_CHANGES'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const card = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#002200',
    backgroundColor: '#000800',
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#001500',
    borderBottomWidth: 1,
    borderBottomColor: '#002200',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#002200',
  },
  dotActive: {
    backgroundColor: '#00ff41',
  },
  botName: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 14,
    color: '#00ff41',
    letterSpacing: 3,
  },
  nodeLabel: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9,
    color: '#3a9e52',
    letterSpacing: 2,
  },
  loopPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#002200',
  },
  loopPillActive: {
    backgroundColor: '#00ff41',
  },
  loopText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 8,
    color: '#3a9e52',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  loopTextActive: {
    color: '#000000',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: '#000c00',
  },
  summaryText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: '#3a9e52',
    letterSpacing: 1,
    flex: 1,
  },
  summaryChevron: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 9,
    color: '#3a9e52',
    marginLeft: 10,
  },
  saveBtn: {
    borderTopWidth: 1,
    borderTopColor: '#002200',
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#000800',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: '#00ff41',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
})

// ── Main Admin Screen ─────────────────────────────────────────────
export default function AdminScreen() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const { loopDetails } = useSystemStatus()
  const [settings, setSettings] = useState<BotSettings[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState<string | null>(null)
  const [manualSecret, setManualSecret] = useState('')
  const [manualUrl, setManualUrl] = useState(API_URL)
  const [authRequired, setAuthRequired] = useState(false)
  const [secretInput, setSecretInput] = useState('')
  const [urlInput, setUrlInput] = useState(API_URL)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Gate: only admin. Also handle sign-out (user becomes null) → redirect home.
  useEffect(() => {
    if (authLoading) return
    if (!user || user.email !== ADMIN_EMAIL) {
      router.replace('/')
    }
  }, [user, authLoading])

  const fetchSettings = useCallback(async (secret?: string, baseUrl?: string) => {
    setIsLoading(true)
    const url = baseUrl || manualUrl || API_URL
    const adminSecret = secret || manualSecret

    try {
      const res = await fetch(`${url}/api/admin/settings`, {
        headers: { 'X-Admin-Secret': adminSecret },
        cache: 'no-store',
      } as any)

      if (res.status === 401) {
        setAuthRequired(true)
        setIsLoading(false)
        return
      }
      if (!res.ok) throw new Error('FETCH_FAILED')

      const data = await res.json()
      const dbEntries = Array.isArray(data) ? data : []
      const finalSettings = ['a', 'b'].map((botKey) => {
        const existing = dbEntries.find((s: any) => s.bot === botKey)
        if (existing) return { ...DEFAULTS, ...existing }
        return { bot: botKey, ...DEFAULTS }
      })
      setSettings(finalSettings)
      setAuthRequired(false)
      setErrorMsg(null)

      // Persist working secret + URL for next session
      if (adminSecret) {
        setManualSecret(adminSecret)
        await AsyncStorage.setItem('bv_admin_secret', adminSecret)
      }
      if (url !== API_URL) {
        await AsyncStorage.setItem('bv_admin_url', url)
      }
    } catch (err: any) {
      setAuthRequired(true)
      setErrorMsg(err.message || 'CONNECTION FAILED')
    } finally {
      setIsLoading(false)
    }
  }, [manualSecret, manualUrl])

  // Load stored secret + URL on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('bv_admin_secret'),
      AsyncStorage.getItem('bv_admin_url'),
    ]).then(([savedSecret, savedUrl]) => {
      const url = savedUrl || API_URL
      setManualUrl(url)
      setUrlInput(url)
      if (savedSecret) {
        setManualSecret(savedSecret)
        setSecretInput(savedSecret)
        fetchSettings(savedSecret, url)
      } else {
        fetchSettings(undefined, url)
      }
    })
  }, [])

  const handleUpdate = (bot: string, field: keyof BotSettings, value: any) => {
    setSettings((prev) => prev.map((s) => s.bot === bot ? { ...s, [field]: value } : s))
  }

  const handleSave = async (bot: string) => {
    const botSettings = settings.find((s) => s.bot === bot)
    if (!botSettings) return
    setIsSaving(bot)
    try {
      const cleanedSettings = {
        ...botSettings,
        banned_words: Array.from(new Set(botSettings.banned_words.filter((w) => w !== ''))),
      }
      const res = await fetch(`${manualUrl || API_URL}/api/admin/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': manualSecret,
        },
        body: JSON.stringify(cleanedSettings),
      })
      if (!res.ok) throw new Error('SAVE_FAILED')
      setSuccessMsg(`BOT_${bot.toUpperCase()}_PARAMETERS_PUSHED`)
      setTimeout(() => setSuccessMsg(null), 3000)
      fetchSettings()
    } catch (err: any) {
      Alert.alert('Sync Failed', err.message || 'SYNC_PROTOCOL_FAILURE')
    } finally {
      setIsSaving(null)
    }
  }

  const handleConnect = () => {
    setManualSecret(secretInput)
    setManualUrl(urlInput)
    fetchSettings(secretInput, urlInput)
  }

  if (!user) return null

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>BRAIN_VAT // CONTROL_PANEL</Text>
          <Text style={styles.subtitle}>ADMIN: {user.email}</Text>
        </View>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.exitBtn}>&lt; EXIT</Text>
        </TouchableOpacity>
      </View>

      {/* Success toast */}
      {successMsg && (
        <View style={styles.successToast}>
          <Text style={styles.successToastText}>{successMsg}</Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Auth required panel */}
        {authRequired && (
          <View style={styles.authCard}>
            <Text style={styles.authHeading}>Administrative_Handshake_Required</Text>
            <Text style={styles.authFieldLabel}>Inference Core URL</Text>
            <TextInput
              style={styles.authInput}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder={API_URL}
              placeholderTextColor={COLORS.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.authFieldLabel}>Admin Secret</Text>
            <TextInput
              style={styles.authInput}
              value={secretInput}
              onChangeText={setSecretInput}
              placeholder="ENTER_PASSPHRASE..."
              placeholderTextColor={COLORS.mutedForeground}
              secureTextEntry
            />
            {errorMsg && (
              <Text style={styles.authError}>{errorMsg}</Text>
            )}
            <TouchableOpacity
              style={styles.authBtn}
              onPress={handleConnect}
              disabled={isLoading}
            >
              {isLoading
                ? <ActivityIndicator color="#00ff41" />
                : <Text style={styles.authBtnText}>[ ESTABLISH_SECURE_LINK ]</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Settings cards */}
        {!authRequired && (
          <>
            {isLoading && settings.length === 0 ? (
              <View style={styles.center}>
                <ActivityIndicator color={COLORS.terminalGreen} />
                <Text style={styles.loadingText}>ACCESSING_ENCRYPTED_CORE...</Text>
              </View>
            ) : (
              settings.map((s) => (
                <BotCard
                  key={s.bot}
                  settings={s}
                  isLoopActive={!!loopDetails?.[s.bot as 'a' | 'b']}
                  isSaving={isSaving === s.bot}
                  onUpdate={handleUpdate}
                  onSave={handleSave}
                />
              ))
            )}
          </>
        )}

        <Text style={styles.footer}>
          brain.vat // hyperparameter_management_shell // v1.2.5 // mobile
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#002200',
  },
  title: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 14,
    color: '#00ff41',
    letterSpacing: 1,
    textShadowColor: '#00ff41',
    textShadowRadius: 4,
  },
  subtitle: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9,
    color: '#3a9e52',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  exitBtn: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: '#7f1d1d',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    paddingHorizontal: 10,
    paddingVertical: 6,
    letterSpacing: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: '#3a9e52',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  authCard: {
    borderWidth: 1,
    borderColor: '#00ff41',
    backgroundColor: '#001500',
    padding: 20,
    marginBottom: 24,
    gap: 12,
  },
  authHeading: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: '#99ffaa',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  authFieldLabel: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 9,
    color: '#3a9e52',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  authInput: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: '#00ff41',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#002200',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  authError: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: '#ef4444',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 1,
  },
  authBtn: {
    borderWidth: 1,
    borderColor: '#00ff41',
    paddingVertical: 14,
    alignItems: 'center',
  },
  authBtnText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: '#00ff41',
    letterSpacing: 3,
  },
  successToast: {
    backgroundColor: '#00f5ff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  successToastText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 11,
    color: '#000000',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  footer: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 9,
    color: '#002200',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 32,
    paddingBottom: 16,
  },
})
