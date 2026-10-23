import {
  checkStorage,
  countryDownloads,
  countryInstalledIds,
  detectMobileTier,
  filterCountries,
  listCountries,
  matchingParts,
  partRemovalIds,
  type CatalogPack,
  type CountryEntry,
} from '@skepi/core';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Text, TextInput, View } from 'react-native';
import { Button, useStyles } from '../components/ui';
import { contentStore, useContent } from '../lib/content';
import { formatBytes, useDownloads } from '../lib/downloads';
import { useMessages } from '../lib/i18n';
import { usePrefs } from '../lib/prefs';
import { useTheme } from '../lib/theme';

function confirm(title: string, body: string, accept: string, cancel: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, body, [
      { text: cancel, style: 'cancel', onPress: () => { resolve(false); } },
      { text: accept, onPress: () => { resolve(true); } },
    ]);
  });
}

/**
 * Packs → "Maps & places" (global maps, decision 2026-10-23): the countries of the signed catalog,
 * searchable, with their download size. Downloads start only when the user presses Download / Update;
 * every pack goes through ContentStore (hash against the signed catalog before it is installed, so
 * before anything opens it). Delete removes all packs of a country; a split country downloads all parts
 * or part by part (a subdivision in the search finds its part), and a part can be deleted alone.
 */
