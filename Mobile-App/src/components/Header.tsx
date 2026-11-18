import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { BackIcon } from './Icons';

type Props = { title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode };

export function Header({ title, subtitle, onBack, right }: Props) {
  return (
    <View style={styles.bar}>
      {onBack && (
        <Pressable onPress={onBack} hitSlop={10} style={styles.back} android_ripple={{ color: '#e2e8f0', radius: 24 }}>
          <BackIcon />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8, backgroundColor: colors.bg },
  back: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 21, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, fontWeight: '600' }
});
