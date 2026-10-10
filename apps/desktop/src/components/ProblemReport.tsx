import { problemReportText, type RetrievalResult } from '@skepi/core';
import { useState } from 'react';
import { ipc } from '../lib/ipc';
import { useMessages } from '../lib/i18n';
import { APP_VERSION } from '../lib/notices';
import { Button, errorText } from './ui';

/**
 * "Report a problem with this answer": the report text (question, what was shown, cited sources, app
 * version; nothing else) to copy, or to save as a .txt file through a native save dialog. The app
 * sends nothing.
 */
export function ProblemReport({ question, found, shown }: { question: string; found: RetrievalResult; shown: readonly { text: string; source: string }[] }) {
  const t = useMessages();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  if (!open) {
    return (
      <div>
        <Button testId="ask-report" tone="plain" label={t.report.button} onClick={() => { setOpen(true); setStatus(null); }} />
      </div>
    );
  }
  const text = problemReportText(
    {
      appVersion: `SKEPI ${APP_VERSION} (Windows)`,
      question,
      layer1: found.layer1,
      aiSentences: shown,
      sources: found.sources.map((s) => ({ id: s.id, title: s.title, heading: s.heading, path: s.path })),
    },
    t.report,
  );
  return (
    <section className="card stack" data-testid="report-panel">
      <h2>{t.report.title}</h2>
      <p className="muted">{t.report.hint}</p>
      <textarea className="mono" readOnly value={text} rows={14} data-testid="report-text" aria-label={t.report.title} />
      <div className="row">
        <Button
          testId="report-copy"
          label={t.report.copy}
          onClick={() => {
            void navigator.clipboard.writeText(text).then(
              () => { setStatus(t.report.copied); },
              (e: unknown) => { setStatus(errorText(e)); },
            );
          }}
        />
        <Button
          testId="report-save"
          label={t.report.save}
          onClick={() => {
            void ipc.reportSave(text).then(
              (path) => { if (path) setStatus(t.report.saved(path)); },
              (e: unknown) => { setStatus(errorText(e)); },
            );
          }}
        />
        <Button testId="report-close" tone="plain" label={t.report.close} onClick={() => { setOpen(false); }} />
      </div>
      {status && <p data-testid="report-status">{status}</p>}
    </section>
  );
}
