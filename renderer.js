'use strict';

// ============================================================================
// Patient Monitoring System - renderer
//   * Live data comes from the ESP32 (polled by the Electron main process)
//   * 4 zone tabs + a Compact View tab
//   * Alert acknowledgement (tab blink -> blurred, inactive tab -> Acknowledge)
//   * Per-zone CSV export
// ============================================================================

const ZONE_COUNT   = 4;
const DEFAULT_NAMES = ['Z0-Sacrum', 'Z1-Heel-L', 'Z2-Heel-R', 'Z3-Shoulder'];   // replaced by names from the device
const ACK_GRACE_MS = 3000;     // ignore a stale "alert" for a moment after the user acknowledged
const MAX_LOG_ROWS = 50000;    // memory guard for very long sessions

const PATIENT_FIELDS = [
  ['name', 'Name'], ['age', 'Age'], ['ht', 'Height'],
  ['wt', 'Weight'], ['diag', 'Diagnosis'], ['bed', 'Bed No']
];

// id is used in element ids, k is the key used for chart sets
const METRICS = [
  { k: 't', id: 'temp', label: 'Temperature (\u2103)', color: '#ef4444' },
  { k: 'h', id: 'hum',  label: 'Humidity (%)',        color: '#22d3ee' },
  { k: 'p', id: 'pres', label: 'Pressure (kPa)',      color: '#eab308' }
];

const $   = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '--');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const zones = Array.from({ length: ZONE_COUNT }, (_, i) => ({
  id: i,
  name: DEFAULT_NAMES[i],
  state: 'running',     // running | paused | stopped  (controls card: play / pause / stop)
  log: [],              // rows for CSV: { ts, temp, hum, pres }
  lastSeq: null,        // last device reading counter that was charted/logged
  dev: null,            // latest zone object received from the device
  graceUntil: 0,
  ackBusy: false,
  ackError: '',
  charts: {},           // big charts (zone tab)
  mini: {}              // small charts (compact view)
}));

const conn = { connected: false, host: '', error: null, everConnected: false };
let activeTab = 0;

const siteOf  = (name) => String(name).replace(/^Z\d+-/, '').replace(/-/g, ' ');
const titleOf = (Z) => `Zone ${Z.id} \u00b7 ${siteOf(Z.name)}`;

// ---------------------------------------------------------------------------
// DOM construction
// ---------------------------------------------------------------------------
function zonePanelHTML(i) {
  const fields = PATIENT_FIELDS.map(([k, ph]) => `<input data-pf="${k}" placeholder="${ph}">`).join('');
  const cards = METRICS.map((m) => `
        <div class="card" id="z${i}-c-${m.id}">
          <div class="card-label">${m.label}</div>
          <div class="card-value" id="z${i}-v-${m.id}">--</div>
        </div>`).join('');
  const charts = METRICS.map((m) => `<div class="chart-wrap"><canvas id="z${i}-ch-${m.id}"></canvas></div>`).join('');

  return `
  <section class="panel" id="panel-${i}" hidden>
    <div class="panel-inner" id="inner-${i}">
      <div class="cards">${cards}
        <div class="card" id="z${i}-c-status">
          <div class="card-label">Status</div>
          <div class="card-value s-muted" id="z${i}-v-status">Waiting&hellip;</div>
        </div>
        <div class="card">
          <div class="card-label">Controls</div>
          <div class="ctrl-group">
            <button class="ctrl-btn" onclick="zoneStart(${i})" title="Start / resume">&#9654;</button>
            <button class="ctrl-btn" onclick="zonePause(${i})" title="Pause / resume">&#9646;&#9646;</button>
            <button class="ctrl-btn" onclick="zoneStop(${i})" title="Stop and clear">&#9632;</button>
          </div>
        </div>
      </div>
      <div class="bottom">
        <div class="patient-panel">
          <h2>Patient Details</h2>
          ${fields}
          <button class="btn-green" onclick="downloadCSV(${i})">Download CSV</button>
        </div>
        <div class="charts">${charts}</div>
      </div>
    </div>
    <div class="lock" id="lock-${i}" hidden>
      <div class="lock-box" role="alertdialog" aria-labelledby="lock-title-${i}">
        <div class="lock-icon">!</div>
        <h3 id="lock-title-${i}"></h3>
        <p>Immediate attention required &ndash; reposition the patient and check the site.</p>
        <p class="reason" id="lock-reason-${i}"></p>
        <button class="btn-red" id="lock-btn-${i}" onclick="acknowledge(${i})">Acknowledge</button>
        <div class="lock-err" id="lock-err-${i}"></div>
      </div>
    </div>
  </section>`;
}

