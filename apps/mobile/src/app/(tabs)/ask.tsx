import { runRag, type EmergencyMatch, type RagResult, type RagSource } from '@skepi/core';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, ContentGate, styles } from '../../components/ui';
import { knowledge, llama, useActiveProfile } from '../../lib/content';
import { useMessages } from '../../lib/i18n';

type Phase = 'idle' | 'loading-model' | 'retrieving' | 'generating' | 'done' | 'error';

export default function AskScreen() {
  const router = useRouter();
  const t = useMessages();
  const { profile, model } = useActiveProfile();
  const [question, setQuestion] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [emergency, setEmergency] = useState<EmergencyMatch | null>(null);
  const [streamed, setStreamed] = useState('');
  const [sources, setSources] = useState<RagSource[]>([]);
  const [result, setResult] = useState<RagResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  const busy = phase === 'loading-model' || phase === 'retrieving' || phase === 'generating';

  const ask = async (): Promise<void> => {
    if (busy || question.trim().length === 0) return;
    const abort = new AbortController();
    controller.current = abort;
    setEmergency(null);
    setStreamed('');
    setSources([]);
    setResult(null);
    setError(null);
    try {
      let inference = null;
      if (model) {
        setPhase('loading-model');
        const loaded = await llama.load(model, profile.load);
        setLoadMs(loaded.loadMs);
        inference = llama;
      }
      setPhase('retrieving');
      const res = await runRag(question, { knowledge, inference }, {
        signal: abort.signal,
        config: { budgetTokens: profile.budgetTokens },
        onEvent: (e) => {
          if (e.type === 'emergency') setEmergency(e.match);
          else if (e.type === 'context') {
            setSources(e.sources);
            setPhase('generating');
          } else if (e.type === 'token') setStreamed((s) => s + e.text);
        },
      });
      setResult(res);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    } finally {
      controller.current = null;
    }
  };

  const openSource = (s: RagSource): void => {
    router.push({ pathname: '/article', params: { archiveId: s.archiveId, path: s.path, title: s.title } });
  };

  const cited = new Set(result?.answer?.cited ?? []);

  return (
    <ContentGate>
      <ScrollView style={styles.screen} contentContainerStyle={{ gap: 8, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <TextInput
          testID="ask-input"
          style={styles.input}
          value={question}
          onChangeText={setQuestion}
          placeholder={t.ask.placeholder}
          multiline
        />
        <View style={styles.row}>
          <Button testID="ask-submit" label={t.ask.submit} onPress={() => void ask()} disabled={busy} />
          <Button testID="ask-stop" label={t.ask.stop} tone="danger" onPress={() => controller.current?.abort()} disabled={!busy} />
          <Button
            testID="ask-clear"
            label={t.ask.clear}
            onPress={() => {
              setQuestion('');
              setResult(null);
              setStreamed('');
              setSources([]);
              setEmergency(null);
              setPhase('idle');
            }}
            disabled={busy}
          />
          <Text style={styles.muted} testID="ask-phase">
            {t.ask.phase[phase]}
          </Text>
        </View>
        {!model && <Text style={styles.muted}>{t.ask.noModel}</Text>}
        {profile.mode === 't1-simulation' && (
          <Text style={styles.muted} testID="ask-t1-simulation">
            {t.ask.simulationActive}
          </Text>
        )}

        {emergency && (
          <View style={styles.banner} testID="emergency-banner">
            <Text style={styles.bannerText}>{t.ask.emergencyCall(emergency.numbers.general)}</Text>
            <Text style={styles.text}>{t.ask.emergencyServices(emergency.numbers)}</Text>
            <Text style={styles.muted}>{t.ask.emergencyTopics(emergency.topics.join(', '))}</Text>
          </View>
        )}

        {result?.status === 'no_source' && (
          <View style={styles.banner}>
            <Text style={styles.bannerText} testID="no-source">
              {t.ask.noSource}
            </Text>
            <Text style={styles.muted}>
              {t.ask.noSourceDetail({
                reason: result.noSourceReason ?? '–',
                coverage: result.best?.coverage.toFixed(2) ?? '–',
              })}
            </Text>
          </View>
        )}

        {phase === 'generating' && streamed.length > 0 && (
          <Text style={styles.muted} testID="answer-progress">
            {t.ask.writing(streamed.length)}
          </Text>
        )}
        {result?.answer && !result.answer.notCovered && (
          <Text style={styles.text} testID="answer-text" selectable>
            {result.answer.text}
          </Text>
        )}
        {result?.answer?.unverified && (
          <Text style={styles.error} testID="answer-unverified">
            {t.ask.unverified}
          </Text>
        )}
        {result?.answer?.notCovered && (
          <Text style={styles.muted} testID="answer-not-covered">
            {t.ask.notCovered}
          </Text>
        )}

        {sources.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={styles.title}>{t.ask.sources}</Text>
            <View style={styles.row}>
              {sources
                .filter((s) => !result?.answer || cited.has(s.id))
                .map((s) => (
                  <Pressable key={s.id} testID={`citation-${s.id}`} style={styles.chip} onPress={() => {
                      openSource(s);
                    }}>
                    <Text style={styles.chipText}>
                      [{s.id}] {s.title}
                    </Text>
                  </Pressable>
                ))}
            </View>
          </View>
        )}

        {result && (
          <Text style={styles.mono} testID="ask-metrics">
            {[
              `status=${result.status}`,
              `retrieval=${result.timings.retrievalMs}ms extract=${result.timings.extractMs}ms rank=${result.timings.rankMs}ms`,
              loadMs !== null ? `modelLoad=${loadMs}ms` : null,
              result.generation
                ? `ttft=${result.generation.timeToFirstTokenMs ?? '–'}ms tok/s=${result.generation.tokensPerSecond?.toFixed(1) ?? '–'} prompt=${result.generation.promptTokens} gen=${result.generation.generatedTokens} stop=${result.generation.stopReason}`
                : null,
              result.answer
                ? `cited=${result.answer.cited.join(',') || '-'} invalid=${result.answer.invalid.join(',') || '-'} unsupported=${result.answer.unsupported.join(',') || '-'}`
                : null,
              result.structured
                ? `support=${result.structured.sentences.map((x) => `${x.source}:${x.support === null ? '–' : x.support.toFixed(2)}`).join(' ')}`
                : null,
              `keywords=${result.keywords.join(' ')}`,
            ]
              .filter(Boolean)
              .join('\n')}
          </Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </ContentGate>
  );
}
