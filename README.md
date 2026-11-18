# PressureGuard

A LoRa-enabled, four-zone pressure-ulcer prevention and monitoring system. An ESP32 sensor node measures pressure, temperature and humidity at the sacrum, both heels and the shoulder, runs therapy and alert logic locally, and sends telemetry over LoRa (433 MHz) to an Arduino UNO R4 WiFi gateway. The gateway publishes to MQTT, where a desktop app and an Android app show live data and send commands back (acknowledge, motor test, diagnostics).

B.Tech. Project, Department of Electrical Engineering, IIT Jodhpur.
Team: Raghav Maliwal(B23EE1039), Nishikant Dhamgunde(B23EE1015) | Supervisor: Dr. Akshay Moudgil

```
ESP32 node --LoRa 433 MHz--> UNO R4 WiFi gateway --MQTT--> Desktop app / Mobile app
            <---- commands ----                    <---- commands ----
```

## Repository structure

```
PressureGuard/
├── arduino/
│   ├── final_transmitter.ino   # ESP32 sensor node
│   └── final_receiver.ino         # UNO R4 WiFi LoRa-to-MQTT gateway
├── Desktop-App/                                  # Electron dashboard (Windows / Linux)
├── Mobile-App/                                   # Expo / React Native Android dashboard
├── docs/
│   ├── PressureGuard_BTech_Project.pptx          # Presentation
│   ├── PressureGuard_BTP_Report.pdf              # Final report
│   └── report-latex/                             # LaTeX source of the report
└── README.md
```

## Hardware at a glance

- **Node:** ESP32 DevKit V1, 4 FSRs (10 kΩ dividers), 4 SHT41 behind a TCA9548A I²C multiplexer, 4 MOSFET-driven therapy motors, buzzer (GPIO 12), LED (GPIO 13), SX1278 / RA-02 LoRa.
- **Gateway:** Arduino UNO R4 WiFi + SX1278 / RA-02 (SS D10, RST D9, DIO0 D2).
- **LoRa:** 433 MHz, SF7, 125 kHz, 14 dBm, sync word 0x42. Check local regulations before use.

## Arduino code

Arduino IDE libraries: **LoRa** (Sandeep Mistry), **ArduinoJson**, **PubSubClient** (gateway only). `WiFiS3` comes with the UNO R4 board package.

- Each `.ino` file must sit in a folder with the same name (as shown above).
- Set your Wi-Fi and MQTT broker details in the constants at the top of `final_receiver.ino`. Do not commit real credentials.
- Upload `final_transmitter` to the ESP32 and `final_receiver` to the UNO R4 WiFi.

## Desktop app

```bash
cd desktop-app
npm install
npx electron .          # or run-windows.bat on Windows
```

Set the broker with the in-app connection dialog or the `MQTT_BROKER_URL` environment variable (for example `mqtt://192.168.1.10:1883`).

## Mobile app

```bash
cd mobile-app
npm install
npx expo start          # development
eas build -p android    # installable APK (needs an Expo account)
```

The phone connects to MQTT over WebSockets, so the broker needs a WebSockets listener (commonly port 9001). Enter an address such as `ws://192.168.1.10:9001` in the app's Settings screen.

## MQTT topics

| Topic | Direction | Content |
| --- | --- | --- |
| `pressureguard/telemetry` | gateway to apps | Four-zone JSON with RSSI and SNR |
| `pressureguard/status` | gateway to apps | `online` / `offline` (last will) |
| `pressureguard/commands/ack` | apps to gateway | Acknowledge / clear alerts |
| `pressureguard/commands/diag` | apps to gateway | Motor test and diagnostics |

## Testing without hardware

Run an MQTT broker, publish simulated four-zone telemetry on `pressureguard/telemetry`, and point either app at it. The desktop app also ships mock tools in `desktop-app/tools/`. Report Appendix C describes the procedure.
