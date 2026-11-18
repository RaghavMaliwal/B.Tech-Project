import React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';
import { useBlink } from './useBlink';

type Props = {
  label?: string;
  value: string;
  unit: string;
  high: boolean;         // threshold exceeded -> blinking red (same as desktop cards)
  big?: boolean;
  style?: object;
};

export function Metric({ label, value, unit, high, big, style }: Props) {
  const blink = useBlink(high, 600);
  const bg = blink.interpolate({ inputRange: [0, 1], outputRange: [high ? '#fff5f5' : 'transparent', '#fecaca'] });
  return (
    <Animated.View style={[styles.box, big && styles.boxBig, high && styles.boxHigh, { backgroundColor: bg }, style]}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <Text style={[styles.value, big && styles.valueBig, high && { color: colors.redDark }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        <Text style={[styles.unit, big && styles.unitBig]}> {unit}</Text>
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1.5, borderColor: 'transparent' },
  boxBig: { paddingVertical: 12, paddingHorizontal: 10, backgroundColor: colors.card },
  boxHigh: { borderColor: colors.red },
  label: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 22, fontWeight: '700', color: colors.text },
  valueBig: { fontSize: 28 },
  unit: { fontSize: 13, fontWeight: '600', color: colors.muted },
  unitBig: { fontSize: 15 }
});
