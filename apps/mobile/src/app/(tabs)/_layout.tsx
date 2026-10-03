import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarIconStyle: { display: 'none' }, tabBarLabelStyle: { fontSize: 14 } }}>
      <Tabs.Screen name="index" options={{ title: 'Αναζήτηση', tabBarButtonTestID: 'tab-search' }} />
      <Tabs.Screen name="ask" options={{ title: 'Ρώτα', tabBarButtonTestID: 'tab-ask' }} />
      <Tabs.Screen name="map" options={{ title: 'Χάρτης', tabBarButtonTestID: 'tab-map' }} />
      <Tabs.Screen name="bench" options={{ title: 'Bench', tabBarButtonTestID: 'tab-bench' }} />
    </Tabs>
  );
}
