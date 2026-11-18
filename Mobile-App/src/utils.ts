import type { DeviceZone } from './types';

export const DEFAULT_NAMES = ['Z0-Sacrum', 'Z1-Heel-L', 'Z2-Heel-R', 'Z3-Shoulder'];

export const siteOf = (name: string) => name.replace(/^Z\d+-/, '').replace(/-/g, ' ');
export const titleOf = (id: number, name: string) => `Zone ${id} \u00b7 ${siteOf(name)}`;

export const fmt = (v: number | null | undefined, digits: number) =>
  typeof v === 'number' && isFinite(v) ? v.toFixed(digits) : '--';

export const pad2 = (n: number) => String(n).padStart(2, '0');

export const clock = (ts: number) => {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

export function paramsHigh(d: DeviceZone): string[] {
  const a: string[] = [];
  if (d.sensor_ok !== false && d.t_high) a.push('Temperature');
  if (d.sensor_ok !== false && d.h_high) a.push('Humidity');
  if (d.p_high) a.push('Pressure');
  return a;
}

export function alertReason(d: DeviceZone | null): string {
  if (!d) return '';
  const parts: string[] = [];
  if (d.sensor_ok !== false && d.t_high) parts.push(`Temperature ${fmt(d.temperature, 1)} \u00b0C (limit ${d.thr_t})`);
  if (d.sensor_ok !== false && d.h_high) parts.push(`Humidity ${fmt(d.humidity, 1)} % (limit ${d.thr_h})`);
  if (d.p_high) parts.push(`Pressure ${fmt(d.pressure, 2)} kPa (limit ${d.thr_p})`);
  return parts.length ? parts.join('\n') : 'Readings are back in range \u2013 acknowledge to clear the alert';
}
