// Shape of the JSON returned by the ESP32  (GET /api/status)
export type DeviceZone = {
  id: number;
  name: string;            // e.g. "Z0-Sacrum"
  seq: number;             // increments with every new sensor reading
  pressure: number;        // kPa
  pressure_mmhg: number;
  temperature: number;     // °C
  humidity: number;        // %
  sensor_ok: boolean;      // SHT41 read ok
  p_high: boolean;
  t_high: boolean;
  h_high: boolean;
  alert: boolean;          // un-acknowledged alert
  therapy: boolean;
  thr_p: number;
  thr_t: number;
  thr_h: number;
};

export type DeviceStatus = {
  device: string;
  uptime_s: number;
  ip: string;
  rssi: number;
  zones: DeviceZone[];
};

export type ZoneRunState = 'running' | 'paused' | 'stopped';

export type LogRow = {
  ts: number;              // epoch ms (phone clock)
  temp: number | null;
  hum: number | null;
  pres: number;
};

export type PatientDetails = {
  name: string;
  age: string;
  height: string;
  weight: string;
  diagnosis: string;
  bed: string;
};
