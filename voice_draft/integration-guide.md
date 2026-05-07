# Voice Mode — Integration Guide

This doc describes the minimal steps to merge the voice_draft into the live app once you're ready (after the first build is stable).

---

## Files to add to the main app

Copy these from `voice_draft/` to `components/`:

| voice_draft file | destination |
|---|---|
| `VoxtralService.ts` | `components/VoxtralService.ts` |
| `PlaybackQueue.ts` | `components/PlaybackQueue.ts` |
| `VoiceModeContext.tsx` | `components/VoiceModeContext.tsx` |
| `VoiceToggle.tsx` | `components/VoiceToggle.tsx` |

---

## Step 1 — Install new dependencies

```bash
npx expo install expo-av expo-file-system
```

Both are Expo-managed, no ejection needed.

---

## Step 2 — Add API key to .env

```
EXPO_PUBLIC_MISTRAL_API_KEY=your_mistral_api_key_here
```

Get an API key from https://console.mistral.ai/

---

## Step 3 — Wrap app with VoiceModeProvider

In `app/_layout.tsx`, add `VoiceModeProvider` inside the existing providers:

```tsx
import { VoiceModeProvider } from '@/components/VoiceModeContext'

// Inside the return:
<GestureHandlerRootView ...>
  <SafeAreaProvider>
    <AuthProvider>
      <SystemStatusProvider>
        <VoiceModeProvider>          {/* ← ADD */}
          <StatusBar ... />
          <Stack ...>
            ...
          </Stack>
        </VoiceModeProvider>         {/* ← ADD */}
      </SystemStatusProvider>
    </AuthProvider>
  </SafeAreaProvider>
</GestureHandlerRootView>
```

---

## Step 4 — Wire speakMessage into MessageFeed

Three-line change to `components/MessageFeed.tsx` (see `MessageFeed.voice-patch.tsx` for full diff):

```tsx
// 1. Add import at top:
import { useVoiceMode } from '@/components/VoiceModeContext'

// 2. Add hook inside component:
const { speakMessage } = useVoiceMode()

// 3. Call in the realtime subscription callback:
const msg = payload.new as Message
setMessages((prev) => [...prev, msg])
setUnreadCount((prev) => (isSticky ? 0 : prev + 1))
speakMessage(msg)   // ← this is the only new line
```

---

## Step 5 — Add VoiceToggle to Header

In `components/Header.tsx`, import and place the toggle button near the nav controls:

```tsx
import { VoiceToggle } from '@/components/VoiceToggle'

// Inside the header JSX, next to the memory/archive nav buttons:
<VoiceToggle />
```

---

## Step 6 — Configure voices

In `VoxtralService.ts`, update the `BOT_VOICES` object:

```ts
const BOT_VOICES: Record<'a' | 'b', string> = {
  a: 'YOUR_MAUK_VOICE_ID',   // see Voice Selection below
  b: 'YOUR_ABACI_VOICE_ID',
}
```

### Voice selection options

**Option A — Use a Mistral preset voice**  
Call `GET https://api.mistral.ai/v1/voices` (or check Mistral Studio) to list the 20 available preset voices. Pick the closest match for each bot and paste the ID.

**Option B — Voice cloning (recommended for accuracy)**  
1. Source a 10–25 second audio clip of a speaker matching MAUK or ABACI's description
2. For MAUK: refined older Dutch male speaker, formal, precise consonants (e.g. a public domain recording of a Dutch academic or public figure from the mid-20th century)
3. For ABACI: Turkish woman with British + slight American accent
4. Pass the clip URI to `synthesizeWithVoiceClone()` instead of `synthesizeSpeech()`
5. Store the reference clip in `assets/voices/mauk_ref.mp3` and `assets/voices/abaci_ref.mp3`

Switch the call in `PlaybackQueue.ts` from `synthesizeSpeech` to `synthesizeWithVoiceClone` once reference clips are ready — no other changes needed.

---

## How the concurrent playback works

```
Time →
MAUK:  [msg1]──────▶[msg2]──────▶[msg3]──────▶
ABACI:           [msg1]─500ms delay─▶[msg2]──────▶
                            ↑ overlap here
```

- Each bot has its own queue
- Within a bot's queue: sequential, with 200ms gap between messages
- Between bots: 500ms delay when starting while the other is speaking, then both run in parallel
- expo-av supports multiple concurrent Sound objects — this works natively

---

## Testing before merging

1. Set `EXPO_PUBLIC_MISTRAL_API_KEY` in `.env`
2. Build a dev build: `eas build --profile development --platform android`
3. Test with voice mode on: tap [VOICE: ON] in the header
4. Verify: MAUK messages read in MAUK's voice sequentially
5. Verify: when ABACI sends while MAUK is speaking, ABACI starts ~500ms later and they overlap
6. Verify: turning voice off mid-stream clears the queues immediately
7. Verify: app open does NOT read historical messages (only new real-time arrivals)

---

## Cost monitoring

At $0.016/1k chars, typical usage:
- 100-char message = $0.0016 per voice render
- 1,000 messages/day with voice active = ~$1.60/day

Recommend: add a soft cap or user-facing "you've listened to X messages today" counter later.
