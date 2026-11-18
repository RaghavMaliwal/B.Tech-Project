import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Api from './api';
import type { DeviceStatus, DeviceZone, LogRow, ZoneRunState } from './types';
import { DEFAULT_NAMES, alertReason, siteOf } from './utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const POLL_MS = 2000;
const FAILS_TO_DROP = 3;        // failed polls in a row before "offline"
const MAX_LOG_ROWS = 20000;
const ACK_GRACE_MS = 3000;      // ignore a stale "alert" for a moment after acknowledging
const RENOTIFY_MS = 30000;      // repeat the alert notification while unacknowledged
const SETTINGS_KEY = 'pms.settings';
const ALERT_CHANNEL = 'alerts';

export type Settings = { host: string; keepAwake: boolean; notifications: boolean };
const DEFAULT_SETTINGS: Settings = { host: Api.DEFAULT_HOST, keepAwake: true, notifications: true };

export type ZoneState = {
  id: number;
  name: string;
  dev: DeviceZone | null;     // latest data from the device (drives alerts)
  view: DeviceZone | null;    // what the cards show: live, frozen (paused) or empty (stopped)
  run: ZoneRunState;
  alert: boolean;         // un-acknowledged alert (after the grace period logic)
};

export type Conn = {
  connected: boolean;
  everConnected: boolean;
  host: string;
  error: string | null;
  ip: string | null;
  rssi: number | null;
  uptime: number | null;
};

type Store = {
  ready: boolean;
  conn: Conn;
  zones: ZoneState[];
  settings: Settings;
  openZoneRequest: number | null;
  consumeOpenZone: () => void;
  getRows: (id: number, last?: number) => LogRow[];
  ack: (id: number) => Promise<Api.ApiResult>;
  setRun: (id: number, state: ZoneRunState | 'toggle-pause') => void;
  changeHost: (host: string) => Promise<{ ok: boolean; error?: string }>;
  updateSettings: (patch: Partial<Settings>) => void;
};

