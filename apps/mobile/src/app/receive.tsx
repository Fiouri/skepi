import { TransferError, type OfferDecision } from '@skepi/core';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, PermissionsAndroid, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, useStyles } from '../components/ui';
import { formatBytes } from '../lib/downloads';
import { useMessages } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import {
  capabilities,
  connect,
  disconnect,
  readTestPairing,
  QrScanner,
  receiveUnverified,
  receiveVerified,
  refreshContent,
  type Connection,
  type ReceiveProgress,
} from '../lib/transfer';

type Result = 'installed' | 'unverified' | 'tampered' | 'interrupted' | { failed: string };

/**
 * Receiver side of P2P sharing: pair by QR (or the pairing code), take a newer signed catalog only if
 * it verifies, receive only packs the signed catalog vouches for (unverified ZIM by explicit choice),
 * checking every chunk on arrival and resuming after an interruption.
 */
export default function ReceiveScreen() {
  useKeepAwake();
  const styles = useStyles();
  const theme = useTheme();
  const t = useMessages();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, ReceiveProgress>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const abort = useRef<AbortController | null>(null);
  const sessionRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (sessionRef.current) disconnect(sessionRef.current);
    },
    [],
  );

  const pair = async (text: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setResults({});
    setProgress({});
    try {
      if (sessionRef.current) disconnect(sessionRef.current);
      const c = await connect(text);
      sessionRef.current = c.sessionId;
      setConnection(c);
      setSelected(new Set(c.offers.filter((o) => o.autoSelect).map((o) => o.offer.id)));
    } catch (e) {
      setConnection(null);
      setError(t.transfer.error(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const scan = async (): Promise<void> => {
    const granted = (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)) === PermissionsAndroid.RESULTS.GRANTED;
    if (!granted) {
      setError(t.transfer.permissionDenied);
      return;
    }
    setScanning(true);
  };

  const deselect = (id: string): void => {
    setSelected((prev) => new Set([...prev].filter((x) => x !== id)));
  };

  const receive = async (): Promise<void> => {
    if (!connection) return;
    setBusy(true);
    setError(null);
    const ac = new AbortController();
    abort.current = ac;
    try {
      for (const d of connection.offers) {
        if (!selected.has(d.offer.id)) continue;
        try {
          if (d.status === 'verified' && d.entry) {
            const entry = d.entry;
            await receiveVerified(connection.sessionId, entry, (p) => {
              setProgress((prev) => ({ ...prev, [entry.id]: p }));
            }, ac.signal);
            setResults((prev) => ({ ...prev, [d.offer.id]: 'installed' }));
            deselect(d.offer.id);
          } else if (d.status === 'unverified') {
            await receiveUnverified(connection.sessionId, d.offer, () => undefined, ac.signal);
            setResults((prev) => ({ ...prev, [d.offer.id]: 'unverified' }));
            deselect(d.offer.id);
          }
        } catch (e) {
          const r: Result =
            e instanceof TransferError && e.code === 'tampered'
              ? 'tampered'
              : e instanceof TransferError && e.code === 'interrupted'
                ? 'interrupted'
                : { failed: e instanceof Error ? e.message : String(e) };
          setResults((prev) => ({ ...prev, [d.offer.id]: r }));
        }
      }
      await refreshContent();
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };

  const toggle = (d: OfferDecision): void => {
    if (d.status !== 'verified' && d.status !== 'unverified') return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(d.offer.id)) next.delete(d.offer.id);
      else next.add(d.offer.id);
      return next;
    });
  };

  const resultText = (r: Result): string =>
    r === 'installed'
      ? t.transfer.resultInstalled
      : r === 'unverified'
        ? t.transfer.resultUnverified
        : r === 'tampered'
          ? t.transfer.resultTampered
          : r === 'interrupted'
            ? t.transfer.resultInterrupted
            : t.transfer.resultFailed(r.failed);

  const catalogLine = (c: Connection): string =>
    c.catalog.kind === 'adopt' && c.adopted
      ? t.transfer.catalogAdopted(c.catalog.sequence)
      : c.catalog.kind === 'same'
        ? t.transfer.catalogSame(c.catalog.sequence)
        : t.transfer.catalogRejected(c.catalog.kind === 'rejected' ? c.catalog.reason : 'not stored');

  return (
    <ScrollView style={styles.fill} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" testID="receive-screen">
      {!connection && (
        <>
          {scanning ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.text}>{t.transfer.cameraHint}</Text>
              <QrScanner
                style={{ width: '100%', height: 320 }}
                testID="receive-camera"
                onScanned={(e) => {
                  setScanning(false);
                  void pair(e.nativeEvent.data);
                }}
                onError={(e) => {
                  setScanning(false);
                  setError(t.transfer.error(e.nativeEvent.message));
                }}
              />
            </View>
          ) : (
            <Button testID="receive-scan" label={t.transfer.scan} onPress={() => void scan()} disabled={busy} />
          )}
          <Text style={styles.title}>{t.transfer.enterCode}</Text>
          <TextInput
            testID="receive-code"
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder='{"v":1,…}'
            placeholderTextColor={theme.muted}
            accessibilityLabel={t.transfer.enterCode}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          {capabilities().faultInjection && (
            <Button
              testID="receive-load-test-pairing"
              label="load test pairing (debug)"
              onPress={() => {
                void readTestPairing().then((text) => {
                  if (text) setCode(text.trim());
                });
              }}
            />
          )}
          <Button
            testID="receive-connect"
            label={busy ? t.transfer.connecting : t.transfer.connect}
            disabled={busy || code.trim().length === 0}
            onPress={() => {
              Keyboard.dismiss();
              void pair(code);
            }}
          />
        </>
      )}
      {connection && (
        <View style={{ gap: 10 }} testID="receive-connected">
          <Text style={connection.catalog.kind === 'rejected' ? styles.error : styles.ok} testID="receive-catalog">
            {catalogLine(connection)}
          </Text>
          {connection.offers.map((d) => {
            const p = progress[d.offer.id];
            const r = results[d.offer.id];
            const selectable = d.status === 'verified' || d.status === 'unverified';
            return (
              <Pressable
                key={d.offer.id}
                testID={`offer-${d.offer.id}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected.has(d.offer.id), disabled: !selectable || busy }}
                disabled={!selectable || busy}
                style={[styles.item, { gap: 4 }]}
                onPress={() => {
                  toggle(d);
                }}
              >
                <Text style={styles.title}>{`${selectable ? (selected.has(d.offer.id) ? '☑ ' : '☐ ') : ''}${d.offer.title || d.offer.id}`}</Text>
                <Text style={styles.muted}>{formatBytes(d.offer.sizeBytes)}</Text>
                <Text style={d.status === 'verified' || d.status === 'installed' ? styles.ok : styles.unverified} testID={`offer-status-${d.offer.id}`}>
                  {t.transfer.status[d.status]}
                </Text>
                {p && (
                  <Text style={styles.text} testID={`receive-progress-${d.offer.id}`}>
                    {t.transfer.progress({ phase: t.transfer.phase[p.phase], chunk: p.chunk, chunks: p.chunks, rerequested: p.rerequested, resumedFrom: p.resumedFrom })}
                  </Text>
                )}
                {r && (
                  <Text style={r === 'installed' ? styles.ok : styles.error} testID={`receive-result-${d.offer.id}`}>
                    {resultText(r)}
                  </Text>
                )}
              </Pressable>
            );
          })}
          <Button testID="receive-start" label={t.transfer.receiveSelected} onPress={() => void receive()} disabled={busy || selected.size === 0} />
          <Button
            testID="receive-disconnect"
            tone="danger"
            label={t.transfer.disconnect}
            disabled={busy}
            onPress={() => {
              disconnect(connection.sessionId);
              sessionRef.current = null;
              setConnection(null);
            }}
          />
        </View>
      )}
      {error && (
        <Text style={styles.error} testID="receive-error">
          {error}
        </Text>
      )}
    </ScrollView>
  );
}
