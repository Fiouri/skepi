import { el } from './el';
import { en } from './en';
import type { Messages } from './messages';

export const SUPPORTED_LOCALES = ['en', 'el'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

const CATALOG: Record<Locale, Messages> = { en, el };

/**
 * The app follows the device's first preferred language: Greek gets Greek, anything else
 * (including unknown or missing) falls back to English. Accepts BCP 47 tags or bare language codes.
 */
export function resolveLocale(preferred: readonly (string | null | undefined)[]): Locale {
  const first = preferred.find((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
  if (first === undefined) return DEFAULT_LOCALE;
  const language = first.trim().toLowerCase().split(/[-_]/)[0];
  return language === 'el' ? 'el' : DEFAULT_LOCALE;
}

export function getMessages(locale: Locale): Messages {
  return CATALOG[locale];
}
