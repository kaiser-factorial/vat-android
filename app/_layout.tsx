import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
  JetBrainsMono_400Regular_Italic,
} from '@expo-google-fonts/jetbrains-mono'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '@/lib/auth-context'
import { SystemStatusProvider } from '@/lib/system-status-context'
import { BYOBProvider } from '@/lib/byob-context'
import { COLORS } from '@/lib/constants'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'JetBrainsMono-Regular': JetBrainsMono_400Regular,
    'JetBrainsMono-Bold': JetBrainsMono_700Bold,
    'JetBrainsMono-Italic': JetBrainsMono_400Regular_Italic,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  // If fonts fail, still render the app (it will use system font fallbacks)
  if (!fontsLoaded && !fontError) return null

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <SafeAreaProvider>
        <AuthProvider>
          <BYOBProvider>
          <SystemStatusProvider>
            <StatusBar style="light" backgroundColor={COLORS.background} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: COLORS.background },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="admin" />
              <Stack.Screen name="about" />
              <Stack.Screen name="archive" />
              <Stack.Screen name="byob" />
            </Stack>
          </SystemStatusProvider>
          </BYOBProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
