/*
  PressureGuard LoRa TRANSMITTER - Complete Bidirectional Node
  Board: ESP32 DevKit V1
  Radio: SX1278 / RA-02 433 MHz

  Features:
  - Multi-zone reading (4 FSRs + 4 SHT41 sensors via TCA9548A multiplexer)
  - Automatic therapy motor control & alerting (Buzzer + LED)
  - Transmits single compact telemetry packet
  - Listens for downlinks (1.5s RX window) right after sending telemetry
*/

#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <ArduinoJson.h>
#include <math.h>

#define TCA_ADDR 0x70
#define SHT41_ADDR 0x44

// Pin Allocations
const int FSR_PINS[4]   = {34, 35, 32, 33};
const int MOTOR_PINS[4] = {25, 26, 27, 14};
const int BUZZER_PIN    = 12;
const int LED_PIN       = 13;

// SPI LoRa Pins (ESP32 DevKit V1)
const int LORA_SCK  = 18;
const int LORA_MISO = 19;
const int LORA_MOSI = 23;
const int LORA_SS   = 5;
const int LORA_RST  = 4;
const int LORA_DIO0 = 2;
const long LORA_FREQ = 433E6;

// FSR & Threshold Parameters
const float R_REF = 10000.0f, VCC = 3.3f, ADC_MAX = 4095.0f;
float FSR_SLOPE[4] = {0.00003f, 0.00003f, 0.00003f, 0.00003f}; // CALIBRATE AS NEEDED
const float AREA_CM2[4] = {90.0f, 45.0f, 45.0f, 60.0f};
const float P_LIMIT[4]  = {4.27f, 4.27f, 4.27f, 4.00f};
const float T_LIMIT[4]  = {36.0f, 36.0f, 36.0f, 36.0f};
const float H_LIMIT[4]  = {70.0f, 70.0f, 70.0f, 70.0f};

const unsigned long POLL_MS      = 5000;
const unsigned long THRESHOLD_MS = 10UL * 1000UL; // 2 hours high pressure trigger
const unsigned long THERAPY_MS   = 15000;                      // 15 seconds therapy cycle

const char *ZONE_NAMES[4] = {"Sacrum", "Heel-L", "Heel-R", "Shoulder"};

struct Zone {
  float p, t, h;
  bool pHigh, tHigh, hHigh, alert, therapy;
  unsigned long highSince, therapySince;
};

Zone z[4];
unsigned long lastPoll = 0;
uint32_t sequenceNo = 0;

void tcaSelect(int ch) {
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(ch < 0 ? 0 : (1 << ch));
  Wire.endTransmission();
  delayMicroseconds(150);
}

bool readSHT41(float &temp, float &hum) {
  Wire.beginTransmission(SHT41_ADDR);
  Wire.write(0xFD);
  if (Wire.endTransmission() != 0) return false;
  delay(10);
  if (Wire.requestFrom((uint8_t)SHT41_ADDR, (uint8_t)6) != 6) return false;
  uint8_t b[6];
  for (int i = 0; i < 6; i++) b[i] = Wire.read();
  uint16_t rt = ((uint16_t)b[0] << 8) | b[1];
  uint16_t rh = ((uint16_t)b[3] << 8) | b[4];
  temp = -45.0f + 175.0f * rt / 65535.0f;
  hum = constrain(-6.0f + 125.0f * rh / 65535.0f, 0.0f, 100.0f);
  return true;
}

float readPressure(int pin, int i) {
  long sum = 0;
  for (int n = 0; n < 16; n++) {
    sum += analogRead(pin);
    delayMicroseconds(200);
  }
  int raw = sum / 16;
  if (raw < 15) return 0;
  if (raw > 4080) return 99.9f;
  float v = raw * VCC / ADC_MAX;
  float resistance = R_REF * (VCC - v) / v;
  if (resistance <= 0) return 99.9f;
  float conductance = 1.0f / resistance;
  float forceN = conductance / FSR_SLOPE[i];
  return max(0.0f, (forceN / (AREA_CM2[i] * 1e-4f)) / 1000.0f);
}

void motorOn(int pin) {
  ledcAttach(pin, 200, 8);
  ledcWrite(pin, 128);
}

void motorOff(int pin) {
  ledcWrite(pin, 0);
  ledcDetach(pin);
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
}

void readZone(int i) {
  z[i].p = readPressure(FSR_PINS[i], i);
  tcaSelect(i);
  float t = 0, h = 0;
  if (readSHT41(t, h)) {
    z[i].t = t;
    z[i].h = h;
  } else {
    z[i].t = NAN;
    z[i].h = NAN;
  }
  tcaSelect(-1);

  z[i].pHigh = z[i].p > P_LIMIT[i];
  z[i].tHigh = !isnan(z[i].t) && z[i].t > T_LIMIT[i];
  z[i].hHigh = !isnan(z[i].h) && z[i].h > H_LIMIT[i];
}

void updateTherapy(int i, unsigned long now) {
  bool high = z[i].pHigh || z[i].tHigh || z[i].hHigh;

  if (z[i].therapy) {
    if (now - z[i].therapySince >= THERAPY_MS) {
      motorOff(MOTOR_PINS[i]);
      z[i].therapy = false;
      readZone(i);
      z[i].alert = z[i].pHigh || z[i].tHigh || z[i].hHigh;
      if (!z[i].alert) z[i].highSince = 0;
    }
    return;
  }

  if (z[i].alert && !high) z[i].alert = false;
  if (z[i].alert) return;

  if (high) {
    if (z[i].highSince == 0) z[i].highSince = now;
    if (now - z[i].highSince >= THRESHOLD_MS) {
      z[i].therapy = true;
      z[i].therapySince = now;
      z[i].highSince = 0;
      motorOn(MOTOR_PINS[i]);
    }
  } else {
    z[i].highSince = 0;
  }
}

