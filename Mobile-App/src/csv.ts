import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LogRow, PatientDetails } from './types';
import { pad2 } from './utils';

const csvCell = (v: unknown) => {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

/** patient_data_<Zone>_<date>_<time>.csv  (zone name is part of the file name) */
export function csvFileName(zoneName: string) {
  const safe = zoneName.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'zone';
  return `patient_data_${safe}_${stamp()}.csv`;
}

export function buildCsv(zoneName: string, p: PatientDetails, rows: LogRow[]) {
  const head: [string, string][] = [
    ['Patient Name', p.name], ['Age', p.age], ['Height', p.height], ['Weight', p.weight],
    ['Diagnosis', p.diagnosis], ['Bed No', p.bed], ['Zone', zoneName]
  ];
  const lines = head.map(([k, v]) => `${csvCell(k)},${csvCell(v)}`);
  lines.push('');
  lines.push('Timestamp,Temperature (C),Humidity (%),Pressure (kPa)');
  for (const r of rows) {
    const d = new Date(r.ts);
    const t = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    lines.push([t, r.temp ?? '', r.hum ?? '', r.pres].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

const DIR_KEY = 'pms.csvDir';

export type SaveResult = { ok: true; where: string } | { ok: false; cancelled?: boolean; error?: string };

/** Save into a folder chosen by the user (remembered for next time). */
export async function saveToFolder(name: string, csv: string): Promise<SaveResult> {
  try {
    let dir: Directory | null = null;
    const last = await AsyncStorage.getItem(DIR_KEY);
    if (last) {
      try {
        const d = new Directory(last);
        const probe = d.createFile(name, 'text/csv');   // throws if permission is gone
        await probe.write(csv);
        return { ok: true, where: name };
      } catch {
        dir = null;                                      // fall through to the picker
      }
    }
    dir = await Directory.pickDirectoryAsync();
    const file = dir.createFile(name, 'text/csv');
    await file.write(csv);
    await AsyncStorage.setItem(DIR_KEY, dir.uri);
    return { ok: true, where: name };
  } catch (e: any) {
    const msg = String(e && e.message ? e.message : e);
    if (/cancel/i.test(msg)) return { ok: false, cancelled: true };
    return { ok: false, error: msg };
  }
}

/** Write to cache and open the Android share sheet (Drive, e-mail, WhatsApp, Files...). */
export async function shareCsv(name: string, csv: string): Promise<SaveResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, error: 'Sharing is not available on this device' };
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    await file.write(csv);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Share CSV' });
    return { ok: true, where: name };
  } catch (e: any) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}
