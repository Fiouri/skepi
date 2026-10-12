import { PROBLEM_REPORT_MAX_DESCRIPTION, problemReportShare, type RetrievalResult } from '@skepi/core';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { ExpoZim } from 'expo-zim';
import { useState } from 'react';
import { Share, Text, TextInput, View } from 'react-native';
import { useMessages } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { Button, useStyles } from './ui';

/**
 * "Report a problem with this answer": the user describes the problem; the report text (question, what
 * was shown, cited sources, app version, the user's text; nothing else) goes to the system share sheet
 * (ACTION_SEND: the user picks the app and sends it), to the clipboard, or to the app's folder
 * (reports/) to send later. The app itself sends nothing and needs no permission for it.
 */
export function ProblemReport({ question, retrieval, shown }: { question: string; retrieval: RetrievalResult; shown: readonly { text: string; source: string }[] }) {
  const t = useMessages();
  const styles = useStyles();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
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
  const { subject, message: text } = problemReportShare(
    {
      appVersion: `SKEPI ${Constants.expoConfig?.version ?? '?'} (Android)`,
      question,
      layer1: retrieval.layer1,
      aiSentences: shown,
      sources: retrieval.sources.map((s) => ({ id: s.id, title: s.title, heading: s.heading, path: s.path })),
      description,
    },
    t.report,
  );
  const share = async () => {
    try {
      await Share.share({ title: subject, message: text }, { dialogTitle: t.report.title, subject });
      setStatus(t.report.shared);
    } catch (e) {
      setStatus(t.report.shareFailed(e instanceof Error ? e.message : String(e)));
    }
  };
  return (
    <View style={styles.card} testID="report-panel">
      <Text style={styles.title} accessibilityRole="header">
        {t.report.title}
      </Text>
      <Text style={styles.muted}>{t.report.hintShare}</Text>
      <TextInput
        testID="report-description"
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder={t.report.inputPlaceholder}
        placeholderTextColor={theme.muted}
        accessibilityLabel={t.report.inputLabel}
        maxLength={PROBLEM_REPORT_MAX_DESCRIPTION}
        multiline
      />
      <Text style={styles.mono} selectable testID="report-text">
        {text}
      </Text>
      <View style={styles.row}>
        <Button
          testID="report-share"
          label={t.report.share}
          onPress={() => {
            void share();
          }}
        />
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
