import { problemReportText, type RetrievalResult } from '@skepi/core';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { ExpoZim } from 'expo-zim';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMessages } from '../lib/i18n';
import { Button, useStyles } from './ui';

/**
 * "Report a problem with this answer": shows the report text (question, what was shown, cited sources,
 * app version; nothing else) to copy, or saves it in the app's folder (reports/) to send later. The app
 * sends nothing.
 */
export function ProblemReport({ question, retrieval, shown }: { question: string; retrieval: RetrievalResult; shown: readonly { text: string; source: string }[] }) {
  const t = useMessages();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  if (!open) {
    return (
      <Button
        testID="ask-report"
        label={t.report.button}
        onPress={() => {
          setOpen(true);
          setStatus(null);
        }}
      />
    );
  }
  const text = problemReportText(
    {
      appVersion: `SKEPI ${Constants.expoConfig?.version ?? '?'} (Android)`,
      question,
      layer1: retrieval.layer1,
      aiSentences: shown,
      sources: retrieval.sources.map((s) => ({ id: s.id, title: s.title, heading: s.heading, path: s.path })),
    },
    { ...t.report, title: t.report.title },
  );
  return (
    <View style={styles.card} testID="report-panel">
      <Text style={styles.title} accessibilityRole="header">
        {t.report.title}
      </Text>
      <Text style={styles.muted}>{t.report.hint}</Text>
      <Text style={styles.mono} selectable testID="report-text">
        {text}
      </Text>
      <View style={styles.row}>
        <Button
          testID="report-copy"
          label={t.report.copy}
          onPress={() => {
            void Clipboard.setStringAsync(text).then(() => {
              setStatus(t.report.copied);
            });
          }}
        />
        <Button
          testID="report-save"
          label={t.report.save}
          onPress={() => {
            const name = `reports/report-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
            void ExpoZim.writeContentFile(name, text).then((path) => {
              setStatus(t.report.saved(path));
            });
          }}
        />
        <Button
          testID="report-close"
          label={t.report.close}
          onPress={() => {
            setOpen(false);
          }}
        />
      </View>
      {status && (
        <Text style={styles.ok} testID="report-status">
          {status}
        </Text>
      )}
    </View>
  );
}
