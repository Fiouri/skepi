import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { llama, useContent } from '../lib/content';
import { useMessages } from '../lib/i18n';
import { usePrefs } from '../lib/prefs';
import { useTheme } from '../lib/theme';

export default function RootLayout() {
  const bootstrap = useContent((s) => s.bootstrap);
  const loadPrefs = usePrefs((s) => s.load);
  const prefsLoaded = usePrefs((s) => s.loaded);
  const onboarded = usePrefs((s) => s.onboardingCompletedAt !== null);
  const blackout = usePrefs((s) => s.blackout);
  const theme = useTheme();
  const t = useMessages();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    void loadPrefs();
    void bootstrap();
  }, [bootstrap, loadPrefs]);

  // First start (or "Get prepared" again): onboarding before anything else.
  const inOnboarding = segments[0] === 'onboarding';
  useEffect(() => {
    if (prefsLoaded && !onboarded && !inOnboarding) router.replace('/onboarding');
  }, [prefsLoaded, onboarded, inOnboarding, router]);

  // Blackout mode: no model in memory (AI runs only on request).
  useEffect(() => {
    if (blackout) void llama.unload();
  }, [blackout]);

  // Free the model as soon as the app leaves the foreground (architecture: unload on background).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void llama.unload();
    });
    return () => {
      sub.remove();
    };
  }, []);

  if (!prefsLoaded) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  const header = {
    headerStyle: { backgroundColor: theme.bg },
    headerTintColor: theme.text,
    contentStyle: { backgroundColor: theme.bg },
    animation: theme.animations ? ('default' as const) : ('none' as const),
  };

  return (
    <>
      <StatusBar style={theme.statusBar} />
      <Stack screenOptions={header}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: t.onboarding.title, headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="article" options={{ title: t.article.title }} />
        <Stack.Screen name="emergency" options={{ title: t.emergency.title }} />
        <Stack.Screen name="card/[id]" options={{ title: t.emergency.cards }} />
        <Stack.Screen name="sos-screen" options={{ headerShown: false }} />
        <Stack.Screen name="share" options={{ title: t.transfer.shareTitle }} />
        <Stack.Screen name="receive" options={{ title: t.transfer.receiveTitle }} />
        <Stack.Screen name="about" options={{ title: t.about.title }} />
      </Stack>
    </>
  );
}
