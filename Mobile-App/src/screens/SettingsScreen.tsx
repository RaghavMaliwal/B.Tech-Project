import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useStore } from '../store';
import * as Api from '../api';
import { Header } from '../components/Header';
import { Btn, Card, Msg, ui } from '../components/ui';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { conn, settings, changeHost, updateSettings } = useStore();
  const insets = useSafeAreaInsets();
  const [host, setHost] = useState(settings.host);
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' | 'info' } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState('');
  const cancel = useRef({ cancelled: false });

  useEffect(() => () => { cancel.current.cancelled = true; }, []);

  const save = async () => {
    const r = await changeHost(host);
    setMsg(r.ok ? { text: 'Saved. Connecting\u2026', kind: 'info' } : { text: r.error || 'Invalid address', kind: 'err' });
  };

  const find = async () => {
    if (scanning) return;
    cancel.current = { cancelled: false };
    setScanning(true);
    setMsg({ text: 'Looking for the device on this Wi-Fi network\u2026', kind: 'info' });
    setProgress('');
    const found = await Api.discoverDevice((d, t) => setProgress(`Scanned ${d} / ${t} addresses`), cancel.current);
    setScanning(false);
    setProgress('');
    if (cancel.current.cancelled) return;
    if (found) {
      setHost(found);
      await changeHost(found);
      setMsg({ text: `Found device at ${found}`, kind: 'ok' });
    } else {
      setMsg({ text: 'No device found. Make sure the phone and the ESP32 are on the same Wi-Fi, or type the IP shown in the Arduino serial monitor.', kind: 'err' });
    }
  };

  const dot = conn.connected ? colors.green : conn.error ? colors.red : colors.orange;
  const status = conn.connected ? 'Connected' : conn.error ? 'Offline' : 'Connecting\u2026';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title="Device & Settings" onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
        <Card title="ESP32 connection">
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: dot }]} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
          {conn.connected && (
            <Text style={ui.hint}>
              IP {conn.ip}  {'\u00b7'}  Wi-Fi {conn.rssi} dBm  {'\u00b7'}  up {Math.floor((conn.uptime ?? 0) / 60)} min
            </Text>
          )}
          {!conn.connected && !!conn.error && <Text style={[ui.hint, { color: colors.redDark }]}>{conn.error}</Text>}

          <Text style={ui.label}>Device address</Text>
          <TextInput
            style={ui.input}
            value={host}
            onChangeText={setHost}
            placeholder="e.g. 192.168.1.50"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={[ui.hint, { marginTop: 6 }]}>
            The IP is printed in the Arduino serial monitor at start-up. The phone must be on the same Wi-Fi as the ESP32.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn label="Save & connect" kind="green" onPress={save} style={{ flex: 1 }} />
            <Btn label={scanning ? 'Scanning\u2026' : 'Find device'} kind="dark" onPress={find} disabled={scanning} style={{ flex: 1 }} />
          </View>
          {!!progress && <Text style={[ui.hint, { marginTop: 8, marginBottom: 0 }]}>{progress}</Text>}
          {msg && <Msg text={msg.text} kind={msg.kind} />}
        </Card>

        <Card title="Preferences">
          <View style={styles.pref}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prefTitle}>Keep screen on</Text>
              <Text style={ui.hint}>Recommended for bedside monitoring: stops the phone from sleeping while the app is open.</Text>
            </View>
            <Switch value={settings.keepAwake} onValueChange={(v) => updateSettings({ keepAwake: v })} trackColor={{ true: colors.green }} />
          </View>
          <View style={styles.pref}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prefTitle}>Alert notifications</Text>
              <Text style={ui.hint}>Sound + vibration notification when a zone raises an alert or the device connection is lost.</Text>
            </View>
            <Switch value={settings.notifications} onValueChange={(v) => updateSettings({ notifications: v })} trackColor={{ true: colors.green }} />
          </View>
        </Card>

        <Text style={[ui.hint, { textAlign: 'center' }]}>
          The device buzzer and LED keep working independently. Acknowledging an alert here silences them.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  statusText: { fontSize: 19, fontWeight: '800', color: colors.text },
  pref: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  prefTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 2 }
});
