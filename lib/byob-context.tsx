/**
 * byob-context.tsx — Global BYOB loop state
 *
 * Holds the BYOBLoop instance above the navigation stack so the loop
 * keeps running when the user navigates away from the BYOB config screen.
 * The BYOB screen reads/writes this context; the Header uses it for the
 * active indicator.
 */

import React, { createContext, useContext, useRef, useState } from 'react'
import { BYOBLoop, type BYOBConfig } from './byob-service'

interface BYOBContextType {
  isActive: boolean
  loopStatus: string
  botName: string
  lastError: string | null
  startLoop: (config: BYOBConfig, apiKey: string) => void
  stopLoop: () => void
}

const BYOBContext = createContext<BYOBContextType | undefined>(undefined)

export function BYOBProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive]     = useState(false)
  const [loopStatus, setLoopStatus] = useState('')
  const [botName, setBotName]       = useState('')
  const [lastError, setLastError]   = useState<string | null>(null)
  const loopRef = useRef<BYOBLoop | null>(null)

  const startLoop = (config: BYOBConfig, apiKey: string) => {
    if (loopRef.current?.isRunning()) return
    const loop = new BYOBLoop(config, apiKey)
    loop.onStatusChange = (s) => setLoopStatus(s.toUpperCase())
    loop.onError        = (msg) => setLastError(msg)
    loopRef.current     = loop
    loop.start()
    setBotName(config.botName)
    setIsActive(true)
    setLastError(null)
  }

  const stopLoop = () => {
    loopRef.current?.stop()
    loopRef.current = null
    setIsActive(false)
    setLoopStatus('')
    setBotName('')
  }

  return (
    <BYOBContext.Provider value={{ isActive, loopStatus, botName, lastError, startLoop, stopLoop }}>
      {children}
    </BYOBContext.Provider>
  )
}

export function useBYOB() {
  const context = useContext(BYOBContext)
  if (!context) throw new Error('useBYOB must be used within BYOBProvider')
  return context
}
