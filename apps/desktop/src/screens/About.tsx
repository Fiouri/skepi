import { ANDROID_RELEASE_SIGNING_SHA256 } from '@skepi/core';
import { useMemo, useState } from 'react';
import { PreviewLabel } from '../components/Preview';
import { Button } from '../components/ui';
import { useMessages } from '../lib/i18n';
import { APP_VERSION, NOTICES, noticeCounts } from '../lib/notices';

/** About: licence, content and model licences, third-party notices, release signing, privacy. */
export function AboutScreen() {
  const t = useMessages();
  const [showNotices, setShowNotices] = useState(false);
  const [filter, setFilter] = useState('');
  const counts = noticeCounts();
  const items = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f.length === 0 ? NOTICES.components : NOTICES.components.filter((c) => `${c.name} ${c.license}`.toLowerCase().includes(f));
  }, [filter]);

  return (
    <div className="stack" data-testid="about-screen">
      <PreviewLabel />
      <h1 data-testid="about-version">{`SKEPI · ${t.about.version(APP_VERSION)}`}</h1>
      <section className="stack" data-testid="about-licence">
        <h2>{t.about.licenceTitle}</h2>
        <p>{t.about.licence}</p>
        <p>{t.about.sourceCode}</p>
      </section>
      <section className="stack" data-testid="about-content">
        <h2>{t.about.contentTitle}</h2>
        {[t.about.wikipedia, t.about.maps, t.about.places, t.about.model, t.about.cardSources].map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>
      <section className="stack" data-testid="about-signing">
        <h2>{t.about.signingTitle}</h2>
        <p>{t.about.signingDesktop}</p>
        <p className="mono">{t.about.signingAndroid(ANDROID_RELEASE_SIGNING_SHA256)}</p>
      </section>
      <section className="stack" data-testid="about-privacy">
        <h2>{t.about.privacyTitle}</h2>
        <p>{t.about.privacy}</p>
      </section>
      <section className="stack" data-testid="about-notices">
        <h2>{t.about.noticesTitle}</h2>
        <p>{t.about.notices(counts)}</p>
        <div>
          <Button testId="about-notices-toggle" label={showNotices ? t.about.hideNotices : t.about.showNotices} onClick={() => { setShowNotices((v) => !v); }} />
        </div>
        {showNotices && (
          <>
            <input
              type="search"
              value={filter}
              placeholder={t.about.filter}
              aria-label={t.about.filter}
              onChange={(e) => { setFilter(e.target.value); }}
              data-testid="about-notices-filter"
            />
            <ul className="notices" data-testid="about-notices-list">
              {items.map((c) => (
                <li key={`${c.ecosystem}:${c.name}@${c.version}`}>
                  <details>
                    <summary>
                      {`${c.name} ${c.version}`} <span className="muted">{`· ${c.ecosystem} · ${c.license}`}</span>
                    </summary>
                    <p className="muted">{c.url}</p>
                    {c.texts.map((id) => (
                      <pre key={id} className="mono notice-text">
                        {NOTICES.texts[id] ?? ''}
                      </pre>
                    ))}
                  </details>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
