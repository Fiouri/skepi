import { ANDROID_RELEASE_SIGNING_SHA256 } from '@skepi/core';
import Constants from 'expo-constants';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { PreviewLabel } from '../components/Preview';
import { Button, useStyles } from '../components/ui';
import { useMessages } from '../lib/i18n';
import { NOTICES, noticeCounts, type NoticeComponent } from '../lib/notices';
import { useTheme } from '../lib/theme';

/** About: licence, content and model licences, third-party notices, release signing, privacy. */
export default function AboutScreen() {
  const t = useMessages();
  const styles = useStyles();
  const theme = useTheme();
  const [showNotices, setShowNotices] = useState(false);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const version = Constants.expoConfig?.version ?? '?';
  const counts = noticeCounts();

  const items = useMemo(() => {
    if (!showNotices) return [];
    const f = filter.trim().toLowerCase();
    return f.length === 0 ? NOTICES.components : NOTICES.components.filter((c) => `${c.name} ${c.license}`.toLowerCase().includes(f));
  }, [showNotices, filter]);

  const section = (title: string, body: string, testID?: string) => (
    <View style={{ gap: 4 }} testID={testID}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.text} selectable>
        {body}
      </Text>
    </View>
  );

  const header = (
    <View style={{ gap: 16, paddingBottom: 8 }}>
      <PreviewLabel />
      <Text style={styles.heading} accessibilityRole="header" testID="about-version">
        {`SKEPI · ${t.about.version(version)}`}
      </Text>
      {section(t.about.licenceTitle, `${t.about.licence}\n${t.about.sourceCode}`, 'about-licence')}
      {section(t.about.contentTitle, [t.about.wikipedia, t.about.maps, t.about.places, t.about.model, t.about.cardSources].join('\n\n'), 'about-content')}
      {section(t.about.signingTitle, t.about.signingAndroid(ANDROID_RELEASE_SIGNING_SHA256), 'about-signing')}
      {section(t.about.privacyTitle, t.about.privacy, 'about-privacy')}
      <View style={{ gap: 8 }} testID="about-notices">
        <Text style={styles.title} accessibilityRole="header">
          {t.about.noticesTitle}
        </Text>
        <Text style={styles.text}>{t.about.notices(counts)}</Text>
        <Button testID="about-notices-toggle" label={showNotices ? t.about.hideNotices : t.about.showNotices} onPress={() => { setShowNotices((v) => !v); }} />
        {showNotices && (
          <TextInput
            style={styles.input}
            value={filter}
            onChangeText={setFilter}
            placeholder={t.about.filter}
            placeholderTextColor={theme.muted}
            accessibilityLabel={t.about.filter}
            autoCorrect={false}
            testID="about-notices-filter"
          />
        )}
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: NoticeComponent }) => {
    const key = `${item.ecosystem}:${item.name}@${item.version}`;
    const expanded = open === key;
    return (
      <Pressable
        style={styles.item}
        accessibilityRole="button"
        onPress={() => {
          setOpen(expanded ? null : key);
        }}
      >
        <Text style={styles.text}>{`${item.name} ${item.version}`}</Text>
        <Text style={styles.muted}>{`${item.ecosystem} · ${item.license} · ${item.url}`}</Text>
        {expanded &&
          item.texts.map((id) => (
            <Text key={id} style={styles.mono} selectable>
              {NOTICES.texts[id] ?? ''}
            </Text>
          ))}
      </Pressable>
    );
  };

  return (
    <FlatList
      style={styles.fill}
      contentContainerStyle={{ padding: 12, paddingBottom: 48 }}
      data={items}
      keyExtractor={(c) => `${c.ecosystem}:${c.name}@${c.version}`}
      renderItem={renderItem}
      ListHeaderComponent={header}
      initialNumToRender={20}
      testID="about-screen"
    />
  );
}
