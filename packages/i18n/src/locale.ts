import { el } from './el';
import { en } from './en';
import type { Messages } from './messages';

export const SUPPORTED_LOCALES = ['en', 'el'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * English-only until v1 (docs/architecture.md, "Decisions"): Greek keeps its strings and tests but is
 * frozen. The app offers it only behind the developer flag (`dev.greekUi`).
 */
export const FROZEN_LOCALES: readonly Locale[] = ['el'];

const CATALOG: Record<Locale, Messages> = { en, el };

/** Locales the UI offers: English, plus the frozen ones when the developer flag is on. */
export function enabledLocales(frozenEnabled: boolean): readonly Locale[] {
  return frozenEnabled ? SUPPORTED_LOCALES : SUPPORTED_LOCALES.filter((l) => !FROZEN_LOCALES.includes(l));
}

/**
 * The app follows the device's first preferred language when it is an enabled locale (Greek gets
 * Greek only while Greek is enabled); anything else (including unknown or missing) falls back to
 * English. Accepts BCP 47 tags or bare language codes.
 */
export function resolveLocale(preferred: readonly (string | null | undefined)[], enabled: readonly Locale[] = SUPPORTED_LOCALES): Locale {
  const first = preferred.find((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
  if (first === undefined) return DEFAULT_LOCALE;
  const language = first.trim().toLowerCase().split(/[-_]/)[0];
  return language === 'el' && enabled.includes('el') ? 'el' : DEFAULT_LOCALE;
}

/** A chosen locale, or English when it is not enabled (a frozen locale chosen before the freeze). */
export function effectiveLocale(chosen: Locale, enabled: readonly Locale[]): Locale {
  return enabled.includes(chosen) ? chosen : DEFAULT_LOCALE;
}

export function getMessages(locale: Locale): Messages {
  return CATALOG[locale];
}
