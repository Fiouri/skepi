import { getMessages, resolveLocale, type Locale, type Messages } from '@skepi/i18n';
import { useLocales } from 'expo-localization';
import { usePrefs } from './prefs';

/**
 * The UI language: the one chosen at onboarding, otherwise the device's first preferred language
 * (Greek → Greek, anything else → English).
 */
export function useLanguage(): Locale {
  const locales = useLocales();
  const chosen = usePrefs((s) => s.locale);
  return chosen === 'system' ? resolveLocale(locales.map((l) => l.languageTag)) : chosen;
}

/** UI strings for the current language. */
export function useMessages(): Messages {
  return getMessages(useLanguage());
}
