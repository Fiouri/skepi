import { useKeepAwake } from 'expo-keep-awake';
import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { Button, ContentGate, styles } from '../../components/ui';
import { runBench, type BenchReport } from '../../lib/bench';
import { useActiveProfile, useContent } from '../../lib/content';
import { useMessages } from '../../lib/i18n';

export default function BenchScreen() {
  useKeepAwake();
  const t = useMessages();
  const simulateT1 = useContent((s) => s.simulateT1);
  const setSimulateT1 = useContent((s) => s.setSimulateT1);
  const { profile } = useActiveProfile();
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [report, setReport] = useState<BenchReport | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        { simulateT1 },
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
              budgetTokens: profile.budgetTokens,
            })}
          </Text>
        </View>
        <View style={styles.row}>
          <Button testID="bench-run" label={running ? t.bench.running : t.bench.run} onPress={() => void start()} disabled={running} />
          <Text style={styles.muted} testID="bench-status">
            {t.bench.status[status]}
          </Text>
        </View>
        {lines.map((l, i) => (
          <Text key={i} style={styles.mono}>
            {l}
          </Text>
        ))}
        {error && <Text style={styles.error}>{error}</Text>}
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
      </ScrollView>
    </ContentGate>
  );
}
