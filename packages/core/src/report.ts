import type { Layer1Answer } from './extractive';

/**
 * "Report a problem with this answer": the text the user copies, saves or hands to the system share
 * sheet and sends themselves. It holds only the question, what was shown (Layer 1 excerpts and AI
 * sentences), the cited sources, the app version and what the user wrote: no time, device, location,
 * settings or other questions. The app makes no network call for it.
 */
export interface ProblemReportLabels {
  title: string;
  question: string;
  layer1: string;
  ai: string;
  noAi: string;
  sources: string;
  version: string;
  /** Placeholder line when the user wrote nothing (they fill it in where they send the report). */
  describe: string;
  /** Heading of the user's own text. */
  userText: string;
}

export interface ProblemReportSource {
  id: string;
  title: string;
  heading: string;
  path: string;
}

export interface ProblemReportInput {
  /** e.g. "S.K.E.P.I. 0.1.1-preview (Android)". */
  appVersion: string;
  question: string;
  layer1: Layer1Answer | null;
  /** AI sentences that were shown (kept by the validator), with their cited source id. */
  aiSentences: readonly { text: string; source: string }[];
  sources: readonly ProblemReportSource[];
  /** What the user wrote about the problem (may be empty). */
  description?: string;
}

/**
 * The plain marker line every shared or copied text carries when it contains an AI summary (EU AI Act
 * Art. 50: AI-generated text is marked as such, also outside the app). Fixed English, never localised.
 */
export const AI_GENERATED_MARKER = 'AI-generated summary';

/** Longest user text kept in a report (the input field has the same limit). */
export const PROBLEM_REPORT_MAX_DESCRIPTION = 2000;

export function problemReportText(input: ProblemReportInput, labels: ProblemReportLabels): string {
  const lines: string[] = [labels.title, `${labels.version}: ${input.appVersion}`, '', `${labels.question}:`, input.question.trim(), ''];
  const passages = input.layer1?.passages ?? [];
  if (passages.length > 0) {
    lines.push(`${labels.layer1}:`);
    for (const p of passages) {
      const shown = p.sentences.filter((s) => s.highlighted).map((s) => s.text);
      const heading = p.heading ? ` — ${p.heading}` : '';
      lines.push(`[${p.sourceId}] ${p.title}${heading}: ${(shown.length > 0 ? shown : p.sentences.slice(0, 1).map((s) => s.text)).join(' ')}`);
    }
    lines.push('');
  }
  if (input.aiSentences.length > 0) {
    lines.push(AI_GENERATED_MARKER, `${labels.ai}:`);
    for (const s of input.aiSentences) lines.push(`- ${s.text} [${s.source}]`);
  } else {
    lines.push(`${labels.noAi}.`);
  }
  lines.push('');
  if (input.sources.length > 0) {
    lines.push(`${labels.sources}:`);
    for (const s of input.sources) lines.push(`[${s.id}] ${s.title}${s.heading ? ` — ${s.heading}` : ''} (${s.path})`);
    lines.push('');
  }
  const description = (input.description ?? '').trim().slice(0, PROBLEM_REPORT_MAX_DESCRIPTION);
  if (description) lines.push(`${labels.userText}:`, description, '');
  else lines.push(labels.describe, '');
  return lines.join('\n');
}

export interface ProblemReportShare {
  /** Subject for e-mail apps (EXTRA_SUBJECT on Android). */
  subject: string;
  /** The report text (EXTRA_TEXT). */
  message: string;
}

/**
 * Content for the system share sheet: the user picks the app and sends it; SKEPI opens no connection.
 */
export function problemReportShare(input: ProblemReportInput, labels: ProblemReportLabels): ProblemReportShare {
  return { subject: `${labels.title} (${input.appVersion})`, message: problemReportText(input, labels) };
}
