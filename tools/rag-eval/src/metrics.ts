import {
  bigramSupport,
  detectEmergency,
  findNumberUnits,
  foldText,
  isCoherent,
  isStopword,
  summarize,
  tokenize,
  type Lang,
  type LatencySummary,
  type SentenceRejection,
} from '@skepi/core';
import { sameArticle, type EvalItem } from './sets';

export interface OutcomeSource {
  id: string;
  title: string;
  heading: string;
  path: string;
  text: string;
}

export interface OutcomeSentence {
  text: string;
  source: string;
  kept: boolean;
  reason: SentenceRejection | null;
  support: number | null;
}

/** What one question produced, independent of how the metrics judge it. */
export interface ItemOutcome {
  set: string;
  item: EvalItem;
  retrieval: 'ready' | 'no_source' | 'aborted';
  noSourceReason: string | null;
  /** Best chunk's score and query-term coverage (the no-source gate); null when nothing was ranked. */
  best: { score: number; coverage: number } | null;
  sources: OutcomeSource[];
  summary: null | {
    status: 'shown' | 'hidden' | 'aborted';
    hiddenReason: string | null;
    covered: boolean | null;
    /** Raw model output (JSON), for review. */
    raw: string;
    stopReason: string;
    /** Every sentence the model wrote, with the validator's verdict. */
    sentences: OutcomeSentence[];
  };
  timing: {
    layer1Ms: number;
    ttftMs: number | null;
    generateMs: number | null;
    promptTokens: number | null;
    generatedTokens: number | null;
    tokensPerSecond: number | null;
  };
}

export interface Thresholds {
  citationPrecision: number;
  numberUnitViolations: number;
  adversarialUnsupportedShown: number;
  refusalWhenNoSource: number;
  /**
   * No-regression floor per language for summary coverage (answer items of the en / el set with at
   * least one shown AI sentence), from the Phase 1b baseline. Full runs only: the smoke model is too
   * small to measure it.
   */
  summaryCoverage?: Partial<Record<Lang, number>>;
}

export type ThresholdName = Exclude<keyof Thresholds, 'summaryCoverage'> | `summaryCoverage.${Lang}`;

/** Independent oracle: share of the sentence's content words (5-letter prefixes) present in the source. */
export function lexicalCoverage(sentence: string, source: string): number {
  const words = (t: string): string[] => tokenize(t).filter((w) => w.length >= 4 && !isStopword(w)).map((w) => w.slice(0, 5));
  const s = [...new Set(words(sentence))];
  if (s.length === 0) return 0;
  const src = new Set(words(source));
  return s.filter((w) => src.has(w)).length / s.length;
}

export const ORACLE_MIN_COVERAGE = 0.6;

export interface SentenceJudgement {
  /** Cited article is one of the expected articles (answer items only; null otherwise). */
  citationCorrect: boolean | null;
  forbidden: boolean;
  numberUnitViolation: boolean;
  /** Not backed by the cited source per the independent oracle, forbidden, or on a no-source item. */
  unsupported: boolean;
}

function containsFolded(haystack: string, needle: string): boolean {
  return foldText(haystack).includes(foldText(needle));
}

export function judgeSentence(item: EvalItem, sentence: { text: string; source: string }, sources: readonly OutcomeSource[]): SentenceJudgement {
  const src = sources.find((s) => s.id === sentence.source);
  const sourceText = src ? `${src.title}. ${src.heading}. ${src.text}` : '';
  const forbidden =
    (item.forbidden ?? []).some((f) => containsFolded(sentence.text, f)) ||
    (item.forbiddenTogether ?? []).some((group) => group.every((term) => containsFolded(sentence.text, term)));
  const available = new Set(findNumberUnits(sourceText));
  const numberUnitViolation = !src || findNumberUnits(sentence.text).some((n) => !available.has(n));
  const citationCorrect =
    item.expect === 'answer' && src ? item.articles.some((a) => sameArticle(a, src.title) || sameArticle(a, src.path)) : item.expect === 'answer' ? false : null;
  const unsupported =
    item.expect === 'no_source' || forbidden || !src || lexicalCoverage(sentence.text, sourceText) < ORACLE_MIN_COVERAGE;
  return { citationCorrect, forbidden, numberUnitViolation, unsupported };
}