export default function MapsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const t = useMessages();
  const catalog = useContent((s) => s.catalog?.catalog ?? null);
  const packs = useContent((s) => s.packs);
  const refresh = useContent((s) => s.refresh);
  const totalRamMb = useContent((s) => s.totalRamMb);
  const allowMetered = useContent((s) => s.allowMetered);
  const downloads = useDownloads((s) => s.byPack);
  const startDownload = useDownloads((s) => s.start);
  const country = usePrefs((s) => s.country);
  const setCountry = usePrefs((s) => s.setCountry);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ iso2: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const countries = useMemo(() => listCountries(catalog, packs), [catalog, packs]);
  const shown = useMemo(() => filterCountries(countries, query), [countries, query]);
  const tier = totalRamMb > 0 ? detectMobileTier(totalRamMb) : null;

  const download = async (entry: CountryEntry, todo: readonly CatalogPack[]): Promise<void> => {
    if (todo.length === 0) return;
    const size = todo.reduce((n, p) => n + p.sizeBytes, 0);
    const space = contentStore.freeSpace(size);
    const check = checkStorage({ sizeBytes: size, freeBytes: space.freeBytes, tier });
    if (!space.ok) {
      setMessage({ iso2: entry.iso2, text: t.library.noSpace({ needed: formatBytes(space.requiredBytes), free: formatBytes(space.freeBytes) }) });
      return;
    }
    // T1 storage warnings: a large download, or one that leaves little room; the user decides.
    if (check.warnings.length > 0) {
      const body = check.warnings
        .map((w) => (w === 'large-download' ? t.maps.warnLarge(formatBytes(size)) : t.maps.warnLowSpace(formatBytes(check.remainingBytes))))
        .join('\n');
      if (!(await confirm(t.maps.warnTitle, body, t.maps.warnAccept, t.library.cancel))) return;
    }
    let metered = allowMetered;
    if (contentStore.networkState().metered && !metered) {
      metered = await confirm(t.library.meteredTitle, t.library.meteredBody(formatBytes(size)), t.library.meteredAccept, t.library.cancel);
      if (!metered) return;
    }
    setMessage(null);
    for (const p of todo) startDownload(p, metered);
  };

  const remove = async (entry: CountryEntry): Promise<void> => {
    if (!(await confirm(t.maps.removeTitle(entry.name), t.maps.removeBody, t.maps.remove, t.library.cancel))) return;
    setBusy(true);
    try {
      for (const id of countryInstalledIds(entry)) await contentStore.remove(id);
      await refresh();
    } catch (e) {
      setMessage({ iso2: entry.iso2, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const removePart = async (entry: CountryEntry, mapPackId: string, name: string): Promise<void> => {
    const ids = partRemovalIds(entry, mapPackId);
    if (ids.length === 0) return;
    if (!(await confirm(t.maps.removePartTitle(name), t.maps.removePartBody(ids.length > 1), t.maps.removePart, t.library.cancel))) return;
    setBusy(true);
    try {
      for (const id of ids) await contentStore.remove(id);
      await refresh();
    } catch (e) {
      setMessage({ iso2: entry.iso2, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const progressOf = (entry: CountryEntry): string | null => {
    // The packs of this country downloaded in this session (one part and the places, or all).
    const ids = [...entry.maps, ...(entry.places ? [entry.places] : [])].map((p) => p.pack.id).filter((id) => downloads[id] !== undefined);
    const running = ids.flatMap((id) => {
      const d = downloads[id];
      return d?.running ? [d] : [];
    });
    if (running.length === 0) return null;
    const current = running.find((d) => d.progress !== null)?.progress ?? null;
    const done = ids.filter((id) => downloads[id]?.result?.kind === 'done').length;
    return t.maps.progress({
      done,
      total: ids.length,
      phase: current ? t.library.phase[current.phase] : t.library.phase.queued,
      percent: current && current.totalBytes > 0 ? Math.min(100, Math.round((current.bytes / current.totalBytes) * 100)) : 0,
    });
  };

  const failures = (entry: CountryEntry): string[] =>
    [...entry.maps, ...(entry.places ? [entry.places] : [])].flatMap((p) => {
      const r = downloads[p.pack.id]?.result;
      return r?.kind === 'failed' ? [t.library.failed(r.reason ?? '')] : [];
    });

  const row = (entry: CountryEntry) => {
    const split = entry.maps.length > 1;
    const progress = progressOf(entry);
    const installed = countryInstalledIds(entry).length > 0;
    const all = countryDownloads(entry);
    const matched = matchingParts(entry, query);
    return (
      <View style={styles.passage} testID={`country-${entry.iso2}`}>
        <Text style={styles.title}>{entry.name}</Text>
        <Text style={styles.muted} testID={`country-status-${entry.iso2}`}>
          {`${t.maps.status[entry.status]} · ${t.maps.size(formatBytes(entry.sizeBytes))}`}
        </Text>
        {split && <Text style={styles.text}>{t.maps.parts}</Text>}
        {split &&
          entry.maps.map((m) => {
            const name = m.pack.region?.part?.name ?? m.pack.title.en;
            const term = matched.get(m.pack.id);
            return (
              <View key={m.pack.id} testID={`country-part-row-${m.pack.id}`}>
                <View style={styles.row}>
                  <Text style={[term ? styles.title : styles.text, { flexShrink: 1 }]} testID={`country-part-name-${m.pack.id}`}>
                    {t.maps.part({ name, size: formatBytes(m.pack.sizeBytes), installed: m.installed !== null && !m.update })}
                  </Text>
                  {(m.installed === null || m.update) && (
                    <Button
                      testID={`country-part-${m.pack.id}`}
                      label={m.update ? t.maps.update(formatBytes(m.pack.sizeBytes)) : t.maps.downloadPart}
                      onPress={() => void download(entry, countryDownloads(entry, [m.pack.region?.part?.id ?? '']))}
                      disabled={busy || progress !== null}
                    />
                  )}
                  {m.installed !== null && (
                    <Button
                      testID={`country-part-delete-${m.pack.id}`}
                      label={t.maps.removePart}
                      tone="danger"
                      onPress={() => void removePart(entry, m.pack.id, name)}
                      disabled={busy || progress !== null}
                    />
                  )}
                </View>
                {term !== undefined && (
                  <Text style={styles.muted} testID={`country-part-match-${m.pack.id}`}>
                    {t.maps.matches(term)}
                  </Text>
                )}
              </View>
            );
          })}
        {split && entry.places && (
          <Text style={styles.text}>{t.maps.places({ size: formatBytes(entry.places.pack.sizeBytes), installed: entry.places.installed !== null })}</Text>
        )}
        <View style={styles.row}>
          {all.length > 0 && (
            <Button
              testID={`country-download-${entry.iso2}`}
              label={
                entry.status === 'update'
                  ? t.maps.update(formatBytes(entry.missingBytes))
                  : split
                    ? t.maps.allParts(formatBytes(entry.missingBytes))
                    : t.maps.download(formatBytes(entry.missingBytes))
              }
              onPress={() => void download(entry, all)}
              disabled={busy || progress !== null || !catalog}
            />
          )}
          {installed && (
            <Button testID={`country-delete-${entry.iso2}`} label={t.maps.remove} tone="danger" onPress={() => void remove(entry)} disabled={busy || progress !== null} />
          )}
          {installed && country !== entry.iso2 && (
            <Button
              testID={`country-select-${entry.iso2}`}
              label={t.maps.useForNumbers}
              onPress={() => {
                setCountry(entry.iso2);
              }}
            />
          )}
        </View>
        {installed && country === entry.iso2 && (
          <Text style={styles.muted} testID={`country-selected-${entry.iso2}`}>
            {t.maps.usedForNumbers}
          </Text>
        )}
        {progress && (
          <Text style={styles.muted} testID={`country-progress-${entry.iso2}`}>
            {progress}
          </Text>
        )}
        {failures(entry).map((f) => (
          <Text key={f} style={styles.error}>
            {f}
          </Text>
        ))}
        {message?.iso2 === entry.iso2 && (
          <Text style={styles.error} testID={`country-message-${entry.iso2}`}>
            {message.text}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.screen} testID="maps-screen">
      <TextInput
        testID="maps-search"
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder={t.maps.search}
        placeholderTextColor={theme.muted}
        accessibilityLabel={t.maps.search}
        autoCorrect={false}
      />
      <Text style={styles.muted}>{catalog ? t.maps.verifiedBeforeOpening : t.maps.noCatalog}</Text>
      <FlatList
        data={shown}
        keyExtractor={(c) => c.iso2}
        renderItem={({ item }) => row(item)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.muted}>{t.maps.none}</Text>}
        contentContainerStyle={{ paddingBottom: 48 }}
      />
    </View>
  );
}
