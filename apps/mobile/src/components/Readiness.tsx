import { detectMobileTier } from '@skepi/core';
import { draftCards } from '@skepi/emergency-cards';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useContent } from '../lib/content';
import { useMessages } from '../lib/i18n';
import { useStyles } from './ui';

export interface ReadinessState {
  cards: boolean;
  cardsDraft: boolean;
  map: boolean;
  encyclopedia: boolean;
  /** null: this device runs no AI (T0). */
  ai: boolean | null;
}

/** What the installed packs cover: cards are bundled; map, encyclopedia and AI come from packs. */
export function useReadiness(): ReadinessState {
  const pmtilesPath = useContent((s) => s.pmtilesPath);
  const archives = useContent((s) => s.archives);
  const models = useContent((s) => s.models);
  const totalRamMb = useContent((s) => s.totalRamMb);
  const tier = totalRamMb > 0 ? detectMobileTier(totalRamMb) : 'T0';
  return {
    cards: true,
    cardsDraft: draftCards().length > 0,
    map: pmtilesPath !== null,
    encyclopedia: archives.some((a) => a.verified),
    ai: tier === 'T0' ? null : models.length > 0,
  };
}

/** "You are ready" indicator on the home screen. */
export function Readiness() {
  const t = useMessages();
  const styles = useStyles();
  const router = useRouter();
  const r = useReadiness();
  const ready = r.cards && r.map && r.encyclopedia && r.ai !== false;
  const items: { id: string; label: string; ok: boolean }[] = [
    { id: 'cards', label: r.cardsDraft ? t.readiness.cardsDraft : t.readiness.cards, ok: r.cards },
    { id: 'map', label: t.readiness.map, ok: r.map },
    { id: 'encyclopedia', label: t.readiness.encyclopedia, ok: r.encyclopedia },
    { id: 'ai', label: r.ai === null ? t.readiness.aiUnsupported : t.readiness.ai, ok: r.ai !== false },
  ];
  return (
    <View style={styles.card} testID="readiness">
      <Text style={ready ? styles.ok : styles.title} accessibilityRole="header" testID={ready ? 'readiness-ready' : 'readiness-not-ready'}>
        {ready ? t.readiness.ready : t.readiness.notReady}
      </Text>
      {items.map((i) => (
        <Text
          key={i.id}
          style={i.ok ? styles.text : styles.error}
          testID={`readiness-${i.id}-${i.ok ? 'yes' : 'no'}`}
          accessibilityLabel={`${i.label}: ${i.ok ? t.readiness.yes : t.readiness.no}`}
        >
          {`${i.ok ? '✓' : '✗'} ${i.label}`}
        </Text>
      ))}
      {!ready && (
        <Pressable accessibilityRole="link" testID="readiness-prepare" onPress={() => { router.push('/onboarding'); }}>
          <Text style={styles.link}>{t.readiness.prepare}</Text>
        </Pressable>
      )}
    </View>
  );
}
