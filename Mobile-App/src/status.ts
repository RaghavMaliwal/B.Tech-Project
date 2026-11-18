import type { ZoneState } from './store';
import { paramsHigh } from './utils';

export type StatusKind = 'ok' | 'warn' | 'alert' | 'off';
export type Status = { label: string; kind: StatusKind };

/** Same rules as the desktop app's Status card. */
export function statusOf(z: ZoneState, connected: boolean): Status {
  const d = z.dev;
  if (!d) return { label: 'Waiting\u2026', kind: 'off' };
  if (z.alert) return { label: 'ALERT', kind: 'alert' };
  if (!connected) return { label: 'Offline', kind: 'off' };
  if (z.run === 'stopped') return { label: 'Stopped', kind: 'off' };
  if (z.run === 'paused') return { label: 'Paused', kind: 'warn' };
  const hi = z.view ? paramsHigh(z.view) : [];
  if (hi.length) return { label: 'Threshold', kind: 'warn' };
  if (d.sensor_ok === false) return { label: 'Sensor fault', kind: 'warn' };
  return { label: 'Normal', kind: 'ok' };
}

export const badgeColors: Record<StatusKind, { bg: string; fg: string }> = {
  ok: { bg: 'rgba(34,197,94,0.16)', fg: '#15803d' },
  warn: { bg: 'rgba(245,158,11,0.2)', fg: '#b45309' },
  alert: { bg: '#ef4444', fg: '#ffffff' },
  off: { bg: '#e2e8f0', fg: '#64748b' }
};
