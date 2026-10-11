import { ScrollView, Text, View } from 'react-native';
import { useMessages } from '../lib/i18n';
import type { StartupError as StartupErrorInfo } from '../lib/prefs';
import { useTheme } from '../lib/theme';
import { Button, useStyles } from './ui';

/**
 * Shown instead of any screen when app.db cannot be opened (e.g. the secure storage refuses the key):
 * the reason, the error code and Retry. Never a blank screen, never a fallback to an unencrypted key or
 * database. The emergency numbers stay one tap away in the system dialler; nothing here needs app.db.
 */
export function StartupError({ error, onRetry }: { error: StartupErrorInfo; onRetry: () => void }) {
  const t = useMessages();
  const styles = useStyles();
  const theme = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 24, paddingTop: 96, gap: 16 }} testID="startup-error">
      <View style={styles.banner} accessibilityRole="alert">
        <Text style={styles.bannerText} testID="startup-error-title">
          {error.kind === 'secure-storage' ? t.startup.secureStorageTitle : t.common.error(error.code)}
        </Text>
        {error.kind === 'secure-storage' ? <Text style={styles.bannerBody}>{t.startup.secureStorageBody}</Text> : null}
      </View>
      <Text style={styles.text} selectable testID="startup-error-code">
        {t.startup.code(error.code)}
      </Text>
      <Text style={styles.muted} selectable testID="startup-error-message">
        {error.message}
      </Text>
      <Button testID="startup-retry" label={t.startup.retry} onPress={onRetry} />
    </ScrollView>
  );
}
