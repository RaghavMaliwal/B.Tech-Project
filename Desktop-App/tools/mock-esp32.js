#!/usr/bin/env node
/*
  Mock ESP32 for developing the desktop app without hardware.
  Implements the same REST API as pressure_ulcer_final.ino.

    node tools/mock-esp32.js [port]          (default port 8080)
    then in the app: click the connection pill and enter  localhost:8080
    or start the app with:  PMS_ESP32_HOST=localhost:8080 npm start

  Extra helper endpoints (mock only):
    GET /mock/alert?zone=N     force an unacknowledged alert on zone N
    GET /mock/high?zone=N      push zone N above its thresholds for ~20 s
    GET /mock/therapy?zone=N   flag zone N as "in therapy" for 10 s
    GET /mock/sensorfail?zone=N  toggle SHT41 failure on zone N
*/
const http = require('http');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const NAMES = ['Z0-Sacrum', 'Z1-Heel-L', 'Z2-Heel-R', 'Z3-Shoulder'];
const THR_P = [4.27, 4.27, 4.27, 4.0];
const THR_T = [36, 36, 36, 36];
const THR_H = [70, 70, 70, 70];
const startedAt = Date.now();
const rnd = (a, b) => a + Math.random() * (b - a);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

const zones = NAMES.map((name, i) => ({
  id: i, name, seq: 1,
  p: rnd(1.5, 3), t: rnd(33, 35), h: rnd(55, 65),
  sensor_ok: true, therapy: false,
  forceHighUntil: 0, alertActive: false, acknowledged: false,
  slope: 0.00003, calibPt1: null
}));
const motors = [0, 0, 0, 0];   // end timestamps

function tick() {
  const now = Date.now();
  zones.forEach((z) => {
    z.seq++;
    const high = now < z.forceHighUntil;
    z.p = high ? rnd(THR_P[z.id] + 0.5, THR_P[z.id] + 2) : Math.max(0.2, z.p + rnd(-0.4, 0.4));
    if (!high && z.p > THR_P[z.id] - 0.5) z.p -= 0.6;
    z.t = high ? rnd(THR_T[z.id] + 0.3, THR_T[z.id] + 1.5) : Math.min(35.5, Math.max(32, z.t + rnd(-0.3, 0.3)));
    z.h = high ? rnd(THR_H[z.id] + 1, THR_H[z.id] + 6) : Math.min(68, Math.max(45, z.h + rnd(-1, 1)));
    if (z.alertActive && z.acknowledged) { z.alertActive = false; z.acknowledged = false; }
    // simulate "still high 20 s -> alert", like the real device does after therapy
    if (high && !z.alertActive && now > z.forceHighUntil - 8000 && !z.therapy) { z.alertActive = true; z.acknowledged = false; }
  });
}
setInterval(tick, 5000);