function compactPanelHTML() {
  const tiles = zones.map((Z) => {
    const cols = METRICS.map((m) => `
        <div class="mcol" id="tile-${Z.id}-m-${m.id}">
          <span class="mval" id="tile-${Z.id}-v-${m.id}">--</span>
          <canvas id="tile-${Z.id}-ch-${m.id}"></canvas>
        </div>`).join('');
    return `
    <div class="ztile" id="tile-${Z.id}" onclick="selectTab(${Z.id})" title="Open zone">
      <div class="ztile-head">
        <span class="ztile-title" id="tile-title-${Z.id}"></span>
        <span class="badge b-off" id="tile-badge-${Z.id}">Waiting</span>
      </div>
      <div class="ztile-metrics">${cols}</div>
      <div class="tile-lock" id="tile-lock-${Z.id}" hidden onclick="event.stopPropagation()">
        <strong>&#9888; Alert &ndash; needs attention</strong>
        <button class="btn-red" id="tile-lock-btn-${Z.id}" onclick="acknowledge(${Z.id})">Acknowledge</button>
      </div>
    </div>`;
  }).join('');
  return `<section class="panel" id="panel-compact" hidden><div class="compact-grid">${tiles}</div></section>`;
}

function buildUI() {
  $('tabs').innerHTML =
    zones.map((Z) => `<button class="tab" id="tab-${Z.id}" onclick="selectTab(${Z.id})"></button>`).join('') +
    `<button class="tab compact-tab" id="tab-compact" onclick="selectTab('compact')">Compact View</button>`;

  $('panels').innerHTML = zones.map((Z) => zonePanelHTML(Z.id)).join('') + compactPanelHTML();

  zones.forEach((Z) => {
    METRICS.forEach((m) => {
      Z.charts[m.k] = new MiniChart(`z${Z.id}-ch-${m.id}`, m.label, m.color);
      Z.mini[m.k]   = new MiniChart(`tile-${Z.id}-ch-${m.id}`, m.label, m.color, { compact: true });
    });
  });

  // Patient details are shared by all zone tabs (one patient, one bed)
  document.querySelectorAll('input[data-pf]').forEach((inp) => {
    inp.addEventListener('input', () => {
      document.querySelectorAll(`input[data-pf="${inp.dataset.pf}"]`).forEach((o) => { if (o !== inp) o.value = inp.value; });
    });
  });

  $('alert-go').addEventListener('click', () => {
    const Z = zones.find(alertActive);
    if (Z) selectTab(Z.id);
  });
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function selectTab(key) {
  activeTab = key;
  [0, 1, 2, 3, 'compact'].forEach((k) => {
    $(`panel-${k}`).hidden = k !== key;
    $(`tab-${k}`).classList.toggle('active', k === key);
  });
  // Charts in hidden panels have no size; redraw once the panel is visible
  requestAnimationFrame(redrawCharts);
}

function redrawCharts() {
  zones.forEach((Z) => {
    Object.values(Z.charts).forEach((c) => c.draw());
    Object.values(Z.mini).forEach((c) => c.draw());
  });
}

// ---------------------------------------------------------------------------
// Incoming data
// ---------------------------------------------------------------------------
function onDeviceStatus(s) {
  if (!s) return;
  conn.connected = !!s.connected;
  conn.host      = s.host || conn.host;
  conn.error     = s.error || null;
  if (s.connected) conn.everConnected = true;

  if (s.data && Array.isArray(s.data.zones)) {
    s.data.zones.forEach(ingest);
  }
  renderAll();
}

function ingest(d) {
  const Z = zones[d.id];
  if (!Z) return;
  if (d.name) Z.name = d.name;
  Z.dev = d;
  // The ESP32 measures every 5 s; chart/log only when a fresh reading arrives
  if (Z.state === 'running' && d.seq !== Z.lastSeq) {
    Z.lastSeq = d.seq;
    record(Z, d);
  }
}

function record(Z, d) {
  const ok = d.sensor_ok !== false;
  const now = new Date();
  const label = now.toLocaleTimeString();

  Z.log.push({
    ts: now.toLocaleString(),
    temp: ok ? d.temperature : '',
    hum:  ok ? d.humidity : '',
    pres: d.pressure
  });
  if (Z.log.length > MAX_LOG_ROWS) Z.log.shift();

  if (ok) {
    Z.charts.t.push(label, d.temperature); Z.mini.t.push(label, d.temperature);
    Z.charts.h.push(label, d.humidity);    Z.mini.h.push(label, d.humidity);
  }
  Z.charts.p.push(label, d.pressure);      Z.mini.p.push(label, d.pressure);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const alertActive = (Z) => !!(Z.dev && Z.dev.alert) && Date.now() >= Z.graceUntil;

function paramsHigh(d) {
  const a = [];
  if (d.sensor_ok !== false && d.t_high) a.push('Temperature');
  if (d.sensor_ok !== false && d.h_high) a.push('Humidity');
  if (d.p_high) a.push('Pressure');
  return a;
}

function statusOf(Z) {
  const d = Z.dev;
  if (!d) return { text: 'Waiting\u2026', cls: 's-muted', badge: 'Waiting', bcls: 'b-off' };
  if (alertActive(Z)) return { text: '\u26a0 ALERT', cls: 's-alert', badge: 'Alert', bcls: 'b-alert' };
  if (!conn.connected) return { text: '\u26a0 Offline', cls: 's-muted', badge: 'Offline', bcls: 'b-off' };
  if (Z.state === 'stopped') return { text: '\u25a0 Stopped', cls: 's-muted', badge: 'Stopped', bcls: 'b-off' };
  if (Z.state === 'paused') return { text: '\u23f8 Paused', cls: 's-warn', badge: 'Paused', bcls: 'b-warn' };
  const hi = paramsHigh(d);
  if (hi.length) return { text: '\u26a0 ' + hi.join(', '), cls: 's-alert', badge: 'Threshold', bcls: 'b-warn' };
  if (d.sensor_ok === false) return { text: '\u26a0 Sensor fault', cls: 's-warn', badge: 'Sensor fault', bcls: 'b-warn' };
  return { text: '\u2713 Normal', cls: 's-normal', badge: 'Normal', bcls: 'b-ok' };
}

function renderValues(Z) {
  const d = Z.dev;
  if (Z.state === 'paused' && d) return;               // paused = display frozen
  const blank = !d || Z.state === 'stopped';
  const ok = !blank && d.sensor_ok !== false;

  const txt = {
    temp: ok ? fmt(d.temperature, 1) + ' \u00b0C' : '-- \u00b0C',
    hum:  ok ? fmt(d.humidity, 1) + ' %'          : '-- %',
    pres: blank ? '-- kPa' : fmt(d.pressure, 2) + ' kPa'
  };
  // threshold blinking on the cards (flags come from the device's own thresholds)
  const hi = {
    temp: ok && d.t_high,
    hum:  ok && d.h_high,
    pres: !blank && d.p_high
  };
  METRICS.forEach((m) => {
    $(`z${Z.id}-v-${m.id}`).textContent    = txt[m.id];
    $(`tile-${Z.id}-v-${m.id}`).textContent = txt[m.id];
    $(`z${Z.id}-c-${m.id}`).classList.toggle('alert-card', !!hi[m.id]);
    $(`tile-${Z.id}-m-${m.id}`).classList.toggle('alert-card', !!hi[m.id]);
  });
}

function renderStatus(Z) {
  const st = statusOf(Z);
  const sv = $(`z${Z.id}-v-status`);
  sv.textContent = st.text;
  sv.className = 'card-value ' + st.cls;

  const b = $(`tile-badge-${Z.id}`);
  b.textContent = st.badge;
  b.className = 'badge ' + st.bcls;
}

function alertReason(d) {
  if (!d) return '';
  const parts = [];
  const lim = (v) => (v != null ? ` (limit ${v})` : '');
  if (d.sensor_ok !== false && d.t_high) parts.push(`Temperature ${fmt(d.temperature, 1)} \u00b0C${lim(d.thr_t)}`);
  if (d.sensor_ok !== false && d.h_high) parts.push(`Humidity ${fmt(d.humidity, 1)} %${lim(d.thr_h)}`);
  if (d.p_high) parts.push(`Pressure ${fmt(d.pressure, 2)} kPa${lim(d.thr_p)}`);
  return parts.length ? parts.join(' \u2502 ') : 'Readings are back in range \u2013 acknowledge to clear the alert';
}

function renderLocks() {
  const alerting = [];
  zones.forEach((Z) => {
    const on = alertActive(Z);
    if (on) alerting.push(Z);

    $(`lock-${Z.id}`).hidden = !on;
    $(`inner-${Z.id}`).inert = on;                      // keyboard + mouse inactive while locked
    $(`tile-lock-${Z.id}`).hidden = !on;
    $(`tile-${Z.id}`).classList.toggle('alert-card', on);
    $(`tab-${Z.id}`).classList.toggle('alert', on);

    if (on) {
      $(`lock-title-${Z.id}`).textContent  = `Alert \u2013 ${titleOf(Z)}`;
      $(`lock-reason-${Z.id}`).textContent = alertReason(Z.dev);
      $(`lock-err-${Z.id}`).textContent    = Z.ackError;
      [`lock-btn-${Z.id}`, `tile-lock-btn-${Z.id}`].forEach((id) => {
        const btn = $(id);
        btn.disabled = Z.ackBusy;
        btn.textContent = Z.ackBusy ? 'Acknowledging\u2026' : 'Acknowledge';
      });
    }
  });

  $('tab-compact').classList.toggle('alert', alerting.length > 0);

  const bar = $('alert-bar');
  bar.classList.toggle('show', alerting.length > 0);
  if (alerting.length) {
    $('alert-text').textContent =
      '\u26a0 ALERT: ' + alerting.map((Z) => `Zone ${Z.id} ${siteOf(Z.name)}`).join(', ') + ' \u2013 reposition patient and acknowledge';
  }
}

function renderConnection() {
  let cls, text;
  if (conn.connected)  { cls = 'ok';   text = 'ESP32 connected'; }
  else if (conn.error) { cls = 'off';  text = 'Offline'; }
  else                 { cls = 'wait'; text = 'Connecting\u2026'; }
  $('conn-pill').className = 'conn-pill ' + cls;
  $('conn-text').textContent = text;
  $('conn-pill').title = `Device: ${conn.host || '--'} \u2013 click to change`;

  const bar = $('offline-bar');
  const offline = !conn.connected && !!conn.error;
  bar.classList.toggle('show', offline);
  if (offline) {
    $('offline-text').textContent = conn.everConnected
      ? `Connection to the ESP32 (${conn.host}) lost \u2013 showing last known readings. ${conn.error}.`
      : `Cannot reach the ESP32 at ${conn.host}. ${conn.error}.`;
  }
}

function renderAll() {
  zones.forEach((Z) => {
    $(`tab-${Z.id}`).textContent = titleOf(Z);
    $(`tile-title-${Z.id}`).textContent = titleOf(Z);
    renderValues(Z);
    renderStatus(Z);
  });
  renderLocks();
  renderConnection();
  if (typeof Diag !== 'undefined') {
    Diag.update({
      connected: conn.connected,
      host: conn.host,
      zones: zones.map((Z) => ({ id: Z.id, name: Z.name, therapy: !!(Z.dev && Z.dev.therapy) }))
    });
  }
}

// ---------------------------------------------------------------------------
// Alert acknowledgement
// ---------------------------------------------------------------------------
async function acknowledge(i) {
  const Z = zones[i];
  if (Z.ackBusy) return;
  Z.ackBusy = true;
  Z.ackError = '';
  renderLocks();

  let r;
  try {
    r = await window.electronAPI.ackZone(i);
  } catch (e) {
    r = { ok: false, error: 'Could not reach the device' };
  }
  Z.ackBusy = false;

  // 409 = the device no longer has an active alert for this zone -> already cleared
  if (r && (r.ok || r.status === 409)) {
    Z.graceUntil = Date.now() + ACK_GRACE_MS;
    if (Z.dev) Z.dev = { ...Z.dev, alert: false };
    setTimeout(renderAll, ACK_GRACE_MS + 60);
  } else {
    Z.ackError = (r && r.error) || 'Could not acknowledge. Try again.';
  }
  renderAll();
}

// ---------------------------------------------------------------------------
// Per-zone controls  (play / pause / stop)
// ---------------------------------------------------------------------------
function clearZoneData(Z) {
  Object.values(Z.charts).forEach((c) => c.clear());
  Object.values(Z.mini).forEach((c) => c.clear());
  Z.log = [];
}

function zoneStart(i) {
  const Z = zones[i];
  if (Z.state === 'running') return;
  const wasStopped = Z.state === 'stopped';
  Z.state = 'running';
  if (wasStopped && Z.dev) {            // plot the current reading straight away
    Z.lastSeq = Z.dev.seq;
    record(Z, Z.dev);
  }
  renderAll();
}

function zonePause(i) {
  const Z = zones[i];
  if (Z.state === 'stopped') return;
  Z.state = Z.state === 'paused' ? 'running' : 'paused';
  renderAll();
}

function zoneStop(i) {
  const Z = zones[i];
  Z.state = 'stopped';
  Z.lastSeq = null;
  clearZoneData(Z);
  renderAll();
}

// ---------------------------------------------------------------------------
// CSV (one zone per file)
// ---------------------------------------------------------------------------
const csvCell = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function patientValue(key) {
  const el = document.querySelector(`input[data-pf="${key}"]`);
  return el ? el.value : '';
}

async function downloadCSV(i) {
  const Z = zones[i];
  const rows = [
    ['Patient Name', patientValue('name')],
    ['Age',          patientValue('age')],
    ['Height',       patientValue('ht')],
    ['Weight',       patientValue('wt')],
    ['Diagnosis',    patientValue('diag')],
    ['Bed No',       patientValue('bed')],
    ['Zone',         Z.name],
    [],
    ['Timestamp', 'Temperature (C)', 'Humidity (%)', 'Pressure (kPa)'],
    ...Z.log.map((r) => ['"' + String(r.ts).replace(/"/g, '""') + '"', r.temp, r.hum, r.pres])
  ];
  const csv = rows.map((r, idx) => (idx < 7 ? r.map(csvCell) : r).join(',')).join('\r\n');
  const result = await window.electronAPI.saveCSV(csv, Z.name);
  if (result && result.success) {
    $('modal-path').textContent = result.filePath;
    $('modal').classList.add('show');
  }
}

function closeModal() {
  $('modal').classList.remove('show');
}

// ---------------------------------------------------------------------------
// Device connection dialog
// ---------------------------------------------------------------------------
function openConnDialog() {
  $('conn-host').value = conn.host || '';
  $('conn-msg').className = 'msg';
  $('conn-detail').textContent = conn.connected ? 'Currently connected' : (conn.error || 'Not connected');
  $('conn-overlay').classList.add('show');
  setTimeout(() => $('conn-host').select(), 30);
}

function closeConnDialog() {
  $('conn-overlay').classList.remove('show');
}

async function saveConnHost() {
  const msg = $('conn-msg');
  const btn = $('conn-save');
  btn.disabled = true;
  const r = await window.electronAPI.setDeviceHost($('conn-host').value);
  btn.disabled = false;
  if (r && r.ok) {
    closeConnDialog();
  } else {
    msg.textContent = (r && r.error) || 'Could not save';
    msg.className = 'msg show err';
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && $('conn-overlay').classList.contains('show') && document.activeElement === $('conn-host')) {
    saveConnHost();
  }
  if (e.key !== 'Escape') return;
  if ($('conn-overlay').classList.contains('show')) closeConnDialog();
  else if (typeof Diag !== 'undefined' && Diag.isOpen()) Diag.close();
  else closeModal();
});

[['conn-overlay', closeConnDialog], ['modal', closeModal]].forEach(([id, fn]) => {
  $(id).addEventListener('mousedown', (e) => { if (e.target === $(id)) fn(); });
});

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------
buildUI();
selectTab(0);
renderAll();

if (window.electronAPI) {
  window.electronAPI.onDeviceStatus(onDeviceStatus);
  window.electronAPI.getDeviceState().then(onDeviceStatus);
}
