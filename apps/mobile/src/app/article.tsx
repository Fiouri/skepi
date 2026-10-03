import { Stack, useLocalSearchParams } from 'expo-router';
import { ExpoZim, ZimArticleView, zimUrl } from 'expo-zim';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { styles } from '../components/ui';

export default function ArticleScreen() {
  const params = useLocalSearchParams<{ archiveId: string; path: string; title?: string }>();
  const url = useMemo(() => zimUrl(params.archiveId, params.path), [params.archiveId, params.path]);
  const startedAt = useRef(performance.now());
  const [openMs, setOpenMs] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<number | null>(null);
  const [external, setExternal] = useState<string | null>(null);

  const refreshBlocked = useCallback(async () => {
    const list = await ExpoZim.getBlockedRequests();
    setBlocked(list.length);
  }, []);

  useEffect(() => {
    startedAt.current = performance.now();
    setOpenMs(null);
  }, [url]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: params.title ?? 'Άρθρο' }} />
      <View style={[styles.row, { padding: 8 }]}>
        <Text style={styles.muted} testID="article-open-ms">
          {openMs === null ? 'Φόρτωση…' : `Άνοιγμα: ${openMs.toFixed(0)} ms`}
        </Text>
        <Text style={styles.muted} testID="blocked-count">
          Blocked requests: {blocked ?? '…'}
        </Text>
      </View>
      {external && (
        <Text style={[styles.muted, { paddingHorizontal: 8 }]} testID="external-link">
          Εξωτερικός σύνδεσμος (δεν ανοίγει): {external}
        </Text>
      )}
      <ZimArticleView
        testID="article-view"
        style={{ flex: 1 }}
        url={url}
        onLoadEnd={() => {
          setOpenMs(performance.now() - startedAt.current);
          void refreshBlocked();
        }}
        onBlockedRequest={() => void refreshBlocked()}
        onExternalLink={(e) => {
          setExternal(e.nativeEvent.url);
        }}
      />
    </View>
  );
}
