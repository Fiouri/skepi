import {
  retrieve,
  summarise,
  SYSTEM_PROMPT,
  type EmergencyMatch,
  type Layer1Passage,
  type MedicalIntent,
  type RagSource,
  type RetrievalResult,
  type SummaryResult,
} from '@skepi/core';
import { cardsForQuestion } from '@skepi/emergency-cards';
import { useRef, useState } from 'react';
import { useNav } from '../App';
import { EmergencyCardSlot, useEmergencyNumbers } from '../components/Cards';
import { Banner, Button, errorText, UnverifiedLabel } from '../components/ui';
import { useMessages } from '../lib/i18n';
import { ipc } from '../lib/ipc';
import { knowledge, llama, ragArchives, ragConfigFor, useActiveProfile, useApp, type ActiveProfile } from '../lib/store';

type Phase = 'idle' | 'loading-model' | 'retrieving' | 'generating' | 'done' | 'error';

/** Loads the profile's model (no-op when loaded) and prefills the fixed system prompt (KV prefix reuse). */
async function ensureModel(active: ActiveProfile, onProgress: (f: number) => void): Promise<boolean> {
  if (!active.model) return false;
  const before = llama.current;
  await llama.load(active.model, active.profile.load, onProgress);
  if (!before || before.modelId !== active.model.id) {
    // Prefill: the system prompt is the common prefix of every later request.
    await llama.generate(
      { messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: '' }], maxTokens: 1, temperature: 0 },
      () => undefined,
      new AbortController().signal,
    );
  }
  return true;
}

