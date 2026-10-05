import { detectMobileTier, planPreset, STORAGE_PRESETS_GB, type CatalogPack } from '@skepi/core';
import { countryList } from '@skepi/emergency-cards';
import { ExpoDeviceProfile } from 'expo-device-profile';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Readiness } from '../components/Readiness';
import { Button, useStyles } from '../components/ui';
import { contentStore, useContent } from '../lib/content';
import { formatBytes, useDownloads } from '../lib/downloads';
import { useLanguage, useMessages } from '../lib/i18n';
import { deviceRegion, usePrefs } from '../lib/prefs';

const MB = 1024 * 1024;
const STEPS = 4;

function Choice({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, selected && { borderWidth: 3, borderColor: styles.link.color }]}
    >
      <Text style={styles.chipText}>{selected ? `● ${label}` : `○ ${label}`}</Text>
    </Pressable>
  );
}

function confirm(title: string, body: string, accept: string, cancel: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, body, [
      { text: cancel, style: 'cancel', onPress: () => { resolve(false); } },
      { text: accept, onPress: () => { resolve(true); } },
    ]);
  });
}

/**
 * "Get prepared": language and country → device tier and free space → storage budget and its
 * preset packs (downloaded through ContentStore) → disclaimer. Works offline when the packs are
 * already installed; the readiness indicator shows what the installed packs cover.
 */
