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
  // automation (macros) — recording/replay only ever happens on explicit user action
  toggleMacroRecording: () => ipcRenderer.invoke('macro:toggleRecording'),
  getMacroState: () => ipcRenderer.invoke('macro:getState'),
  onMacroState: (cb) => ipcRenderer.on('macro:state', (_e, s) => cb(s)),
  approveMacro: (name) => ipcRenderer.invoke('macro:approve', name),
  discardMacro: () => ipcRenderer.invoke('macro:discard'),
  listMacros: () => ipcRenderer.invoke('macro:list'),
  replayMacro: (id) => ipcRenderer.invoke('macro:replay', id),
  deleteMacro: (id) => ipcRenderer.invoke('macro:delete', id),
  renameMacro: (id, name) => ipcRenderer.invoke('macro:rename', id, name),
  getMacroStats: () => ipcRenderer.invoke('macro:getStats'),
  adoptSuggestion: (id) => ipcRenderer.invoke('macro:adoptSuggestion', id),
  dismissSuggestion: (id) => ipcRenderer.invoke('macro:dismissSuggestion', id),

  // focus sessions
  startFocus: (minutes) => ipcRenderer.invoke('focus:start', minutes),
  stopFocus: () => ipcRenderer.invoke('focus:stop'),
  getFocusState: () => ipcRenderer.invoke('focus:getState'),
  onFocusState: (cb) => ipcRenderer.on('focus:state', (_e, s) => cb(s)),

  // streaks, lifetime stats, trophy case
  getStreak: () => ipcRenderer.invoke('progress:getStreak'),
  getLifetimeStats: () => ipcRenderer.invoke('progress:getLifetimeStats'),
  getAchievements: () => ipcRenderer.invoke('progress:getAchievements'),
  buyFreeze: () => ipcRenderer.invoke('progress:buyFreeze'),

  // ask your pet
  askPet: (question) => ipcRenderer.invoke('diary:ask', question),

  // shareable weekly recap card
  generateRecap: (period) => ipcRenderer.invoke('recap:generate', period),

  // LAN mobile companion
  getLanInfo: () => ipcRenderer.invoke('lan:getInfo'),
  regenerateLanToken: () => ipcRenderer.invoke('lan:regenerateToken'),

  // cloud relay (opt-in)
  getCloudInfo: () => ipcRenderer.invoke('cloud:getInfo'),
  setCloudConfig: (patch) => ipcRenderer.invoke('cloud:setConfig', patch),
  regenerateCloudTokens: () => ipcRenderer.invoke('cloud:regenerateTokens'),
  pushCloudNow: () => ipcRenderer.invoke('cloud:pushNow'),
});
