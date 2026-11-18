import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { useStore } from '../store';
import { ZoneCard } from '../components/ZoneCard';
import { GearIcon, ToolsIcon } from '../components/Icons';
import { siteOf } from '../utils';

type Props = { onOpenZone: (id: number) => void; onOpenDiag: () => void; onOpenSettings: () => void };

export function HomeScreen({ onOpenZone, onOpenDiag, onOpenSettings }: Props) {
  const { zones, conn } = useStore();
  const insets = useSafeAreaInsets();
  const alerting = zones.filter((z) => z.alert);
  const offline = !conn.connected && !!conn.error;

  const dot = conn.connected ? colors.green : conn.error ? colors.red : colors.orange;
  const statusText = conn.connected ? 'ESP32 connected' : conn.error ? 'ESP32 offline' : 'Connecting\u2026';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Patient Monitoring System</Text>
      </View>

      {alerting.length > 0 && (
        <Pressable style={styles.alertBar} onPress={() => onOpenZone(alerting[0].id)}>
          <Text style={styles.alertText} numberOfLines={2}>
            {'\u26a0'} ALERT: {alerting.map((z) => `Zone ${z.id} ${siteOf(z.name)}`).join(', ')}
          </Text>
          <Text style={styles.alertGo}>View</Text>
        </Pressable>
      )}
      {offline && (
        <Pressable style={styles.offBar} onPress={onOpenSettings}>
          <Text style={styles.offText} numberOfLines={2}>
            {conn.everConnected ? 'Connection lost \u2013 showing last known readings.' : `Cannot reach the device at ${conn.host}.`} Tap to fix.
          </Text>
        </Pressable>
      )}

      <View style={styles.grid}>
        <View style={styles.row}>
          <ZoneCard zone={zones[0]} connected={conn.connected} onPress={() => onOpenZone(0)} />
          <ZoneCard zone={zones[1]} connected={conn.connected} onPress={() => onOpenZone(1)} />
        </View>
        <View style={styles.row}>
          <ZoneCard zone={zones[2]} connected={conn.connected} onPress={() => onOpenZone(2)} />
          <ZoneCard zone={zones[3]} connected={conn.connected} onPress={() => onOpenZone(3)} />
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable style={[styles.bBtn, { flex: 1.4 }]} onPress={onOpenSettings} android_ripple={{ color: '#e2e8f0' }}>
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bTitle} numberOfLines={1}>{statusText}</Text>
            <Text style={styles.bSub} numberOfLines={1}>{conn.host}</Text>
          </View>
          <GearIcon />
        </Pressable>
        <Pressable style={[styles.bBtn, { flex: 1 }]} onPress={onOpenDiag} android_ripple={{ color: '#e2e8f0' }}>
          <ToolsIcon />
          <Text style={styles.bTitle}>Diagnostics</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  titleRow: { paddingHorizontal: 14, paddingVertical: 12 },
  title: { fontSize: 23, fontWeight: '800', color: colors.text },
  alertBar: { marginHorizontal: 12, marginBottom: 8, backgroundColor: colors.red, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertText: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 13 },
  alertGo: { color: '#fff', fontWeight: '800', fontSize: 13, borderWidth: 1.5, borderColor: '#fff', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 3 },
  offBar: { marginHorizontal: 12, marginBottom: 8, backgroundColor: colors.orange, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  offText: { color: '#000', fontWeight: '700', fontSize: 13 },
  grid: { flex: 1, paddingHorizontal: 12, gap: 10, paddingBottom: 10 },
  row: { flex: 1, flexDirection: 'row', gap: 10 },
  bottom: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingTop: 10, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  bBtn: { height: 56, borderRadius: radius.button, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10, overflow: 'hidden' },
  dot: { width: 11, height: 11, borderRadius: 6 },
  bTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  bSub: { fontSize: 11, color: colors.muted, fontWeight: '600' }
});
