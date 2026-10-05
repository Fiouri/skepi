import {
  retrieve,
  summarise,
  type EmergencyMatch,
  type Layer1Passage,
  type MedicalIntent,
  type RagSource,
  type RetrievalResult,
  type SummaryResult,
} from '@skepi/core';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { cardsForQuestion } from '@skepi/emergency-cards';
import { EmergencyCardSlot, useEmergencyNumbers } from '../../components/EmergencyCards';
import { Button, ContentGate, UnverifiedLabel, useStyles } from '../../components/ui';
import { energyTier, ensureModel, knowledge, llama, ragArchives, ragConfigFor, useActiveProfile } from '../../lib/content';
import { measureEnergy, useEnergyCost } from '../../lib/energy';
import { useMessages } from '../../lib/i18n';
import { usePrefs } from '../../lib/prefs';
import { useTheme } from '../../lib/theme';

type Phase = 'idle' | 'loading-model' | 'retrieving' | 'generating' | 'done' | 'error';

interface Metrics {
  sourcesVisibleMs: number | null;
  loadMs: number | null;
  prewarmMs: number | null;
}

const NO_METRICS: Metrics = { sourcesVisibleMs: null, loadMs: null, prewarmMs: null };

export default function AskScreen() {
  const router = useRouter();
  const t = useMessages();
  const styles = useStyles();
  const theme = useTheme();
  const active = useActiveProfile();
  const { profile, model } = active;
  const blackout = usePrefs((s) => s.blackout);
  const numbers = useEmergencyNumbers();
  const aiCost = useEnergyCost('ai-summary', energyTier(profile));
  const [question, setQuestion] = useState('');
  /** The question as asked (the cards follow it, not the text being edited). */
  const [asked, setAsked] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [emergency, setEmergency] = useState<EmergencyMatch | null>(null);
  const [medical, setMedical] = useState<MedicalIntent | null>(null);
  const [sources, setSources] = useState<RagSource[]>([]);
  const [retrieval, setRetrieved] = useState<RetrievalResult | null>(null);
  const [streamed, setStreamed] = useState<{ text: string; source: string }[]>([]);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(NO_METRICS);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const tappedAt = useRef<number | null>(null);

  const busy = phase === 'loading-model' || phase === 'retrieving' || phase === 'generating';

  // "Sources visible": from the tap to the first frame that shows them (after React commits).
  useEffect(() => {
    if (sources.length === 0 || tappedAt.current === null) return;
    const start = tappedAt.current;
    tappedAt.current = null;
    const frame = requestAnimationFrame(() => {
      setMetrics((m) => ({ ...m, sourcesVisibleMs: performance.now() - start }));
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [sources]);

  const reset = (): void => {
    setAsked('');
    setEmergency(null);
    setMedical(null);
    setSources([]);
    setRetrieved(null);
    setStreamed([]);
    setSummary(null);
    setMetrics(NO_METRICS);
    setError(null);
  };

  const runSummary = async (r: RetrievalResult, abort: AbortController): Promise<void> => {
    setPhase('loading-model');
    setLoadProgress(0);
    const ready = await ensureModel(active, (fraction) => {
      setLoadProgress(Math.round(fraction * 100));
    }).finally(() => {
      setLoadProgress(null);
    });
    if (!ready) return;
    setMetrics((m) => ({ ...m, loadMs: ready.loaded.loadMs, prewarmMs: ready.prewarmMs }));
    if (abort.signal.aborted) return;
    setPhase('generating');
    const s = await measureEnergy('ai-summary', energyTier(profile), () =>
      summarise(r, llama, {
        signal: abort.signal,
        config: ragConfigFor(profile),
        onEvent: (e) => {
          if (e.type === 'sentence') setStreamed((list) => [...list, { text: e.text, source: e.source }]);
        },
      }),
    );
    setSummary(s);
  };

  const withController = async (work: (abort: AbortController) => Promise<void>): Promise<void> => {
    const abort = new AbortController();
    controller.current = abort;
    try {
      await work(abort);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    } finally {
      controller.current = null;
    }
  };

  const ask = (): void => {
    if (busy || question.trim().length === 0) return;
    reset();
    setAsked(question);
    tappedAt.current = performance.now();
    setPhase('retrieving');
    void withController(async (abort) => {
      const r = await retrieve(question, knowledge, {
        signal: abort.signal,
        config: ragConfigFor(profile),
        archives: ragArchives(),
        onEvent: (e) => {
          if (e.type === 'emergency') setEmergency(e.match);
          else if (e.type === 'medical') setMedical(e.intent);
          else if (e.type === 'context') setSources(e.sources);
        },
      });
      setRetrieved(r);
      // T2+: the AI summary follows Layer 1 automatically, except on medical intent and in blackout
      // mode (tap only, with the measured cost).
      if (r.status === 'ready' && model && profile.summaryMode === 'auto' && !r.medical && !blackout) await runSummary(r, abort);
    });
  };

  const summariseOnDemand = (): void => {
    if (busy || retrieval?.status !== 'ready') return;
    const r = retrieval;
    void withController((abort) => runSummary(r, abort));
  };

  const open = (p: { archiveId: string; path: string; title: string; anchor: string | null }): void => {
    router.push({
      pathname: '/article',
      params: { archiveId: p.archiveId, path: p.path, title: p.title, ...(p.anchor ? { anchor: p.anchor } : {}) },
    });
  };

  const openSource = (id: string): void => {
    const s = sources.find((x) => x.id === id);
    const passage = retrieval?.layer1?.passages.find((p) => p.sourceId === id);
    if (s) open({ archiveId: s.archiveId, path: s.path, title: s.title, anchor: passage?.anchor ?? null });
  };

  const shownSentences = summary?.status === 'shown' ? (summary.validation?.kept ?? []) : streamed;
  const unverified = (summary?.label ?? (medical ? 'unverified-ai-summary' : 'ai-summary')) === 'unverified-ai-summary';
  const canSummarise = retrieval?.status === 'ready' && model !== null && summary === null && !busy;
  const hasCards = asked.length > 0 && cardsForQuestion(asked, emergency?.topics ?? []).length > 0;
  const onDemand = profile.summaryMode === 'on-demand' || medical !== null || blackout;

  return (
    <ContentGate>
      {/* Question, Ask/Stop and the phase stay on screen while Layer 1 and the summary scroll. */}
      <View style={styles.stickyHeader}>
        <TextInput
          testID="ask-input"
          style={styles.input}
          value={question}
          onChangeText={setQuestion}
          placeholder={t.ask.placeholder}
          placeholderTextColor={theme.muted}
          accessibilityLabel={t.ask.placeholder}
          multiline
        />
        <View style={styles.row}>
          <Button testID="ask-submit" label={t.ask.submit} onPress={ask} disabled={busy} />
          <Button testID="ask-stop" label={t.ask.stop} tone="danger" onPress={() => controller.current?.abort()} disabled={!busy} />
          <Button
            testID="ask-clear"
            label={t.ask.clear}
            onPress={() => {
              setQuestion('');
              reset();
              setPhase('idle');
            }}
            disabled={busy}
          />
          <Text style={styles.muted} testID="ask-phase">
            {t.ask.phase[phase]}
          </Text>
        </View>
      </View>
      <ScrollView style={styles.screen} contentContainerStyle={{ gap: 8, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {!model && <Text style={styles.muted}>{t.ask.noModel}</Text>}
        {phase === 'loading-model' && loadProgress !== null && (
          <View style={{ gap: 4 }} testID="model-progress" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: loadProgress }}>
            <Text style={styles.muted}>{t.ask.loadingModel(loadProgress)}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${loadProgress}%` }]} />
            </View>
          </View>
        )}
        {profile.mode === 't1-simulation' && (
          <Text style={styles.muted} testID="ask-t1-simulation">
            {t.ask.simulationActive}
          </Text>
        )}

        {/* Card + number first, before anything else (architecture: "User safety"). */}
        {emergency && (
          <View style={styles.banner} testID="emergency-banner" accessibilityRole="alert">
            <Text style={styles.bannerText}>{t.ask.emergencyCall(numbers.general)}</Text>
            <Button testID="ask-call" tone="danger" label={t.emergency.call(numbers.general)} onPress={() => void Linking.openURL(`tel:${numbers.general}`).catch(() => undefined)} />
            <Text style={styles.bannerBody}>{t.ask.emergencyTopics(emergency.topics.join(', '))}</Text>
            {!numbers.known && <Text style={styles.bannerBody}>{t.emergency.defaultNumber}</Text>}
          </View>
        )}
        {!emergency && (medical || hasCards) && (
          <View style={styles.banner} testID="medical-notice" accessibilityRole="alert">
            <Text style={styles.bannerText}>{t.ask.medicalNotice(numbers.general)}</Text>
            <Button testID="ask-call" tone="danger" label={t.emergency.call(numbers.general)} onPress={() => void Linking.openURL(`tel:${numbers.general}`).catch(() => undefined)} />
          </View>
        )}
        {asked.length > 0 && <EmergencyCardSlot question={asked} topics={emergency?.topics ?? []} />}
        {blackout && retrieval?.status === 'ready' && model && (
          <Text style={styles.muted} testID="ask-blackout-ai-off">
            {t.blackout.aiOff}
          </Text>
        )}

        {retrieval?.status === 'no_source' && (
          <View style={styles.banner}>
            <Text style={styles.bannerText} testID="no-source">
              {t.ask.noSource}
            </Text>
            <Text style={styles.muted}>
              {t.ask.noSourceDetail({
                reason: retrieval.noSourceReason ?? '–',
                coverage: retrieval.best?.coverage.toFixed(2) ?? '–',
              })}
            </Text>
          </View>
        )}

        {retrieval?.layer1 && retrieval.layer1.passages.length > 0 && (
          <View style={{ gap: 8 }} testID="layer1">
            <Text style={styles.title}>{t.ask.fromSources}</Text>
            {retrieval.layer1.passages.map((p, i) => (
              <Passage
                key={p.sourceId}
                passage={p}
                index={i}
                label={t.ask.sourceLabel({ id: p.sourceId, title: p.title, heading: p.heading })}
                onOpen={() => {
                  open(p);
                }}
              />
            ))}
          </View>
        )}

        {(phase === 'generating' || shownSentences.length > 0) && (
          <View style={styles.summary} testID="ai-summary">
            <Text style={styles.summaryLabel} testID="ai-label">
              {unverified ? t.ask.unverifiedAiLabel : t.ask.aiLabel}
            </Text>
            {phase === 'generating' && shownSentences.length === 0 && (
              <Text style={styles.muted} testID="answer-progress">
                {t.ask.writing}
              </Text>
            )}
            {shownSentences.map((s, i) => (
              <View key={`${s.source}-${i}`} style={styles.row}>
                <Text style={[styles.text, { flexShrink: 1 }]} selectable testID={`answer-sentence-${i}`}>
                  {s.text}
                </Text>
                <Pressable
                  accessibilityRole="link"
                  testID={`citation-${s.source}`}
                  style={styles.chip}
                  onPress={() => {
                    openSource(s.source);
                  }}
                >
                  <Text style={styles.chipText}>[{s.source}]</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
        {summary && summary.status !== 'shown' && (
          <Text style={styles.muted} testID="summary-hidden">
            {summary.hiddenReason === 'not_covered' ? t.ask.summaryNotCovered : t.ask.summaryHidden}
          </Text>
        )}

        {canSummarise && onDemand && (
          <Button testID="ask-summarise" label={medical ? t.ask.summariseMedical : t.ask.summarise} cost={aiCost} onPress={summariseOnDemand} />
        )}

        {retrieval && (
          <Text style={styles.mono} testID="ask-metrics">
            {[
              `status=${retrieval.status} lang=${retrieval.lang} medical=${retrieval.medical ? 'yes' : 'no'}`,
              `layer1=${retrieval.timings.layer1Ms}ms sourcesVisible=${metrics.sourcesVisibleMs?.toFixed(0) ?? '–'}ms`,
              `retrieval=${retrieval.timings.retrievalMs}ms extract=${retrieval.timings.extractMs}ms rank=${retrieval.timings.rankMs}ms`,
              retrieval.budget
                ? `budget=${retrieval.budget.tier}/${retrieval.budget.lang} ${retrieval.budget.chars} chars ~${retrieval.budget.tokens} tok, sources=${retrieval.sources.length}`
                : null,
              metrics.loadMs !== null ? `modelLoad=${metrics.loadMs}ms prewarm=${metrics.prewarmMs ?? 0}ms` : null,
              summary
                ? `ttft=${summary.generation.timeToFirstTokenMs ?? '–'}ms tok/s=${summary.generation.tokensPerSecond?.toFixed(1) ?? '–'} prompt=${summary.generation.promptTokens} cached=${summary.generation.cachedPromptTokens} gen=${summary.generation.generatedTokens} stop=${summary.generation.stopReason}`
                : null,
              summary?.validation
                ? `summary=${summary.status} kept=${summary.validation.kept.length}/${summary.validation.sentences.length} cited=${summary.validation.cited.join(',') || '-'} rejected=${summary.validation.sentences.filter((s) => !s.kept).map((s) => s.reason ?? 'not-covered').join(',') || '-'}`
                : summary
                  ? `summary=${summary.status} (${summary.hiddenReason ?? ''})`
                  : null,
              `keywords=${retrieval.keywords.join(' ')}`,
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

/**
 * One Layer 1 passage: the matching sentences (with "…" where the passage skips text), and the whole
 * passage on request. Showing every passage in full pushed the AI summary off the first screen.
 */
function Passage({ passage, index, onOpen, label }: { passage: Layer1Passage; index: number; onOpen: () => void; label: string }) {
  const t = useMessages();
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const highlighted = passage.sentences.flatMap((s, i) => (s.highlighted ? [i] : []));
  const shown = expanded || highlighted.length === 0 ? passage.sentences.map((_, i) => i) : highlighted;
  const canExpand = shown.length < passage.sentences.length || expanded;
  return (
    <View style={styles.passage} testID={`layer1-passage-${index}`}>
      <Pressable accessibilityRole="link" testID={`layer1-source-${passage.sourceId}`} style={styles.chip} onPress={onOpen}>
        <Text style={styles.chipText}>{label}</Text>
      </Pressable>
      <UnverifiedLabel archiveId={passage.archiveId} />
      <Text style={styles.text} selectable>
        {shown.map((i, k) => {
          const s = passage.sentences[i];
          if (!s) return null;
          const gap = k > 0 && i !== (shown[k - 1] ?? -1) + 1;
          return (
            <Text key={i} style={s.highlighted ? styles.highlight : undefined}>
              {k > 0 ? (gap ? ' … ' : ' ') : i > 0 ? '… ' : ''}
              {s.text}
            </Text>
          );
        })}
      </Text>
      {canExpand && (
        <Pressable
          testID={`layer1-toggle-${index}`}
          accessibilityRole="button"
          onPress={() => {
            setExpanded((e) => !e);
          }}
        >
          <Text style={styles.link}>{expanded ? t.ask.hidePassage : t.ask.showPassage}</Text>
        </Pressable>
      )}
    </View>
  );
}
