import { Camera, GeoJSONSource, Layer, Map, NetworkManager, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { EMERGENCY_CATEGORIES, placeTitle, poisToGeoJson, type BBox, type EmergencyCategory, type Place } from '@skepi/core';
import { POI_COLORS, POI_OUTLINE } from '@skepi/ui-tokens';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import baseStyle from '../../../assets/map/style.json';
import { useStyles } from '../../components/ui';
import { llama, useContent } from '../../lib/content';
import { useMessages } from '../../lib/i18n';
import { placesAttribution, poisInView, syncPlacesPacks } from '../../lib/places';

// Patras / Achaia (test region of the Greece packs).
const PATRAS: [number, number] = [21.7346, 38.2466];
/** Below this zoom the POI layer stays empty (thousands of points would hide the map). */
const POI_MIN_ZOOM = 10;
const FOCUS_ZOOM = 15;

function offlineStyle(pmtilesPath: string): StyleSpecification {
  const style = JSON.parse(JSON.stringify(baseStyle)) as StyleSpecification;
  const source = style.sources.protomaps;
  if (source?.type !== 'vector') throw new Error('style: protomaps vector source missing');
  source.url = `pmtiles://file://${pmtilesPath}`;
  return style;
}

function num(v: string | string[] | undefined): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  const n = s === undefined ? NaN : Number(s);
  return Number.isFinite(n) ? n : null;
}

const CIRCLE_COLOR = [
  'match',
  ['get', 'category'],
  ...EMERGENCY_CATEGORIES.flatMap((c) => [c, POI_COLORS[c]]),
  '#4b5563',
] as const;

