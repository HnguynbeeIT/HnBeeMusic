const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("hnbeeDesktop", {
  isDesktop: true,
  platform: process.platform,
  version: "2.5.0",
});
