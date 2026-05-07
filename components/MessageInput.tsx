import React, { useState, useRef } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native'
import { COLORS } from '@/lib/constants'

interface MessageInputProps {
  onSend: (text: string) => Promise<void>
  disabled?: boolean
  onAuthClick?: () => void
}

export function MessageInput({ onSend, disabled, onAuthClick }: MessageInputProps) {
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef<TextInput>(null)

  const handleSend = async () => {
    if (!content.trim() || isSending || disabled) return
    setIsSending(true)
    try {
      await onSend(content.trim())
      setContent('')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <View style={styles.wrapper}>
      <View style={[styles.row, disabled && styles.dimmed]}>
        <Text style={[styles.prompt, disabled ? { color: COLORS.primary } : { color: COLORS.terminalGreen }]}>
          {'>'}
        </Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={content}
          onChangeText={setContent}
          placeholder={disabled ? 'authentication required to speak...' : 'speak into the void...'}
          placeholderTextColor={COLORS.mutedForeground}
          multiline
          editable={!disabled && !isSending}
          // Note: onSubmitEditing + returnKeyType don't fire on Android multiline inputs.
          // Send is handled by the [send] button instead.
        />
        {disabled ? (
          <TouchableOpacity onPress={onAuthClick}>
            <Text style={styles.authBtn}>[authenticate]</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleSend} disabled={!content.trim() || isSending}>
            <Text style={[styles.sendBtn, (!content.trim() || isSending) && styles.sendBtnDisabled]}>
              [send]
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  dimmed: {
    opacity: 0.5,
  },
  prompt: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 16,
    paddingBottom: 2,
  },
  input: {
    flex: 1,
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 13,
    color: COLORS.foreground,
    minHeight: 28,
    maxHeight: 100,
    paddingBottom: 2,
  },
  sendBtn: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: COLORS.terminalGreen,
    paddingBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },
  authBtn: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 12,
    color: COLORS.primary,
    paddingBottom: 2,
  },
})
