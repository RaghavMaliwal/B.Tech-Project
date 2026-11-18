import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useStore } from '../store';
import * as Api from '../api';
import { Header } from '../components/Header';
import { ToolsIcon } from '../components/Icons';
import { Btn, Card, Msg, Segmented, ui } from '../components/ui';
import { siteOf } from '../utils';

const MOTOR_GPIO = [25, 26, 27, 14];
const FSR_GPIO = [34, 35, 32, 33];
type Tab = 'motors' | 'fsr' | 'i2c';
type M = { text: string; kind: 'ok' | 'err' | 'info' } | null;

export function DiagnosticsScreen({ onBack }: { onBack: () => void }) {
  const { conn } = useStore();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('motors');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title="Diagnostics" subtitle={conn.connected ? `Connected to ${conn.host}` : 'Device offline'} onBack={onBack} right={<ToolsIcon size={28} />} />
      <View style={{ paddingHorizontal: 12 }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[{ id: 'motors', label: 'Motor Test' }, { id: 'fsr', label: 'FSR Calibration' }, { id: 'i2c', label: 'I\u00b2C & Sensors' }]}
        />
      </View>
      {!conn.connected && <View style={{ paddingHorizontal: 12 }}><Msg kind="err" text="Device offline \u2013 diagnostics are unavailable until the ESP32 reconnects." /></View>}
      <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 4, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {tab === 'motors' && <MotorPane />}
        {tab === 'fsr' && <FsrPane />}
        {tab === 'i2c' && <I2cPane />}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Motor test  (serial commands m0..m3 / mall)
// ---------------------------------------------------------------------------
function MotorPane() {
  const { zones, conn } = useStore();
  const [secs, setSecs] = useState<'3' | '5' | '10'>('5');
  const [until, setUntil] = useState([0, 0, 0, 0]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<M>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const run = async (target: number | 'all') => {
    if (busy) return;
    setBusy(true);
    const s = Number(secs);
    const r = await Api.request(`/api/diag/motor?zone=${target}&sec=${s}`, 'POST', 4000);
    setBusy(false);
    if (r.ok) {
      const end = Date.now() + s * 1000;
      setUntil((old) => old.map((u, i) => ((target === 'all' || target === i) && !zones[i].dev?.therapy ? end : u)));
      const skipped = r.data && r.data.skipped ? ` (${r.data.skipped} skipped \u2013 in use)` : '';
      setMsg({ text: `Motor test running for ${s} s${skipped}.`, kind: 'ok' });
    } else {
      setMsg({ text: r.error, kind: 'err' });
    }
  };

  const stop = async () => {
    setBusy(true);
    const r = await Api.request('/api/diag/motor_stop', 'POST');
    setBusy(false);
    if (r.ok) { setUntil([0, 0, 0, 0]); setMsg({ text: 'Motors stopped.', kind: 'info' }); }
    else setMsg({ text: r.error, kind: 'err' });
  };

  const off = !conn.connected || busy;

  return (
    <>
      <Text style={ui.hint}>
        Runs the coin vibration motor at 200 Hz / 50 % duty {'\u2013'} the same drive as serial commands m0{'\u2013'}m3 / mall. Use it to confirm wiring and that every motor works.
      </Text>
      <Text style={ui.label}>Duration</Text>
      <Segmented<'3' | '5' | '10'> value={secs} onChange={setSecs} options={[{ id: '3', label: '3 s' }, { id: '5', label: '5 s' }, { id: '10', label: '10 s' }]} />

      {zones.map((z) => {
        const left = Math.ceil((until[z.id] - now) / 1000);
        const running = left > 0;
        const inUse = !!z.dev?.therapy;
        return (
          <Card key={z.id} style={running ? { borderWidth: 2, borderColor: colors.green, backgroundColor: '#f0fdf4' } : undefined}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.zTitle}>Zone {z.id} {'\u00b7'} {siteOf(z.name)}</Text>
                <Text style={ui.hint}>Motor {'\u00b7'} GPIO {MOTOR_GPIO[z.id]}</Text>
              </View>
              <Btn small kind={running ? 'green' : 'dark'} label={running ? `Running\u2026 ${left}s` : inUse ? 'Busy' : 'Run motor'} disabled={off || inUse || running} onPress={() => run(z.id)} />
            </View>
          </Card>
        );
      })}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn label="Test all motors" kind="green" style={{ flex: 1 }} disabled={off} onPress={() => run('all')} />
        <Btn label="Stop" kind="red" style={{ flex: 1 }} disabled={!conn.connected || busy} onPress={stop} />
      </View>
      {msg && <Msg text={msg.text} kind={msg.kind} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// FSR calibration  (serial commands c0..c3, 2-point with known weights)
// ---------------------------------------------------------------------------
type Live = { raw: number; resistance: number | null; pressure: number; slope: number };

function FsrPane() {
  const { zones, conn } = useStore();
  const [zone, setZone] = useState(0);
  const [g1, setG1] = useState('');
  const [g2, setG2] = useState('');
  const [p1, setP1] = useState<{ grams: number; raw: number; R: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<M>(null);
  const [live, setLive] = useState<Live | null>(null);
  const liveBusy = useRef(false);
  const busyRef = useRef(false);
  busyRef.current = busy;

  const reset = useCallback((z: number) => { setZone(z); setP1(null); setDone(null); setMsg(null); setG1(''); setG2(''); setLive(null); }, []);

  // live readings of the selected zone's FSR
  useEffect(() => {
    if (!conn.connected) return;
    let alive = true;
    const tick = async () => {
      if (liveBusy.current || busyRef.current) return;
      liveBusy.current = true;
      const r = await Api.request('/api/diag/fsr', 'GET', 5000);
      liveBusy.current = false;
      if (!alive || !r.ok || !r.data) return;
      const z = (r.data.zones || []).find((q: any) => q.zone === zone);
      if (z) setLive({ raw: z.raw, resistance: z.resistance, pressure: z.pressure, slope: z.slope });
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [conn.connected, zone]);

  const capture = async (step: 1 | 2) => {
    const grams = parseFloat(step === 1 ? g1 : g2);
    if (!(grams > 0)) { setMsg({ text: 'Enter the weight in grams.', kind: 'err' }); return; }
    if (step === 2 && p1 && grams <= p1.grams) { setMsg({ text: 'The second weight must be heavier than the first.', kind: 'err' }); return; }
    setBusy(true);
    setMsg({ text: 'Measuring \u2013 keep the weight still\u2026', kind: 'info' });
    const r = await Api.request(`/api/diag/calib?zone=${zone}&step=${step}&grams=${grams}`, 'POST', 10000);
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.error, kind: 'err' }); return; }
    if (step === 1) {
      setP1({ grams, raw: r.data.raw, R: r.data.resistance });
      setMsg({ text: 'Point 1 captured. Now place a heavier weight.', kind: 'ok' });
    } else {
      const s = Number(r.data.slope);
      setDone(Number.isFinite(s) ? s.toExponential(4) : String(r.data.slope));
      setMsg({ text: 'Calibration complete and saved on the device.', kind: 'ok' });
    }
  };

  const off = !conn.connected || busy;
  const z = zones[zone];

  return (
    <>
      <Text style={ui.hint}>
        Two-point calibration with known weights, identical to serial commands c0{'\u2013'}c3. The resulting slope is stored on the ESP32 and used immediately.
      </Text>

      <View style={styles.zsel}>
        {zones.map((q) => (
          <Btn key={q.id} small kind={q.id === zone ? 'dark' : 'ghost'} label={`Zone ${q.id}`} onPress={() => reset(q.id)} style={{ flex: 1, paddingHorizontal: 4 }} />
        ))}
      </View>

      <Card title={`Live \u00b7 ${siteOf(z.name)} (GPIO ${FSR_GPIO[zone]})`}>
        <View style={styles.kv}>
          <Kv k="Raw ADC" v={live ? String(live.raw) : '\u2013'} />
          <Kv k="Resistance" v={live ? (live.resistance == null ? 'open' : `${live.resistance} \u03a9`) : '\u2013'} />
          <Kv k="Pressure" v={live ? `${Number(live.pressure).toFixed(2)} kPa` : '\u2013'} />
          <Kv k="Slope (S/N)" v={live ? Number(live.slope).toExponential(2) : '\u2013'} />
        </View>
      </Card>

      {msg && <Msg text={msg.text} kind={msg.kind} />}

      <Card title="1 \u00b7 First known weight" style={p1 || done ? { borderWidth: 2, borderColor: colors.green } : undefined}>
        <Text style={ui.hint}>Place a weight on the FSR of Zone {zone}, enter it and capture.</Text>
        <Text style={ui.label}>Weight (g)</Text>
        <TextInput style={ui.input} value={g1} onChangeText={setG1} keyboardType="numeric" placeholder="e.g. 200" placeholderTextColor="#94a3b8" editable={!done} />
        <Btn label="Capture point 1" onPress={() => capture(1)} disabled={off || !!done} style={{ marginTop: 10 }} />
        {p1 && <Text style={[ui.hint, { marginTop: 8, marginBottom: 0 }]}>Captured: {p1.grams} g {'\u2192'} raw {p1.raw}, R = {p1.R} {'\u03a9'}</Text>}
      </Card>

      <Card title="2 \u00b7 Second, heavier weight" style={[!p1 && !done ? { opacity: 0.5 } : undefined, done ? { borderWidth: 2, borderColor: colors.green } : undefined] as any}>
        <Text style={ui.hint}>Replace with a heavier weight, enter it and capture. The result is saved on the device.</Text>
        <Text style={ui.label}>Weight (g)</Text>
        <TextInput style={ui.input} value={g2} onChangeText={setG2} keyboardType="numeric" placeholder="e.g. 1000" placeholderTextColor="#94a3b8" editable={!!p1 && !done} />
        <Btn label="Capture point 2 & save" kind="green" onPress={() => capture(2)} disabled={off || !p1} style={{ marginTop: 10 }} />
        {done && <Text style={[ui.hint, { marginTop: 8, marginBottom: 0 }]}>Saved: slope = {done} S/N</Text>}
      </Card>

      <Btn label="Start over" kind="ghost" onPress={() => reset(zone)} />
    </>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kvItem}>
      <Text style={styles.kvK}>{k}</Text>
      <Text style={styles.kvV}>{v}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// I2C & sensors  (serial command i + SHT41 per mux channel)
// ---------------------------------------------------------------------------
type ScanResult = { tca_ok: boolean; bus: number[]; channels: { zone: number; name: string; ok: boolean; temperature?: number; humidity?: number }[] };
const KNOWN: Record<number, string> = { 0x70: 'TCA9548A mux', 0x44: 'SHT41' };

function I2cPane() {
  const { conn } = useStore();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<M>(null);
  const [res, setRes] = useState<ScanResult | null>(null);
  const started = useRef(false);

  const scan = useCallback(async () => {
    setBusy(true);
    setMsg({ text: 'Scanning\u2026', kind: 'info' });
    const r = await Api.request<ScanResult>('/api/diag/i2c', 'GET', 8000);
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.error, kind: 'err' }); return; }
    setMsg(null);
    setRes(r.data);
  }, []);

  useEffect(() => {
    if (!started.current && conn.connected) { started.current = true; scan(); }
  }, [conn.connected, scan]);

  const hex = (a: number) => '0x' + a.toString(16).toUpperCase().padStart(2, '0');

  return (
    <>
      <Text style={ui.hint}>
        Scans the I{'\u00b2'}C bus (serial command i) and reads the SHT41 temperature / humidity sensor behind each TCA9548A multiplexer channel. Mux channels are closed during the bus scan, so only the multiplexer itself is expected on the main bus.
      </Text>
      <Btn label={busy ? 'Scanning\u2026' : 'Run scan'} onPress={scan} disabled={!conn.connected || busy} />
      {msg && <Msg text={msg.text} kind={msg.kind} />}

      {res && (
        <View style={{ marginTop: 12 }}>
          <Card title="TCA9548A multiplexer (0x70)">
            <Pill ok={res.tca_ok} />
          </Card>
          <Card title="Main bus devices">
            <View style={styles.chips}>
              {res.bus.length === 0 && <Text style={ui.hint}>No devices found {'\u2013'} check SDA/SCL wiring.</Text>}
              {res.bus.map((a) => (
                <View key={a} style={[styles.chip, KNOWN[a] ? styles.chipGood : null]}>
                  <Text style={styles.chipText}>{hex(a)}{KNOWN[a] ? ` \u00b7 ${KNOWN[a]}` : ''}</Text>
                </View>
              ))}
            </View>
          </Card>
          <Card title="SHT41 per channel">
            {res.channels.map((c) => (
              <View key={c.zone} style={styles.chRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.zTitle}>Zone {c.zone} {'\u00b7'} {siteOf(c.name)}</Text>
                  <Text style={ui.hint}>
                    CH{c.zone}{c.ok ? `  \u00b7  ${Number(c.temperature).toFixed(1)} \u00b0C  \u00b7  ${Number(c.humidity).toFixed(1)} %` : ''}
                  </Text>
                </View>
                <Pill ok={c.ok} />
              </View>
            ))}
          </Card>
        </View>
      )}
    </>
  );
}

function Pill({ ok }: { ok: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: ok ? '#dcfce7' : '#fee2e2' }]}>
      <Text style={{ color: ok ? '#166534' : '#991b1b', fontWeight: '800', fontSize: 12 }}>{ok ? 'OK' : 'NOT FOUND'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  zTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  zsel: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  kv: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kvItem: { width: '48%', backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 9 },
  kvK: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  kvV: { fontSize: 16, fontWeight: '800', color: colors.text, fontFamily: 'monospace' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border },
  chipGood: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  chipText: { fontSize: 13, fontWeight: '800', fontFamily: 'monospace', color: colors.text },
  chRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' }
});
