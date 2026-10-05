import { Tabs } from 'expo-router';
import { useMessages } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function TabsLayout() {
  const t = useMessages();
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 13 },
        tabBarStyle: { backgroundColor: theme.bg, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        sceneStyle: { backgroundColor: theme.bg },
        animation: 'none',
      }}
    >
      <Tabs.Screen name="index" options={{ title: t.tabs.search, tabBarButtonTestID: 'tab-search', tabBarAccessibilityLabel: t.tabs.search }} />
      <Tabs.Screen name="ask" options={{ title: t.tabs.ask, tabBarButtonTestID: 'tab-ask', tabBarAccessibilityLabel: t.tabs.ask }} />
      <Tabs.Screen name="map" options={{ title: t.tabs.map, tabBarButtonTestID: 'tab-map', tabBarAccessibilityLabel: t.tabs.map }} />
      <Tabs.Screen name="tools" options={{ title: t.tabs.tools, tabBarButtonTestID: 'tab-tools', tabBarAccessibilityLabel: t.tabs.tools }} />
      <Tabs.Screen name="library" options={{ title: t.tabs.library, tabBarButtonTestID: 'tab-library', tabBarAccessibilityLabel: t.tabs.library }} />
      <Tabs.Screen name="bench" options={{ title: t.tabs.bench, tabBarButtonTestID: 'tab-bench', tabBarAccessibilityLabel: t.tabs.bench }} />
    </Tabs>
  );
}
