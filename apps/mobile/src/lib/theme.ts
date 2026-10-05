import { THEMES, type Theme } from '@skepi/ui-tokens';
import { usePrefs } from './prefs';

/** Light theme normally; pure black, no animations, in blackout mode. */
export function useTheme(): Theme {
  const blackout = usePrefs((s) => s.blackout);
  return THEMES[blackout ? 'blackout' : 'light'];
}
