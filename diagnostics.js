'use strict';

// ============================================================================
// Diagnostics dialog (spanner + screwdriver icon in the header)
//   Motor test        -> same as serial commands m0..m3 / mall
//   FSR calibration   -> same as serial commands c0..c3 (2-point, saved on the ESP32)
//   I2C & sensors     -> same as serial command i (plus an SHT41 check per mux channel)
// All requests go through the Electron main process to the ESP32 REST API.
// ============================================================================

const Diag = (() => {
  const MOTOR_GPIO = [25, 26, 27, 14];
  const FSR_GPIO   = [34, 35, 32, 33];
  const KNOWN_I2C  = { 0x70: 'TCA9548A mux', 0x44: 'SHT41' };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const site = (name, id) => (name ? String(name).replace(/^Z\d+-/, '').replace(/-/g, ' ') : `Zone ${id}`);
  const zlabel = (z) => (z.name ? `Zone ${z.id} \u00b7 ${site(z.name, z.id)}` : `Zone ${z.id}`);

  let isOpen = false;
  let pane = 'motors';
  let st = { connected: false, host: '', zones: [0, 1, 2, 3].map((id) => ({ id, name: '', therapy: false })) };

  const motor = { until: [0, 0, 0, 0], busy: false, ticker: null };
  const cal   = { zone: 0, p1: null, done: null, busy: false, liveBusy: false, timer: null };
  const scan  = { busy: false, ran: false };

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------
  function setMsg(id, text, kind) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg' + (text ? ' show ' + (kind || 'info') : '');
  }

  async function call(fn) {
    try { return await fn(); }
    catch (e) { return { ok: false, error: 'Could not reach the device' }; }
  }

  // -------------------------------------------------------------------------
  // Motor test
  // -------------------------------------------------------------------------
  function renderMotors() {
    $('pane-motors').innerHTML = `
      <p class="hint">Runs the coin vibration motor at 200&nbsp;Hz / 50&nbsp;% duty &ndash; the same drive as the serial
        commands <b>m0&ndash;m3</b> and <b>mall</b>. Use it to confirm wiring and that every motor is working.</p>
      <div class="row between">
        <label class="field" style="width:130px">Duration
          <select id="dm-sec"><option value="3">3 seconds</option><option value="5" selected>5 seconds</option><option value="10">10 seconds</option></select>
        </label>
        <div class="row">
          <button class="btn-sm green" id="dm-all">Test all motors</button>
          <button class="btn-sm red" id="dm-stop">Stop</button>
        </div>
      </div>
      <div class="mgrid">
        ${st.zones.map((z) => `
          <div class="mcard" id="dm-card-${z.id}">
            <div><div class="nm" id="dm-name-${z.id}"></div><div class="sub">Motor &middot; GPIO ${MOTOR_GPIO[z.id]}</div></div>
            <button class="btn-sm" id="dm-btn-${z.id}">Run motor</button>
          </div>`).join('')}
      </div>
      <div class="msg" id="dm-msg"></div>`;

    st.zones.forEach((z) => { $(`dm-btn-${z.id}`).onclick = () => runMotor(String(z.id)); });
    $('dm-all').onclick  = () => runMotor('all');
    $('dm-stop').onclick = stopMotors;
    refreshMotors();
  }

  function refreshMotors() {
    if (!$('dm-all')) return;
    const now = Date.now();
    st.zones.forEach((z) => {
      const card = $(`dm-card-${z.id}`), btn = $(`dm-btn-${z.id}`), nm = $(`dm-name-${z.id}`);
      if (!card) return;
      nm.textContent = zlabel(z);
      const left = Math.ceil((motor.until[z.id] - now) / 1000);
      const running = left > 0;
      card.classList.toggle('running', running);
      btn.textContent = running ? `Running\u2026 ${left}s` : (z.therapy ? 'Busy' : 'Run motor');
      btn.title = z.therapy ? 'This zone is currently in use by the device' : '';
      btn.disabled = !st.connected || motor.busy || z.therapy || running;
    });
    $('dm-all').disabled = !st.connected || motor.busy;
    $('dm-stop').disabled = !st.connected || motor.busy;
  }

  function ensureTicker() {
    if (motor.ticker) return;
    motor.ticker = setInterval(() => {
      refreshMotors();
      if (!motor.until.some((t) => t > Date.now())) { clearInterval(motor.ticker); motor.ticker = null; }
    }, 250);
  }

  async function runMotor(target) {
    if (motor.busy) return;
    motor.busy = true; refreshMotors();
    const secs = Number($('dm-sec').value) || 5;
    const r = await call(() => window.electronAPI.diag.motor(target, secs));
    motor.busy = false;
    if (r.ok) {
      const end = Date.now() + secs * 1000;
      st.zones.forEach((z) => { if ((target === 'all' || Number(target) === z.id) && !z.therapy) motor.until[z.id] = end; });
      const skipped = r.data && r.data.skipped ? ` (${r.data.skipped} skipped \u2013 in use)` : '';
      setMsg('dm-msg', `Motor test running for ${secs} s${skipped}.`, 'ok');
      ensureTicker();
    } else {
      setMsg('dm-msg', r.error || 'Motor test failed', 'err');
    }
    refreshMotors();
  }

  async function stopMotors() {
    motor.busy = true; refreshMotors();
    const r = await call(() => window.electronAPI.diag.motorStop());
    motor.busy = false;
    if (r.ok) { motor.until = [0, 0, 0, 0]; setMsg('dm-msg', 'Motors stopped.', 'info'); }
    else setMsg('dm-msg', r.error || 'Could not stop motors', 'err');
    refreshMotors();
  }

  // -------------------------------------------------------------------------
  // FSR calibration
  // -------------------------------------------------------------------------
  function renderFsr() {
    const z = st.zones[cal.zone];
    $('pane-fsr').innerHTML = `
      <p class="hint">Two-point calibration with known weights, identical to serial commands <b>c0&ndash;c3</b>.
        The resulting slope is stored on the ESP32 and used immediately.</p>
      <div class="zsel">
        ${st.zones.map((q) => `<button data-z="${q.id}" class="${q.id === cal.zone ? 'active' : ''}">Zone ${q.id}<br><small>${esc(q.name ? site(q.name, q.id) : '')}</small></button>`).join('')}
      </div>
      <div class="kv">
        <div><small>Raw ADC</small><b id="cl-raw">&ndash;</b></div>
        <div><small>Resistance</small><b id="cl-res">&ndash;</b></div>
        <div><small>Pressure</small><b id="cl-kpa">&ndash;</b></div>
        <div><small>Slope (S/N)</small><b id="cl-slope">&ndash;</b></div>
      </div>
      <div class="msg" id="cs-msg" style="margin:0 0 10px"></div>
      <div class="step" id="cs-1">
        <span class="num">1</span>
        <div class="grow">
          <h4>First known weight</h4>
          <div class="hint" style="margin:0">Place a weight on the FSR of ${esc(zlabel(z))} (GPIO ${FSR_GPIO[cal.zone]}), enter it and capture.</div>
          <div class="row">
            <label class="field">Weight (g)<input id="cs-g1" type="number" min="1" step="any" placeholder="e.g. 200"></label>
            <button class="btn-sm" id="cs-b1">Capture point 1</button>
          </div>
          <div class="res" id="cs-r1"></div>
        </div>
      </div>
      <div class="step off" id="cs-2">
        <span class="num">2</span>
        <div class="grow">
          <h4>Second, heavier weight</h4>
          <div class="hint" style="margin:0">Replace with a heavier weight, enter it and capture. The result is saved on the device.</div>
          <div class="row">
            <label class="field">Weight (g)<input id="cs-g2" type="number" min="1" step="any" placeholder="e.g. 1000"></label>
            <button class="btn-sm green" id="cs-b2">Capture point 2 &amp; save</button>
          </div>
          <div class="res" id="cs-r2"></div>
        </div>
      </div>
      <div class="row" style="margin-top:10px"><button class="btn-sm ghost" id="cs-reset">Start over</button></div>`;

    document.querySelectorAll('#pane-fsr .zsel button').forEach((b) => {
      b.onclick = () => { cal.zone = Number(b.dataset.z); cal.p1 = null; cal.done = null; renderFsr(); pollFsr(); };
    });
    $('cs-b1').onclick = () => capture(1);
    $('cs-b2').onclick = () => capture(2);
    $('cs-reset').onclick = () => { cal.p1 = null; cal.done = null; renderFsr(); };
    refreshCal();
  }

  function refreshCal() {
    if (!$('cs-1')) return;
    const off = !st.connected || cal.busy;
    $('cs-1').classList.toggle('done', !!cal.p1 || !!cal.done);
    $('cs-2').classList.toggle('off', !cal.p1 && !cal.done);
    $('cs-2').classList.toggle('done', !!cal.done);
    $('cs-b1').disabled = off || !!cal.done;
    $('cs-g1').disabled = !!cal.done;
    $('cs-b2').disabled = off || !cal.p1;
    $('cs-g2').disabled = !cal.p1;
    if (cal.p1) $('cs-r1').textContent = `Captured: ${cal.p1.grams} g \u2192 raw ${cal.p1.raw}, R = ${cal.p1.R} \u03a9`;
    if (cal.done) $('cs-r2').textContent = `Saved: slope = ${cal.done.slope} S/N`;
  }

  async function capture(step) {
    const input = $(step === 1 ? 'cs-g1' : 'cs-g2');
    const grams = parseFloat(input.value);
    if (!(grams > 0)) { setMsg('cs-msg', 'Enter the weight in grams.', 'err'); return; }
    if (step === 2 && cal.p1 && grams <= cal.p1.grams) {
      setMsg('cs-msg', 'The second weight must be heavier than the first.', 'err'); return;
    }
    cal.busy = true; refreshCal();
    setMsg('cs-msg', 'Measuring \u2013 keep the weight still\u2026', 'info');
    const r = await call(() => window.electronAPI.diag.calib(cal.zone, step, grams));
    cal.busy = false;

    if (!r.ok) {
      setMsg('cs-msg', r.error || 'Calibration failed', 'err');
    } else if (step === 1) {
      cal.p1 = { grams, raw: r.data.raw, R: r.data.resistance };
      setMsg('cs-msg', 'Point 1 captured. Now place a heavier weight.', 'ok');
    } else {
      const slope = Number(r.data.slope);
      cal.done = { slope: Number.isFinite(slope) ? slope.toExponential(4) : String(r.data.slope) };
      setMsg('cs-msg', 'Calibration complete and saved on the device.', 'ok');
    }
    refreshCal();
  }

  async function pollFsr() {
    if (!isOpen || pane !== 'fsr' || !st.connected || cal.liveBusy || cal.busy) return;
    cal.liveBusy = true;
    const r = await call(() => window.electronAPI.diag.fsr());
    cal.liveBusy = false;
    if (!r.ok || !r.data || !$('cl-raw')) return;
    const z = (r.data.zones || []).find((q) => q.zone === cal.zone);
    if (!z) return;
    $('cl-raw').textContent   = z.raw;
    $('cl-res').textContent   = z.resistance == null ? 'open / none' : z.resistance + ' \u03a9';
    $('cl-kpa').textContent   = Number(z.pressure).toFixed(2) + ' kPa';
    $('cl-slope').textContent = Number(z.slope).toExponential(2);
  }

  function startFsrTimer() {
    stopFsrTimer();
    pollFsr();
    cal.timer = setInterval(pollFsr, 1500);
  }
  function stopFsrTimer() {
    if (cal.timer) { clearInterval(cal.timer); cal.timer = null; }
  }

  // -------------------------------------------------------------------------
  // I2C & sensors
  // -------------------------------------------------------------------------
  function renderI2c() {
    $('pane-i2c').innerHTML = `
      <p class="hint">Scans the I&sup2;C bus (serial command <b>i</b>) and reads the SHT41 temperature / humidity sensor
        behind each TCA9548A multiplexer channel. Mux channels are closed during the bus scan, so only the multiplexer
        itself is expected on the main bus.</p>
      <div class="row between"><span class="sect">Results</span><button class="btn-sm" id="di-run">Run scan</button></div>
      <div id="di-out"></div>
      <div class="msg" id="di-msg"></div>`;
    $('di-run').onclick = runScan;
    refreshScan();
  }

  function refreshScan() {
    const b = $('di-run');
    if (b) b.disabled = !st.connected || scan.busy;
  }

  async function runScan() {
    if (scan.busy) return;
    scan.busy = true; refreshScan();
    setMsg('di-msg', 'Scanning\u2026', 'info');
    const r = await call(() => window.electronAPI.diag.i2c());
    scan.busy = false; scan.ran = true;
    refreshScan();
    if (!r.ok) { setMsg('di-msg', r.error || 'Scan failed', 'err'); return; }
    setMsg('di-msg', '');

    const d = r.data || {};
    const hex = (a) => '0x' + a.toString(16).toUpperCase().padStart(2, '0');
    const chips = (d.bus || []).length
      ? d.bus.map((a) => `<span class="chip ${KNOWN_I2C[a] ? 'good' : ''}">${hex(a)}${KNOWN_I2C[a] ? ' &middot; ' + KNOWN_I2C[a] : ''}</span>`).join('')
      : '<span class="hint" style="margin:0">No devices found &ndash; check SDA/SCL wiring.</span>';

    const rows = (d.channels || []).map((c) => `
      <tr>
        <td><b>Zone ${c.zone}</b> &middot; ${esc(site(c.name, c.zone))}</td>
        <td>CH${c.zone}</td>
        <td><span class="pill ${c.ok ? 'ok' : 'bad'}">${c.ok ? 'OK' : 'NOT FOUND'}</span></td>
        <td>${c.ok ? Number(c.temperature).toFixed(1) + ' \u00b0C' : '&ndash;'}</td>
        <td>${c.ok ? Number(c.humidity).toFixed(1) + ' %' : '&ndash;'}</td>
      </tr>`).join('');

    $('di-out').innerHTML = `
      <div class="row" style="margin:6px 0 2px"><span class="sect">TCA9548A multiplexer (0x70)</span>
        <span class="pill ${d.tca_ok ? 'ok' : 'bad'}">${d.tca_ok ? 'OK' : 'NOT FOUND'}</span></div>
      <div class="sect" style="margin-top:12px">Main bus devices</div>
      <div class="chips">${chips}</div>
      <div class="sect">SHT41 per channel</div>
      <table class="tbl"><thead><tr><th>Zone</th><th>Mux</th><th>SHT41</th><th>Temp</th><th>Humidity</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // -------------------------------------------------------------------------
  // Dialog plumbing
  // -------------------------------------------------------------------------
  function showPane(name) {
    pane = name;
    document.querySelectorAll('#diag-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.pane === name));
    ['motors', 'fsr', 'i2c'].forEach((p) => { $(`pane-${p}`).hidden = p !== name; });
    if (name === 'fsr') startFsrTimer(); else stopFsrTimer();
    if (name === 'i2c' && !scan.ran && st.connected) runScan();
  }

  function renderFoot() {
    const f = $('diag-foot');
    f.className = 'dlg-foot ' + (st.connected ? 'ok' : 'off');
    $('diag-foot-text').textContent = st.connected
      ? `Connected to ${st.host}`
      : 'Device offline \u2013 diagnostics are unavailable until the ESP32 reconnects';
  }

  function refreshAll() {
    renderFoot();
    refreshMotors();
    refreshCal();
    refreshScan();
  }

  function open() {
    isOpen = true;
    scan.ran = false;
    renderMotors(); renderFsr(); renderI2c();
    $('diag-overlay').classList.add('show');
    showPane('motors');
    refreshAll();
  }

  function close() {
    isOpen = false;
    stopFsrTimer();
    $('diag-overlay').classList.remove('show');
  }

  function update(s) {
    st = { ...s };
    if (!isOpen) return;
    refreshAll();
  }

  // wire static controls
  document.querySelectorAll('#diag-tabs button').forEach((b) => b.addEventListener('click', () => showPane(b.dataset.pane)));
  $('diag-overlay').addEventListener('mousedown', (e) => { if (e.target === $('diag-overlay')) close(); });

  return { open, close, update, isOpen: () => isOpen };
})();
