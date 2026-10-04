import { Camera, Map, NetworkManager, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import baseStyle from '../../../assets/map/style.json';
import { styles } from '../../components/ui';
import { llama, useContent } from '../../lib/content';
import { useMessages } from '../../lib/i18n';

// Patras / Achaia
const PATRAS: [number, number] = [21.7346, 38.2466];

function offlineStyle(pmtilesPath: string): StyleSpecification {
  const style = JSON.parse(JSON.stringify(baseStyle)) as StyleSpecification;
  const source = style.sources.protomaps;
  if (source?.type !== 'vector') throw new Error('style: protomaps vector source missing');
  source.url = `pmtiles://file://${pmtilesPath}`;
  return style;
}

export default function MapScreen() {
  const t = useMessages();
  const pmtilesPath = useContent((s) => s.pmtilesPath);
  const status = useContent((s) => s.status);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [startedAt] = useState(() => performance.now());

  // T1: model and map never share memory; MapLibre treated as offline (zero egress).
  useFocusEffect(
    useCallback(() => {
      NetworkManager.setConnected(false);
      void llama.unload();
    }, []),
  );

  const mapStyle = useMemo(() => (pmtilesPath ? offlineStyle(pmtilesPath) : null), [pmtilesPath]);

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
      >
        <Camera initialViewState={{ center: PATRAS, zoom: 12 }} />
      </Map>
      <Text style={[styles.muted, { padding: 6 }]} testID="map-status">
        {failed
          ? t.map.failed
          : renderMs === null
            ? t.map.loading
            : t.map.ready(renderMs.toFixed(0))}
      </Text>
    </View>
  );
}
