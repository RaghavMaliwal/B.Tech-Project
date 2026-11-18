#!/usr/bin/env node
/*
  Mock MQTT Publisher for PressureGuard Desktop Testing
  Requires a running MQTT broker on localhost (e.g., Mosquitto).
  
  Run with: node tools/mock-mqtt.js
*/
const mqtt = require('mqtt');

const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const TELEMETRY_TOPIC = 'pressureguard/telemetry';
const STATUS_TOPIC = 'pressureguard/receiver/status';
const COMMANDS_TOPIC = 'pressureguard/commands/#';

const client = mqtt.connect(BROKER);
const ZONE_NAMES = ['Sacrum', 'Heel-L', 'Heel-R', 'Shoulder'];
let seq = 1;

client.on('connect', () => {
  console.log(`Mock MQTT Publisher connected to ${BROKER}`);
  client.publish(STATUS_TOPIC, 'online', { retain: true });

  // Subscribe to command topics to test UI/Electron downlink execution
  client.subscribe(COMMANDS_TOPIC, (err) => {
    if (!err) {
      console.log(`Subscribed to command channel: ${COMMANDS_TOPIC}`);
    }
  });

  setInterval(() => {
    seq++;
    const payload = {
      device: 'PressureGuard LoRa (Mock)',
      seq: seq,
      uptime_s: Math.floor(process.uptime()),
      ip: '127.0.0.1',
      rssi: -58,
      zones: ZONE_NAMES.map((name, id) => {
        const pressure = +(1.8 + Math.random() * 0.8).toFixed(2);
        const temperature = +(33.5 + Math.random() * 1.5).toFixed(1);
        const humidity = +(55 + Math.random() * 10).toFixed(1);
        return {
          id: id,
          name: name,
          seq: seq,
          pressure: pressure,
          pressure_mmhg: +(pressure * 7.50062).toFixed(1),
          temperature: temperature,
          humidity: humidity,
          sensor_ok: true,
          p_high: pressure > 4.27,
          t_high: temperature > 36.0,
          h_high: humidity > 70.0,
          alert: false,
          therapy: false,
          thr_p: 4.27,
          thr_t: 36.0,
          thr_h: 70.0
        };
      })
    };

    client.publish(TELEMETRY_TOPIC, JSON.stringify(payload));
    console.log(`Published seq #${seq} to ${TELEMETRY_TOPIC}`);
  }, 5000);
});

// Log incoming downlink commands sent from Electron app
client.on('message', (topic, message) => {
  if (topic.startsWith('pressureguard/commands')) {
    console.log(`[Mock Downlink Command Received] Topic: ${topic} | Payload: ${message.toString()}`);
  }
});