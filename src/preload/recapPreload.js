const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recapAPI', {
  getData: () => ipcRenderer.invoke('recap:getData'),
});
