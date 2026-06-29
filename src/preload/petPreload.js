const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  getBounds: () => ipcRenderer.invoke('window:getBounds'),
  moveWindow: (x, y) => ipcRenderer.send('window:move', x, y),
  endDrag: () => ipcRenderer.send('window:dragEnd'),
  setInteractive: (v) => ipcRenderer.send('pet:setInteractive', v),
  contextMenu: () => ipcRenderer.send('pet:contextMenu'),
  openDiary: () => ipcRenderer.send('diary:open'),
  setCreature: (id) => ipcRenderer.send('creature:set', id),
  getCreature: () => ipcRenderer.invoke('creature:get'),
  getFrames: (id) => ipcRenderer.invoke('creatures:getFrames', id),
  nudgeScale: (delta) => ipcRenderer.send('pet:nudgeScale', delta),
  getSounds: () => ipcRenderer.invoke('app:getSounds'),
  onSoundEnabled: (cb) => ipcRenderer.on('sound-enabled', (_e, v) => cb(v)),
  onActivity: (cb) => ipcRenderer.on('activity', (_e, ev) => cb(ev)),
  onCreature: (cb) => ipcRenderer.on('creature', (_e, id) => cb(id)),
  onCursor: (cb) => ipcRenderer.on('cursor', (_e, d) => cb(d)),
  onLevelUp: (cb) => ipcRenderer.on('levelup', (_e, p) => cb(p)),
  onSpeak: (cb) => ipcRenderer.on('speak', (_e, url) => cb(url)),
  requestSpeak: (text) => ipcRenderer.send('pet:speak', text),
  getLang: () => ipcRenderer.invoke('app:getLang'),
  onLang: (cb) => ipcRenderer.on('lang', (_e, l) => cb(l)),
});
