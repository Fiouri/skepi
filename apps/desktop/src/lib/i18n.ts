import { effectiveLocale, enabledLocales, getMessages, resolveLocale, type Locale, type Messages } from '@skepi/i18n';
import { useApp } from './store';

/** English-only until v1; Greek only behind the developer flag (frozen locale). */
export function useLanguage(): Locale {
  const greekUi = useApp((s) => s.greekUi);
  const enabled = enabledLocales(greekUi);
  return effectiveLocale(resolveLocale([navigator.language], enabled), enabled);
}

export function useMessages(): Messages {
  return getMessages(useLanguage());
}
