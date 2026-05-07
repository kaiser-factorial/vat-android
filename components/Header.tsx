import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth-context'
import { useBYOB } from '@/lib/byob-context'
import { SystemStatusIndicator } from './SystemStatusIndicator'
import { COLORS, ADMIN_EMAIL } from '@/lib/constants'

interface HeaderProps {
  onAuthClick: () => void
  onMemoryPress: () => void
}

export function Header({ onAuthClick, onMemoryPress }: HeaderProps) {
  const router = useRouter()
  const { user, displayName, isLoading, signOut } = useAuth()
  const { isActive: byobActive, botName: byobBotName } = useBYOB()

  const isAdmin = user?.email === ADMIN_EMAIL

  const resolvedName =
    displayName?.toUpperCase() === 'CORINA' ? 'BRICK.FACTORIAL' : displayName?.toUpperCase() ?? 'ANON'

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top row: title + auth */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.push('/')}>
            <Text style={styles.title}>brain.vat</Text>
          </TouchableOpacity>

          <View style={styles.authArea}>
            {!isLoading && (
              <>
                {user ? (
                  <View style={styles.row}>
                    <Text style={styles.userName}>{resolvedName}</Text>
                    <TouchableOpacity onPress={signOut}>
                      <Text style={styles.link}>[exit]</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={onAuthClick}>
                    <Text style={styles.link}>[authenticate]</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {/* Nav row */}
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => router.push('/about')}>
            <Text style={styles.navLink}>[about]</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/archive')}>
            <Text style={styles.navLink}>[archive]</Text>
          </TouchableOpacity>
          {isAdmin && (
            <>
              <TouchableOpacity onPress={() => router.push('/admin')}>
                <Text style={[styles.navLink, { color: COLORS.terminalGreen }]}>[control]</Text>
              </TouchableOpacity>
            </>
          )}
          {user && (
            <TouchableOpacity onPress={onMemoryPress}>
              <Text style={styles.navLink}>[memory]</Text>
            </TouchableOpacity>
          )}
          {user && (
            <TouchableOpacity onPress={() => router.push('/byob')} style={styles.byobNav}>
              {byobActive && <View style={styles.byobDot} />}
              <Text style={[styles.navLink, byobActive && { color: COLORS.terminalGreen }]}>
                {byobActive ? `[${byobBotName}]` : '[byob]'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status */}
        <View style={styles.statusRow}>
          <SystemStatusIndicator />
        </View>

        <Text style={styles.subtitle}>a conversation between MAUK and ABACI</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  container: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 22,
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  authArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userName: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: COLORS.terminalGreen,
  },
  link: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: COLORS.primary,
  },
  navRow: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  byobNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  byobDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.terminalGreen,
  },
  navLink: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: COLORS.mutedForeground,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitle: {
    fontFamily: 'JetBrainsMono-Italic',
    fontSize: 10,
    color: COLORS.mutedForeground,
    textAlign: 'center',
  },
})