export function AskScreen() {
  const t = useMessages();
  const nav = useNav();
  const active = useActiveProfile();
  const { profile, model } = active;
  const blackout = useApp((s) => s.blackout);
  const archives = useApp((s) => s.archives);
  const numbers = useEmergencyNumbers();
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [emergency, setEmergency] = useState<EmergencyMatch | null>(null);
  const [medical, setMedical] = useState<MedicalIntent | null>(null);
  const [sources, setSources] = useState<RagSource[]>([]);
  const [found, setFound] = useState<RetrievalResult | null>(null);
  const [streamed, setStreamed] = useState<{ text: string; source: string }[]>([]);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = phase === 'loading-model' || phase === 'retrieving' || phase === 'generating';

  const reset = (): void => {
    setAsked('');
    setEmergency(null);
    setMedical(null);
    setSources([]);
    setFound(null);
    setStreamed([]);
    setSummary(null);
    setError(null);
  };

  const runSummary = async (r: RetrievalResult, abort: AbortController): Promise<void> => {
    setPhase('loading-model');
    setLoadProgress(0);
    const ready = await ensureModel(active, (f) => {
      setLoadProgress(Math.round(f * 100));
    }).finally(() => {
      setLoadProgress(null);
    });
    if (!ready || abort.signal.aborted) return;
    setPhase('generating');
    const s = await summarise(r, llama, {
      signal: abort.signal,
      config: ragConfigFor(profile),
      onEvent: (e) => {
        if (e.type === 'sentence') setStreamed((list) => [...list, { text: e.text, source: e.source }]);
      },
    });
    setSummary(s);
  };

  const withController = async (work: (abort: AbortController) => Promise<void>): Promise<void> => {
    const abort = new AbortController();
    controller.current = abort;
    try {
      await work(abort);
      setPhase('done');
    } catch (e) {
      setError(errorText(e));
      setPhase('error');
    } finally {
      controller.current = null;
    }
  };

  const ask = (): void => {
    if (busy || question.trim().length === 0) return;
    reset();
    setAsked(question);
    setPhase('retrieving');
    void withController(async (abort) => {
      const r = await retrieve(question, knowledge, {
        signal: abort.signal,
        config: ragConfigFor(profile),
        archives: ragArchives(archives),
        onEvent: (e) => {
          if (e.type === 'emergency') setEmergency(e.match);
          else if (e.type === 'medical') setMedical(e.intent);
          else if (e.type === 'context') setSources(e.sources);
        },
      });
      setFound(r);
      // T2+/T3: the AI summary follows Layer 1, except on medical intent and in blackout mode.
      if (r.status === 'ready' && model && profile.summaryMode === 'auto' && !r.medical && !blackout) await runSummary(r, abort);
    });
  };

  const summariseOnDemand = (): void => {
    if (busy || found?.status !== 'ready') return;
    const r = found;
    void withController((abort) => runSummary(r, abort));
  };

  const open = (p: { archiveId: string; path: string; title: string; anchor: string | null }): void => {
    void ipc.viewerOpen(p.archiveId, p.path, p.title, blackout, p.anchor).catch((e: unknown) => {
      setError(errorText(e));
    });
  };

  const openSource = (id: string): void => {
    const s = sources.find((x) => x.id === id);
    const passage = found?.layer1?.passages.find((p) => p.sourceId === id);
    if (s) open({ archiveId: s.archiveId, path: s.path, title: s.title, anchor: passage?.anchor ?? null });
  };

  const shown = summary?.status === 'shown' ? (summary.validation?.kept ?? []) : streamed;
  const unverified = (summary?.label ?? (medical ? 'unverified-ai-summary' : 'ai-summary')) === 'unverified-ai-summary';
  const canSummarise = found?.status === 'ready' && model !== null && summary === null && !busy;
  const hasCards = asked.length > 0 && cardsForQuestion(asked, emergency?.topics ?? []).length > 0;
  const onDemand = profile.summaryMode === 'on-demand' || medical !== null || blackout;

  return (
    <section className="stack" data-testid="ask-screen">
      <h1>{t.tabs.ask}</h1>
      <textarea
        data-testid="ask-input"
        rows={2}
        value={question}
        aria-label={t.ask.placeholder}
        placeholder={t.ask.placeholder}
        onChange={(e) => {
          setQuestion(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            ask();
          }
        }}
      />
      <div className="row">
        <Button testId="ask-submit" label={t.ask.submit} onClick={ask} disabled={busy} />
        <Button testId="ask-stop" label={t.ask.stop} tone="danger" onClick={() => controller.current?.abort()} disabled={!busy} />
        <Button
          testId="ask-clear"
          tone="plain"
          label={t.ask.clear}
          onClick={() => {
            setQuestion('');
            reset();
            setPhase('idle');
          }}
          disabled={busy}
        />
        <span className="muted" data-testid="ask-phase">
          {t.ask.phase[phase]}
        </span>
      </div>
      {!model && <p className="muted">{t.ask.noModel}</p>}
      {profile.mode === 't1-simulation' && <p className="muted">{t.ask.simulationActive}</p>}
      {phase === 'loading-model' && loadProgress !== null && (
        <div data-testid="model-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loadProgress}>
          <span className="muted">{t.ask.loadingModel(loadProgress)}</span>
          <div className="progress">
            <div style={{ width: `${String(loadProgress)}%` }} />
          </div>
        </div>
      )}

      {emergency && (
        <Banner tone="danger" testId="emergency-banner" role="alert">
          <strong>{t.ask.emergencyCall(numbers.general)}</strong>
          <div>{t.ask.emergencyTopics(emergency.topics.join(', '))}</div>
          {!numbers.known && <div>{t.emergency.defaultNumber}</div>}
        </Banner>
      )}
      {!emergency && (medical !== null || hasCards) && (
        <Banner tone="danger" testId="medical-notice" role="alert">
          {t.ask.medicalNotice(numbers.general)}
        </Banner>
      )}
      {asked.length > 0 && <EmergencyCardSlot question={asked} topics={emergency?.topics ?? []} onOpen={nav.openCard} />}
      {blackout && found?.status === 'ready' && model && <p className="muted">{t.blackout.aiOff}</p>}

      {found?.status === 'no_source' && (
        <Banner tone="info">
          <strong data-testid="no-source">{t.ask.noSource}</strong>
          <div className="muted">{t.ask.noSourceDetail({ reason: found.noSourceReason ?? '–', coverage: found.best?.coverage.toFixed(2) ?? '–' })}</div>
        </Banner>
      )}

      {found?.layer1 && found.layer1.passages.length > 0 && (
        <div className="stack" data-testid="layer1">
          <h2>{t.ask.fromSources}</h2>
          {found.layer1.passages.map((p, i) => (
            <Passage
              key={p.sourceId}
              passage={p}
              index={i}
              onOpen={() => {
                open(p);
              }}
              label={t.ask.sourceLabel({ id: p.sourceId, title: p.title, heading: p.heading })}
            />
          ))}
        </div>
      )}

      {(phase === 'generating' || shown.length > 0) && (
        <div className="summary stack" data-testid="ai-summary">
          <strong data-testid="ai-label">{unverified ? t.ask.unverifiedAiLabel : t.ask.aiLabel}</strong>
          {phase === 'generating' && shown.length === 0 && <span className="muted">{t.ask.writing}</span>}
          {shown.map((s, i) => (
            <div key={`${s.source}-${String(i)}`} className="row">
              <span data-testid={`answer-sentence-${String(i)}`}>{s.text}</span>
              <button
                type="button"
                className="chip"
                data-testid={`citation-${s.source}`}
                onClick={() => {
                  openSource(s.source);
                }}
              >
                [{s.source}]
              </button>
            </div>
          ))}
        </div>
      )}
      {summary && summary.status !== 'shown' && (
        <p className="muted" data-testid="summary-hidden">
          {summary.hiddenReason === 'not_covered' ? t.ask.summaryNotCovered : t.ask.summaryHidden}
        </p>
      )}
      {canSummarise && onDemand && <Button testId="ask-summarise" label={medical ? t.ask.summariseMedical : t.ask.summarise} onClick={summariseOnDemand} />}

      {found && (
        <div className="mono" data-testid="ask-metrics">
          {[
            `status=${found.status} lang=${found.lang} medical=${found.medical ? 'yes' : 'no'} tier=${profile.effectiveTier}`,
            `layer1=${String(found.timings.layer1Ms)}ms retrieval=${String(found.timings.retrievalMs)}ms`,
            found.budget ? `budget=${found.budget.tier}/${found.budget.lang} ${String(found.budget.chars)} chars, sources=${String(found.sources.length)}` : null,
            llama.current ? `model=${llama.current.modelId} gpu=${llama.current.gpu ? llama.current.devices.join(',') : `no (${llama.current.reasonNoGpu})`}` : null,
            summary
              ? `ttft=${String(summary.generation.timeToFirstTokenMs ?? '–')}ms tok/s=${summary.generation.tokensPerSecond?.toFixed(1) ?? '–'} prompt=${String(summary.generation.promptTokens)} cached=${String(summary.generation.cachedPromptTokens)}`
              : null,
            summary?.validation ? `summary=${summary.status} kept=${String(summary.validation.kept.length)}/${String(summary.validation.sentences.length)}` : null,
          ]
            .filter(Boolean)
            .join('\n')}
        </div>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
    </section>
  );
}

function Passage({ passage, index, onOpen, label }: { passage: Layer1Passage; index: number; onOpen: () => void; label: string }) {
  const t = useMessages();
  const [expanded, setExpanded] = useState(false);
  const highlighted = passage.sentences.flatMap((s, i) => (s.highlighted ? [i] : []));
  const shown = expanded || highlighted.length === 0 ? passage.sentences.map((_, i) => i) : highlighted;
  return (
    <div className="card stack" data-testid={`layer1-passage-${String(index)}`}>
      <div>
        <button type="button" className="chip" data-testid={`layer1-source-${passage.sourceId}`} onClick={onOpen}>
          {label}
        </button>
      </div>
      <UnverifiedLabel archiveId={passage.archiveId} />
      <p style={{ margin: 0 }}>
        {shown.map((i, k) => {
          const s = passage.sentences[i];
          if (!s) return null;
          const gap = k > 0 && i !== (shown[k - 1] ?? -1) + 1;
          return (
            <span key={i} className={s.highlighted ? 'highlight' : undefined}>
              {k > 0 ? (gap ? ' … ' : ' ') : i > 0 ? '… ' : ''}
              {s.text}
            </span>
          );
        })}
      </p>
      {(shown.length < passage.sentences.length || expanded) && (
        <div>
          <button
            type="button"
            className="btn plain"
            data-testid={`layer1-toggle-${String(index)}`}
            onClick={() => {
              setExpanded((e) => !e);
            }}
          >
            {expanded ? t.ask.hidePassage : t.ask.showPassage}
          </button>
        </div>
      )}
    </div>
  );
}