export default function MapScreen() {
  const styles = useStyles();
  const t = useMessages();
  const params = useLocalSearchParams<{ lat?: string; lon?: string; title?: string }>();
  const pmtilesPath = useContent((s) => s.pmtilesPath);
  const placesPaths = useContent((s) => s.placesPaths);
  const status = useContent((s) => s.status);
  const camera = useRef<CameraRef>(null);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [startedAt] = useState(() => performance.now());
  const [view, setView] = useState<{ bbox: BBox; zoom: number } | null>(null);
  const [enabled, setEnabled] = useState<ReadonlySet<EmergencyCategory>>(() => new Set(EMERGENCY_CATEGORIES));
  const [pois, setPois] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [attribution, setAttribution] = useState<string[]>([]);
  const focus = useMemo(() => {
    const lat = num(params.lat);
    const lon = num(params.lon);
    return lat !== null && lon !== null ? { lat, lon, title: typeof params.title === 'string' ? params.title : '' } : null;
  }, [params.lat, params.lon, params.title]);

  // T1: model and map never share memory; MapLibre treated as offline (zero egress).
  useFocusEffect(
    useCallback(() => {
      NetworkManager.setConnected(false);
      void llama.unload();
    }, []),
  );

  useEffect(() => {
    syncPlacesPacks(placesPaths);
    void placesAttribution(placesPaths).then(setAttribution, () => {
      setAttribution([]);
    });
  }, [placesPaths]);

  // A place chosen in the home search: centre on it.
  useEffect(() => {
    if (!focus) return;
    camera.current?.jumpTo({ center: [focus.lon, focus.lat], zoom: FOCUS_ZOOM });
  }, [focus]);

  // The POI layer follows the visible area (read from the verified places packs only).
  useEffect(() => {
    if (!view || view.zoom < POI_MIN_ZOOM || placesPaths.length === 0 || enabled.size === 0) {
      setPois([]);
      return;
    }
    let live = true;
    void poisInView(placesPaths, view.bbox, [...enabled]).then(
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
  }, [view, enabled, placesPaths]);

  const mapStyle = useMemo(() => (pmtilesPath ? offlineStyle(pmtilesPath) : null), [pmtilesPath]);
  const geojson = useMemo(() => poisToGeoJson(pois), [pois]);
  const focusGeojson = useMemo(
    () =>
      focus
        ? { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [focus.lon, focus.lat] }, properties: { title: focus.title } }] }
        : null,
    [focus],
  );

  if (status !== 'ready') return <View style={styles.center} />;
  if (!mapStyle) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted} testID="map-missing">
          {t.map.missing}
        </Text>
      </View>
    );
  }

  const toggle = (c: EmergencyCategory): void => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const selectedTitle = selected ? placeTitle(selected) : null;

  return (
    <View style={{ flex: 1 }} testID="map-screen">
      <Map
        style={{ flex: 1 }}
        mapStyle={mapStyle}
        attribution
        logo={false}
        onDidFinishRenderingMapFully={() => {
          setRenderMs((prev) => prev ?? performance.now() - startedAt);
        }}
        onDidFailLoadingMap={() => {
          setFailed(true);
        }}
        onRegionDidChange={(e) => {
          const [west, south, east, north] = e.nativeEvent.bounds;
          setView({ bbox: { west, south, east, north }, zoom: e.nativeEvent.zoom });
        }}
        onPress={() => {
          setSelected(null);
        }}
      >
        <Camera ref={camera} initialViewState={{ center: focus ? [focus.lon, focus.lat] : PATRAS, zoom: focus ? FOCUS_ZOOM : 12 }} />
        <GeoJSONSource
          id="skepi-pois"
          data={geojson}
          onPress={(e) => {
            const id = e.nativeEvent.features[0]?.id;
            const hit = pois.find((p) => p.id === id) ?? null;
            if (hit) {
              e.stopPropagation();
              setSelected(hit);
            }
          }}
        >
          <Layer
            type="circle"
            id="skepi-poi-circles"
            paint={{ 'circle-radius': 7, 'circle-color': CIRCLE_COLOR as unknown as string, 'circle-stroke-color': POI_OUTLINE, 'circle-stroke-width': 2 }}
          />
          <Layer
            type="symbol"
            id="skepi-poi-labels"
            minzoom={14}
            layout={{ 'text-field': ['get', 'title'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true }}
            paint={{ 'text-color': '#111827', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }}
          />
        </GeoJSONSource>
        {focusGeojson && (
          <GeoJSONSource id="skepi-focus" data={focusGeojson}>
            <Layer type="circle" id="skepi-focus-circle" paint={{ 'circle-radius': 9, 'circle-color': '#111827', 'circle-stroke-color': POI_OUTLINE, 'circle-stroke-width': 3 }} />
          </GeoJSONSource>
        )}
      </Map>
      <View style={[styles.row, { padding: 6 }]} accessibilityRole="toolbar" testID="poi-filters">
        {EMERGENCY_CATEGORIES.map((c) => (
          <Pressable
            key={c}
            testID={`poi-filter-${c}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: enabled.has(c) }}
            style={[styles.chip, { borderWidth: 2, borderColor: enabled.has(c) ? POI_COLORS[c] : 'transparent', opacity: enabled.has(c) ? 1 : 0.6 }]}
            onPress={() => {
              toggle(c);
            }}
          >
            <Text style={styles.chipText}>{t.map.poi[c]}</Text>
          </Pressable>
        ))}
      </View>
      {selected && selectedTitle && (
        <View style={[styles.card, { marginHorizontal: 6 }]} testID="poi-selected" accessible accessibilityRole="summary">
          <Text style={styles.title}>{selectedTitle.title}</Text>
          {selectedTitle.local && <Text style={styles.text}>{selectedTitle.local}</Text>}
          <Text style={styles.muted}>{`${selectedTitle.kind} · ${selected.lat.toFixed(5)}, ${selected.lon.toFixed(5)}`}</Text>
        </View>
      )}
      <Text style={[styles.muted, { paddingHorizontal: 6 }]} testID="poi-count">
        {placesPaths.length === 0
          ? t.map.noPlaces
          : !view || view.zoom < POI_MIN_ZOOM
            ? t.map.zoomForPois
            : t.map.poiCount(pois.length)}
      </Text>
      <Text style={[styles.muted, { paddingHorizontal: 6 }]} testID="map-status">
        {failed ? t.map.failed : renderMs === null ? t.map.loading : t.map.ready(renderMs.toFixed(0))}
      </Text>
      <Text style={[styles.muted, { paddingHorizontal: 6, paddingBottom: 6 }]} testID="map-attribution">
        {[t.map.attribution, ...attribution.filter((a) => !a.includes('OpenStreetMap contributors'))].join(' · ')}
      </Text>
    </View>
  );
}
