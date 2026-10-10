import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { themeVars, useTheme } from './components/ui';
import { ipc } from './lib/ipc';
import { useMessages } from './lib/i18n';
import { useApp } from './lib/store';
import { PreviewLabel } from './components/Preview';
import { AboutScreen } from './screens/About';
import { AskScreen } from './screens/Ask';
import { CardsScreen } from './screens/Cards';
import { LibraryScreen } from './screens/Library';
import { MapScreen } from './screens/Map';
import { SearchScreen } from './screens/Search';
import { SettingsScreen } from './screens/Settings';
import { StationScreen } from './screens/Station';

export type Tab = 'search' | 'ask' | 'map' | 'cards' | 'library' | 'station' | 'settings' | 'about';

interface Nav {
  tab: Tab;
  cardId: string | null;
  mapFocus: { lat: number; lon: number; title: string } | null;
  go: (tab: Tab) => void;
  openCard: (id: string | null) => void;
  showOnMap: (focus: { lat: number; lon: number; title: string }) => void;
}

export const useNav = create<Nav>((set) => ({
  tab: 'search',
  cardId: null,
  mapFocus: null,
  go: (tab) => {
    set({ tab });
  },
  openCard: (id) => {
    set({ tab: 'cards', cardId: id });
  },
  showOnMap: (focus) => {
    set({ tab: 'map', mapFocus: focus });
  },
}));

/** External links clicked in the sealed viewer are never opened: they are shown here as text. */
function ExternalLinks() {
  const t = useMessages();
  const [links, setLinks] = useState<string[]>([]);
  useEffect(() => {
    let off: (() => void) | null = null;
    let live = true;
    void ipc.onViewerExternal((url) => {
      setLinks((l) => [url, ...l.filter((x) => x !== url)].slice(0, 3));
    }).then((u) => {
      if (live) off = u;
      else u();
    });
    return () => {
      live = false;
      off?.();
    };
  }, []);
  if (links.length === 0) return null;
  return (
    <div className="banner info" data-testid="external-links" role="status">
      {links.map((u) => (
        <div key={u}>{t.article.externalLink(u)}</div>
      ))}
    </div>
  );
}

export function App() {
  const t = useMessages();
  const theme = useTheme();
  const nav = useNav();
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const verifying = useApp((s) => s.verifying);
  const bootstrap = useApp((s) => s.bootstrap);
  const disclaimerAccepted = useApp((s) => s.disclaimerAccepted);
  const acceptDisclaimer = useApp((s) => s.acceptDisclaimer);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'search', label: t.tabs.search },
    { id: 'ask', label: t.tabs.ask },
    { id: 'map', label: t.tabs.map },
    { id: 'cards', label: t.desktop.tabs.cards },
    { id: 'library', label: t.tabs.library },
    { id: 'station', label: t.desktop.tabs.station },
    { id: 'settings', label: t.desktop.tabs.settings },
    { id: 'about', label: t.about.open },
  ];

  return (
    <div className="app" style={themeVars(theme)} data-theme={theme.name} data-status={status}>
      <nav className="tabs" aria-label="SKEPI">
        <div className="brand">SKEPI</div>
        <button type="button" className="emergency" data-testid="emergency-button" onClick={() => { nav.openCard(null); }}>
          {t.home.emergency}
        </button>
        {tabs.map((tab) => (
          <button key={tab.id} type="button" data-testid={`tab-${tab.id}`} aria-current={nav.tab === tab.id ? 'page' : undefined} onClick={() => { nav.go(tab.id); }}>
            {tab.label}
          </button>
        ))}
      </nav>
      <main className={nav.tab === 'map' ? 'full' : undefined}>
        {status === 'error' && (
          <div className="banner danger" role="alert" data-testid="app-error">
            {t.common.error(error ?? '')}
          </div>
        )}
        {verifying && (
          <div className="banner info" data-testid="verifying">
            {t.content.verifying({ file: verifying.file, percent: verifying.percent })}
          </div>
        )}
        {status === 'ready' && !disclaimerAccepted && (
          <div className="banner warning stack" data-testid="disclaimer" role="alertdialog">
            <strong>{t.onboarding.disclaimerTitle}</strong>
            {t.onboarding.disclaimerBody.map((line) => (
              <span key={line}>{line}</span>
            ))}
            <div>
              <button type="button" className="btn accent" data-testid="disclaimer-accept" onClick={acceptDisclaimer}>
                {t.onboarding.accept}
              </button>
            </div>
          </div>
        )}
        <ExternalLinks />
        {nav.tab === 'search' && <PreviewLabel />}
        {nav.tab === 'search' && <SearchScreen />}
        {nav.tab === 'ask' && <AskScreen />}
        {nav.tab === 'map' && <MapScreen />}
        {nav.tab === 'cards' && <CardsScreen />}
        {nav.tab === 'library' && <LibraryScreen />}
        {nav.tab === 'station' && <StationScreen />}
        {nav.tab === 'settings' && <SettingsScreen />}
        {nav.tab === 'about' && <AboutScreen />}
      </main>
    </div>
  );
}
