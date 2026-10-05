import { getMessages, resolveLocale, type Locale, type Messages } from '@skepi/i18n';
import { useLocales } from 'expo-localization';

/** UI strings for the device's first preferred language (Greek → Greek, anything else → English). */
export function useMessages(): Messages {
  const locales = useLocales();
  return getMessages(resolveLocale(locales.map((l) => l.languageTag)));
}

/** The resolved UI language. */
export function useLanguage(): Locale {
  const locales = useLocales();
  return resolveLocale(locales.map((l) => l.languageTag));
}
