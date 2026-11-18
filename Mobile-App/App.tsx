import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MonitorProvider, useStore } from './src/store';
import { colors } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { ZoneScreen } from './src/screens/ZoneScreen';
import { DiagnosticsScreen } from './src/screens/DiagnosticsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

type Route = { name: 'home' } | { name: 'zone'; id: number } | { name: 'diag' } | { name: 'settings' };

function Root() {
  const { ready, openZoneRequest, consumeOpenZone } = useStore();
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);

  const push = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  // Android hardware / gesture back: go up one screen, leave the app only from Home
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) { pop(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  // tapping an alert notification opens that zone
  useEffect(() => {
    if (openZoneRequest !== null) {
      setStack([{ name: 'home' }, { name: 'zone', id: openZoneRequest }]);
      consumeOpenZone();
    }
  }, [openZoneRequest, consumeOpenZone]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  const top = stack[stack.length - 1];
  switch (top.name) {
    case 'zone':
      return <ZoneScreen key={`z${top.id}`} zoneId={top.id} onBack={pop} />;
    case 'diag':
      return <DiagnosticsScreen onBack={pop} />;
    case 'settings':
      return <SettingsScreen onBack={pop} />;
    default:
      return (
        <HomeScreen
          onOpenZone={(id) => push({ name: 'zone', id })}
          onOpenDiag={() => push({ name: 'diag' })}
          onOpenSettings={() => push({ name: 'settings' })}
        />
      );
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <MonitorProvider>
        <Root />
      </MonitorProvider>
    </SafeAreaProvider>
  );
}
