import type { SearchHit } from '@skepi/contracts';
import { DEFAULT_SUGGEST, placeTitle, suggestTitles } from '@skepi/core';
import { findCards } from '@skepi/emergency-cards';
import { useEffect, useRef, useState } from 'react';
import { useNav } from '../App';
import { CardLinks } from '../components/Cards';
import { Banner, errorText, UnverifiedLabel } from '../components/ui';
import { useMessages } from '../lib/i18n';
import { ipc } from '../lib/ipc';
import { searchAllPlaces, type PlaceHit } from '../lib/places';
import { knowledge, newestVerified, ragArchives, useApp } from '../lib/store';

interface Timing {
  kind: 'suggest' | 'fulltext';
  totalMs: number;
  nativeMs: number;
  count: number;
}

/** One field over emergency cards, places and articles (suggestions while typing, full-text on Enter). */
export function SearchScreen() {
  const t = useMessages();
  const nav = useNav();
  const archives = useApp((s) => s.archives);
  const packs = useApp((s) => s.packs);
  const blackout = useApp((s) => s.blackout);
  const status = useApp((s) => s.status);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [places, setPlaces] = useState<PlaceHit[]>([]);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const placesIds = newestVerified(packs, 'places').map((p) => p.id);
  const placesKey = placesIds.join(',');

  const run = async (q: string, kind: Timing['kind']): Promise<void> => {
    const id = ++seq.current;
    if (q.trim().length === 0 || archives.length === 0) {
      setHits([]);
      setTiming(null);
      return;
    }
    try {
      const start = performance.now();
      const result =
        kind === 'suggest'
          ? await suggestTitles(knowledge, q, { ...DEFAULT_SUGGEST, archives: ragArchives(archives) })
          : await knowledge.search(q, { mode: 'fulltext', limit: 20 });
      if (id !== seq.current) return;
      setHits(result);
      setError(null);
      setTiming({ kind, totalMs: performance.now() - start, nativeMs: kind === 'suggest' ? knowledge.lastNativeMs.suggest : knowledge.lastNativeMs.search, count: result.length });
    } catch (e) {
      if (id === seq.current) setError(errorText(e));
    }
  };

  useEffect(() => {
    const ids = placesKey ? placesKey.split(',') : [];
    if (query.trim().length === 0 || ids.length === 0) {
      setPlaces([]);
      return;
    }
    let live = true;
    void searchAllPlaces(ids, query, 6).then(
      (found) => {
        if (live) setPlaces(found);
      },
      () => {
        if (live) setPlaces([]);
      },
    );
    return () => {
      live = false;
    };
  }, [query, placesKey]);

  const cards = query.trim().length > 0 ? findCards(query) : [];

  const open = (h: SearchHit): void => {
    void ipc.viewerOpen(h.archiveId, h.path, h.title, blackout, null).catch((e: unknown) => {
      setError(errorText(e));
    });
  };

  return (
    <section className="stack" data-testid="search-screen">
      <h1>{t.tabs.search}</h1>
      <input
        type="search"
        data-testid="search-input"
        aria-label={t.search.placeholder}
        placeholder={t.search.placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          void run(e.target.value, 'suggest');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void run(query, 'fulltext');
        }}
      />
      <div className="row">
        <button type="button" className="btn plain" data-testid="search-fulltext" onClick={() => void run(query, 'fulltext')}>
          {t.search.fullText}
        </button>
        {timing && (
          <span className="muted" data-testid="search-timing">
            {t.search.timing({ kind: timing.kind, count: timing.count, totalMs: timing.totalMs.toFixed(0), nativeMs: timing.nativeMs.toFixed(0) })}
          </span>
        )}
      </div>
      {status === 'ready' && archives.length === 0 && <p className="muted">{t.content.missing}</p>}
      <p className="muted">{t.desktop.viewerHint}</p>
      {error && <Banner tone="danger">{error}</Banner>}
      {cards.length > 0 && (
        <div className="stack">
          <h2>{t.emergency.cards}</h2>
          <CardLinks cards={cards} onOpen={nav.openCard} />
        </div>
      )}
      {places.length > 0 && (
        <div data-testid="place-results">
          <h2>{t.search.places}</h2>
          {places.map((p) => {
            const name = placeTitle(p);
            return (
              <button
                key={`${p.packId}-${String(p.id)}`}
                type="button"
                className="hit"
                data-testid={`place-${String(p.id)}`}
                title={t.search.placeOnMap}
                onClick={() => {
                  nav.showOnMap({ lat: p.lat, lon: p.lon, title: name.title });
                }}
              >
                {name.title}
                {name.local && name.local !== name.title ? ` (${name.local})` : ''} <span className="muted">· {name.kind}</span>
              </button>
            );
          })}
        </div>
      )}
      {hits.length > 0 && (
        <div data-testid="article-results">
          {hits.map((h) => (
            <div key={`${h.archiveId}/${h.path}`}>
              <button type="button" className="hit" data-testid={`hit-${h.path}`} onClick={() => { open(h); }}>
                {h.title}
              </button>
              <UnverifiedLabel archiveId={h.archiveId} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
