const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('spLan', {
  redeemActivation: (code, request) => ipcRenderer.invoke('sp:redeem-activation', code, request)
});
