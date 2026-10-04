import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { ZimArticleViewProps } from './ExpoZim.types';

const NativeView: ComponentType<ZimArticleViewProps> = requireNativeView('ExpoZim');

export function ZimArticleView(props: ZimArticleViewProps) {
  return <NativeView {...props} />;
}

/** `zim://<archiveId>/<path>[#anchor]`; the fragment scrolls to a section and never reaches the native handler. */
export function zimUrl(archiveId: string, path: string, anchor?: string): string {
  const base = `zim://${archiveId}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return anchor ? `${base}#${encodeURIComponent(anchor)}` : base;
}
