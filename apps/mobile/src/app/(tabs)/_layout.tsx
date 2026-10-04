import { Tabs } from 'expo-router';
import { useMessages } from '../../lib/i18n';

export default function TabsLayout() {
  const t = useMessages();
  return (
    <Tabs screenOptions={{ tabBarIconStyle: { display: 'none' }, tabBarLabelStyle: { fontSize: 14 } }}>
      <Tabs.Screen name="index" options={{ title: t.tabs.search, tabBarButtonTestID: 'tab-search' }} />
      <Tabs.Screen name="ask" options={{ title: t.tabs.ask, tabBarButtonTestID: 'tab-ask' }} />
      <Tabs.Screen name="map" options={{ title: t.tabs.map, tabBarButtonTestID: 'tab-map' }} />
      <Tabs.Screen name="bench" options={{ title: t.tabs.bench, tabBarButtonTestID: 'tab-bench' }} />
    </Tabs>
  );
}
