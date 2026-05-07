/**
 * byob-service.ts — Bring Your Own Bot inference loop & API helpers
 *
 * ─── SUPABASE SCHEMA ──────────────────────────────────────────────────────────
 *
 * CREATE TABLE public.bots (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,  -- UNIQUE required for upsert
 *   name text NOT NULL,
 *   api_provider text NOT NULL CHECK (api_provider IN ('anthropic', 'openai')),
 *   model text NOT NULL,
 *   system_prompt text,
 *   temperature double precision DEFAULT 0.9,
 *   max_tokens integer DEFAULT 150,
 *   base_sleep integer DEFAULT 120,
 *   base_jitter integer DEFAULT 45,
 *   is_active boolean DEFAULT false,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * -- RLS: users can only read/write their own rows
 * ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "own bots" ON bots USING (auth.uid() = user_id);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NOTE: This service requires expo-secure-store.
 * Install with: npx expo install expo-secure-store
 */

import { supabase } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type APIProvider = 'anthropic' | 'openai' | 'huggingface'

export interface BYOBConfig {
  botName: string
  provider: APIProvider
  model: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  baseSleep: number   // seconds
  baseJitter: number  // seconds
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Thrown when a cycle should be silently skipped (not counted as a failure).
 * Examples: no user-role messages in history, empty feed.
 */
class SkipCycleError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'SkipCycleError'
  }
}

// ─── Anthropic message normalizer ─────────────────────────────────────────────

/**
 * Anthropic's Messages API requires strictly alternating user/assistant turns,
 * and the first turn must be `user`.
 *
 * This function:
 *   1. Collapses consecutive same-role messages by joining their content
 *   2. Drops any leading `assistant` messages
 *
 * Returns the cleaned array, or an empty array if no user-role messages remain
 * (the caller should skip the API call in that case).
 */
function prepareAnthropicMessages(messages: ConversationMessage[]): ConversationMessage[] {
  if (messages.length === 0) return []

  // 1. Collapse consecutive same-role messages
  const collapsed: ConversationMessage[] = []
  for (const msg of messages) {
    const last = collapsed[collapsed.length - 1]
    if (last && last.role === msg.role) {
      last.content += '\n' + msg.content
    } else {
      collapsed.push({ role: msg.role, content: msg.content })
    }
  }

  // 2. Drop leading assistant turns
  while (collapsed.length > 0 && collapsed[0].role === 'assistant') {
    collapsed.shift()
  }

  return collapsed
}

// ─── Provider API caller ──────────────────────────────────────────────────────

/**
 * Calls the configured LLM provider and returns the text response.
 * Throws on network / API error so the loop can handle it.
 */
export async function callProviderAPI(
  messages: ConversationMessage[],
  config: BYOBConfig,
  apiKey: string,
): Promise<string> {
  if (config.provider === 'anthropic') {
    const anthropicMessages = prepareAnthropicMessages(messages)
    if (anthropicMessages.length === 0) {
      throw new SkipCycleError('no user-role messages in history')
    }

    const body = {
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: config.systemPrompt,
      messages: anthropicMessages,
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic API ${res.status}: ${err}`)
    }

    const data = await res.json()
    const text: string = data?.content?.[0]?.text
    if (!text) throw new Error('Anthropic: empty response content')
    return text.trim()
  }

  // OpenAI — chat completions format
  if (messages.length === 0) {
    throw new SkipCycleError('empty message feed')
  }

  if (config.provider === 'openai') {
    const body = {
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: config.systemPrompt },
        ...messages,
      ],
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API ${res.status}: ${err}`)
    }

    const data = await res.json()
    const text: string = data?.choices?.[0]?.message?.content
    if (!text) throw new Error('OpenAI: empty response content')
    return text.trim()
  }

  // HuggingFace — two-stage fallback:
  //   1. Try OpenAI-compatible chat completions (works for featured models with chat templates)
  //   2. Fall back to basic text-generation API (works for custom/fine-tuned model repos)
  //   If neither works, the model is likely a HF Space and not accessible via the Inference API.

  const hfHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // ── Stage 1: chat completions ──────────────────────────────────────────────
  const chatRes = await fetch(
    `https://api-inference.huggingface.co/models/${config.model}/v1/chat/completions`,
    {
      method: 'POST',
      headers: hfHeaders,
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        messages: [
          { role: 'system', content: config.systemPrompt },
          ...messages,
        ],
      }),
    }
  )

  if (chatRes.ok) {
    const chatData = await chatRes.json()
    const text: string = chatData?.choices?.[0]?.message?.content
    if (!text) throw new Error('HuggingFace: empty chat response')
    return text.trim()
  }

  // 503 = model cold-starting — skip cleanly rather than counting as failure
  if (chatRes.status === 503) {
    throw new SkipCycleError('HuggingFace model loading (cold start)')
  }

  // ── Stage 2: basic text-generation ────────────────────────────────────────
  // Only attempt if chat completions returned 404 (not supported) or 400.
  // Any other status (401 auth, 429 rate-limit, 5xx) is a real error.
  if (chatRes.status !== 404 && chatRes.status !== 400) {
    const err = await chatRes.text()
    throw new Error(`HuggingFace API ${chatRes.status}: ${err}`)
  }

  const historyText = messages.map((m) => m.content).join('\n')
  const prompt = config.systemPrompt
    ? `${config.systemPrompt}\n\n${historyText}\n${config.botName}:`
    : `${historyText}\n${config.botName}:`

  const genRes = await fetch(
    `https://api-inference.huggingface.co/models/${config.model}`,
    {
      method: 'POST',
      headers: hfHeaders,
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: config.maxTokens,
          temperature: config.temperature,
          return_full_text: false,
        },
      }),
    }
  )

  if (!genRes.ok) {
    const err = await genRes.text()
    if (genRes.status === 503) throw new SkipCycleError('HuggingFace model loading (cold start)')
    if (genRes.status === 404) {
      throw new Error(
        `HuggingFace: model "${config.model}" is not accessible via the Inference API. ` +
        'It may be a private Space or not deployed to the Inference API.'
      )
    }
    throw new Error(`HuggingFace API ${genRes.status}: ${err}`)
  }

  const genData = await genRes.json()
  const text: string = Array.isArray(genData)
    ? genData[0]?.generated_text
    : genData?.generated_text
  if (!text) throw new Error('HuggingFace: empty text-generation response')
  return text.trim()
}

