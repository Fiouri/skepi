import { SOS_TIMELINE } from '@skepi/core';
import { ExpoEmergencyTools } from 'expo-emergency-tools';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useMessages } from '../lib/i18n';

const KEEP_AWAKE_TAG = 'skepi-sos-screen';

/**
 * Screen SOS: the whole screen blinks the Morse SOS timeline in white or red at full brightness.
 * Red keeps night vision. Tap anywhere to stop; brightness returns to the system setting.
 */
export default function SosScreen() {
  const { color } = useLocalSearchParams<{ color?: string }>();
  const router = useRouter();
  const t = useMessages();
  const lit = color === 'red' ? '#ff0000' : '#ffffff';
  const [on, setOn] = useState(true);

  useEffect(() => {
    let index = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = (): void => {
      setOn(index % 2 === 0);
      const delay = SOS_TIMELINE[index] ?? 250;
      index = (index + 1) % SOS_TIMELINE.length;
      timer = setTimeout(step, delay);
    };
    step();
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    ExpoEmergencyTools.setScreenBrightness(1);
    return () => {
      if (timer) clearTimeout(timer);
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
      ExpoEmergencyTools.setScreenBrightness(null);
    };
  }, []);

  return (
    <Pressable
      testID="sos-screen"
      accessibilityRole="button"
      accessibilityLabel={t.tools.screenExit}
      style={{ flex: 1, backgroundColor: on ? lit : '#000000', alignItems: 'center', justifyContent: 'flex-end', padding: 24 }}
      onPress={() => {
        router.back();
      }}
    >
      <StatusBar hidden />
      <Text style={{ color: on ? '#000000' : '#a3a3a3', fontSize: 16 }}>{t.tools.screenExit}</Text>
    </Pressable>
  );
}
