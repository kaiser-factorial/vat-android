export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://brick-factorial-brain-vat-inference.hf.space'
export const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL ?? 'kaiser.factorial@gmail.com'

// Brand colors — mirrors globals.css
export const COLORS = {
  background: '#141414',
  card: '#1a1a1a',
  border: '#2a2a2a',
  input: '#1e1e1e',
  foreground: '#b8b0a0',
  mutedForeground: '#555555',
  primary: '#E63946',       // blood red
  mauk: '#03A6A1',          // cyan
  abaci: '#FF9D23',         // warm orange
  user: '#E63946',
  terminalGreen: '#3a9e52',
  white: '#ffffff',
  black: '#000000',
  red: '#E63946',
  amber: '#f59e0b',
}
