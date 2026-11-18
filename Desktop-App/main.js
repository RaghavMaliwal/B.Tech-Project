const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const mqtt = require('mqtt');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Default MQTT Broker URL. Can be updated dynamically from the app header
// or via environment variable MQTT_BROKER_URL.
const DEFAULT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://192.168.1.100:1883';
const TELEMETRY_TOPIC = 'pressureguard/telemetry';
const STATUS_TOPIC = 'pressureguard/receiver/status';
const CMD_ACK_TOPIC = 'pressureguard/commands/ack';
const CMD_DIAG_TOPIC = 'pressureguard/commands/diag';

const DATA_TIMEOUT_MS = 15000; // mark offline if no MQTT packet received for 15 seconds

let win = null;
let config = { brokerUrl: DEFAULT_BROKER };
let configPath = null;
let mqttClient = null;
let timeoutCheckTimer = null;

let deviceState = {
  connected: false,
  host: config.brokerUrl,
  lastSeen: null,
  error: null,
  data: null
};

// ---------------------------------------------------------------------------
// Configuration Management
// ---------------------------------------------------------------------------
function loadConfig() {
  configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (saved && typeof saved.brokerUrl === 'string' && !process.env.MQTT_BROKER_URL) {
      config.brokerUrl = normalizeBrokerUrl(saved.brokerUrl);
    }
  } catch (_) { /* Keep default */ }
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Could not save config:', e);
  }
}

function normalizeBrokerUrl(input) {
  let str = String(input || '').trim();
  if (!str.startsWith('mqtt://') && !str.startsWith('mqtts://') && !str.startsWith('ws://') && !str.startsWith('wss://')) {
    str = 'mqtt://' + str;
  }
  return str;
}

function pushState() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('device-status', deviceState);
  }
}

// ---------------------------------------------------------------------------
// MQTT Client Lifecycle
// ---------------------------------------------------------------------------
function connectMQTT() {
  if (mqttClient) {
    try { mqttClient.end(true); } catch (_) {}
  }

  deviceState = {
    connected: false,
    host: config.brokerUrl,
    lastSeen: deviceState.lastSeen,
    error: 'Connecting to MQTT Broker...',
    data: deviceState.data
  };
  pushState();

  console.log(`Connecting to MQTT broker at: ${config.brokerUrl}`);

  mqttClient = mqtt.connect(config.brokerUrl, {
    clientId: `pressureguard-desktop-${Math.random().toString(16).substring(2, 8)}`,
    clean: true,
    connectTimeout: 8000,
    reconnectPeriod: 4000
  });

  mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
    mqttClient.subscribe([TELEMETRY_TOPIC, STATUS_TOPIC], (err) => {
      if (err) {
        console.error('Failed to subscribe to MQTT topics:', err);
      } else {
        console.log(`Subscribed to topics: ${TELEMETRY_TOPIC}, ${STATUS_TOPIC}`);
      }
    });

    deviceState.connected = true;
    deviceState.host = config.brokerUrl;
    deviceState.error = null;
    pushState();
  });

  mqttClient.on('message', (topic, message) => {
  const payloadStr = message.toString();

  if (topic === STATUS_TOPIC) {
    if (payloadStr.trim() === 'offline') {
      deviceState.connected = false;
      deviceState.error = 'LoRa receiver status reported offline';
      pushState();
    }
    return;
  }

  if (topic === TELEMETRY_TOPIC) {
      try {
        const raw = JSON.parse(payloadStr);

        if (raw && Array.isArray(raw.zones) && raw.zones.length === 4) {
          // Normalize JSON schema so renderer.js gets exact property names it expects
          const normalizedData = {
            device: raw.device || "PressureGuard LoRa",
            seq: raw.seq !== undefined ? raw.seq : raw.sequence,
            uptime_s: raw.uptime_s !== undefined ? raw.uptime_s : raw.uptime,
            ip: raw.ip || "",
            rssi: raw.rssi || 0,
            zones: raw.zones.map((z, idx) => {
              const pressure = z.pressure !== undefined ? z.pressure : (z.pressure_kPa || 0);
              const temp = z.temperature !== undefined ? z.temperature : (z.temperature_C || 0);
              const hum = z.humidity !== undefined ? z.humidity : (z.humidity_pct || 0);
              const pLimits = [4.27, 4.27, 4.27, 4.00];

              return {
                id: z.id !== undefined ? z.id : idx,
                name: z.name || ["Sacrum", "Heel-L", "Heel-R", "Shoulder"][idx],
                seq: raw.seq !== undefined ? raw.seq : raw.sequence,
                pressure: pressure,
                pressure_mmhg: z.pressure_mmhg !== undefined ? z.pressure_mmhg : +(pressure * 7.50062).toFixed(1),
                temperature: temp,
                humidity: hum,
                sensor_ok: z.sensor_ok !== undefined ? z.sensor_ok : true,
                p_high: z.p_high !== undefined ? z.p_high : !!z.pressure_high,
                t_high: z.t_high !== undefined ? z.t_high : !!z.temp_high,
                h_high: z.h_high !== undefined ? z.h_high : !!z.humidity_high,
                alert: !!z.alert,
                therapy: z.therapy !== undefined ? z.therapy : !!z.therapy_active,
                thr_p: z.thr_p || pLimits[idx],
                thr_t: z.thr_t || 36.0,
                thr_h: z.thr_h || 70.0
              };
            })
          };

          deviceState.connected = true;
          deviceState.lastSeen = Date.now();
          deviceState.error = null;
          deviceState.data = normalizedData;

          console.log(`[SUCCESS] Telemetry normalized and sent to UI (Seq: ${normalizedData.seq})`);
          pushState();
        } else {
          console.warn('[REJECTED] Telemetry JSON missing "zones" array of length 4.');
        }
      } catch (err) {
        console.error('Failed to parse telemetry JSON:', err.message);
      }
    }
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error:', err.message);
    deviceState.connected = false;
    deviceState.error = `MQTT Error: ${err.message}`;
    pushState();
  });

  mqttClient.on('offline', () => {
    deviceState.connected = false;
    deviceState.error = 'MQTT Broker disconnected';
    pushState();
  });
}

