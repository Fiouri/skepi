import { checkStorage, countryDownloads, countryInstalledIds, filterCountries, listCountries, matchingParts, partRemovalIds, type CountryEntry } from '@skepi/core';
import { useMemo, useState } from 'react';
import { Banner, Button, errorText, formatBytes } from '../components/ui';
import { useMessages } from '../lib/i18n';
import { ipc, type CatalogPackJson, type DownloadProgressJson } from '../lib/ipc';
import { useActiveProfile, useApp } from '../lib/store';

const MB = 1024 * 1024;

/**
 * Packs → "Maps & places" (global maps, decision 2026-10-23): the countries of the signed catalog,
 * searchable, with download size, free-space check, download, update and delete (a split country:
 * all parts or one, a subdivision in the search finds its part, a part can be deleted alone). Downloads
 * start only on a click; the Rust ContentStore checks every chunk and the whole file against the signed
 * catalog before installing it, so nothing opens unverified.
 */
export function MapsSection() {
  const t = useMessages();
  const catalog = useApp((s) => s.catalog?.catalog ?? null);
  const packs = useApp((s) => s.packs);
  const refresh = useApp((s) => s.refresh);
  const country = useApp((s) => s.country);
  const { profile } = useActiveProfile();
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<Record<string, DownloadProgressJson>>({});
  const [message, setMessage] = useState<{ iso2: string; text: string; tone: 'danger' | 'warning' | 'info' } | null>(null);
  const [confirming, setConfirming] = useState<{ entry: CountryEntry<CatalogPackJson>; todo: CatalogPackJson[]; text: string } | null>(null);
  // The country (part: null) or one map part being deleted, awaiting confirmation.
  const [removing, setRemoving] = useState<{ entry: CountryEntry<CatalogPackJson>; part: { id: string; name: string } | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const countries = useMemo(() => listCountries(catalog, packs), [catalog, packs]);
  const shown = useMemo(() => filterCountries(countries, query), [countries, query]);

  const start = async (entry: CountryEntry<CatalogPackJson>, todo: readonly CatalogPackJson[]): Promise<void> => {
    setConfirming(null);
    setMessage(null);
    for (const p of todo) {
      try {
        await ipc.contentDownload(p.id, (pr) => {
          setProgress((cur) => ({ ...cur, [p.id]: pr }));
        });
      } catch (e) {
        setMessage({ iso2: entry.iso2, text: t.library.failed(errorText(e)), tone: 'danger' });
        break;
      }
    }
    await refresh();
  };

  const download = async (entry: CountryEntry<CatalogPackJson>, todo: CatalogPackJson[]): Promise<void> => {
    if (todo.length === 0) return;
    const size = todo.reduce((n, p) => n + p.sizeBytes, 0);
    const free = (await ipc.deviceInfo()).snapshot.freeDiskMb * MB;
    const check = checkStorage({ sizeBytes: size, freeBytes: free, tier: profile.effectiveTier });
    if (!check.ok) {
      setMessage({ iso2: entry.iso2, text: t.library.noSpace({ needed: formatBytes(check.requiredBytes), free: formatBytes(free) }), tone: 'danger' });
      return;
    }
    if (check.warnings.length > 0) {
      const text = check.warnings.map((w) => (w === 'large-download' ? t.maps.warnLarge(formatBytes(size)) : t.maps.warnLowSpace(formatBytes(check.remainingBytes)))).join(' ');
      setConfirming({ entry, todo, text });
      return;
    }
    await start(entry, todo);
  };

  const remove = async (entry: CountryEntry<CatalogPackJson>, part: { id: string } | null): Promise<void> => {
    setRemoving(null);
    setBusy(true);
    try {
      for (const id of part ? partRemovalIds(entry, part.id) : countryInstalledIds(entry)) await ipc.contentRemove(id);
      await refresh();
    } catch (e) {
      setMessage({ iso2: entry.iso2, text: errorText(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const running = (entry: CountryEntry<CatalogPackJson>): DownloadProgressJson | null => {
    const ids = [...entry.maps, ...(entry.places ? [entry.places] : [])].map((p) => p.pack.id);
    return (
      ids.map((id) => progress[id]).find((p) => p !== undefined && (p.phase === 'downloading' || p.phase === 'verifying' || p.phase === 'installing' || p.phase === 'queued')) ?? null
    );
  };

  return (
    <section className="stack" data-testid="maps-section">
      <h2>{t.maps.title}</h2>
      <p className="muted">{catalog ? t.maps.verifiedBeforeOpening : t.maps.noCatalog}</p>
      <input
        data-testid="maps-search"
        type="search"
        placeholder={t.maps.search}
        aria-label={t.maps.search}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      {shown.length === 0 && <p className="muted">{t.maps.none}</p>}
      {shown.map((entry) => {
        const pr = running(entry);
        const installed = countryInstalledIds(entry).length > 0;
        const all = countryDownloads(entry);
        const split = entry.maps.length > 1;
        const matched = matchingParts(entry, query);
        const percent = pr && pr.totalBytes > 0 ? Math.floor((pr.bytes / pr.totalBytes) * 100) : 0;
        return (
          <div key={entry.iso2} className="card stack" data-testid={`country-${entry.iso2}`}>
            <strong>{entry.name}</strong>
            <span className="muted" data-testid={`country-status-${entry.iso2}`}>
              {t.maps.status[entry.status]} · {t.maps.size(formatBytes(entry.sizeBytes))}
            </span>
            {split && <span>{t.maps.parts}</span>}
            {split &&
              entry.maps.map((m) => {
                const name = m.pack.region?.part?.name ?? m.pack.title.en;
                const term = matched.get(m.pack.id);
                return (
                  <div key={m.pack.id} className="row" data-testid={`country-part-row-${m.pack.id}`}>
                    <span>
                      {term ? <strong>{t.maps.part({ name, size: formatBytes(m.pack.sizeBytes), installed: m.installed !== null && !m.update })}</strong> : t.maps.part({ name, size: formatBytes(m.pack.sizeBytes), installed: m.installed !== null && !m.update })}
                      {term && (
                        <span className="muted" data-testid={`country-part-match-${m.pack.id}`}>
                          {' '}
                          · {t.maps.matches(term)}
                        </span>
                      )}
                    </span>
                    {(m.installed === null || m.update) && (
                      <Button
                        testId={`country-part-${m.pack.id}`}
                        tone="plain"
                        label={m.update ? t.maps.update(formatBytes(m.pack.sizeBytes)) : t.maps.downloadPart}
                        disabled={busy || pr !== null}
                        onClick={() => void download(entry, countryDownloads(entry, [m.pack.region?.part?.id ?? '']))}
                      />
                    )}
                    {m.installed !== null && (
                      <Button
                        testId={`country-part-delete-${m.pack.id}`}
                        tone="plain"
                        label={t.maps.removePart}
                        disabled={busy || pr !== null}
                        onClick={() => {
                          setRemoving({ entry, part: { id: m.pack.id, name } });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            {split && entry.places && <span>{t.maps.places({ size: formatBytes(entry.places.pack.sizeBytes), installed: entry.places.installed !== null })}</span>}
            <div className="row">
              {all.length > 0 && (
                <Button
                  testId={`country-download-${entry.iso2}`}
                  label={
                    entry.status === 'update'
                      ? t.maps.update(formatBytes(entry.missingBytes))
                      : split
                        ? t.maps.allParts(formatBytes(entry.missingBytes))
                        : t.maps.download(formatBytes(entry.missingBytes))
                  }
                  disabled={busy || pr !== null}
                  onClick={() => void download(entry, all)}
                />
              )}
              {installed && (
                <Button
                  testId={`country-delete-${entry.iso2}`}
                  tone="danger"
                  label={t.maps.remove}
                  disabled={busy || pr !== null}
                  onClick={() => {
                    setRemoving({ entry, part: null });
                  }}
                />
              )}
              {installed && country !== entry.iso2 && (
                <Button
                  testId={`country-select-${entry.iso2}`}
                  tone="plain"
                  label={t.maps.useForNumbers}
                  onClick={() => {
                    useApp.setState({ country: entry.iso2 });
                    void ipc.settingsSet('region.country', entry.iso2);
                  }}
                />
              )}
            </div>
            {installed && country === entry.iso2 && (
              <span className="muted" data-testid={`country-selected-${entry.iso2}`}>
                {t.maps.usedForNumbers}
              </span>
            )}
            {pr && (
              <div data-testid={`country-progress-${entry.iso2}`}>
                <span className="muted">{t.library.progress({ phase: t.library.phase[pr.phase], percent, mirror: pr.mirror + 1, rejected: pr.rejectedMirrors })}</span>
                <div className="progress">
                  <div style={{ width: `${String(percent)}%` }} />
                </div>
              </div>
            )}
            {confirming?.entry.iso2 === entry.iso2 && (
              <div className="banner warning stack" role="alertdialog" data-testid="storage-warning">
                <strong>{t.maps.warnTitle}</strong>
                <span>{confirming.text}</span>
                <div className="row">
                  <Button testId="storage-accept" tone="danger" label={t.maps.warnAccept} onClick={() => void start(confirming.entry, confirming.todo)} />
                  <Button
                    testId="storage-cancel"
                    tone="plain"
                    label={t.library.cancel}
                    onClick={() => {
                      setConfirming(null);
                    }}
                  />
                </div>
              </div>
            )}
            {removing?.entry.iso2 === entry.iso2 && (
              <div className="banner warning stack" role="alertdialog" data-testid="remove-dialog">
                <strong>{removing.part ? t.maps.removePartTitle(removing.part.name) : t.maps.removeTitle(entry.name)}</strong>
                <span>{removing.part ? t.maps.removePartBody(partRemovalIds(entry, removing.part.id).length > 1) : t.maps.removeBody}</span>
                <div className="row">
                  <Button
                    testId="remove-accept"
                    tone="danger"
                    label={removing.part ? t.maps.removePart : t.maps.remove}
                    onClick={() => void remove(entry, removing.part)}
                  />
                  <Button
                    testId="remove-cancel"
                    tone="plain"
                    label={t.library.cancel}
                    onClick={() => {
                      setRemoving(null);
                    }}
                  />
                </div>
              </div>
            )}
            {message?.iso2 === entry.iso2 && <Banner tone={message.tone}>{message.text}</Banner>}
          </div>
        );
      })}
    </section>
  );
}
