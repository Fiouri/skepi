import { PREVIEW_BUILD } from '@skepi/emergency-cards';
import { Text, View } from 'react-native';
import { useMessages } from '../lib/i18n';
import { useStyles } from './ui';

/**
 * Developer Preview builds (SKEPI_PREVIEW=1, which bundles the preview cards): a permanent
 * "Developer preview — not for emergency use" label on the home and About screens.
 */
export function PreviewLabel() {
  const t = useMessages();
  const styles = useStyles();
  if (!PREVIEW_BUILD) return null;
  return (
    <View style={styles.warning} testID="preview-label" accessibilityRole="alert">
      <Text style={styles.warningText}>{t.preview.label}</Text>
    </View>
  );
}
