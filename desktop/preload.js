const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hnbeeDesktop", {
  isDesktop: true,
  isElectron: true,
  platform: process.platform,
  version: "2.5.1",
  setPlayingState: (isPlaying) => {
    ipcRenderer.send("hnbee:playback-state", Boolean(isPlaying));
  },
  openOAuth: (provider) => {
    if (provider === "google" || provider === "facebook") {
      ipcRenderer.send("hnbee:open-oauth", provider);
    }
  },
});
