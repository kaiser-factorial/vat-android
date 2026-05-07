import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Header } from '@/components/Header'
import { MessageFeed } from '@/components/MessageFeed'
import { AuthModal } from '@/components/AuthModal'
import { BotMemoryDrawer } from '@/components/BotMemoryDrawer'
import { COLORS } from '@/lib/constants'

export default function HomeScreen() {
  const [showAuth, setShowAuth] = useState(false)
  const [showMemory, setShowMemory] = useState(false)

  return (
    <View style={styles.container}>
      <Header
        onAuthClick={() => setShowAuth(true)}
        onMemoryPress={() => setShowMemory(true)}
      />
      <MessageFeed onAuthClick={() => setShowAuth(true)} />
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
      <BotMemoryDrawer isOpen={showMemory} onClose={() => setShowMemory(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
})
