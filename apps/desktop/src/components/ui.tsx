import { THEMES, type Theme } from '@skepi/ui-tokens';
import type { ReactNode } from 'react';
import { useMessages } from '../lib/i18n';
import { useApp } from '../lib/store';

export function useTheme(): Theme {
  return THEMES[useApp((s) => (s.blackout ? 'blackout' : 'light'))];
}

/** Theme tokens (packages/ui-tokens, WCAG AA checked) as CSS variables on the app root. */
export function themeVars(theme: Theme): Record<string, string> {
  return {
    '--bg': theme.bg,
    '--surface': theme.surface,
    '--text': theme.text,
    '--muted': theme.muted,
    '--border': theme.border,
    '--accent': theme.accent,
    '--on-accent': theme.onAccent,
    '--danger': theme.danger,
    '--on-danger': theme.onDanger,
    '--danger-bg': theme.dangerBg,
    '--on-danger-bg': theme.onDangerBg,
    '--chip': theme.chip,
    '--on-chip': theme.onChip,
    '--highlight': theme.highlight,
    '--on-highlight': theme.onHighlight,
    '--warning-bg': theme.warningBg,
    '--on-warning-bg': theme.onWarningBg,
    '--ok': theme.ok,
    '--transition': theme.animations ? '120ms' : '0ms',
  };
}

export function Button(props: {
  label: string;
  onClick: () => void;
  testId?: string;
  tone?: 'accent' | 'danger' | 'plain';
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`btn ${props.tone ?? 'accent'}`}
      data-testid={props.testId}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      {props.label}
    </button>
  );
}

export function Banner(props: { tone: 'danger' | 'warning' | 'info'; children: ReactNode; testId?: string; role?: 'alert' | 'status' }) {
  return (
    <div className={`banner ${props.tone}`} data-testid={props.testId} role={props.role ?? 'status'}>
      {props.children}
    </div>
  );
}

export function UnverifiedLabel({ archiveId }: { archiveId: string }) {
  const t = useMessages();
  const unverified = useApp((s) => s.archives.some((a) => a.archiveId === archiveId && !a.verified));
  if (!unverified) return null;
  return (
    <span className="unverified" data-testid="unverified-label">
      {t.unverified.label}
    </span>
  );
}

export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} kB`;
  return `${String(n)} B`;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
