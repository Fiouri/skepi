import { effectiveLocale, enabledLocales, getMessages, resolveLocale, type Locale, type Messages } from '@skepi/i18n';
import { useLocales } from 'expo-localization';
import { usePrefs } from './prefs';

/** Locales the UI offers: English only until v1; Greek behind the developer flag. */
export function useEnabledLocales(): readonly Locale[] {
  return enabledLocales(usePrefs((s) => s.greekUi));
}

/**
 * The UI language: the one chosen at onboarding, otherwise the device's first preferred language,
 * both limited to the enabled locales (English-only until v1).
 */
export function useLanguage(): Locale {
  const locales = useLocales();
  const chosen = usePrefs((s) => s.locale);
  const enabled = useEnabledLocales();
  return chosen === 'system' ? resolveLocale(locales.map((l) => l.languageTag), enabled) : effectiveLocale(chosen, enabled);
}

/** UI strings for the current language. */
export function useMessages(): Messages {
  return getMessages(useLanguage());
}
