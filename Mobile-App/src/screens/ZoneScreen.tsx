import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fill, radius } from '../theme';
import { useStore } from '../store';
import { statusOf } from '../status';
import { Header } from '../components/Header';
import { Badge } from '../components/Badge';
import { Metric } from '../components/Metric';
import { Chart } from '../components/Chart';
import { AlertLock } from '../components/AlertLock';
import { EMPTY_PATIENT, PatientSheet } from '../components/PatientSheet';
import { DownloadIcon, PauseIcon, PlayIcon, StopIcon } from '../components/Icons';
import { buildCsv, csvFileName, saveToFolder, shareCsv } from '../csv';
import type { PatientDetails } from '../types';
import { fmt, titleOf } from '../utils';

type Props = { zoneId: number; onBack: () => void };

export function ZoneScreen({ zoneId, onBack }: Props) {
  const { zones, conn, getRows, ack, setRun } = useStore();
  const insets = useSafeAreaInsets();
  const zone = zones[zoneId];
  const v = zone.view;
  const ok = !!v && v.sensor_ok !== false;
  const st = statusOf(zone, conn.connected);

  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; err: boolean } | null>(null);
  const [lastPatient, setLastPatient] = useState<PatientDetails>(EMPTY_PATIENT);   // kept in memory only

  // chart series (last 20 readings of this zone)
  const rows = getRows(zoneId, 20);
  const series = useMemo(() => ({
    t: rows.filter((r) => r.temp !== null),
    h: rows.filter((r) => r.hum !== null),
    p: rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows.length, rows[rows.length - 1]?.ts, zone.run]);

  const showToast = (text: string, err = false) => {
    setToast({ text, err });
    setTimeout(() => setToast(null), 4500);
  };

  const doExport = async (p: PatientDetails, mode: 'save' | 'share') => {
    setBusy(true);
    setLastPatient(p);
    const name = csvFileName(zone.name);
    const csv = buildCsv(zone.name, p, getRows(zoneId));       // only this zone's data
    const r = mode === 'save' ? await saveToFolder(name, csv) : await shareCsv(name, csv);
    setBusy(false);
    if (r.ok) {
      setSheet(false);
      showToast(mode === 'save' ? `Saved ${r.where}` : `Shared ${r.where}`);
    } else if (!r.cancelled) {
      showToast(r.error || 'Could not save the file', true);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title={titleOf(zone.id, zone.name)} onBack={onBack} right={<Badge status={st} />} />

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* live numbers */}
          <View style={styles.tiles}>
            <Metric big label="Temp" value={ok ? fmt(v!.temperature, 1) : '--'} unit={'\u00b0C'} high={ok && !!v!.t_high} style={styles.tile} />
            <Metric big label="Humidity" value={ok ? fmt(v!.humidity, 1) : '--'} unit="%" high={ok && !!v!.h_high} style={styles.tile} />
            <Metric big label="Pressure" value={v ? fmt(v.pressure, 2) : '--'} unit="kPa" high={!!v && !!v.p_high} style={styles.tile} />
          </View>

          {/* controls */}
          <View style={styles.controls}>
            <Text style={styles.ctrlLabel}>Recording</Text>
            <View style={styles.ctrlBtns}>
              <CtrlBtn onPress={() => setRun(zoneId, 'running')} active={zone.run === 'running'}><PlayIcon /></CtrlBtn>
              <CtrlBtn onPress={() => setRun(zoneId, 'toggle-pause')} active={zone.run === 'paused'}><PauseIcon /></CtrlBtn>
              <CtrlBtn onPress={() => setRun(zoneId, 'stopped')} active={zone.run === 'stopped'}><StopIcon /></CtrlBtn>
            </View>
          </View>

          {/* graphs */}
          <Chart label="Temperature (℃)" color={colors.temp} values={series.t.map((r) => r.temp as number)} times={series.t.map((r) => r.ts)} decimals={1} threshold={zone.dev?.thr_t} />
          <Chart label="Humidity (%)" color={colors.hum} values={series.h.map((r) => r.hum as number)} times={series.h.map((r) => r.ts)} decimals={1} threshold={zone.dev?.thr_h} />
          <Chart label="Pressure (kPa)" color={colors.pres} values={series.p.map((r) => r.pres)} times={series.p.map((r) => r.ts)} decimals={2} threshold={zone.dev?.thr_p} />
          <View style={{ height: 8 }} />
        </ScrollView>

        {zone.alert && <AlertLock zone={zone} onAck={() => ack(zoneId)} />}
      </View>

      {/* bottom action */}
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {toast && (
          <View style={[styles.toast, toast.err && { backgroundColor: colors.red }]}>
            <Text style={styles.toastText} numberOfLines={2}>{toast.text}</Text>
          </View>
        )}
        <Pressable style={({ pressed }) => [styles.dl, pressed && { opacity: 0.85 }]} onPress={() => setSheet(true)}>
          <DownloadIcon />
          <Text style={styles.dlText}>Download CSV</Text>
        </Pressable>
        {zone.alert && <View style={fill} />}
      </View>

      <PatientSheet
        visible={sheet}
        zoneTitle={titleOf(zone.id, zone.name)}
        initial={lastPatient}
        busy={busy}
        onCancel={() => !busy && setSheet(false)}
        onSave={(p) => doExport(p, 'save')}
        onShare={(p) => doExport(p, 'share')}
      />
    </View>
  );
}

function CtrlBtn({ children, onPress, active }: { children: React.ReactNode; onPress: () => void; active: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.ctrlBtn, active && styles.ctrlBtnActive]} android_ripple={{ color: '#cbd5e1', radius: 26 }}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 12, paddingBottom: 8, gap: 10 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 8 },
  ctrlLabel: { fontSize: 14, fontWeight: '800', color: colors.text },
  ctrlBtns: { flexDirection: 'row', gap: 8 },
  ctrlBtn: { width: 48, height: 44, borderRadius: 10, backgroundColor: colors.input, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ctrlBtnActive: { backgroundColor: '#dbeafe', borderColor: '#60a5fa' },
  bottom: { paddingHorizontal: 12, paddingTop: 10, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  dl: { height: 54, borderRadius: radius.button, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  dlText: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  toast: { backgroundColor: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' }
});
