export type Speaker = 'MAUK' | 'ABACI' | string
export type Role = 'bot' | 'user'
export type Bot = 'a' | 'b' | 'c'
export type Space = 'bot_a' | 'bot_b' | 'shared'

export interface Message {
  id: string
  speaker: Speaker
  text: string
  thoughts?: string | null
  role: Role
  user_id: string | null
  created_at: string
  /**
   * Generation params snapshotted at message time.
   * Shape mirrors BotSettings (without bot/updated_at).
   * Populated by server when params are stored per-message;
   * undefined for older messages or when not yet implemented server-side.
   */
  params?: Partial<BotSettings>
}

export interface MemoryConcept {
  id: string
  bot: Bot
  concept: string
  weight: number
  updated_at: string
}

export interface WorkspaceFile {
  id: string
  space: Space
  name: string
  content: string
  updated_at: string
}

export interface Profile {
  id: string
  display_name: string
  created_at: string
}

export interface BotSettings {
  bot: string
  temperature: number
  top_p: number
  repetition_penalty: number
  max_new_tokens: number
  banned_words: string[]
  model_version: string
  base_sleep: number
  base_jitter: number
  top_k: number
  memory_weight: number
  updated_at?: string
}

export interface ParsedMessage {
  speaker: string
  text: string
  continuation?: string
}

export interface UserBot {
  id: string
  user_id: string
  name: string
  api_provider: 'anthropic' | 'openai' | 'huggingface'
  model: string
  system_prompt?: string
  temperature: number
  max_tokens: number
  base_sleep: number
  base_jitter: number
  is_active: boolean
  created_at: string
}
