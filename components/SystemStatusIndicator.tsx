import React, { useEffect, useRef } from 'react'
import { Animated, View, Text, StyleSheet } from 'react-native'
import { useSystemStatus } from '@/lib/system-status-context'
import { COLORS } from '@/lib/constants'

export function SystemStatusIndicator() {
  const { isOnline, isLoopActive } = useSystemStatus()
  const pulseAnim = useRef(new Animated.Value(1)).current

  const dotColor = !isOnline ? COLORS.primary : !isLoopActive ? COLORS.amber : COLORS.terminalGreen
  const label = !isOnline ? 'SYSTEM: OFFLINE' : !isLoopActive ? 'SYSTEM: IDLE' : 'SYSTEM: ONLINE'
  const textColor = !isOnline ? '#7f1d1d' : !isLoopActive ? '#78350f' : COLORS.terminalGreen

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [isOnline, isLoopActive])

  return (
    <View style={styles.row}>
      <Animated.View
        style={[styles.dot, { backgroundColor: dotColor, opacity: pulseAnim }]}
      />
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
})
