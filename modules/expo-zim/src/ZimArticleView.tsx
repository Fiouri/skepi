import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { ZimArticleViewProps } from './ExpoZim.types';

const NativeView: ComponentType<ZimArticleViewProps> = requireNativeView('ExpoZim');

export function ZimArticleView(props: ZimArticleViewProps) {
  return <NativeView {...props} />;
}

export function zimUrl(archiveId: string, path: string): string {
  return `zim://${archiveId}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
