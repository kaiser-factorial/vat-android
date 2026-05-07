/**
 * VoiceToggle.tsx
 * ─────────────────────────────────────────────────────────────────
 * A small toggle button that lives in the app Header.
 * Shows current voice mode state and toggles it on press.
 *
 * Visual design:
 *  - Matches the terminal aesthetic of the rest of the app
 *  - Active: [♦ VOICE: ON] in terminalGreen
 *  - Inactive: [♦ VOICE: OFF] in mutedForeground
 *  - Animated dot pulses when active (like SystemStatusIndicator)
 *
 * Integration:
 *  Add <VoiceToggle /> inside Header.tsx, next to the other nav controls.
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef } from 'react'
import { Animated, TouchableOpacity, Text, View, StyleSheet } from 'react-native'
import { useVoiceMode } from './VoiceModeContext'
import { COLORS } from '@/lib/constants'

export function VoiceToggle() {
  const { isVoiceActive, toggleVoice } = useVoiceMode()
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!isVoiceActive) {
      pulseAnim.setValue(1)
      return
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [isVoiceActive])

  return (
    <TouchableOpacity
      style={[styles.btn, isVoiceActive && styles.btnActive]}
      onPress={toggleVoice}
      activeOpacity={0.7}
    >
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: isVoiceActive ? COLORS.terminalGreen : COLORS.border },
          isVoiceActive && { opacity: pulseAnim },
        ]}
      />
      <Text style={[styles.label, isVoiceActive && styles.labelActive]}>
        {isVoiceActive ? 'VOICE: ON' : 'VOICE: OFF'}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnActive: {
    borderColor: `${COLORS.terminalGreen}60`,
    backgroundColor: `${COLORS.terminalGreen}0a`,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  label: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 8,
    color: COLORS.mutedForeground,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  labelActive: {
    color: COLORS.terminalGreen,
  },
})
