import { useKeepAwake } from 'expo-keep-awake';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, ContentGate, styles } from '../../components/ui';
import { runBench, type BenchReport } from '../../lib/bench';

export default function BenchScreen() {
  useKeepAwake();
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
      const r = await runBench((line) => {
        setLines((prev) => [...prev, line]);
      });
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <ContentGate>
      <ScrollView style={styles.screen} contentContainerStyle={{ gap: 8, paddingBottom: 48 }}>
        <View style={styles.row}>
          <Button testID="bench-run" label={running ? 'Τρέχει…' : 'Run bench'} onPress={() => void start()} disabled={running} />
          <Text style={styles.muted} testID="bench-status">
            {running ? 'running' : report ? 'done' : error ? 'error' : 'idle'}
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
                {g.pass === null ? '–' : g.pass ? 'PASS' : 'FAIL'} {name}: {g.value === null ? 'n/a' : g.value.toFixed(1)} (gate {'<'} {g.gate})
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </ContentGate>
  );
}
