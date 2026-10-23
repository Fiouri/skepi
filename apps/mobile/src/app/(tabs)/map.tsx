import { Camera, GeoJSONSource, Layer, Map, NetworkManager, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import {
  chooseHeading,
  compassPoint,
  distanceKm,
  EMERGENCY_CATEGORIES,
  fixState,
  followStep,
  formatDecimal,
  formatDms,
  HEADING_INTERVAL_MS,
  HEADING_INTERVAL_MS_BLACKOUT,
  INITIAL_FOLLOW,
  LOCATION_INTERVAL_MS,
  LOCATION_INTERVAL_MS_BLACKOUT,
  locationFeatures,
  mapHome,
  multiSourceStyle,
  placeTitle,
  poisToGeoJson,
  smoothHeading,
  STALE_AFTER_MS,
  STALE_AFTER_MS_BLACKOUT,
  type BBox,
  type EmergencyCategory,
  type FollowEvent,
  type FollowState,
  type LocationFix,
  type Place,
} from '@skepi/core';
import { POI_COLORS, POI_OUTLINE } from '@skepi/ui-tokens';
import { ExpoEmergencyTools, type GnssFix } from 'expo-emergency-tools';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, Pressable, Text, View } from 'react-native';
import baseStyle from '../../../assets/map/style.json';
import { Button, useStyles } from '../../components/ui';
import { llama, useContent } from '../../lib/content';
import { useMessages } from '../../lib/i18n';
import { countryOfPosition, placesAttribution, poisInView, syncPlacesPacks } from '../../lib/places';
import { usePrefs } from '../../lib/prefs';

/** The country of the position is looked up again after this distance or time (not on every fix). */
const COUNTRY_RECHECK_KM = 1;
const COUNTRY_RECHECK_MS = 60_000;
/** Below this zoom the POI layer stays empty (thousands of points would hide the map). */
const POI_MIN_ZOOM = 10;
const FOCUS_ZOOM = 15;
/** "My location" zooms in to at least this level. */
const LOCATE_ZOOM = 15;
/** Not a POI colour (police is #1d4ed8): the puck is a ringed dot with a halo, unlike the POI dots. */
const LOCATION_BLUE = '#0a84ff';
const LOCATION_GREY = '#6b7280';

/** The bundled style over every installed, verified map pack (one source each; core multiSourceStyle). */
function offlineStyle(packs: readonly { id: string; path: string }[]): StyleSpecification | null {
  return multiSourceStyle(
    baseStyle as unknown as StyleSpecification,
    packs.map((p) => ({ id: p.id, url: `pmtiles://file://${p.path}` })),
  );
}

function num(v: string | string[] | undefined): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  const n = s === undefined ? NaN : Number(s);
  return Number.isFinite(n) ? n : null;
}

function toFix(e: GnssFix): LocationFix {
  return { latitude: e.latitude, longitude: e.longitude, accuracyM: e.accuracyM, speedMps: e.speedMps, bearingDeg: e.bearingDeg, timeMs: e.timeMs };
}

function errorCode(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : '';
}

/**
 * Asks only when the user presses "My location" (never on opening the map). Android asks here; iOS asks
 * inside startLocationUpdates (CoreLocation "while in use").
 */
async function locationPermission(ask: boolean): Promise<boolean> {
  if (ExpoEmergencyTools.locationPermissionGranted()) return true;
  if (!ask) return false;
  if (Platform.OS !== 'android') return true;
  return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)) === PermissionsAndroid.RESULTS.GRANTED;
}

const CIRCLE_COLOR = [
  'match',
  ['get', 'category'],
  ...EMERGENCY_CATEGORIES.flatMap((c) => [c, POI_COLORS[c]]),
  '#4b5563',
] as const;

type LocationStatus = 'off' | 'permission' | 'gps-off' | 'on';