export default function OnboardingScreen() {
  const t = useMessages();
  const styles = useStyles();
  const router = useRouter();
  const lang = useLanguage();
  const prefs = usePrefs();
  const status = useContent((s) => s.status);
  const catalogState = useContent((s) => s.catalog);
  const packs = useContent((s) => s.packs);
  const allowMetered = useContent((s) => s.allowMetered);
  const downloads = useDownloads((s) => s.byPack);
  const startDownload = useDownloads((s) => s.start);
  const [step, setStep] = useState(0);
  const [device, setDevice] = useState<{ totalRamMb: number; freeDiskMb: number } | null>(null);

  // The country defaults to the OS region (never the network) until the user picks one.
  useEffect(() => {
    if (prefs.country === null) {
      const region = deviceRegion();
      if (region && countryList('en').some((c) => c.country === region)) prefs.setCountry(region);
    }
  }, [prefs]);

  useEffect(() => {
    void ExpoDeviceProfile.getSnapshot().then((s) => {
      setDevice({ totalRamMb: s.totalRamMb, freeDiskMb: s.freeDiskMb });
    });
  }, [step]);

  const tier = device ? detectMobileTier(device.totalRamMb) : null;
  const budgetGb = prefs.budgetGb ?? STORAGE_PRESETS_GB[0];
  const installedIds = useMemo(() => new Set(packs.map((p) => p.id)), [packs]);
  const testCatalog = catalogState?.purpose === 'test';
  const plan = useMemo(() => {
    const catalog = catalogState?.catalog;
    if (!catalog || !device || !tier) return null;
    return planPreset({
      packs: catalog.packs,
      budgetGb,
      locale: lang,
      tier,
      freeBytes: device.freeDiskMb * MB,
      installedIds,
      testCatalog,
    });
  }, [catalogState, device, tier, budgetGb, lang, installedIds, testCatalog]);

  const downloadPlan = async (toDownload: readonly CatalogPack[]): Promise<void> => {
    if (toDownload.length === 0) return;
    let metered = allowMetered;
    if (contentStore.networkState().metered && !metered) {
      const total = toDownload.reduce((n, p) => n + p.sizeBytes, 0);
      metered = await confirm(t.library.meteredTitle, t.library.meteredBody(formatBytes(total)), t.library.meteredAccept, t.library.cancel);
      if (!metered) return;
    }
    for (const p of toDownload) startDownload(p, metered);
  };

  const finish = (): void => {
    prefs.acceptDisclaimer();
    prefs.completeOnboarding();
    router.replace('/');
  };

  const planDownloads = plan?.toDownload ?? [];
  const running = planDownloads.some((p) => downloads[p.id]?.running === true);
  const title = (p: CatalogPack): string => (lang === 'el' ? (p.title.el ?? p.title.en) : p.title.en);

  return (
    <View style={styles.fill} testID="onboarding">
    <ScrollView style={styles.fill} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
      <Text style={styles.muted} testID="onboarding-step">
        {t.onboarding.stepOf({ step: step + 1, total: STEPS })}
      </Text>

      {step === 0 && (
        <View style={{ gap: 12 }} testID="onboarding-language">
          <Text style={styles.heading} accessibilityRole="header">
            {t.onboarding.languageTitle}
          </Text>
          <Text style={styles.title}>{t.onboarding.language}</Text>
          <View style={styles.row} accessibilityRole="radiogroup">
            <Choice testID="lang-system" label={t.onboarding.languageSystem} selected={prefs.locale === 'system'} onPress={() => { prefs.setLocale('system'); }} />
            <Choice testID="lang-en" label="English" selected={prefs.locale === 'en'} onPress={() => { prefs.setLocale('en'); }} />
            <Choice testID="lang-el" label="Ελληνικά" selected={prefs.locale === 'el'} onPress={() => { prefs.setLocale('el'); }} />
          </View>
          <Text style={styles.title}>{t.onboarding.country}</Text>
          <Text style={styles.muted}>{t.onboarding.countryHint}</Text>
          <View style={styles.row} accessibilityRole="radiogroup">
            {countryList(lang).map((c) => (
              <Choice key={c.country} testID={`country-${c.country}`} label={c.name} selected={prefs.country === c.country} onPress={() => { prefs.setCountry(c.country); }} />
            ))}
          </View>
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: 10 }} testID="onboarding-device">
          <Text style={styles.heading} accessibilityRole="header">
            {t.onboarding.deviceTitle}
          </Text>
          {device && tier ? (
            <>
              <Text style={styles.title} testID={`onboarding-tier-${tier}`}>{`${tier}: ${t.onboarding.tier[tier]}`}</Text>
              <Text style={styles.text}>{t.onboarding.ram(formatBytes(device.totalRamMb * MB))}</Text>
              <Text style={styles.text} testID="onboarding-free-space">
                {t.onboarding.freeSpace(formatBytes(device.freeDiskMb * MB))}
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>{t.common.loading}</Text>
          )}
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: 10 }} testID="onboarding-storage">
          <Text style={styles.heading} accessibilityRole="header">
            {t.onboarding.budgetTitle}
          </Text>
          <View style={styles.row} accessibilityRole="radiogroup">
            {STORAGE_PRESETS_GB.map((gb) => (
              <Choice key={gb} testID={`budget-${String(gb)}`} label={t.onboarding.budgetOption(gb)} selected={budgetGb === gb} onPress={() => { prefs.setBudgetGb(gb); }} />
            ))}
          </View>
          {testCatalog && <Text style={styles.muted}>{t.onboarding.testCatalog}</Text>}
          {status !== 'ready' || !plan ? (
            <Text style={styles.muted}>{t.common.loading}</Text>
          ) : (
            <>
              <Text style={styles.text} testID="onboarding-plan">
                {t.onboarding.planSummary({ packs: plan.packs.length, size: formatBytes(plan.totalBytes), download: formatBytes(plan.downloadBytes) })}
              </Text>
              {plan.packs.map((p) => {
                const d = downloads[p.id];
                const pr = d?.progress ?? null;
                const state = installedIds.has(p.id)
                  ? t.onboarding.installed
                  : d?.result
                    ? d.result.kind === 'failed'
                      ? t.library.failed(d.result.reason ?? '')
                      : t.library.phase[d.result.kind]
                    : pr && d?.running
                      ? t.library.progress({
                          phase: t.library.phase[pr.phase],
                          percent: pr.totalBytes > 0 ? Math.min(100, Math.round((pr.bytes / pr.totalBytes) * 100)) : 0,
                          mirror: pr.mirror + 1,
                          rejected: pr.rejectedMirrors,
                        })
                      : formatBytes(p.sizeBytes);
                return (
                  <View key={p.id} style={styles.passage} testID={`plan-${p.id}`}>
                    <Text style={styles.title}>{title(p)}</Text>
                    <Text style={installedIds.has(p.id) ? styles.ok : styles.muted} testID={`plan-state-${p.id}`}>
                      {state}
                    </Text>
                  </View>
                );
              })}
              {plan.packs.length === 0 && <Text style={styles.error}>{t.onboarding.tooLarge}</Text>}
              {planDownloads.length > 0 && !running && (
                <Button testID="onboarding-download" label={t.onboarding.download} onPress={() => void downloadPlan(planDownloads)} />
              )}
              {running && <Text style={styles.muted}>{t.onboarding.downloading}</Text>}
              <Readiness />
            </>
          )}
        </View>
      )}

      {step === 3 && (
        <View style={{ gap: 12 }} testID="onboarding-disclaimer">
          <Text style={styles.heading} accessibilityRole="header">
            {t.onboarding.disclaimerTitle}
          </Text>
          {t.onboarding.disclaimerBody.map((p) => (
            <Text key={p} style={styles.text}>
              {p}
            </Text>
          ))}
          <Button testID="onboarding-accept" label={t.onboarding.accept} onPress={finish} />
        </View>
      )}

    </ScrollView>
      {/* Navigation stays on screen: the country list is longer than one screen. */}
      <View style={[styles.stickyHeader, styles.row, { justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 0, borderTopColor: styles.input.borderColor }]}>
        {step > 0 ? <Button testID="onboarding-back" label={t.onboarding.back} onPress={() => { setStep((s) => s - 1); }} /> : <View />}
        {step < STEPS - 1 && (
          <Button
            testID="onboarding-next"
            label={step === 2 && planDownloads.length > 0 && !running ? t.onboarding.skip : t.onboarding.next}
            onPress={() => { setStep((s) => s + 1); }}
          />
        )}
      </View>
    </View>
  );
}