// Notifications are shown even while the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function MonitorProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [openZoneRequest, setOpenZoneRequest] = useState<number | null>(null);

  const settingsRef = useRef(settings);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // all mutable monitoring state lives in refs; `version` triggers re-render
  const connRef = useRef<Conn>({ connected: false, everConnected: false, host: Api.DEFAULT_HOST, error: null, ip: null, rssi: null, uptime: null });
  const devRef = useRef<(DeviceZone | null)[]>([null, null, null, null]);
  const namesRef = useRef<string[]>([...DEFAULT_NAMES]);
  const runRef = useRef<ZoneRunState[]>(['running', 'running', 'running', 'running']);
  const frozenRef = useRef<(DeviceZone | null)[]>([null, null, null, null]);
  const logsRef = useRef<LogRow[][]>([[], [], [], []]);
  const lastSeqRef = useRef<(number | null)[]>([null, null, null, null]);
  const graceRef = useRef<number[]>([0, 0, 0, 0]);
  const notifiedRef = useRef<number[]>([0, 0, 0, 0]);
  const offlineNotifiedRef = useRef(false);
  const failRef = useRef(0);
  const inFlightRef = useRef(false);

  // ---- notifications -------------------------------------------------------
  const notify = useCallback(async (id: string, title: string, body: string, data: Record<string, unknown>) => {
    if (!settingsRef.current.notifications) return;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: { title, body, data, sound: 'default' },
        trigger: { channelId: ALERT_CHANNEL }
      });
    } catch { /* notifications unavailable / denied */ }
  }, []);

  const clearNotification = useCallback(async (id: string) => {
    try { await Notifications.dismissNotificationAsync(id); } catch { /* ignore */ }
  }, []);

  // ---- logging ---------------------------------------------------------------
  const addRow = (z: DeviceZone) => {
    const rows = logsRef.current[z.id];
    const ok = z.sensor_ok !== false;
    rows.push({ ts: Date.now(), temp: ok ? z.temperature : null, hum: ok ? z.humidity : null, pres: z.pressure });
    if (rows.length > MAX_LOG_ROWS) rows.shift();
  };

  // ---- one poll ----------------------------------------------------------------
  const onSuccess = useCallback((st: DeviceStatus) => {
    failRef.current = 0;
    const wasOffline = connRef.current.everConnected && !connRef.current.connected;
    connRef.current = {
      ...connRef.current, connected: true, everConnected: true, error: null,
      ip: st.ip, rssi: st.rssi, uptime: st.uptime_s
    };
    if (wasOffline || offlineNotifiedRef.current) {
      offlineNotifiedRef.current = false;
      clearNotification('offline');
    }

    const now = Date.now();
    for (const z of st.zones) {
      if (z.id < 0 || z.id > 3) continue;
      devRef.current[z.id] = z;
      if (z.name) namesRef.current[z.id] = z.name;

      // chart / log only when a fresh reading arrives and the zone is "running"
      if (runRef.current[z.id] === 'running' && z.seq !== lastSeqRef.current[z.id]) {
        lastSeqRef.current[z.id] = z.seq;
        addRow(z);
      }

      // alert notifications
      if (z.alert) {
        const last = notifiedRef.current[z.id];
        if (!last || now - last > RENOTIFY_MS) {
          if (!last) Vibration.vibrate([0, 600, 300, 600]);
          notifiedRef.current[z.id] = now;
          notify(`alert-${z.id}`, `ALERT \u2013 Zone ${z.id} \u00b7 ${siteOf(z.name)}`, alertReason(z), { zoneId: z.id });
        }
      } else if (notifiedRef.current[z.id]) {
        notifiedRef.current[z.id] = 0;
        clearNotification(`alert-${z.id}`);
      }
    }
  }, [notify, clearNotification]);

  const onFail = useCallback((error: string) => {
    failRef.current += 1;
    const c = connRef.current;
    const dropped = failRef.current >= FAILS_TO_DROP;
    connRef.current = { ...c, connected: dropped ? false : c.connected, error };
    if (dropped && c.everConnected && !offlineNotifiedRef.current) {
      offlineNotifiedRef.current = true;
      notify('offline', 'Device connection lost', 'The phone cannot reach the monitoring device. Readings are no longer updating.', {});
    }
  }, [notify]);

  const poll = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const hostAtStart = Api.getHost();
    const r = await Api.request<DeviceStatus>('/api/status');
    inFlightRef.current = false;
    if (hostAtStart !== Api.getHost()) return;       // host changed while waiting
    if (r.ok && r.data && Array.isArray(r.data.zones) && r.data.zones.length === 4) onSuccess(r.data);
    else onFail(r.ok ? 'Unexpected response from device' : r.error);
    bump();
  }, [onSuccess, onFail, bump]);

  // ---- start-up -------------------------------------------------------------
  useEffect(() => {
    (async () => {
      let s = DEFAULT_SETTINGS;
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      } catch { /* defaults */ }
      settingsRef.current = s;
      setSettings(s);
      Api.setHost(s.host);
      connRef.current = { ...connRef.current, host: s.host };

      try {
        await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
          name: 'Patient alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 600, 300, 600],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default'
        });
        const p = await Notifications.getPermissionsAsync();
        if (!p.granted) await Notifications.requestPermissionsAsync();
      } catch { /* ignore */ }

      setReady(true);
    })();
  }, []);

  // ---- polling loop -----------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    poll();
    const timer = setInterval(poll, POLL_MS);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') poll(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [ready, poll]);

  // ---- keep screen on -----------------------------------------------------------
  useEffect(() => {
    if (settings.keepAwake) activateKeepAwakeAsync('pms').catch(() => undefined);
    else deactivateKeepAwake('pms').catch(() => undefined);
  }, [settings.keepAwake]);

  // ---- tapping a notification opens that zone ----------------------------------
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const id = resp.notification.request.content.data?.zoneId;
      if (typeof id === 'number') setOpenZoneRequest(id);
    });
    return () => sub.remove();
  }, []);

  // ---- actions ------------------------------------------------------------------
  const ack = useCallback(async (id: number) => {
    const r = await Api.request(`/api/ack?zone=${id}`, 'POST');
    // 409 = no active alert any more -> already cleared
    if (r.ok || r.status === 409) {
      graceRef.current[id] = Date.now() + ACK_GRACE_MS;
      const d = devRef.current[id];
      if (d) devRef.current[id] = { ...d, alert: false };
      notifiedRef.current[id] = 0;
      clearNotification(`alert-${id}`);
      setTimeout(bump, ACK_GRACE_MS + 60);
      bump();
      setTimeout(poll, 200);
    }
    return r;
  }, [bump, clearNotification, poll]);

  const setRun = useCallback((id: number, state: ZoneRunState | 'toggle-pause') => {
    const cur = runRef.current[id];
    let next: ZoneRunState;
    if (state === 'toggle-pause') {
      if (cur === 'stopped') return;
      next = cur === 'paused' ? 'running' : 'paused';
    } else {
      next = state;
    }
    if (next === cur) return;
    runRef.current[id] = next;
    frozenRef.current[id] = next === 'paused' ? devRef.current[id] : null;
    if (next === 'stopped') {
      logsRef.current[id] = [];
      lastSeqRef.current[id] = null;
    } else if (next === 'running' && cur === 'stopped') {
      const d = devRef.current[id];
      if (d) { lastSeqRef.current[id] = d.seq; addRow(d); }   // plot the current reading straight away
    }
    bump();
  }, [bump]);

  const changeHost = useCallback(async (hostInput: string) => {
    let host: string;
    try { host = Api.normalizeHost(hostInput); } catch (e: any) { return { ok: false, error: e.message as string }; }
    Api.setHost(host);
    failRef.current = 0;
    connRef.current = { ...connRef.current, host, connected: false, error: null };
    const next = { ...settingsRef.current, host };
    settingsRef.current = next;
    setSettings(next);
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => undefined);
    bump();
    poll();
    return { ok: true };
  }, [bump, poll]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const getRows = useCallback((id: number, last?: number) => {
    const rows = logsRef.current[id];
    return last ? rows.slice(-last) : rows.slice();
  }, []);

  // ---- derived view state -----------------------------------------------------------
  const value = useMemo<Store>(() => {
    const now = Date.now();
    const zones: ZoneState[] = [0, 1, 2, 3].map((id) => {
      const dev = devRef.current[id];
      return {
        id,
        name: namesRef.current[id],
        dev,
        view: runRef.current[id] === 'stopped' ? null : runRef.current[id] === 'paused' ? frozenRef.current[id] : dev,
        run: runRef.current[id],
        alert: !!(dev && dev.alert) && now >= graceRef.current[id]
      };
    });
    return {
      ready,
      conn: { ...connRef.current, host: settings.host },
      zones,
      settings,
      openZoneRequest,
      consumeOpenZone: () => setOpenZoneRequest(null),
      getRows, ack, setRun, changeHost, updateSettings
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ready, settings, openZoneRequest, getRows, ack, setRun, changeHost, updateSettings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
