import type { Layer1Answer } from './extractive';

/**
 * "Report a problem with this answer" (Developer Preview): the text the user copies or saves and sends
 * themselves. It holds only the question, what was shown (Layer 1 excerpts and AI sentences), the cited
 * sources and the app version: no time, device, location, settings or other questions. The app makes
 * no network call for it.
 */
export interface ProblemReportLabels {
  title: string;
  question: string;
  layer1: string;
  ai: string;
  noAi: string;
  sources: string;
  version: string;
  describe: string;
}

export interface ProblemReportSource {
  id: string;
  title: string;
  heading: string;
  path: string;
}

export interface ProblemReportInput {
  /** e.g. "SKEPI 0.1.0-preview (Android)". */
  appVersion: string;
  question: string;
  layer1: Layer1Answer | null;
  /** AI sentences that were shown (kept by the validator), with their cited source id. */
  aiSentences: readonly { text: string; source: string }[];
  sources: readonly ProblemReportSource[];
}

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
    lines.push(`${labels.ai}:`);
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
  lines.push(labels.describe, '');
  return lines.join('\n');
}
