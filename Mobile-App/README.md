# Patient Monitor – mobile app (Expo / React Native)

Android app for the pressure-ulcer monitoring device. Same features as the desktop app, laid out for a phone.
No Java/Kotlin: it is a TypeScript Expo app, built into an APK with **EAS Build**.
The ESP32 firmware is the same `pressure_ulcer_final.ino` as the desktop app (REST API on port 80).

## Screens
* **Home** – title, a compact card per zone with live **temperature / humidity / pressure numbers**,
  alert + offline banners, and a bottom bar: **ESP32 connection status** (tap for settings) and **Diagnostics**.
* **Zone dashboard** (tap a card) – big live numbers, ▶ ⏸ ■ recording controls, three graphs (T / H / P with the
  device's limit as a dashed line) and a **Download CSV** button for *that zone only*.
* **Download CSV** – asks for patient details (all optional), then **Save to device** (choose a folder once, it is
  remembered) or **Share…**. File name: `patient_data_<Zone>_<date>_<time>.csv`.
* **Alerts** – a zone card blinks red; opening that zone shows a frosted, inactive screen with a single
  **Acknowledge** button (silences the device buzzer/LED). A sound + vibration notification is raised too.
* **Diagnostics** (full screen) – Motor Test, FSR Calibration (2-point, saved on the ESP32), I²C & Sensors scan.
* **Device & Settings** – ESP32 address, **Find device** (scans the Wi-Fi network), keep-screen-on, notifications.

## Build the APK with EAS (no Android Studio needed)
```bash
npm install
npm install -g eas-cli
eas login                      # free Expo account
eas init                       # links the project (adds projectId to app.json)
eas build -p android --profile preview
```
When the cloud build finishes, EAS prints a link/QR code to download the **.apk** – install it on the phone
(allow "install unknown apps"). `--profile preview` produces an APK; `production` produces an .aab for Play Store.

## Run while developing
```bash
npx expo start         # needs a dev build or Expo Go on the same Wi-Fi; type-check with: npm run typecheck
```
To work without hardware, use the mock device from the desktop project:
`node tools/mock-esp32.js 8080`, then enter `<your-PC-IP>:8080` in the app's Device & Settings.

## Connecting to the ESP32
Phone and ESP32 must be on the **same Wi-Fi**. Open *Device & Settings* → **Find device** (tries `pressureguard.local`,
then scans the phone's subnet), or type the IP shown in the Arduino serial monitor. The address is remembered.

## Notes / limits
* The app talks plain HTTP to the ESP32 (`usesCleartextTraffic` is enabled in `app.json` via expo-build-properties).
* Alerts/notifications run while the app process is alive (foreground, or recently backgrounded). For bedside use
  keep the app open – *Keep screen on* is enabled by default. The device buzzer always sounds regardless.
* Graphs/CSV data live in memory: closing the app clears them (same as the desktop app).
* The ESP32 endpoints have no authentication – use a trusted network.

## Layout
```
App.tsx                 navigation (Home → Zone / Diagnostics / Settings, Android back button)
src/store.tsx           polling, per-zone logs, alert notifications, recording state
src/api.ts              ESP32 REST client + auto-discovery
src/csv.ts              CSV builder, save-to-folder, share
src/screens/*           Home, Zone, Diagnostics, Settings
src/components/*        Chart (SVG), ZoneCard, AlertLock, PatientSheet, icons…
eas.json / app.json     build + app configuration
```