void processDownlinkCommand(const char* jsonPayload) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, jsonPayload);
  if (err) {
    Serial.printf("JSON parse error on downlink: %s\n", err.c_str());
    return;
  }

  const char* action = doc["action"] | "";
  int zone = doc["zone"] | -1;

  if (strcmp(action, "motor") == 0) {
    if (zone >= 0 && zone < 4) {
      int state = doc["state"] | 1;
      if (state == 1) {
        Serial.printf("Downlink Command: Force START motor on zone %d\n", zone);
        motorOn(MOTOR_PINS[zone]);
        z[zone].therapy = true;
        z[zone].therapySince = millis();
      } else {
        Serial.printf("Downlink Command: Force STOP motor on zone %d\n", zone);
        motorOff(MOTOR_PINS[zone]);
        z[zone].therapy = false;
      }
    }
  } 
  else if (strcmp(action, "motor_stop_all") == 0) {
    Serial.println("Downlink Command: Stopping ALL motors");
    for (int i = 0; i < 4; i++) {
      motorOff(MOTOR_PINS[i]);
      z[i].therapy = false;
    }
  }
  else if (strcmp(action, "clear_alerts") == 0) {
    Serial.println("Downlink Command: Resetting alerts");
    for (int i = 0; i < 4; i++) {
      z[i].alert = false;
      z[i].highSince = 0;
    }
    digitalWrite(LED_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
  }
}

void checkDownlink(unsigned long windowMs) {
  delay(50); // Give receiver node time to receive telemetry and prepare TX packet
  
  unsigned long start = millis();
  while (millis() - start < windowMs) {
    int packetSize = LoRa.parsePacket();
    if (packetSize > 0) {
      char rxBuf[256];
      int i = 0;
      while (LoRa.available() && i < (int)sizeof(rxBuf) - 1) {
        rxBuf[i++] = (char)LoRa.read();
      }
      rxBuf[i] = '\0';

      Serial.printf("Downlink Received (%d bytes): %s\n", packetSize, rxBuf);
      processDownlinkCommand(rxBuf);
      break; 
    }
    delay(10);
  }
}

void transmitPacket() {
  StaticJsonDocument<768> compact;
  compact["s"] = ++sequenceNo;
  compact["u"] = millis() / 1000UL;
  JsonArray zones = compact.createNestedArray("z");

  for (int i = 0; i < 4; i++) {
    JsonArray row = zones.createNestedArray();
    bool sensorOK = !isnan(z[i].t) && !isnan(z[i].h);
    uint8_t flags = 0;
    if (z[i].pHigh) flags |= 1;
    if (z[i].tHigh) flags |= 2;
    if (z[i].hHigh) flags |= 4;
    if (z[i].alert) flags |= 8;
    if (sensorOK)   flags |= 16;

    row.add(i);
    row.add(roundf(z[i].p * 100.0f) / 100.0f);
    row.add(sensorOK ? roundf(z[i].t * 100.0f) / 100.0f : 0.0f);
    row.add(sensorOK ? roundf(z[i].h * 100.0f) / 100.0f : 0.0f);
    row.add(flags);
    row.add(z[i].therapy ? 1 : 0);
  }

  char payload[255];
  size_t len = serializeJson(compact, payload, sizeof(payload));
  if (len == 0 || len >= sizeof(payload) || len > 255) {
    Serial.printf("ERROR: compact payload will not fit (%u bytes)\n", (unsigned)len);
    return;
  }

  int began = LoRa.beginPacket();
  if (began != 1) {
    Serial.println("ERROR: LoRa.beginPacket failed");
    return;
  }
  size_t written = LoRa.write((const uint8_t *)payload, len);
  int sent = LoRa.endPacket();

  Serial.printf("LoRa TX %s | JSON bytes=%u | bytes queued=%u | seq=%lu\n",
                (sent == 1 && written == len) ? "OK" : "FAILED",
                (unsigned)len, (unsigned)written, (unsigned long)sequenceNo);
  Serial.println(payload);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Wire.begin(21, 22);
  Wire.setClock(100000);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  for (int i = 0; i < 4; i++) {
    pinMode(MOTOR_PINS[i], OUTPUT);
    digitalWrite(MOTOR_PINS[i], LOW);
    z[i].p = 0; z[i].t = NAN; z[i].h = NAN;
    z[i].pHigh = z[i].tHigh = z[i].hHigh = false;
    z[i].alert = z[i].therapy = false;
    z[i].highSince = z[i].therapySince = 0;
  }
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("LoRa init failed: check wiring and radio frequency");
    while (true) delay(1000);
  }
  LoRa.setSyncWord(0x42);
  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setTxPower(14);

  Serial.println("PressureGuard compact LoRa transmitter ready");
  for (int i = 0; i < 4; i++) readZone(i);
  
  transmitPacket();
  checkDownlink(1500);
  lastPoll = millis();
}

void loop() {
  unsigned long now = millis();
  if (now - lastPoll >= POLL_MS) {
    lastPoll = now;
    for (int i = 0; i < 4; i++) {
      readZone(i);
      updateTherapy(i, now);
    }

    bool anyAlert = false;
    for (int i = 0; i < 4; i++) if (z[i].alert) anyAlert = true;
    digitalWrite(LED_PIN, anyAlert ? HIGH : LOW);
    digitalWrite(BUZZER_PIN, anyAlert ? HIGH : LOW);

    transmitPacket();
    checkDownlink(1500);
  }
}