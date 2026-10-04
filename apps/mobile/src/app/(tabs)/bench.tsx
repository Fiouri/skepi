import type { InferenceBackend, RagSource } from '@skepi/core';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Button, ContentGate, styles } from '../../components/ui';
import { runBench, type BenchReport } from '../../lib/bench';
import { useActiveProfile, useContent } from '../../lib/content';
import { useMessages } from '../../lib/i18n';

const BACKENDS: readonly InferenceBackend[] = ['cpu', 'opencl', 'hexagon'];

export default function BenchScreen() {
  useKeepAwake();
  const t = useMessages();
  const simulateT1 = useContent((s) => s.simulateT1);
  const setSimulateT1 = useContent((s) => s.setSimulateT1);
  const backend = useContent((s) => s.backend);
  const setBackend = useContent((s) => s.setBackend);
  const { profile } = useActiveProfile();
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [report, setReport] = useState<BenchReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Render probe for "sources visible": the bench shows the sources here, like the Ask screen does,
  // and the time of the first frame after React commits them is the measurement.
  const [probe, setProbe] = useState<RagSource[]>([]);
  const pending = useRef<((at: number) => void) | null>(null);
  useEffect(() => {
    const resolve = pending.current;
    if (!resolve) return;
    pending.current = null;
    const frame = requestAnimationFrame(() => {
      resolve(performance.now());
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [probe]);
  const renderSources = useCallback(
    (sources: RagSource[]) =>
      new Promise<number>((resolve) => {
        pending.current = resolve;
        setProbe(sources);
      }),
    [],
  );

  const start = async (): Promise<void> => {
    setRunning(true);
    setLines([]);
    setReport(null);
    setError(null);
    try {
      const r = await runBench(
        (line) => {
          setLines((prev) => [...prev, line]);
        },
        { simulateT1, backend, renderSources },
      );
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const status = running ? 'running' : report ? 'done' : error ? 'error' : 'idle';

  return (
    <ContentGate>
      <ScrollView style={styles.screen} contentContainerStyle={{ gap: 8, paddingBottom: 48 }}>
        <View style={{ gap: 4 }}>
          <Text style={styles.title}>{t.bench.developer}</Text>
          <View style={styles.row}>
            <Switch
              testID="dev-t1-simulation"
              accessibilityLabel={t.bench.t1Simulation}
              value={simulateT1}
              onValueChange={setSimulateT1}
              disabled={running}
            />
            <Text style={styles.text}>{t.bench.t1Simulation}</Text>
          </View>
          <Text style={styles.muted}>{t.bench.t1SimulationHint}</Text>
          <Text style={styles.text}>{t.bench.backend}</Text>
          <View style={styles.row}>
            {BACKENDS.map((b) => (
              <Pressable
                key={b}
                testID={`dev-backend-${b}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: backend === b, disabled: running }}
                disabled={running}
                style={[styles.chip, backend === b ? { borderWidth: 2 } : null]}
                onPress={() => {
                  setBackend(b);
                }}
              >
                <Text style={styles.chipText}>{t.bench.backendOption[b]}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.muted}>{t.bench.backendHint}</Text>
          <Text style={styles.mono} testID="bench-profile">
            {t.bench.profile({
              tier:
                profile.detectedTier === profile.effectiveTier
                  ? profile.detectedTier
                  : `${profile.detectedTier} → ${profile.effectiveTier}`,
              mode: profile.mode,
              model: profile.modelId ?? '–',
              threads: profile.load.threads,
              contextSize: profile.load.contextSize,
              budget: profile.budgetTier,
              summary: profile.summaryMode,
              backend: profile.backend,
            })}
          </Text>
        </View>
        <View style={styles.row}>
          <Button testID="bench-run" label={running ? t.bench.running : t.bench.run} onPress={() => void start()} disabled={running} />
          <Text style={styles.muted} testID="bench-status">
            {t.bench.status[status]}
          </Text>
        </View>
        {probe.length > 0 && (
          <View testID="bench-probe">
            {probe.map((s) => (
              <Text key={s.id} style={styles.chipText}>
                [{s.id}] {s.title}
              </Text>
            ))}
          </View>
        )}
        {report && (
          <View style={{ gap: 4 }} testID="bench-gates">
            {Object.entries(report.gates).map(([name, g]) => (
              <Text key={name} style={styles.mono}>
                {g.gate === null
                  ? `${name}: ${g.value === null ? 'n/a' : g.value.toFixed(1)}`
                  : t.bench.gate({
                      result: g.pass === null ? 'none' : g.pass ? 'pass' : 'fail',
                      name,
                      value: g.value === null ? 'n/a' : g.value.toFixed(1),
                      limit: g.gate,
                    })}
              </Text>
            ))}
          </View>
        )}
        {lines.map((l, i) => (
          <Text key={i} style={styles.mono}>
            {l}
          </Text>
        ))}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </ContentGate>
  );
}
