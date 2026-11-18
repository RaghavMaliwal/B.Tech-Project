# Patient Monitoring System

Electron desktop app that shows live pressure / temperature / humidity from the
ESP32 pressure-ulcer device (4 zones), handles alert acknowledgement and offers
hardware diagnostics.

## Files
```
main.js            Electron main process: polls the ESP32 over HTTP, ack + diagnostics proxy, CSV save
preload.js         Secure IPC bridge (window.electronAPI)
index.html         UI + styles
renderer.js        Tabs, zone panels, compact view, alert lock, CSV
diagnostics.js     Diagnostics dialog (motor test, FSR calibration, I2C scan)
chart-mini.js      Self-contained chart engine
tools/mock-esp32.js  Fake ESP32 for developing without hardware
```

## Run
```bash
npm install
npm start
```
Node.js 18+ required. Windows: `run-windows.bat`.

## Connecting to the ESP32
1. Flash `pressure_ulcer_final.ino` (set `WIFI_SSID` / `WIFI_PASSWORD`). Libraries: ArduinoJson, WebSockets (ESPmDNS is built into the ESP32 core).
2. The PC and the ESP32 must be on the same network.
3. Open the app. It looks for `pressureguard.local`. If your network does not resolve it,
   click the connection pill (top right) and enter the IP printed in the serial monitor.
   The address is remembered. `PMS_ESP32_HOST=192.168.1.50 npm start` overrides it.

### ESP32 REST API (port 80, used by the app)
| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/status` | all zones: readings, thresholds, flags, alert, `seq` |
| POST | `/api/ack?zone=N` | acknowledge zone N's alert (only if one is active) |
| POST | `/api/diag/motor?zone=N\|all&sec=S` | motor test, non-blocking, 1-10 s |
| POST | `/api/diag/motor_stop` | stop motor test |
| GET  | `/api/diag/i2c` | bus scan + SHT41 per mux channel |
| GET  | `/api/diag/fsr` | raw ADC / resistance / slope per zone |
| POST | `/api/diag/calib?zone=N&step=1\|2&grams=G` | 2-point FSR calibration (saved to flash) |

The original WebSocket dashboard (`http://<ip>/`, port 81) still works unchanged.
These endpoints have no authentication: use a trusted network.

## Using the app
* **Zone tabs** - one per zone: cards, patient details, charts. Patient details are shared between tabs.
* **Compact View** - all four zones on one screen; click a tile to open the zone.
* **Alerts** - cards blink when a value is above the device's thresholds. When the device raises an
  alert, that zone's tab blinks red; opening it shows a blurred, inactive screen with one
  **Acknowledge** button (silences the buzzer/LED on the device).
* **Controls** - per zone: play / pause (freeze charts + log) / stop (clear charts + log).
* **Download CSV** - only the current zone's data; file name `patient_data_<Zone>_<date>_<time>.csv`.
* **Diagnostics** (spanner icon) - motor test, FSR calibration, I2C scan.

## Developing without hardware
```bash
node tools/mock-esp32.js 8080
PMS_ESP32_HOST=localhost:8080 npm start
```
Helpers: `curl localhost:8080/mock/alert?zone=1` (force alert), `/mock/high?zone=2`, `/mock/sensorfail?zone=0`.

## Build installer
`npm run build-win` or `npm run build-linux` (output in `dist/`).
