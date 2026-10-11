import { deleteSetting, getSetting, SecureStorageError, setSetting, type SettingKey, type Settings, type UiLocaleSetting } from '@skepi/db';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { appDb } from './db';

/**
 * User preferences from onboarding and the home screen (persisted in app.db). Loaded before
 * anything else so the app can open on onboarding, in the chosen language and theme.
 */
/** Why the app could not start (shown instead of any screen; app/_layout.tsx). */
export interface StartupError {
  kind: 'secure-storage' | 'other';
  code: string;
  message: string;
}

interface PrefsState {
  loaded: boolean;
  startupError: StartupError | null;
  onboardingCompletedAt: number | null;
  disclaimerAcceptedAt: number | null;
  locale: UiLocaleSetting;
  /** ISO 3166-1 alpha-2; null until chosen (the dataset's 112 default applies). */
  country: string | null;
  budgetGb: number | null;
  blackout: boolean;
  /** Developer flag: the frozen Greek UI (English-only until v1; off by default in every build). */
  greekUi: boolean;
  load: () => Promise<void>;
  setLocale: (locale: UiLocaleSetting) => void;
  setCountry: (country: string) => void;
  setBudgetGb: (gb: number) => void;
  setBlackout: (on: boolean) => void;
  setGreekUi: (on: boolean) => void;
  acceptDisclaimer: () => void;
  completeOnboarding: () => void;
  restartOnboarding: () => void;
}

function persist<K extends SettingKey>(key: K, value: Settings[K]): void {
  void appDb().then((db) => setSetting(db, key, value));
}

/** The device's region (from the OS locale, never from the network), as the default country. */
export function deviceRegion(): string | null {
  const region = getLocales().at(0)?.regionCode;
  return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : null;
}

export const usePrefs = create<PrefsState>((set) => ({
  loaded: false,
  startupError: null,
  onboardingCompletedAt: null,
  disclaimerAcceptedAt: null,
  locale: 'system',
  country: null,
  budgetGb: null,
  blackout: false,
  greekUi: false,
  load: async () => {
    set({ startupError: null });
    let db;
    try {
      db = await appDb();
    } catch (e) {
      const startupError: StartupError =
        e instanceof SecureStorageError
          ? { kind: 'secure-storage', code: e.displayCode, message: e.native.message }
          : { kind: 'other', code: 'ERR_APP_DB', message: e instanceof Error ? e.message : String(e) };
      if (!(e instanceof SecureStorageError)) console.error(`[skepi] app.db: ${startupError.message}`);
      set({ startupError });
      return;
    }
    const [onboardingCompletedAt, disclaimerAcceptedAt, locale, country, budgetGb, blackout, greekUi] = await Promise.all([
      getSetting(db, 'onboarding.completedAt'),
      getSetting(db, 'disclaimer.acceptedAt'),
      getSetting(db, 'ui.locale'),
      getSetting(db, 'region.country'),
      getSetting(db, 'storage.budgetGb'),
      getSetting(db, 'blackout.enabled'),
      getSetting(db, 'dev.greekUi'),
    ]);
    set({
      loaded: true,
      onboardingCompletedAt,
      disclaimerAcceptedAt,
      locale: locale ?? 'system',
      country,
      budgetGb,
      blackout: blackout ?? false,
      greekUi: greekUi ?? false,
    });
  },
  setLocale: (locale) => {
    set({ locale });
    persist('ui.locale', locale);
  },
  setCountry: (country) => {
    set({ country });
    persist('region.country', country);
  },
  setBudgetGb: (budgetGb) => {
    set({ budgetGb });
    persist('storage.budgetGb', budgetGb);
  },
  setBlackout: (blackout) => {
    set({ blackout });
    persist('blackout.enabled', blackout);
  },
  setGreekUi: (greekUi) => {
    set({ greekUi });
    persist('dev.greekUi', greekUi);
  },
  acceptDisclaimer: () => {
    const now = Date.now();
    set({ disclaimerAcceptedAt: now });
    persist('disclaimer.acceptedAt', now);
  },
  completeOnboarding: () => {
    const now = Date.now();
    set({ onboardingCompletedAt: now });
    persist('onboarding.completedAt', now);
  },
  restartOnboarding: () => {
    set({ onboardingCompletedAt: null });
    void appDb().then((db) => deleteSetting(db, 'onboarding.completedAt'));
  },
}));
