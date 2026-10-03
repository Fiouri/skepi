import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useContent } from '../lib/content';

export const colors = {
  bg: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  border: '#d1d5db',
  accent: '#1d4ed8',
  danger: '#b91c1c',
  dangerBg: '#fee2e2',
  chip: '#dbeafe',
};

export function Button({
  label,
  onPress,
  disabled = false,
  testID,
  tone = 'accent',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  tone?: 'accent' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, { backgroundColor: tone === 'danger' ? colors.danger : colors.accent }, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/** Renders children only once content has been opened; shows status otherwise. */
export function ContentGate({ children }: { children: ReactNode }) {
  const status = useContent((s) => s.status);
  const error = useContent((s) => s.error);
  const archives = useContent((s) => s.archives);
  if (status === 'loading' || status === 'idle') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Άνοιγμα περιεχομένου…</Text>
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.error} testID="content-error">
          Σφάλμα: {error}
        </Text>
      </View>
    );
  }
  if (archives.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted} testID="content-missing">
          Δεν βρέθηκε ZIM. Τρέξε scripts/provision.ps1.
        </Text>
      </View>
    );
  }
  return <>{children}</>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 12, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, minHeight: 48, justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  muted: { color: colors.muted, fontSize: 13 },
  text: { color: colors.text, fontSize: 15, lineHeight: 22 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 15 },
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, minHeight: 48 },
  chip: { backgroundColor: colors.chip, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, minHeight: 40, justifyContent: 'center' },
  chipText: { color: colors.accent, fontWeight: '700' },
  banner: { backgroundColor: colors.dangerBg, padding: 12, borderRadius: 8, gap: 4 },
  bannerText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: colors.text },
});