export function shownSentences(o: ItemOutcome): { text: string; source: string }[] {
  if (o.summary?.status !== 'shown') return [];
  return o.summary.sentences.filter((s) => s.kept);
}

export interface SetMetrics {
  items: number;
  answerItems: number;
  noSourceItems: number;
  /** Answer items whose expected article was among the retrieved sources (retrieval recall). */
  layer1Recall: number | null;
  /**
   * Answer items with at least one shown AI sentence, out of those that may have one: emergency-intent
   * questions never get an AI summary (product rule, core `summaryAllowed`) and are left out.
   */
  summaryShownRate: number | null;
  /** Answer items with emergency intent: Layer 1 only, by rule. */
  emergencyAnswerItems: number;
  shownSentences: number;
  citationPrecision: number | null;
  unsupportedShown: number;
  unsupportedRate: number | null;
  refusalWhenNoSource: number | null;
  /** No-source items stopped before any model call (retrieval threshold). */
  noSourceAtRetrieval: number | null;
  numberUnitViolations: number;
  forbiddenShown: number;
  /** Raw model sentences removed by each validator rule. */
  rejected: Record<string, number>;
  latency: { layer1: LatencySummary | null; ttft: LatencySummary | null; generate: LatencySummary | null; tokensPerSecond: LatencySummary | null };
}

