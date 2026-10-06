import { chunkRange } from '@skepi/core';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { Image, PermissionsAndroid, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Button, useStyles } from '../components/ui';
import { currentCatalog, useContent } from '../lib/content';
import { formatBytes } from '../lib/downloads';
import { useMessages } from '../lib/i18n';
import {
  capabilities,
  hostStatus,
  onHostStopped,
  setHostFaults,
  startSharing,
  stopSharing,
  type CatalogFault,
  type FaultsInput,
  type Sharing,
} from '../lib/transfer';

/** Android 13+: LocalOnlyHotspot needs NEARBY_WIFI_DEVICES; older versions fine location. */
async function hotspotPermission(): Promise<boolean> {
  const permission =
    Number(Platform.Version) >= 33 ? PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES : PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Host side of P2P sharing: the user picks packs; only those are served (read-only HTTPS, per-session
 * certificate and token, QR pairing), optionally with the app's APK on a local page.
 */
export default function ShareScreen() {
  useKeepAwake();
  const styles = useStyles();
  const t = useMessages();
  const packs = useContent((s) => s.packs);
  const caps = capabilities();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [mode, setMode] = useState<'lan' | 'hotspot'>('lan');
  const [shareApp, setShareApp] = useState(false);
  const [catalogFault, setCatalogFault] = useState<CatalogFault>('none');
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState(0);
  const [stopped, setStopped] = useState<string | null>(null);
  const [faults, setFaults] = useState<FaultsInput>({});

  useEffect(
    () =>
      onHostStopped((reason) => {
        setStopped(reason);
        setSharing(null);
      }),
    [],
  );

  // Live request counter while sharing.
  useEffect(() => {
    if (!sharing) return;
    const timer = setInterval(() => {
      setRequests(hostStatus().requests ?? 0);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [sharing]);

  // Leaving the screen ends the session.
  useEffect(
    () => () => {
      stopSharing();
    },
    [],
  );

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const start = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setStopped(null);
    try {
      if (mode === 'hotspot' && !(await hotspotPermission())) {
        setError(t.transfer.permissionDenied);
        return;
      }
      setSharing(await startSharing({ packIds: [...selected], mode, shareApp, catalogFault }));
      setRequests(0);
    } catch (e) {
      setError(t.transfer.error(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  /** Debug: faults add up (e.g. a corrupted chunk and a dropped connection in one transfer). */
  const addFault = (f: FaultsInput): void => {
    const next = { ...faults, ...f };
    setFaults(next);
    setHostFaults(next);
  };

  const stop = (): void => {
    stopSharing();
    setSharing(null);
  };

  /** Debug: fault on the n-th chunk of the first shared pack (offset from its catalog entry). */
  const chunkOffset = (n: number): { pack: string; offset: number } | null => {
    const first = sharing?.packs[0];
    const entry = first ? currentCatalog()?.packs.find((p) => p.id === first.id) : undefined;
    if (!first || !entry) return null;
    return { pack: first.id, offset: chunkRange(entry, Math.min(n, entry.chunkSha256.length - 1)).offset };
  };

  return (
    <ScrollView style={styles.fill} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 48 }} testID="share-screen">
      {!sharing && (
        <>
          <Text style={styles.title} accessibilityRole="header">
            {t.transfer.choosePacks}
          </Text>
          {packs.length === 0 && <Text style={styles.muted}>{t.transfer.noPacks}</Text>}
          {packs.map((p) => (
            <Pressable
              key={p.id}
              testID={`share-pack-${p.id}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected.has(p.id) }}
              style={[styles.item, styles.row]}
              onPress={() => {
                toggle(p.id);
              }}
            >
              <Text style={styles.title}>{selected.has(p.id) ? '☑' : '☐'}</Text>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.text}>{p.title}</Text>
                <Text style={styles.muted}>{formatBytes(p.sizeBytes)}</Text>
                {!p.verified && <Text style={styles.unverified}>{t.unverified.label}</Text>}
              </View>
            </Pressable>
          ))}
          <Text style={styles.title}>{t.transfer.mode}</Text>
          <View style={styles.row} accessibilityRole="radiogroup">
            {(['lan', 'hotspot'] as const).map((m) => (
              <Pressable
                key={m}
                testID={`share-mode-${m}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === m, disabled: m === 'hotspot' && !caps.hotspot }}
                disabled={m === 'hotspot' && !caps.hotspot}
                style={[styles.chip, mode === m ? { borderWidth: 2 } : null]}
                onPress={() => {
                  setMode(m);
                }}
              >
                <Text style={styles.chipText}>{m === 'lan' ? t.transfer.modeLan : t.transfer.modeHotspot}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.muted}>{mode === 'lan' ? t.transfer.modeLanHint : caps.hotspot ? t.transfer.modeHotspotHint : t.transfer.hotspotUnsupported}</Text>
          <View style={styles.row}>
            <Switch testID="share-app" accessibilityLabel={t.transfer.shareApp} value={shareApp} onValueChange={setShareApp} />
            <Text style={styles.text}>{t.transfer.shareApp}</Text>
          </View>
          <Text style={styles.muted}>{t.transfer.shareAppHint}</Text>
          {caps.faultInjection && (
            <View style={styles.card} testID="share-developer">
              <Text style={styles.muted}>{t.transfer.developer}</Text>
              <View style={styles.row}>
                {(['none', 'bad-signature', 'embedded'] as const).map((f) => (
                  <Pressable
                    key={f}
                    testID={`catalog-fault-${f}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: catalogFault === f }}
                    style={[styles.chip, catalogFault === f ? { borderWidth: 2 } : null]}
                    onPress={() => {
                      setCatalogFault(f);
                    }}
                  >
                    <Text style={styles.chipText}>{`catalog: ${f}`}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <Button testID="share-start" label={busy ? t.transfer.starting : t.transfer.start} onPress={() => void start()} disabled={busy || selected.size === 0} />
        </>
      )}
      {sharing && (
        <View style={{ gap: 12 }} testID="share-active">
          <Text style={styles.title} testID="share-status">
            {t.transfer.sharing({ packs: sharing.packs.length, requests })}
          </Text>
          <Text style={styles.text}>{t.transfer.scanHint}</Text>
          <Image testID="share-qr" source={{ uri: sharing.qr }} style={{ width: 300, height: 300, alignSelf: 'center' }} accessibilityIgnoresInvertColors />
          {sharing.pairing.ssid && sharing.pairing.psk && (
            <Text style={styles.text} testID="share-hotspot">
              {t.transfer.hotspotCredentials({ ssid: sharing.pairing.ssid, psk: sharing.pairing.psk })}
            </Text>
          )}
          <Text style={styles.muted}>{t.transfer.code}</Text>
          <Text style={styles.mono} selectable testID="share-code">
            {sharing.pairingText}
          </Text>
          {sharing.apkQr && sharing.session.apkUrl && (
            <View style={styles.card} testID="share-apk">
              <Text style={styles.title}>{t.transfer.apkTitle}</Text>
              <Image source={{ uri: sharing.apkQr }} style={{ width: 220, height: 220, alignSelf: 'center' }} accessibilityIgnoresInvertColors />
              <Text style={styles.text} selectable testID="share-apk-url">
                {t.transfer.apkHint(sharing.session.apkUrl)}
              </Text>
              {sharing.session.apkCertSha256 && <Text style={styles.mono}>{t.transfer.apkFingerprint(sharing.session.apkCertSha256)}</Text>}
            </View>
          )}
          {caps.faultInjection && (
            <View style={[styles.card, styles.row]} testID="share-faults">
              <Button
                testID="fault-corrupt-once"
                label="corrupt chunk 2 once"
                onPress={() => {
                  const c = chunkOffset(1);
                  if (c) addFault({ corruptOncePack: c.pack, corruptOnceOffset: c.offset });
                }}
              />
              <Button
                testID="fault-drop-once"
                label="drop at chunk 3 once"
                onPress={() => {
                  const c = chunkOffset(2);
                  if (c) addFault({ dropOncePack: c.pack, dropOnceOffset: c.offset });
                }}
              />
              <Button
                testID="fault-tamper"
                label="tamper every chunk"
                onPress={() => {
                  const c = chunkOffset(0);
                  if (c) addFault({ corruptAlwaysPack: c.pack });
                }}
              />
              <Button
                testID="fault-clear"
                label="no faults"
                onPress={() => {
                  setFaults({});
                  setHostFaults({});
                }}
              />
            </View>
          )}
          <Button testID="share-stop" tone="danger" label={t.transfer.stop} onPress={stop} />
        </View>
      )}
      {stopped && (
        <Text style={styles.muted} testID="share-stopped">
          {t.transfer.stopped(stopped)}
        </Text>
      )}
      {error && (
        <Text style={styles.error} testID="share-error">
          {error}
        </Text>
      )}
    </ScrollView>
  );
}
