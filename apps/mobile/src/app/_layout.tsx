import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { llama, useContent } from '../lib/content';

export default function RootLayout() {
  const bootstrap = useContent((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Free the model as soon as the app leaves the foreground (architecture: unload on background).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void llama.unload();
    });
    return () => {
      sub.remove();
    };
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="article" options={{ title: 'Άρθρο' }} />
      </Stack>
    </>
  );
}
