const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // CSV Export
  saveCSV: (csvContent, zoneName) => ipcRenderer.invoke('save-csv', csvContent, zoneName),

  // Connection & Live Telemetry
  getDeviceState: () => ipcRenderer.invoke('device-get-state'),
  setDeviceHost: (host) => ipcRenderer.invoke('device-set-host', host),
  onDeviceStatus: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('device-status', handler);
    return () => ipcRenderer.removeListener('device-status', handler);
  },

  // Alert acknowledgement
  ackZone: (zone) => ipcRenderer.invoke('device-ack', zone),

  // Direct Bidirectional Downlink Commands
  sendMotorCommand: (zone, state, seconds) => ipcRenderer.invoke('diag-motor', zone, seconds || 5, state),
  sendStopAll: () => ipcRenderer.invoke('diag-motor-stop'),
  sendClearAlerts: () => ipcRenderer.invoke('device-ack', -1),

  // Diagnostics
  diag: {
    motor:     (zone, seconds)     => ipcRenderer.invoke('diag-motor', zone, seconds),
    motorStop: ()                  => ipcRenderer.invoke('diag-motor-stop'),
    i2c:       ()                  => ipcRenderer.invoke('diag-i2c'),
    fsr:       ()                  => ipcRenderer.invoke('diag-fsr'),
    calib:     (zone, step, grams) => ipcRenderer.invoke('diag-calib', zone, step, grams)
  }
});