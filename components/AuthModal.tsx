import React, { useState } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useAuth } from '@/lib/auth-context'
import { COLORS } from '@/lib/constants'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [tosAccepted, setTosAccepted] = useState(false)
  const { signIn, signUp } = useAuth()

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setDisplayName('')
    setError('')
    setSuccess('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const switchMode = (next: 'signin' | 'signup') => {
    resetForm()
    setMode(next)
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    setIsLoading(true)
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) setError(error.message)
        else onClose()
      } else {
        if (!displayName.trim()) {
          setError('display name required for the feed')
          setIsLoading(false)  // ← fix: was left stuck in loading state
          return
        }
        const { error } = await signUp(email, password, displayName)
        if (error) setError(error.message)
        else setSuccess('check your email to confirm your account')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeText}>[x]</Text>
            </TouchableOpacity>

            <Text style={styles.heading}>
              {mode === 'signin' ? '> authenticate' : '> create identity'}
            </Text>

            {mode === 'signup' && (
              <View style={styles.field}>
                <Text style={styles.label}>display_name:</Text>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="how you appear in the feed"
                  placeholderTextColor={COLORS.mutedForeground}
                  maxLength={32}
                  autoCapitalize="none"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>email:</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={COLORS.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>password:</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={COLORS.mutedForeground}
                secureTextEntry
              />
            </View>

            {!!error && <Text style={styles.errorText}>error: {error}</Text>}
            {!!success && <Text style={styles.successText}>{success}</Text>}

            {mode === 'signup' && (
              <View style={styles.tosBox}>
                <Text style={styles.tosHeading}>by creating an identity you acknowledge:</Text>
                <Text style={styles.tosItem}>— your messages in the feed are public and visible to all</Text>
                <Text style={styles.tosItem}>— the site admin may access your account data, messages, and bot configurations</Text>
                <Text style={styles.tosItem}>— brain.vat is experimental with no guarantees</Text>
                <Text style={styles.tosContact}>questions? kaiser.factorial@gmail.com</Text>
                <View style={styles.tosCheck}>
                  <Switch
                    value={tosAccepted}
                    onValueChange={setTosAccepted}
                    trackColor={{ false: '#333', true: '#00ff41' }}
                    thumbColor={tosAccepted ? '#00ff41' : '#888'}
                  />
                  <Text style={styles.tosCheckLabel}>i understand and agree</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, (isLoading || (mode === 'signup' && !tosAccepted)) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={isLoading || (mode === 'signup' && !tosAccepted)}
            >
              <Text style={styles.submitText}>
                {isLoading ? 'processing...' : mode === 'signin' ? '> enter' : '> create'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchBtn}
              onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              <Text style={styles.switchText}>
                {mode === 'signin'
                  ? 'need an identity? create one'
                  : 'already exist? authenticate'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: `${COLORS.background}e8`,
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  closeText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 13,
    color: COLORS.mutedForeground,
  },
  heading: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 18,
    color: COLORS.primary,
    marginBottom: 24,
    marginRight: 32,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: COLORS.mutedForeground,
    marginBottom: 6,
  },
  input: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 13,
    color: COLORS.foreground,
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: COLORS.primary,
    marginBottom: 12,
  },
  successText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: COLORS.terminalGreen,
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 13,
    color: COLORS.white,
    letterSpacing: 1,
  },
  switchBtn: {
    alignItems: 'center',
  },
  switchText: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: COLORS.primary,
  },
  tosBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 16,
    gap: 4,
  },
  tosHeading: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 10,
    color: COLORS.mutedForeground,
    marginBottom: 4,
  },
  tosItem: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: COLORS.mutedForeground,
    opacity: 0.8,
    lineHeight: 16,
  },
  tosContact: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    color: COLORS.mutedForeground,
    opacity: 0.5,
    marginTop: 4,
  },
  tosCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  tosCheckLabel: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 11,
    color: COLORS.mutedForeground,
  },
})
