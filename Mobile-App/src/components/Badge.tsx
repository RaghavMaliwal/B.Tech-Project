import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { badgeColors, Status } from '../status';

export function Badge({ status }: { status: Status }) {
  const c = badgeColors[status.kind];
  return (
    <View style={[styles.b, { backgroundColor: c.bg }]}>
      <Text style={[styles.t, { color: c.fg }]}>{status.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  b: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  t: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 }
});
