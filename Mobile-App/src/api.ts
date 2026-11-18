import * as Network from 'expo-network';

// ---------------------------------------------------------------------------
// Thin client for the ESP32 REST API (see pressure_ulcer_final.ino)
// ---------------------------------------------------------------------------
export const DEFAULT_HOST = 'pressureguard.local';

export type ApiResult<T = any> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

let currentHost = DEFAULT_HOST;
export const getHost = () => currentHost;
export const setHost = (h: string) => { currentHost = h; };

/** Accepts "192.168.1.50", "http://192.168.1.50/", "pressureguard.local", "host:8080". */
export function normalizeHost(input: string): string {
  const h = String(input || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!/^[A-Za-z0-9]([A-Za-z0-9.\-]*[A-Za-z0-9])?(:\d{1,5})?$/.test(h)) {
    throw new Error('Enter a valid IP address or host name');
  }
  return h;
}

async function fetchWithTimeout(url: string, method: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { method, signal: ctrl.signal, headers: { 'Cache-Control': 'no-store' } });
  } finally {
    clearTimeout(timer);
  }
}

export async function request<T = any>(path: string, method: 'GET' | 'POST' = 'GET', timeoutMs = 4000): Promise<ApiResult<T>> {
  const host = currentHost;
  let res: Response;
  try {
    res = await fetchWithTimeout(`http://${host}${path}`, method, timeoutMs);
  } catch (e: any) {
    const timedOut = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
    return { ok: false, status: 0, error: timedOut ? 'Device did not respond in time' : `Cannot reach device at ${host}` };
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    return { ok: false, status: res.status, error: (body && body.error) || `Device returned HTTP ${res.status}` };
  }
  return { ok: true, status: res.status, data: body as T };
}

// ---------------------------------------------------------------------------
// Auto-discovery: many phones cannot resolve "pressureguard.local" (mDNS), so
// we also probe every address of the phone's own /24 Wi-Fi subnet.
// ---------------------------------------------------------------------------
async function probe(host: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`http://${host}/api/status`, 'GET', timeoutMs);
    if (!res.ok) return false;
    const j = await res.json();
    return !!j && typeof j.device === 'string' && Array.isArray(j.zones);
  } catch {
    return false;
  }
}

export async function discoverDevice(
  onProgress?: (done: number, total: number) => void,
  cancel?: { cancelled: boolean }
): Promise<string | null> {
  if (await probe('pressureguard.local', 1500)) return 'pressureguard.local';

  let ip = '';
  try { ip = await Network.getIpAddressAsync(); } catch { return null; }
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return null;

  const prefix = `${m[1]}.${m[2]}.${m[3]}`;
  const candidates: string[] = [];
  for (let i = 1; i <= 254; i++) if (String(i) !== m[4]) candidates.push(`${prefix}.${i}`);

  let found: string | null = null;
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (!found && !(cancel && cancel.cancelled)) {
      const i = next++;
      if (i >= candidates.length) return;
      if (await probe(candidates[i], 700)) found = candidates[i];
      done++;
      if (onProgress) onProgress(done, candidates.length);
    }
  };
  await Promise.all(Array.from({ length: 24 }, worker));
  return found;
}
