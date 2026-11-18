import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import type { ZoneState } from '../store';
import { statusOf } from '../status';
import { fmt, siteOf } from '../utils';
import { Badge } from './Badge';
import { Metric } from './Metric';
import { useBlink } from './useBlink';

type Props = { zone: ZoneState; connected: boolean; onPress: () => void };

/** One zone on the home screen: live numbers only (no graphs). Blinks red on an unacknowledged alert. */
export function ZoneCard({ zone, connected, onPress }: Props) {
  const v = zone.view;
  const ok = !!v && v.sensor_ok !== false;
  const st = statusOf(zone, connected);
  const blink = useBlink(zone.alert, 450);
  const bg = blink.interpolate({ inputRange: [0, 1], outputRange: [colors.card, '#fecaca'] });
  const border = zone.alert ? colors.red : 'transparent';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.press, pressed && { opacity: 0.85 }]} android_ripple={{ color: '#e2e8f0' }}>
      <Animated.View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.zone}>Zone {zone.id}</Text>
            <Text style={styles.site} numberOfLines={1}>{siteOf(zone.name)}</Text>
          </View>
          <Badge status={st} />
        </View>
        <View style={styles.metrics}>
          <Metric label="Temp" value={ok ? fmt(v!.temperature, 1) : '--'} unit={'\u00b0C'} high={ok && !!v!.t_high} />
          <Metric label="Humidity" value={ok ? fmt(v!.humidity, 1) : '--'} unit="%" high={ok && !!v!.h_high} />
          <Metric label="Pressure" value={v ? fmt(v.pressure, 2) : '--'} unit="kPa" high={!!v && !!v.p_high} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: { flex: 1 },
  card: { flex: 1, borderRadius: radius.card, borderWidth: 2, padding: 10, justifyContent: 'space-between' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  zone: { fontSize: 17, fontWeight: '800', color: colors.text },
  site: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  metrics: { gap: 2 }
});