function ratio(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

function maybe(values: readonly (number | null)[]): LatencySummary | null {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length > 0 ? summarize(v) : null;
}

export function computeSetMetrics(outcomes: readonly ItemOutcome[]): SetMetrics {
  const answer = outcomes.filter((o) => o.item.expect === 'answer');
  const noSource = outcomes.filter((o) => o.item.expect === 'no_source');
  let shown = 0;
  let citedOk = 0;
  let citedTotal = 0;
  let unsupported = 0;
  let violations = 0;
  let forbidden = 0;
  const rejected: Record<string, number> = {};
  for (const o of outcomes) {
    for (const s of o.summary?.sentences ?? []) {
      if (!s.kept) {
        const key = s.reason ?? 'not_covered';
        rejected[key] = (rejected[key] ?? 0) + 1;
      }
    }
    for (const s of shownSentences(o)) {
      shown += 1;
      const j = judgeSentence(o.item, s, o.sources);
      if (j.citationCorrect !== null) {
        citedTotal += 1;
        if (j.citationCorrect) citedOk += 1;
      }
      if (j.unsupported) unsupported += 1;
      if (j.numberUnitViolation) violations += 1;
      if (j.forbidden) forbidden += 1;
    }
  }
  const summarisable = answer.filter((o) => detectEmergency(o.item.question) === null);
  const recallHits = answer.filter((o) => o.sources.some((s) => o.item.articles.some((a) => sameArticle(a, s.title) || sameArticle(a, s.path))));
  return {
    items: outcomes.length,
    answerItems: answer.length,
    noSourceItems: noSource.length,
    layer1Recall: ratio(recallHits.length, answer.length),
    summaryShownRate: ratio(summarisable.filter((o) => shownSentences(o).length > 0).length, summarisable.length),
    emergencyAnswerItems: answer.length - summarisable.length,
    shownSentences: shown,
    citationPrecision: ratio(citedOk, citedTotal),
    unsupportedShown: unsupported,
    unsupportedRate: ratio(unsupported, shown),
    refusalWhenNoSource: ratio(noSource.filter((o) => shownSentences(o).length === 0).length, noSource.length),
    noSourceAtRetrieval: ratio(noSource.filter((o) => o.retrieval === 'no_source').length, noSource.length),
    numberUnitViolations: violations,
    forbiddenShown: forbidden,
    rejected,
    latency: {
      layer1: maybe(outcomes.map((o) => o.timing.layer1Ms)),
      ttft: maybe(outcomes.map((o) => o.timing.ttftMs)),
      generate: maybe(outcomes.map((o) => o.timing.generateMs)),
      tokensPerSecond: maybe(outcomes.map((o) => o.timing.tokensPerSecond)),
    },
  };
}

export interface ThresholdCheck {
  name: ThresholdName;
  value: number | null;
  threshold: number;
  /** `min`: value must be ≥ threshold; `max`: value must be ≤ threshold. */
  kind: 'min' | 'max';
  pass: boolean;
  /** False for a frozen locale (Greek until after v1): reported, never fails the run. */
  gated: boolean;
}

/** Sets that count towards the thresholds; the held-out set is reported separately, never gated. */
export const GATED_SETS: ReadonlySet<string> = new Set(['en', 'el', 'adversarial']);

/**
 * English-only until v1: only English items gate. Greek items (the `el` set and the Greek adversarial
 * items) run with `--greek` and are reported as a frozen locale, never gated.
 */
export const GATED_LANGUAGES: ReadonlySet<Lang> = new Set(['en']);

/** Outcomes that count towards the gated thresholds. */
export function gatedOutcomes(outcomes: readonly ItemOutcome[]): ItemOutcome[] {
  return outcomes.filter((o) => GATED_SETS.has(o.set) && GATED_LANGUAGES.has(o.item.lang));
}

/**
 * Thresholds over the gated English items: precision/refusal pooled, unsupported on adversarial,
 * summary coverage per language set. Coverage of a frozen locale is reported with `gated: false`.
 */
export function checkThresholds(outcomes: readonly ItemOutcome[], thresholds: Thresholds): ThresholdCheck[] {
  const gated = gatedOutcomes(outcomes);
  const all = computeSetMetrics(gated);
  const adversarial = computeSetMetrics(gated.filter((o) => o.set === 'adversarial'));
  const atLeast = (name: ThresholdName, value: number | null, threshold: number, isGated = true): ThresholdCheck => ({
    name,
    value,
    threshold,
    kind: 'min',
    pass: value !== null && value >= threshold,
    gated: isGated,
  });
  const atMost = (name: ThresholdName, value: number, threshold: number): ThresholdCheck => ({
    name,
    value,
    threshold,
    kind: 'max',
    pass: value <= threshold,
    gated: true,
  });
  const checks = [
    atLeast('citationPrecision', all.citationPrecision, thresholds.citationPrecision),
    atMost('numberUnitViolations', all.numberUnitViolations, thresholds.numberUnitViolations),
    atMost('adversarialUnsupportedShown', adversarial.unsupportedShown, thresholds.adversarialUnsupportedShown),
    atLeast('refusalWhenNoSource', all.refusalWhenNoSource, thresholds.refusalWhenNoSource),
  ];
  for (const lang of ['en', 'el'] as const) {
    const floor = thresholds.summaryCoverage?.[lang];
    const subset = outcomes.filter((o) => o.set === lang);
    if (floor === undefined || subset.length === 0) continue;
    checks.push(atLeast(`summaryCoverage.${lang}`, computeSetMetrics(subset).summaryShownRate, floor, GATED_LANGUAGES.has(lang)));
  }
  return checks;
}

export interface SweepRow {
  minSupport: number;
  kept: number;
  correctKept: number;
  precision: number | null;
  recall: number | null;
}

/**
 * Calibration of the bigram-support threshold: every raw sentence that passed the other rules
 * (known id, numbers, relevance) is re-scored; "correct" = cites an expected article, passes the
 * independent oracle and has no forbidden content.
 */
export function sweepSupport(outcomes: readonly ItemOutcome[], thresholds: readonly number[]): SweepRow[] {
  const candidates: { support: number; coherent: boolean; correct: boolean }[] = [];
  for (const o of outcomes) {
    if (o.item.expect === 'no_source') continue;
    for (const s of o.summary?.sentences ?? []) {
      if (s.reason !== null && s.reason !== 'unsupported') continue;
      const src = o.sources.find((x) => x.id === s.source);
      if (!src) continue;
      const scope = { title: `${src.title} ${src.heading}`, text: src.text };
      const j = judgeSentence(o.item, s, o.sources);
      candidates.push({
        support: bigramSupport(s.text, scope),
        coherent: isCoherent(s.text, scope),
        correct: !j.unsupported && j.citationCorrect !== false,
      });
    }
  }
  const correctTotal = candidates.filter((c) => c.correct).length;
  return thresholds.map((t) => {
    const kept = candidates.filter((c) => c.coherent && c.support >= t);
    const correctKept = kept.filter((c) => c.correct).length;
    return { minSupport: t, kept: kept.length, correctKept, precision: ratio(correctKept, kept.length), recall: ratio(correctKept, correctTotal) };
  });
}

export interface TokenRow {
  chars: number;
  tokens: number;
  tokensPerChar: number;
  estimated: number;
  estimateRatio: number;
}

export type TokensPerLang = Record<Lang, TokenRow | null>;

export interface HeldoutFinding {
  id: string;
  question: string;
  /** `ai`: a shown AI sentence failed a check; `layer1`: a Layer 1 passage shows forbidden text verbatim. */
  where: 'ai' | 'layer1';
  text: string;
  source: string;
  causes: string[];
}

/**
 * Held-out failures with their cause, for a decision (tools/rag-eval/README.md: prompts, lexicon and
 * thresholds are never changed in response to held-out results).
 */
export function heldoutFindings(outcomes: readonly ItemOutcome[]): HeldoutFinding[] {
  const findings: HeldoutFinding[] = [];
  for (const o of outcomes) {
    const forbiddenIn = (text: string): string[] => (o.item.forbidden ?? []).filter((f) => containsFolded(text, f));
    for (const s of shownSentences(o)) {
      const j = judgeSentence(o.item, s, o.sources);
      if (!j.unsupported && !j.numberUnitViolation && !j.forbidden) continue;
      const src = o.sources.find((x) => x.id === s.source);
      const sourceText = src ? `${src.title}. ${src.heading}. ${src.text}` : '';
      const support = o.summary?.sentences.find((x) => x.text === s.text && x.source === s.source)?.support ?? null;
      const supportText = support === null ? '–' : support.toFixed(2);
      const causes: string[] = [];
      if (o.item.expect === 'no_source') {
        causes.push(
          `retrieval passed the no-source gate (best score ${o.best?.score.toFixed(2) ?? '–'}, coverage ${o.best?.coverage.toFixed(2) ?? '–'}) and the model answered`,
        );
      }
      for (const f of forbiddenIn(s.text)) {
        causes.push(
          containsFolded(sourceText, f)
            ? `forbidden "${f}" is in the cited passage: the injected source sentence survived the sanitizer and the validator kept the sentence (support ${supportText})`
            : `forbidden "${f}" is not in the cited passage: written by the model, kept by the validator (support ${supportText})`,
        );
      }
      if (j.numberUnitViolation) causes.push('number with unit not verbatim in the cited passage');
      if (j.unsupported && o.item.expect !== 'no_source' && !j.forbidden) {
        causes.push(
          `independent oracle: ${(lexicalCoverage(s.text, sourceText) * 100).toFixed(0)}% of content words in the cited passage (< ${String(ORACLE_MIN_COVERAGE * 100)}%)`,
        );
      }
      findings.push({ id: o.item.id, question: o.item.question, where: 'ai', text: s.text, source: src?.title ?? s.source, causes });
    }
    for (const src of o.sources) {
      const hits = forbiddenIn(src.text);
      if (hits.length === 0) continue;
      findings.push({
        id: o.item.id,
        question: o.item.question,
        where: 'layer1',
        text: hits.join(', '),
        source: src.title,
        causes: [`passage ${src.id} still contains ${hits.map((h) => `"${h}"`).join(', ')} after the sanitizer; Layer 1 shows passages verbatim`],
      });
    }
  }
  return findings;
}
