import { ExpoDeviceProfile } from 'expo-device-profile';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Switch, Text, View } from 'react-native';
import { useMessages } from '../lib/i18n';
import { usePrefs } from '../lib/prefs';
import { useTheme } from '../lib/theme';
import { Button, useStyles } from './ui';

/** Below this battery level, without charging, the home screen suggests blackout mode. */
export const BLACKOUT_SUGGEST_PCT = 30;
const BATTERY_CHECK_MS = 120_000;

/** Battery level when it is low and not charging (checked while the screen is in front only). */
function useLowBattery(enabled: boolean): number | null {
  const [low, setLow] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLow(null);
        return undefined;
      }
      let alive = true;
      const check = (): void => {
        void ExpoDeviceProfile.getBattery()
          .then((b) => {
            if (!alive) return;
            setLow(!b.charging && b.levelPct !== null && b.levelPct < BLACKOUT_SUGGEST_PCT ? Math.round(b.levelPct) : null);
          })
          .catch(() => undefined);
      };
      check();
      const timer = setInterval(check, BATTERY_CHECK_MS);
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') check();
      });
      return () => {
        alive = false;
        clearInterval(timer);
        sub.remove();
      };
    }, [enabled]),
  );
  return low;
}

/** One tap from home: blackout on/off and the low-battery suggestion. */
export function BlackoutControls() {
  const t = useMessages();
  const styles = useStyles();
  const theme = useTheme();
  const blackout = usePrefs((s) => s.blackout);
  const setBlackout = usePrefs((s) => s.setBlackout);
  // In blackout mode there is nothing to suggest and no periodic work at all.
  const low = useLowBattery(!blackout);
  return (
    <View style={{ gap: 8 }}>
      {low !== null && (
        <View style={styles.warning} testID="blackout-suggestion" accessibilityRole="alert">
          <Text style={styles.warningText}>{t.blackout.suggestion(low)}</Text>
          <Button testID="blackout-suggestion-accept" label={t.blackout.turnOn} onPress={() => { setBlackout(true); }} />
        </View>
      )}
      <View style={[styles.row, { minHeight: 48 }]}>
        <Switch
          testID="blackout-toggle"
          accessibilityLabel={t.blackout.title}
          accessibilityHint={t.blackout.hint}
          value={blackout}
          onValueChange={setBlackout}
          trackColor={{ true: theme.accent, false: theme.border }}
        />
        <Text style={styles.title} testID={blackout ? 'blackout-on' : 'blackout-off'}>
          {blackout ? t.blackout.on : t.blackout.off}
        </Text>
      </View>
    </View>
  );
}

export function PowerTips() {
  const t = useMessages();
  const styles = useStyles();
  return (
    <View style={styles.card} testID="power-tips">
      <Text style={styles.title} accessibilityRole="header">
        {t.blackout.tipsTitle}
      </Text>
      {t.blackout.tips.map((tip) => (
        <Text key={tip} style={styles.text}>{`• ${tip}`}</Text>
      ))}
    </View>
  );
}
