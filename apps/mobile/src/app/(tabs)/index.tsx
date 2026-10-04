import type { SearchHit } from '@skepi/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Button, ContentGate, styles } from '../../components/ui';
import { knowledge } from '../../lib/content';
import { useMessages } from '../../lib/i18n';

interface Timing {
  kind: 'suggest' | 'fulltext';
  totalMs: number;
  nativeMs: number;
  count: number;
}

export default function SearchScreen() {
  const router = useRouter();
  const t = useMessages();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const run = useCallback(async (q: string, kind: Timing['kind']) => {
    const id = ++seq.current;
    if (q.trim().length === 0) {
      setHits([]);
      setTiming(null);
      return;
    }
    try {
      const start = performance.now();
      const result = await knowledge.search(q, { mode: kind === 'suggest' ? 'suggest' : 'fulltext', limit: 20 });
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
  }, []);

  const onChange = (text: string): void => {
    setQuery(text);
    void run(text, 'suggest');
  };

  return (
    <ContentGate>
      <View style={styles.screen}>
        <TextInput
          testID="search-input"
          style={styles.input}
          value={query}
          onChangeText={onChange}
          onSubmitEditing={() => void run(query, 'fulltext')}
          placeholder={t.search.placeholder}
          returnKeyType="search"
          autoCorrect={false}
        />
        <View style={styles.row}>
          <Button testID="search-fulltext" label={t.search.fullText} onPress={() => void run(query, 'fulltext')} />
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
        {error && <Text style={styles.error}>{error}</Text>}
        <FlatList
          data={hits}
          keyExtractor={(h) => `${h.archiveId}/${h.path}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => (
            <Pressable
              testID={`search-result-${index}`}
              style={styles.item}
              onPress={() => {
                router.push({ pathname: '/article', params: { archiveId: item.archiveId, path: item.path, title: item.title } });
              }}
            >
              <Text style={styles.title}>{item.title}</Text>
              {item.snippet && item.snippet !== item.title ? <Text style={styles.muted}>{item.snippet}</Text> : null}
            </Pressable>
          )}
        />
      </View>
    </ContentGate>
  );
}
