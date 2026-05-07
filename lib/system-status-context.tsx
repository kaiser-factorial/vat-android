import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { API_URL } from './constants'
import { supabase } from './supabase'

interface LoopDetails {
  a?: boolean
  b?: boolean
}

interface SystemStatusContextType {
  isOnline: boolean
  isLoopActive: boolean
  loopDetails: LoopDetails | null
  refreshStatus: () => void
}

const SystemStatusContext = createContext<SystemStatusContextType | undefined>(undefined)

// How recent a bot message must be to count as "loop is active" (milliseconds)
const ACTIVITY_WINDOW_MS = 8 * 60 * 1000 // 8 minutes

export function SystemStatusProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(false)
  const [isLoopActive, setIsLoopActive] = useState(false)
  const [loopDetails, setLoopDetails] = useState<LoopDetails | null>(null)

  /**
   * Supabase fallback: if the HuggingFace Space is sleeping / unreachable,
   * or if the API reports the loop as inactive, check whether a bot message
   * has been posted within the last ACTIVITY_WINDOW_MS ms. If yes, treat the
   * loop as running (it just ran recently enough to be considered active).
   */
  const checkRecentBotActivity = useCallback(async () => {
    try {
      const since = new Date(Date.now() - ACTIVITY_WINDOW_MS).toISOString()
      const { data } = await supabase
        .from('messages')
        .select('id')
        .eq('role', 'bot')
        .gte('created_at', since)
        .limit(1)
      if (data && data.length > 0) {
        setIsLoopActive(true)
      }
    } catch {
      // silent — this is best-effort only
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/status`, { cache: 'no-store' })
      if (!res.ok) {
        setIsOnline(false)
        setIsLoopActive(false)
        // HF Space may be sleeping; fall back to recent message activity
        await checkRecentBotActivity()
        return
      }

      const data = await res.json()
      setIsOnline(true)

      // FIX: the server returns loop_details: { a: bool, b: bool }
      // NOT loop_a_active / loop_b_active (those keys don't exist on the response).
      const loopA = !!data?.loop_details?.a
      const loopB = !!data?.loop_details?.b
      setLoopDetails({ a: loopA, b: loopB })

      // Combine the top-level convenience flag with the per-bot values
      const apiSaysActive = !!(data?.loop_active || loopA || loopB)
      setIsLoopActive(apiSaysActive)

      // If the API says inactive, double-check via recent Supabase messages.
      // The HF Space sometimes reports stale loop state after a cold restart.
      if (!apiSaysActive) {
        await checkRecentBotActivity()
      }
    } catch {
      // API unreachable (Space asleep, network error, etc.)
      setIsOnline(false)
      setIsLoopActive(false)
      await checkRecentBotActivity()
    }
  }, [checkRecentBotActivity])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 30_000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  return (
    <SystemStatusContext.Provider value={{ isOnline, isLoopActive, loopDetails, refreshStatus }}>
      {children}
    </SystemStatusContext.Provider>
  )
}

export function useSystemStatus() {
  const context = useContext(SystemStatusContext)
  if (!context) throw new Error('useSystemStatus must be used within SystemStatusProvider')
  return context
}
