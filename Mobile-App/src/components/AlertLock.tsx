import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fill, radius } from '../theme';
import type { ApiResult } from '../api';
import { alertReason, titleOf } from '../utils';
import type { ZoneState } from '../store';

type Props = { zone: ZoneState; onAck: () => Promise<ApiResult> };

/** Frosted, inactive overlay shown over a zone screen while its alert is unacknowledged. */
export function AlertLock({ zone, onAck }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const press = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const r = await onAck();
    setBusy(false);
    if (!r.ok && r.status !== 409) setError(r.error || 'Could not acknowledge. Try again.');
  };

  return (
    // the full-screen Pressable swallows every touch, so the screen below is inactive
    <Pressable style={styles.overlay} onPress={() => undefined}>
      <View style={styles.box}>
        <View style={styles.icon}><Text style={styles.iconText}>!</Text></View>
        <Text style={styles.title}>Alert {'\u2013'} {titleOf(zone.id, zone.name)}</Text>
        <Text style={styles.sub}>Immediate attention required {'\u2013'} reposition the patient and check the site.</Text>
        <Text style={styles.reason}>{alertReason(zone.dev)}</Text>
        <Pressable style={({ pressed }) => [styles.btn, (pressed || busy) && { opacity: 0.75 }]} onPress={press} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Acknowledge</Text>}
        </Pressable>
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...fill,
    backgroundColor: 'rgba(241,245,249,0.93)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 50
  },
  box: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderColor: colors.red,
    borderWidth: 2,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    elevation: 8
  },
  icon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  iconText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  title: { fontSize: 19, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 8 },
  reason: { fontSize: 14, fontWeight: '700', color: colors.red, textAlign: 'center', marginBottom: 16 },
  btn: { backgroundColor: colors.red, borderRadius: radius.button, paddingVertical: 14, paddingHorizontal: 44, minWidth: 200, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  error: { color: colors.red, fontSize: 13, marginTop: 10, textAlign: 'center' }
});