export default function MapScreen() {
  const styles = useStyles();
  const t = useMessages();
  const params = useLocalSearchParams<{ lat?: string; lon?: string; title?: string }>();
  const mapPacks = useContent((s) => s.mapPacks);
  const placesPacks = useContent((s) => s.placesPacks);
  const placesPaths = useContent((s) => s.placesPaths);
  const status = useContent((s) => s.status);
  const blackout = usePrefs((s) => s.blackout);
  const country = usePrefs((s) => s.country);
  const setPositionCountry = usePrefs((s) => s.setPositionCountry);
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

  // --- Live position and heading (decision 2026-10-21) ---------------------------------------
  // Only while the map tab is focused and the app is in the foreground; the fix lives in this
  // component's memory only: never stored, logged, shared or sent over P2P.
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('off');
  const [permissionAsks, setPermissionAsks] = useState(0);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [satellites, setSatellites] = useState<{ visible: number; used: number } | null>(null);
  const [compass, setCompass] = useState<{ degrees: number; accuracy: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [follow, setFollow] = useState<FollowState>(INITIAL_FOLLOW);
  const followRef = useRef<FollowState>(INITIAL_FOLLOW);
  const fixRef = useRef<LocationFix | null>(null);
  // Without a place to show: the chosen country (or the first installed one), whole.
  const home = useMemo(() => mapHome(mapPacks.flatMap((p) => (p.region ? [p.region] : [])), country), [mapPacks, country]);
  const zoomRef = useRef(focus ? FOCUS_ZOOM : home.zoom);
  const countryCheck = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const active = focused && appActive;

  // T1: model and map never share memory; MapLibre treated as offline (zero egress).
  useFocusEffect(
    useCallback(() => {
      NetworkManager.setConnected(false);
      void llama.unload();
      setFocused(true);
      return () => {
        setFocused(false);
      };
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setAppActive(s === 'active');
    });
    return () => {
      sub.remove();
    };
  }, []);

  const moveCamera = useCallback(
    (target: LocationFix, zoomIn: boolean) => {
      const zoom = zoomIn ? Math.max(zoomRef.current, LOCATE_ZOOM) : undefined;
      const center: [number, number] = [target.longitude, target.latitude];
      // Blackout mode: no animations.
      if (blackout) camera.current?.jumpTo({ center, ...(zoom !== undefined ? { zoom } : {}) });
      else camera.current?.easeTo({ center, ...(zoom !== undefined ? { zoom } : {}), duration: 300 });
    },
    [blackout],
  );

  const dispatchFollow = useCallback(
    (event: FollowEvent): boolean => {
      const step = followStep(followRef.current, event);
      followRef.current = step.state;
      setFollow(step.state);
      return step.centre;
    },
    [],
  );

  useEffect(() => {
    if (!active) return undefined;
    const run = { stopped: false };
    const subs = [
      ExpoEmergencyTools.addListener('onLocation', (e) => {
        const next = toFix(e);
        fixRef.current = next;
        setFix(next);
        setNow(Date.now());
        if (dispatchFollow({ type: 'fix' })) moveCamera(next, followRef.current.mode !== 'follow');
      }),
      ExpoEmergencyTools.addListener('onGnssStatus', (s) => {
        setSatellites(s);
      }),
      ExpoEmergencyTools.addListener('onHeading', (h) => {
        setCompass((prev) => ({ degrees: smoothHeading(prev?.degrees ?? null, h.heading), accuracy: h.accuracy }));
      }),
    ];
    void (async () => {
      const granted = await locationPermission(false);
      if (run.stopped) return;
      if (!granted) {
        setLocationStatus('permission');
        return;
      }
      try {
        ExpoEmergencyTools.startLocationUpdates(blackout ? LOCATION_INTERVAL_MS_BLACKOUT : LOCATION_INTERVAL_MS);
        setLocationStatus('on');
      } catch (e) {
        const code = errorCode(e);
        setLocationStatus(code === 'ERR_GPS_DISABLED' ? 'gps-off' : 'permission');
        return;
      }
      // The heading is drawn only with a position: no compass without location updates.
      try {
        if (ExpoEmergencyTools.compassAvailable()) ExpoEmergencyTools.startCompass(blackout ? HEADING_INTERVAL_MS_BLACKOUT : HEADING_INTERVAL_MS);
      } catch {
        setCompass(null);
      }
    })();
    // The puck turns grey when no fix arrives for a while.
    const tick = setInterval(
      () => {
        setNow(Date.now());
      },
      blackout ? LOCATION_INTERVAL_MS_BLACKOUT : 5_000,
    );
    return () => {
      run.stopped = true;
      clearInterval(tick);
      for (const s of subs) s.remove();
      ExpoEmergencyTools.stopLocationUpdates();
      ExpoEmergencyTools.stopCompass();
      setCompass(null);
    };
  }, [active, blackout, permissionAsks, dispatchFollow, moveCamera]);

  const locateMe = async (): Promise<void> => {
    if (locationStatus !== 'on') {
      const granted = await locationPermission(true);
      if (!granted) {
        setLocationStatus('permission');
        return;
      }
      // Restart the updates with the permission now granted (iOS asks inside startLocationUpdates).
      setPermissionAsks((n) => n + 1);
    }
    const current = fixRef.current;
    if (dispatchFollow({ type: 'press', hasFix: current !== null }) && current) moveCamera(current, true);
  };

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

  const mapStyle = useMemo(() => offlineStyle(mapPacks), [mapPacks]);
  const geojson = useMemo(() => poisToGeoJson(pois), [pois]);
  const focusGeojson = useMemo(
    () =>
      focus
        ? { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [focus.lon, focus.lat] }, properties: { title: focus.title } }] }
        : null,
    [focus],
  );
  const puckState = fixState(fix, now, blackout ? STALE_AFTER_MS_BLACKOUT : STALE_AFTER_MS);

  // Emergency numbers follow the installed country of a live position (memory only).
  useEffect(() => {
    if (!fix || puckState !== 'live') return;
    const last = countryCheck.current;
    if (last && Date.now() - last.at < COUNTRY_RECHECK_MS && distanceKm(last.lat, last.lon, fix.latitude, fix.longitude) < COUNTRY_RECHECK_KM) return;
    countryCheck.current = { lat: fix.latitude, lon: fix.longitude, at: Date.now() };
    const packs = [...mapPacks.map((p) => ({ ...p, kind: 'pmtiles' as const })), ...placesPacks.map((p) => ({ ...p, kind: 'places' as const }))];
    void countryOfPosition(packs, fix.latitude, fix.longitude).then(setPositionCountry, () => {
      setPositionCountry(null);
    });
  }, [fix, puckState, mapPacks, placesPacks, setPositionCountry]);
  const heading = chooseHeading(compass, puckState === 'live' ? fix : null);
  const zoom = view?.zoom ?? zoomRef.current;
  const locationGeojson = useMemo(
    () => (fix && puckState !== 'none' ? locationFeatures(fix, heading, puckState, zoom) : null),
    [fix, heading, puckState, zoom],
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
        onRegionWillChange={(e) => {
          // A pan or zoom by the user leaves follow mode; camera moves made by the app do not.
          if (e.nativeEvent.userInteraction) dispatchFollow({ type: 'pan' });
        }}
        onRegionDidChange={(e) => {
          const [west, south, east, north] = e.nativeEvent.bounds;
          zoomRef.current = e.nativeEvent.zoom;
          setView({ bbox: { west, south, east, north }, zoom: e.nativeEvent.zoom });
        }}
        onPress={() => {
          setSelected(null);
        }}
      >
        <Camera ref={camera} initialViewState={{ center: focus ? [focus.lon, focus.lat] : home.center, zoom: focus ? FOCUS_ZOOM : home.zoom }} />
        <GeoJSONSource
          id="skepi-pois"
          data={geojson}
          onPress={(e) => {
            // The feature id is the index in `pois` (poisToGeoJson): row ids repeat across packs.
            const id = Number(e.nativeEvent.features[0]?.id);
            const hit = Number.isInteger(id) ? (pois[id] ?? null) : null;
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
        {locationGeojson && (
          <GeoJSONSource id="skepi-location" data={locationGeojson}>
            <Layer
              type="fill"
              id="skepi-location-accuracy"
              filter={['==', ['get', 'kind'], 'accuracy']}
              paint={{ 'fill-color': puckState === 'live' ? LOCATION_BLUE : LOCATION_GREY, 'fill-opacity': 0.15, 'fill-outline-color': puckState === 'live' ? LOCATION_BLUE : LOCATION_GREY }}
            />
            <Layer type="fill" id="skepi-location-cone" filter={['==', ['get', 'kind'], 'cone']} paint={{ 'fill-color': LOCATION_BLUE, 'fill-opacity': 0.3 }} />
            <Layer
              type="circle"
              id="skepi-location-halo"
              filter={['==', ['get', 'kind'], 'puck']}
              paint={{ 'circle-radius': 20, 'circle-color': puckState === 'live' ? LOCATION_BLUE : LOCATION_GREY, 'circle-opacity': 0.2 }}
            />
            <Layer
              type="circle"
              id="skepi-location-ring"
              filter={['==', ['get', 'kind'], 'puck']}
              paint={{ 'circle-radius': 11, 'circle-color': '#ffffff', 'circle-stroke-color': puckState === 'live' ? LOCATION_BLUE : LOCATION_GREY, 'circle-stroke-width': 3 }}
            />
            <Layer
              type="circle"
              id="skepi-location-puck"
              filter={['==', ['get', 'kind'], 'puck']}
              paint={{ 'circle-radius': 6, 'circle-color': puckState === 'live' ? LOCATION_BLUE : LOCATION_GREY }}
            />
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
      <LocationPanel
        status={locationStatus}
        fix={fix}
        state={puckState}
        now={now}
        heading={heading}
        satellites={satellites}
        following={follow.mode === 'follow'}
        onLocate={() => {
          void locateMe();
        }}
      />
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

/**
 * Under the map: the "My location" button, the puck state in words (screen readers cannot see the
 * map), the coordinates and the heading.
 */
function LocationPanel({
  status,
  fix,
  state,
  now,
  heading,
  satellites,
  following,
  onLocate,
}: {
  status: LocationStatus;
  fix: LocationFix | null;
  state: 'none' | 'stale' | 'live';
  now: number;
  heading: { degrees: number; source: 'compass' | 'course' } | null;
  satellites: { visible: number; used: number } | null;
  following: boolean;
  onLocate: () => void;
}) {
  const t = useMessages();
  const styles = useStyles();
  const accuracy = fix?.accuracyM != null ? fix.accuracyM.toFixed(0) : null;
  return (
    <View style={{ paddingHorizontal: 6, gap: 4 }} testID="map-location">
      <View style={styles.row}>
        <Button testID="map-my-location" label={following ? t.map.myLocationFollowing : t.map.myLocation} onPress={onLocate} />
        {status === 'on' && state === 'live' && (
          <Text style={styles.text} testID="map-puck" accessibilityRole="text">
            {t.map.youAreHere(accuracy)}
          </Text>
        )}
        {status === 'on' && state === 'stale' && fix && (
          <Text style={styles.muted} testID="map-puck-stale">
            {t.map.lastKnown(Math.max(0, Math.round((now - fix.timeMs) / 1000)))}
          </Text>
        )}
      </View>
      {status === 'permission' && (
        <Text style={styles.muted} testID="map-location-permission">
          {t.map.permissionNeeded}
        </Text>
      )}
      {status === 'gps-off' && (
        <Text style={styles.error} testID="map-gps-off">
          {t.map.gpsOff}
        </Text>
      )}
      {status === 'on' && state === 'none' && (
        <View testID="map-waiting-gps">
          <Text style={styles.text}>{t.map.waitingGps}</Text>
          <Text style={styles.muted}>{t.map.waitingGpsDetail}</Text>
          {satellites && <Text style={styles.muted}>{t.map.satellites(satellites)}</Text>}
        </View>
      )}
      {fix && state !== 'none' && (
        <View testID="map-coordinates" accessible>
          <Text style={styles.mono} selectable testID="map-coordinates-decimal">
            {formatDecimal(fix.latitude, fix.longitude)}
          </Text>
          <Text style={styles.muted} selectable>
            {formatDms(fix.latitude, fix.longitude)}
          </Text>
          <Text style={styles.muted} testID="map-heading">
            {heading && state === 'live' ? t.map.heading({ degrees: Math.round(heading.degrees) % 360, point: compassPoint(heading.degrees), source: heading.source }) : t.map.noHeading}
          </Text>
        </View>
      )}
    </View>
  );
}