function startTimeoutMonitor() {
  if (timeoutCheckTimer) clearInterval(timeoutCheckTimer);
  timeoutCheckTimer = setInterval(() => {
    if (deviceState.connected && deviceState.lastSeen) {
      if (Date.now() - deviceState.lastSeen > DATA_TIMEOUT_MS) {
        deviceState.connected = false;
        deviceState.error = 'No telemetry received from LoRa receiver recently';
        pushState();
      }
    }
  }, 3000);
}

// ---------------------------------------------------------------------------
// Window Creation
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  loadConfig();
  deviceState.host = config.brokerUrl;

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Patient Monitoring System',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
  
  win.webContents.once('did-finish-load', () => {
    connectMQTT();
    startTimeoutMonitor();
  });
});

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------
function pad2(n) { return String(n).padStart(2, '0'); }
function fileStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_` +
         `${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

ipcMain.handle('save-csv', async (event, csvContent, zoneName) => {
  const safeZone = String(zoneName || 'zone').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'zone';
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Save Patient Data',
    defaultPath: path.join(app.getPath('downloads'), `patient_data_${safeZone}_${fileStamp()}.csv`),
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { success: false };
  fs.writeFileSync(filePath, String(csvContent), 'utf8');
  return { success: true, filePath };
});

ipcMain.handle('device-get-state', async () => deviceState);

ipcMain.handle('device-set-host', async (event, host) => {
  try {
    config.brokerUrl = normalizeBrokerUrl(host);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  saveConfig();
  connectMQTT();
  return { ok: true, host: config.brokerUrl };
});

// Helper function to send commands over MQTT
function publishCommand(topic, payload) {
  return new Promise((resolve) => {
    if (!mqttClient || !mqttClient.connected) {
      return resolve({ ok: false, error: 'MQTT broker disconnected' });
    }
    mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) return resolve({ ok: false, error: err.message });
      resolve({ ok: true });
    });
  });
}

// IPC: Alert Ack & Diagnostics over MQTT
ipcMain.handle('device-ack', async (event, zone) => {
  return publishCommand(CMD_ACK_TOPIC, { action: 'clear_alerts', zone: Number(zone), timestamp: Date.now() });
});

ipcMain.handle('diag-motor', async (event, zone, seconds, state) => {
  return publishCommand(CMD_DIAG_TOPIC, { 
    action: 'motor', 
    zone: Number(zone), 
    seconds: Number(seconds || 5),
    state: state !== undefined ? Number(state) : 1 
  });
});

ipcMain.handle('diag-motor-stop', async () => {
  return publishCommand(CMD_DIAG_TOPIC, { action: 'motor_stop_all' });
});

ipcMain.handle('diag-i2c', async () => {
  return publishCommand(CMD_DIAG_TOPIC, { action: 'i2c' });
});

ipcMain.handle('diag-fsr', async () => {
  return publishCommand(CMD_DIAG_TOPIC, { action: 'fsr' });
});

ipcMain.handle('diag-calib', async (event, zone, step, grams) => {
  return publishCommand(CMD_DIAG_TOPIC, { action: 'calib', zone: Number(zone), step: Number(step), grams: Number(grams) });
});

app.on('window-all-closed', () => {
  if (timeoutCheckTimer) clearInterval(timeoutCheckTimer);
  if (mqttClient) mqttClient.end(true);
  if (process.platform !== 'darwin') app.quit();
});