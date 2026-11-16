const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jarvis', {
  chat: payload => ipcRenderer.invoke('chat', payload),
  status: () => ipcRenderer.invoke('status'),
  speak: payload => ipcRenderer.invoke('speak', payload),
  stop: () => ipcRenderer.invoke('stop-speech'),
  transcribe: audio => ipcRenderer.invoke('transcribe', audio),
  install: kind => ipcRenderer.invoke('install', kind),
  openLink: url => ipcRenderer.invoke('open-link', url),
  onProgress: callback => ipcRenderer.on('download-progress', (_event, message) => callback(message))
});