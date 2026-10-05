/**
 * Design tokens for both themes. Blackout mode (docs/architecture.md, "Blackout mode") is pure black
 * for OLED panels and has no animations. Every text/background pair the app uses is listed in
 * `CONTRAST_PAIRS` and checked against WCAG 2.x AA in the tests (4.5:1 for text, 3:1 for large text
 * and UI boundaries).
 */

export type ThemeName = 'light' | 'blackout';

export interface Theme {
  name: ThemeName;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  onAccent: string;
  danger: string;
  onDanger: string;
  dangerBg: string;
  onDangerBg: string;
  chip: string;
  onChip: string;
  highlight: string;
  onHighlight: string;
  warningBg: string;
  onWarningBg: string;
  ok: string;
  /** Animations (navigation transitions, spinners' motion) are off in blackout mode. */
  animations: boolean;
  statusBar: 'dark' | 'light';
}

export const LIGHT: Theme = {
  name: 'light',
  bg: '#ffffff',
  surface: '#f3f4f6',
  text: '#111827',
  muted: '#4b5563',
  border: '#6b7280',
  accent: '#1d4ed8',
  onAccent: '#ffffff',
  danger: '#b91c1c',
  onDanger: '#ffffff',
  dangerBg: '#fee2e2',
  onDangerBg: '#991b1b',
  chip: '#dbeafe',
  onChip: '#1e40af',
  highlight: '#fef08a',
  onHighlight: '#111827',
  warningBg: '#fef3c7',
  onWarningBg: '#78350f',
  ok: '#15803d',
  animations: true,
  statusBar: 'dark',
};

export const BLACKOUT: Theme = {
  name: 'blackout',
  bg: '#000000',
  surface: '#0a0a0a',
  text: '#e5e7eb',
  muted: '#a3a3a3',
  border: '#737373',
  accent: '#93c5fd',
  onAccent: '#000000',
  danger: '#f87171',
  onDanger: '#000000',
  dangerBg: '#1f0a0a',
  onDangerBg: '#fca5a5',
  chip: '#0f172a',
  onChip: '#93c5fd',
  highlight: '#3f3f00',
  onHighlight: '#fef9c3',
  warningBg: '#1c1400',
  onWarningBg: '#fcd34d',
  ok: '#4ade80',
  animations: false,
  statusBar: 'light',
};

export const THEMES: Readonly<Record<ThemeName, Theme>> = { light: LIGHT, blackout: BLACKOUT };

/** Android minimum touch target (Material, WCAG 2.5.5 enhanced is 44 CSS px). */
export const MIN_TOUCH_DP = 48;

export const TYPE = { body: 16, small: 14, title: 18, heading: 22, step: 18 } as const;

type ColorKey = { [K in keyof Theme]: Theme[K] extends string ? (K extends 'name' | 'statusBar' ? never : K) : never }[keyof Theme];

export interface ContrastPair {
  fg: ColorKey;
  bg: ColorKey;
  /** 'text' needs 4.5:1, 'ui' (borders, icons, large bold text) needs 3:1. */
  kind: 'text' | 'ui';
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { fg: 'text', bg: 'bg', kind: 'text' },
  { fg: 'text', bg: 'surface', kind: 'text' },
  { fg: 'muted', bg: 'bg', kind: 'text' },
  { fg: 'muted', bg: 'surface', kind: 'text' },
  { fg: 'accent', bg: 'bg', kind: 'text' },
  { fg: 'onAccent', bg: 'accent', kind: 'text' },
  { fg: 'danger', bg: 'bg', kind: 'text' },
  { fg: 'onDanger', bg: 'danger', kind: 'text' },
  { fg: 'onDangerBg', bg: 'dangerBg', kind: 'text' },
  { fg: 'onChip', bg: 'chip', kind: 'text' },
  { fg: 'onHighlight', bg: 'highlight', kind: 'text' },
  { fg: 'onWarningBg', bg: 'warningBg', kind: 'text' },
  { fg: 'ok', bg: 'bg', kind: 'text' },
  { fg: 'border', bg: 'bg', kind: 'ui' },
];

function channel(hex: string, offset: number): number {
  const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a #rrggbb colour: ${hex}`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
