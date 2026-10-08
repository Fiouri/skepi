import { EMERGENCY_CATEGORIES, placeTitle, poisToGeoJson, type BBox, type EmergencyCategory, type Place } from '@skepi/core';
import { POI_COLORS, POI_OUTLINE } from '@skepi/ui-tokens';
import { addProtocol, Map as MapLibre, NavigationControl, type GeoJSONSource, type MapLayerMouseEvent, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import baseStyle from '../../../mobile/assets/map/style.json';
import { useNav } from '../App';
import { useMessages } from '../lib/i18n';
import { pmtilesUrl } from '../lib/maps';
import { placesAttribution, poisInView } from '../lib/places';
import { llama, newestVerified, useApp } from '../lib/store';

// Patras / Achaia (test region of the Greece packs).
const PATRAS: [number, number] = [21.7346, 38.2466];
/** Below this zoom the POI layer stays empty (thousands of points would hide the map). */
const POI_MIN_ZOOM = 10;

/** The bundled Protomaps style with local glyphs/sprites (app origin) and the verified pack's tiles. */
function offlineStyle(tilesUrl: string): StyleSpecification {
  const style = JSON.parse(JSON.stringify(baseStyle)) as StyleSpecification;
  const origin = window.location.origin;
  style.glyphs = `${origin}/map/fonts/{fontstack}/{range}.pbf`;
  style.sprite = `${origin}/map/sprites/light`;
  const source = style.sources.protomaps;
  if (source?.type !== 'vector') throw new Error('style: protomaps vector source missing');
  source.url = tilesUrl;
  return style;
}

export function MapScreen() {
  const t = useMessages();
  const focus = useNav((s) => s.mapFocus);
  const packs = useApp((s) => s.packs);
  const status = useApp((s) => s.status);
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<{ bbox: BBox; zoom: number } | null>(null);
  const [enabled, setEnabled] = useState<ReadonlySet<EmergencyCategory>>(() => new Set(EMERGENCY_CATEGORIES));
  const [pois, setPois] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [attribution, setAttribution] = useState<string[]>([]);
  const mapPack = newestVerified(packs, 'pmtiles')[0] ?? null;
  const placesIds = useMemo(() => newestVerified(packs, 'places').map((p) => p.id), [packs]);
  const placesKey = placesIds.join(',');
  const poisRef = useRef<Place[]>([]);
  poisRef.current = pois;

  // The model and the map are not resident together on small machines: opening the map unloads it.
  useEffect(() => {
    void llama.unload().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!mapPack || !container.current) return;
    const started = performance.now();
    const m = new MapLibre({
      container: container.current,
      style: offlineStyle(
        pmtilesUrl(mapPack.id, (name, handler) => {
          addProtocol(name, handler);
        }),
      ),
      center: focus ? [focus.lon, focus.lat] : PATRAS,
      zoom: focus ? 15 : 12,
      attributionControl: false,
    });
    map.current = m;
    if (import.meta.env.MODE === 'e2e') (window as unknown as { __skepiMap?: MapLibre }).__skepiMap = m;
    m.addControl(new NavigationControl({ showCompass: true }), 'top-right');
    const updateView = (): void => {
      const b = m.getBounds();
      setView({ bbox: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, zoom: m.getZoom() });
    };
    m.on('load', () => {
      setReady(Math.round(performance.now() - started));
      m.resize();
      if (m.getLayer('pois')) return;
      // POIs read before the style finished loading are drawn now.
      m.addSource('pois', { type: 'geojson', data: poisToGeoJson(poisRef.current) });
      m.addLayer({
        id: 'pois',
        type: 'circle',
        source: 'pois',
        paint: {
          'circle-radius': 7,
          'circle-color': ['match', ['get', 'category'], ...EMERGENCY_CATEGORIES.flatMap((c) => [c, POI_COLORS[c]]), '#4b5563'] as unknown as string,
          'circle-stroke-color': POI_OUTLINE,
          'circle-stroke-width': 2,
        },
      });
      if (focus) {
        m.addSource('focus', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: [focus.lon, focus.lat] }, properties: {} } });
        m.addLayer({ id: 'focus', type: 'circle', source: 'focus', paint: { 'circle-radius': 10, 'circle-color': '#1d4ed8', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
      }
      updateView();
    });
    m.on('moveend', updateView);
    const observer = new ResizeObserver(() => {
      m.resize();
    });
    observer.observe(container.current);
    m.on('error', (e: { error: Error }) => {
      setFailed(e.error.message);
    });
    m.on('click', 'pois', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.id;
      setSelected((cur) => (typeof id === 'number' ? (poisRef.current.find((p) => p.id === id) ?? cur) : cur));
    });
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
    // The map is rebuilt only for another pack or another focus place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapPack?.id, focus]);

  useEffect(() => {
    const ids = placesKey ? placesKey.split(',') : [];
    void placesAttribution(ids).then(setAttribution, () => {
      setAttribution([]);
    });
  }, [placesKey]);

  useEffect(() => {
    const ids = placesKey ? placesKey.split(',') : [];
    if (!view || view.zoom < POI_MIN_ZOOM || ids.length === 0 || enabled.size === 0) {
      setPois([]);
      return;
    }
    let live = true;
    void poisInView(ids, view.bbox, [...enabled]).then(
      (found) => {
        if (live) setPois(found);
      },
      () => {
        if (live) setPois([]);
      },
    );
    return () => {
      live = false;
    };
  }, [view, enabled, placesKey]);

  useEffect(() => {
    const src = map.current?.getSource<GeoJSONSource>('pois');
    src?.setData(poisToGeoJson(pois));
  }, [pois]);

  if (status === 'ready' && !mapPack) {
    return (
      <div className="map-bar">
        <p className="muted" data-testid="map-missing">
          {t.map.missing}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="map-bar stack" data-testid="map-screen">
        <div className="row">
          {EMERGENCY_CATEGORIES.map((c) => (
            <label key={c} className="check" style={{ minHeight: 32 }}>
              <input
                type="checkbox"
                data-testid={`poi-filter-${c}`}
                checked={enabled.has(c)}
                onChange={() => {
                  setEnabled((cur) => {
                    const next = new Set(cur);
                    if (next.has(c)) next.delete(c);
                    else next.add(c);
                    return next;
                  });
                }}
              />
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: POI_COLORS[c] }} />
              {t.map.poi[c]}
            </label>
          ))}
        </div>
        <div className="row muted">
          <span data-testid="map-status">{ready !== null ? t.map.ready(String(ready)) : failed ? t.map.failed : t.map.loading}</span>
          {failed && (
            <span className="muted" data-testid="map-error">
              {failed}
            </span>
          )}
          <span data-testid="poi-count">{placesIds.length === 0 ? t.map.noPlaces : view && view.zoom < POI_MIN_ZOOM ? t.map.zoomForPois : t.map.poiCount(pois.length)}</span>
        </div>
        {selected && (
          <div className="card" data-testid="poi-selected">
            {placeTitle(selected).title} · {placeTitle(selected).kind} · {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}
          </div>
        )}
        {focus && <div data-testid="map-focus">{focus.title}</div>}
      </div>
      <div ref={container} className="map" data-testid="map" />
      <div className="map-bar muted" data-testid="map-attribution">
        {[t.map.attribution, ...attribution.filter((a) => !t.map.attribution.includes(a.replace('©', '').trim().split(' (')[0] ?? a))].join(' · ')}
      </div>
    </>
  );
}
