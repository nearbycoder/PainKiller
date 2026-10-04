const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  readSave: () => ipcRenderer.invoke("save:read"),
  writeSave: (data) => ipcRenderer.invoke("save:write", data),
  fullscreen: () => ipcRenderer.invoke("window:fullscreen"),
  quit: () => ipcRenderer.invoke("window:quit"),
});