function zoneJson(z) {
  const p = z.p, t = z.sensor_ok ? z.t : 0, h = z.sensor_ok ? z.h : 0;
  return {
    id: z.id, name: z.name, seq: z.seq,
    pressure: r2(p), pressure_mmhg: r1(p * 7.50062),
    temperature: r1(t), humidity: r1(h), sensor_ok: z.sensor_ok,
    p_high: p > THR_P[z.id], t_high: t > THR_T[z.id], h_high: h > THR_H[z.id],
    alert: z.alertActive && !z.acknowledged, therapy: z.therapy,
    thr_p: THR_P[z.id], thr_t: THR_T[z.id], thr_h: THR_H[z.id]
  };
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const err = (res, code, msg) => send(res, code, { ok: false, error: msg });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const q = u.searchParams;
  const route = `${req.method} ${u.pathname}`;
  const zi = /^\d+$/.test(q.get('zone') || '') ? Number(q.get('zone')) : -1;
  const now = Date.now();
  zones.forEach((z, i) => { if (z.therapy && now > (z._therapyEnd || 0)) z.therapy = false; });

  switch (route) {
    case 'GET /api/status':
      return send(res, 200, {
        device: 'PressureGuard (mock)', uptime_s: Math.floor((now - startedAt) / 1000),
        ip: '127.0.0.1', rssi: -52, zones: zones.map(zoneJson)
      });

    case 'POST /api/ack': {
      if (zi < 0 || zi > 3) return err(res, 400, 'zone must be 0-3');
      const z = zones[zi];
      if (!(z.alertActive && !z.acknowledged)) return err(res, 409, 'no active alert on this zone');
      z.acknowledged = true;
      return send(res, 200, { ok: true });
    }

    case 'POST /api/diag/motor': {
      const all = q.get('zone') === 'all';
      if (!all && (zi < 0 || zi > 3)) return err(res, 400, 'zone must be 0-3 or all');
      const sec = Math.max(1, Math.min(10, Number(q.get('sec') || 5)));
      let started = 0, skipped = 0;
      zones.forEach((z, i) => {
        if (!all && i !== zi) return;
        if (z.therapy) { skipped++; return; }
        motors[i] = now + sec * 1000; started++;
      });
      if (!started) return err(res, 409, 'zone is running vibration therapy');
      return send(res, 200, { ok: true, started, skipped, seconds: sec });
    }

    case 'POST /api/diag/motor_stop':
      motors.fill(0);
      return send(res, 200, { ok: true });

    case 'GET /api/diag/i2c':
      await delay(300);
      return send(res, 200, {
        tca_ok: true, bus: [0x70],
        channels: zones.map((z) => ({ zone: z.id, name: z.name, ok: z.sensor_ok, ...(z.sensor_ok ? { temperature: r1(z.t), humidity: r1(z.h) } : {}) }))
      });

    case 'GET /api/diag/fsr':
      return send(res, 200, {
        zones: zones.map((z) => {
          const raw = Math.round(300 + z.p * 150 + rnd(-5, 5));
          const v = raw * 3.3 / 4095;
          return { zone: z.id, name: z.name, raw, voltage: r2(v), resistance: Math.round(10000 * (3.3 - v) / v),
                   slope: z.slope, pressure: r2(z.p), calib_pending: !!z.calibPt1 };
        })
      });

    case 'POST /api/diag/calib': {
      const step = Number(q.get('step')), grams = Number(q.get('grams'));
      if (zi < 0 || zi > 3) return err(res, 400, 'zone must be 0-3');
      if (step !== 1 && step !== 2) return err(res, 400, 'step must be 1 or 2');
      if (!(grams > 0)) return err(res, 400, 'grams must be > 0');
      const z = zones[zi];
      await delay(500);
      const raw = Math.round(400 + grams * 1.2);
      const R = Math.round(10000 * (4095 - raw) / raw);
      if (step === 1) { z.calibPt1 = { grams, R }; return send(res, 200, { ok: true, step: 1, raw, resistance: R, force_n: +(grams * 9.81 / 1000).toFixed(4) }); }
      if (!z.calibPt1) return err(res, 409, 'Run step 1 first');
      if (grams <= z.calibPt1.grams) return err(res, 422, 'Second weight must be heavier than the first');
      z.slope = (1 / R - 1 / z.calibPt1.R) / ((grams - z.calibPt1.grams) * 9.81 / 1000);
      z.calibPt1 = null;
      if (z.slope <= 0) return err(res, 422, 'Conductance did not increase. Check wiring.');
      return send(res, 200, { ok: true, step: 2, raw, resistance: R, slope: z.slope });
    }

    // ---- mock-only helpers
    case 'GET /mock/alert':
      if (zi < 0 || zi > 3) return err(res, 400, 'zone 0-3');
      zones[zi].alertActive = true; zones[zi].acknowledged = false; zones[zi].p = THR_P[zi] + 1.2;
      return send(res, 200, { ok: true });
    case 'GET /mock/high':
      if (zi < 0 || zi > 3) return err(res, 400, 'zone 0-3');
      zones[zi].forceHighUntil = now + 20000;
      return send(res, 200, { ok: true });
    case 'GET /mock/therapy':
      if (zi < 0 || zi > 3) return err(res, 400, 'zone 0-3');
      zones[zi].therapy = true; zones[zi]._therapyEnd = now + 10000;
      return send(res, 200, { ok: true });
    case 'GET /mock/sensorfail':
      if (zi < 0 || zi > 3) return err(res, 400, 'zone 0-3');
      zones[zi].sensor_ok = !zones[zi].sensor_ok;
      return send(res, 200, { ok: true, sensor_ok: zones[zi].sensor_ok });

    default:
      return err(res, 404, 'not found');
  }
}).listen(PORT, () => console.log(`Mock ESP32 listening on http://localhost:${PORT}`));
