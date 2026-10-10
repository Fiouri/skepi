import { PREVIEW_BUILD } from '@skepi/emergency-cards';
import { useMessages } from '../lib/i18n';
import { Banner } from './ui';

/** Developer Preview builds (SKEPI_PREVIEW=1): the permanent "not for emergency use" label (home, About). */
export function PreviewLabel() {
  const t = useMessages();
  if (!PREVIEW_BUILD) return null;
  return (
    <Banner tone="warning" testId="preview-label" role="alert">
      <strong>{t.preview.label}</strong>
    </Banner>
  );
}