// ─── BYOB Loop ────────────────────────────────────────────────────────────────

/**
 * BYOBLoop runs the guest-bot inference cycle:
 *   1. Fetch last 20 messages from Supabase
 *   2. Format as provider conversation history
 *   3. Call provider API
 *   4. Post response to messages table
 *   5. Sleep (baseSleep + random jitter), then repeat
 *
 * The loop is entirely client-side; it stops when stop() is called or the
 * component unmounts. API keys are never stored in Supabase.
 */
export class BYOBLoop {
  private config: BYOBConfig
  private apiKey: string
  private running = false
  private consecutiveFailures = 0
  private readonly MAX_FAILURES_BEFORE_BACKOFF = 3

  /** Optional callback so the UI can react to loop events */
  onStatusChange?: (status: 'idle' | 'thinking' | 'posting' | 'sleeping' | 'error') => void
  onError?: (msg: string) => void
  onPost?: (text: string) => void

  constructor(config: BYOBConfig, apiKey: string) {
    this.config = config
    this.apiKey = apiKey
  }

  /** Update config on the fly (e.g. after user saves changes) */
  updateConfig(config: BYOBConfig) {
    this.config = config
  }

  isRunning() {
    return this.running
  }

  start() {
    if (this.running) return
    this.running = true
    this.consecutiveFailures = 0
    this._loop()
  }

  stop() {
    this.running = false
    this.onStatusChange?.('idle')
  }

  private async _loop() {
    while (this.running) {
      try {
        // 1. Fetch last 20 messages
        this.onStatusChange?.('thinking')
        const { data: rawMessages, error } = await supabase
          .from('messages')
          .select('speaker, text, role')
          .order('created_at', { ascending: false })
          .limit(20)

        if (error) throw new Error(`Supabase fetch: ${error.message}`)

        // Reverse so messages are ascending (oldest first → newest last)
        const messages = (rawMessages ?? []).reverse()

        // 2. Format conversation history for the provider
        const history: ConversationMessage[] = messages.map((m: { speaker: string; text: string; role: string }) => ({
          role: m.speaker === this.config.botName ? 'assistant' : 'user',
          content: `${m.speaker}: ${m.text}`,
        }))

        // 3. Call provider API
        const responseText = await callProviderAPI(history, this.config, this.apiKey)

        // 4. Post to messages table
        this.onStatusChange?.('posting')
        const { error: insertError } = await supabase.from('messages').insert({
          speaker: this.config.botName,
          text: responseText,
          role: 'bot',
        })

        if (insertError) throw new Error(`Supabase insert: ${insertError.message}`)

        this.onPost?.(responseText)
        this.consecutiveFailures = 0

      } catch (err) {
        if (err instanceof SkipCycleError) {
          // Not a real failure — just no content to respond to yet. Sleep normally.
          console.log(`[BYOBLoop] Skipping cycle: ${err.message}`)
        } else {
          this.consecutiveFailures++
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[BYOBLoop] Cycle error (failure #${this.consecutiveFailures}): ${msg}`)
          this.onError?.(msg)
          this.onStatusChange?.('error')
        }

        if (!this.running) break
      }

      if (!this.running) break

      // 5. Sleep: apply exponential backoff after repeated failures, capped at 16x
      const MAX_BACKOFF_MULTIPLIER = 16
      const backoffMultiplier = this.consecutiveFailures >= this.MAX_FAILURES_BEFORE_BACKOFF
        ? Math.min(
          MAX_BACKOFF_MULTIPLIER,
          Math.pow(2, this.consecutiveFailures - this.MAX_FAILURES_BEFORE_BACKOFF + 1),
        )
        : 1

      const sleepSeconds =
        (this.config.baseSleep + Math.random() * this.config.baseJitter) * backoffMultiplier

      this.onStatusChange?.('sleeping')
      await this._sleep(sleepSeconds * 1000)
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      const check = (remaining: number) => {
        if (!this.running) { resolve(); return }
        if (remaining <= 0) { resolve(); return }
        const tick = Math.min(remaining, 500)
        setTimeout(() => check(remaining - tick), tick)
      }
      check(ms)
    })
  }
}
