/*
  PressureGuard LoRa RECEIVER - Complete Gateway Node
  Board: Arduino UNO R4 WiFi
  Radio: SX1278 / RA-02 433 MHz

  Features:
  - Connects to WiFi & MQTT Broker
  - Receives compact LoRa telemetry packets from transmitter node
  - Expands compact telemetry into full JSON structure and publishes to MQTT
  - Listens to MQTT command topic ("pressureguard/commands/#")
  - Queues desktop commands and sends downlinks over LoRa during node RX window
*/

#include <SPI.h>
#include <LoRa.h>
#include <WiFiS3.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* WIFI_SSID = "Raghav";
const char* WIFI_PASS = "s38mw2mn";

// MQTT Configuration
const char* MQTT_HOST = "10.227.189.128"; // Broker IP / Hostname
const int   MQTT_PORT = 1883;
const char* MQTT_CLIENT_ID = "PressureGuard_UNO_R4";
const char* MQTT_STATUS_TOPIC = "pressureguard/status";
const char* MQTT_TELEMETRY_TOPIC = "pressureguard/telemetry";
const char* MQTT_COMMAND_TOPIC = "pressureguard/commands/#";

// LoRa Pin Configuration for Arduino UNO R4 WiFi
const int LORA_SS   = 10;
const int LORA_RST  = 9;
const int LORA_DIO0 = 2;
const long LORA_FREQ = 433E6;

const char *ZONE_NAMES[4] = {"Sacrum", "Heel-L", "Heel-R", "Shoulder"};

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

unsigned long lastMqttAttempt = 0;
char pendingCommand[256] = "";
bool hasPendingCommand = false;

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (length >= sizeof(pendingCommand)) return;
  
  for (unsigned int i = 0; i < length; i++) {
    pendingCommand[i] = (char)payload[i];
  }
  pendingCommand[length] = '\0';
  hasPendingCommand = true;
  
  Serial.print("Queued Downlink Command from MQTT: ");
  Serial.println(pendingCommand);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected! IP Address: ");
  Serial.println(WiFi.localIP());
}

void connectMQTT() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastMqttAttempt < 5000) return;
  lastMqttAttempt = millis();

  Serial.print("Connecting to MQTT Broker...");
  bool ok = mqtt.connect(MQTT_CLIENT_ID, nullptr, nullptr, MQTT_STATUS_TOPIC, 1, true, "offline");

  if (ok) {
    mqtt.publish(MQTT_STATUS_TOPIC, "online", true);
    mqtt.subscribe(MQTT_COMMAND_TOPIC);
    Serial.println(" Connected and subscribed to command topics!");
  } else {
    Serial.print(" Failed, state=");
    Serial.println(mqtt.state());
  }
}

bool expandAndPublish(const char* rawPayload, size_t len) {
  StaticJsonDocument<768> compactDoc;
  DeserializationError err = deserializeJson(compactDoc, rawPayload, len);
  if (err) {
    Serial.print("JSON parse error on raw LoRa packet: ");
    Serial.println(err.c_str());
    return false;
  }

  StaticJsonDocument<1024> expandedDoc;
  expandedDoc["sequence"] = compactDoc["s"];
  expandedDoc["uptime"] = compactDoc["u"];
  expandedDoc["rssi"] = LoRa.packetRssi();
  expandedDoc["snr"] = LoRa.packetSnr();

  JsonArray expandedZones = expandedDoc.createNestedArray("zones");
  JsonArray compactZones = compactDoc["z"].as<JsonArray>();

  for (JsonArray row : compactZones) 
  {
    int id = row[0] | 0;
    float p = row[1] | 0.0f;
    float t = row[2] | 0.0f;
    float h = row[3] | 0.0f;
    uint8_t flags = row[4] | 0;
    int therapy = row[5] | 0;

    JsonObject zoneObj = expandedZones.createNestedObject();

    zoneObj["id"] = id;
    zoneObj["name"] = (id >= 0 && id < 4) ? ZONE_NAMES[id] : "Unknown";

    zoneObj["pressure_kPa"] = p;
    zoneObj["temperature_C"] = t;
    zoneObj["humidity_pct"] = h;

    zoneObj["pressure_high"] = (flags & 1) != 0;
    zoneObj["temp_high"] = (flags & 2) != 0;
    zoneObj["humidity_high"] = (flags & 4) != 0;
    zoneObj["alert"] = (flags & 8) != 0;
    zoneObj["sensor_ok"] = (flags & 16) != 0;

    zoneObj["therapy_active"] = (therapy == 1);
  }

  char outBuf[1024];
  size_t outLen = serializeJson(expandedDoc, outBuf, sizeof(outBuf));

  if (mqtt.connected()) {
    mqtt.publish(MQTT_TELEMETRY_TOPIC, outBuf, outLen);
    Serial.print("Expanded MQTT Telemetry Published: ");
    Serial.println(outBuf);
    return true;
  } else {
    Serial.println("MQTT disconnected, skipped publishing.");
    return false;
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000);

  connectWiFi();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(1800);

  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("LoRa initialization failed! Check wiring.");
    while (true) delay(1000);
  }

  LoRa.setSyncWord(0x42);
  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setTxPower(14);

  Serial.println("PressureGuard LoRa Receiver Gateway Ready!");
}

void loop() {
  connectWiFi();
  connectMQTT();
  if (mqtt.connected()) {
    mqtt.loop();
  }

  int packetSize = LoRa.parsePacket();
  if (packetSize > 0) {
    char payload[256];
    int n = 0;
    while (LoRa.available() && n < (int)sizeof(payload) - 1) {
      payload[n++] = (char)LoRa.read();
    }
    payload[n] = '\0';

    Serial.print("Received LoRa Packet (");
    Serial.print(packetSize);
    Serial.print(" bytes): ");
    Serial.println(payload);

    bool published = expandAndPublish(payload, (size_t)n);

    // DOWNLINK TRANSMISSION: Send command to Transmitter Node during its RX window
    if (published && hasPendingCommand) {
      delay(80); // Small pause for transmitter node radio to switch from TX to RX

      LoRa.beginPacket();
      LoRa.print(pendingCommand);
      LoRa.endPacket();

      Serial.print("Transmitted Downlink to Node: ");
      Serial.println(pendingCommand);

      hasPendingCommand = false;
      pendingCommand[0] = '\0';
    }
  }
}