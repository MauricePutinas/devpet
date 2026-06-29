const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diaryAPI', {
  getDay: (date) => ipcRenderer.invoke('diary:getDay', date),
  listDates: () => ipcRenderer.invoke('diary:listDates'),
  generate: (date) => ipcRenderer.invoke('diary:generate', date),
  getActivitySummaries: (date) => ipcRenderer.invoke('activity:summaries', date),
  seedDemo: () => ipcRenderer.invoke('diary:seedDemo'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  getProgress: () => ipcRenderer.invoke('app:getProgress'),
  listCreatures: () => ipcRenderer.invoke('creatures:list'),
  getShop: () => ipcRenderer.invoke('shop:list'),
  buySkin: (id) => ipcRenderer.invoke('shop:buy', id),
  getScale: () => ipcRenderer.invoke('pet:getScale'),
  setScale: (s) => ipcRenderer.invoke('pet:setScale', s),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  addFolder: () => ipcRenderer.invoke('folders:add'),
  removeFolder: (folder) => ipcRenderer.invoke('folders:remove', folder),
  setCreature: (id) => ipcRenderer.send('creature:set', id),
  openUserData: () => ipcRenderer.invoke('app:openUserData'),
  onUpdate: (cb) => ipcRenderer.on('events-updated', () => cb()),
  onScale: (cb) => ipcRenderer.on('scale-changed', (_e, s) => cb(s)),
  onLang: (cb) => ipcRenderer.on('lang', (_e, l) => cb(l)),
});
