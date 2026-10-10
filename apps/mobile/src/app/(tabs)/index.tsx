import type { SearchHit } from '@skepi/contracts';
import { DEFAULT_SUGGEST, placeTitle, suggestTitles } from '@skepi/core';
import { findCards } from '@skepi/emergency-cards';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { BlackoutControls, PowerTips } from '../../components/Blackout';
import { CardLinks } from '../../components/EmergencyCards';
import { PreviewLabel } from '../../components/Preview';
import { Readiness } from '../../components/Readiness';
import { Button, useStyles, UnverifiedLabel } from '../../components/ui';
import { knowledge, ragArchives, useContent } from '../../lib/content';
import { useMessages } from '../../lib/i18n';
import { searchAllPlaces, type PlaceHit } from '../../lib/places';
import { usePrefs } from '../../lib/prefs';
import { useTheme } from '../../lib/theme';

interface Timing {
  kind: 'suggest' | 'fulltext';
  totalMs: number;
  nativeMs: number;
  count: number;
}

/**
 * Home: the permanent Emergency button, blackout mode, the "You are ready" indicator, and one search
 * field over emergency cards, places (verified places packs) and articles. Cards and the Emergency
 * button work with no pack at all.
 */
export default function SearchScreen() {
  const router = useRouter();
  const t = useMessages();
  const styles = useStyles();
  const theme = useTheme();
  const blackout = usePrefs((s) => s.blackout);
  const archives = useContent((s) => s.archives);
  const placesPaths = useContent((s) => s.placesPaths);
  const status = useContent((s) => s.status);
  const [places, setPlaces] = useState<PlaceHit[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const canSearchArticles = status === 'ready' && archives.length > 0;

  const run = useCallback(
    async (q: string, kind: Timing['kind']) => {
      const id = ++seq.current;
      if (q.trim().length === 0 || !canSearchArticles) {
        setHits([]);
        setTiming(null);
        return;
      }
      try {
        const start = performance.now();
        const result =
          kind === 'suggest'
            ? await suggestTitles(knowledge, q, { ...DEFAULT_SUGGEST, archives: ragArchives() })
            : await knowledge.search(q, { mode: 'fulltext', limit: 20 });
        const totalMs = performance.now() - start;
        if (id !== seq.current) return;
        setHits(result);
        setError(null);
        setTiming({
          kind,
          totalMs,
          nativeMs: kind === 'suggest' ? knowledge.lastNativeMs.suggest : knowledge.lastNativeMs.search,
          count: result.length,
        });
      } catch (e) {
        if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
      }
    },
    [canSearchArticles],
  );

  // Places come from the verified places packs (SQLite FTS5, ~1 ms per query): searched on every change.
  useEffect(() => {
    if (query.trim().length === 0 || placesPaths.length === 0) {
      setPlaces([]);
      return;
    }
    let live = true;
    void searchAllPlaces(placesPaths, query, 5).then(
      (found) => {
        if (live) setPlaces(found);
      },
      () => {
        if (live) setPlaces([]);
      },
    );
    return () => {
      live = false;
    };
  }, [query, placesPaths]);

  const onChange = (text: string): void => {
    setQuery(text);
    void run(text, 'suggest');
  };

  const cards = query.trim().length > 0 ? findCards(query) : [];

  const header = (
    <View style={{ gap: 10 }}>
      <PreviewLabel />
      <Button testID="home-emergency" tone="danger" label={t.home.emergency} hint={t.home.emergencyHint} onPress={() => { router.push('/emergency'); }} />
      <BlackoutControls />
      <TextInput
        testID="search-input"
        style={styles.input}
        value={query}
        onChangeText={onChange}
        onSubmitEditing={() => {
          Keyboard.dismiss();
          void run(query, 'fulltext');
        }}
        placeholder={t.search.placeholder}
        placeholderTextColor={theme.muted}
        accessibilityLabel={t.search.placeholder}
        returnKeyType="search"
        autoCorrect={false}
      />
      {canSearchArticles && (
        <View style={styles.row}>
          <Button
            testID="search-fulltext"
            label={t.search.fullText}
            onPress={() => {
              Keyboard.dismiss();
              void run(query, 'fulltext');
            }}
          />
          {timing && (
            <Text style={styles.muted} testID="search-timing">
              {t.search.timing({
                kind: timing.kind,
                count: timing.count,
                totalMs: timing.totalMs.toFixed(1),
                nativeMs: timing.nativeMs.toFixed(1),
              })}
            </Text>
          )}
        </View>
      )}
      {status === 'ready' && archives.length === 0 && (
        <Text style={styles.muted} testID="content-missing">
          {t.content.missing}
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {cards.length > 0 && (
        <View testID="search-cards">
          <CardLinks cards={cards} />
        </View>
      )}
      {places.length > 0 && (
        <View testID="search-places">
          <Text style={styles.title} accessibilityRole="header">
            {t.search.places}
          </Text>
          {places.map((p, i) => {
            const title = placeTitle(p);
            return (
              <Pressable
                key={`${p.packPath}#${String(p.id)}`}
                testID={`place-result-${String(i)}`}
                accessibilityRole="link"
                accessibilityHint={t.search.placeOnMap}
                style={styles.item}
                onPress={() => {
                  Keyboard.dismiss();
                  router.push({ pathname: '/map', params: { lat: String(p.lat), lon: String(p.lon), title: title.title } });
                }}
              >
                <Text style={styles.title}>{title.title}</Text>
                <Text style={styles.muted}>{[title.local, title.kind].filter(Boolean).join(' · ')}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      style={styles.fill}
      contentContainerStyle={{ padding: 12, paddingBottom: 48 }}
      data={hits}
      ListHeaderComponent={header}
      ListFooterComponent={
        <View style={{ gap: 10, marginTop: 10 }}>
          <Readiness />
          {blackout && <PowerTips />}
          <Pressable accessibilityRole="link" testID="home-about" onPress={() => { router.push('/about'); }}>
            <Text style={styles.link}>{t.about.open}</Text>
          </Pressable>
        </View>
      }
      keyExtractor={(h) => `${h.archiveId}/${h.path}`}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item, index }) => (
        <Pressable
          testID={`search-result-${String(index)}`}
          accessibilityRole="link"
          style={styles.item}
          onPress={() => {
            router.push({ pathname: '/article', params: { archiveId: item.archiveId, path: item.path, title: item.title } });
          }}
        >
          <Text style={styles.title}>{item.title}</Text>
          <UnverifiedLabel archiveId={item.archiveId} />
          {item.snippet && item.snippet !== item.title ? <Text style={styles.muted}>{item.snippet}</Text> : null}
        </Pressable>
      )}
    />
  );
}
