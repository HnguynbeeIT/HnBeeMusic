const path = require("path");
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  nativeImage,
  shell,
} = require("electron");

const APP_URL = process.env.HNBEE_APP_URL || "https://hnbeemusic.vercel.app";
const ICON_PATH = path.join(__dirname, "assets", "icon.png");

// Allow instant audio playback without browser autoplay blocks
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");

let mainWindow = null;
let tray = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function sendMediaCommand(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents
    .executeJavaScript(
      `(function() {
        if (typeof window.__hnbeeMediaAction === 'function') {
          window.__hnbeeMediaAction(${JSON.stringify(action)});
          return true;
        }
        return false;
      })()`
    )
    .catch(() => {});
}

function createWindow() {
  const icon = nativeImage.createFromPath(ICON_PATH);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    title: "HnBee Music",
    backgroundColor: "#09090b",
    icon,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    ...(process.platform === "win32"
      ? {
          titleBarOverlay: {
            color: "#09090b",
            symbolColor: "#e4e4e7",
            height: 34,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Keep OAuth sign-in windows inside Electron while opening external links in OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      /^https:\/\/(accounts\.google\.com|www\.facebook\.com|m\.facebook\.com|hnbeemusic\.vercel\.app)/i.test(
        url
      )
    ) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Minimize to System Tray instead of quitting when clicking X
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Subtle top draggable strip for frameless dark title bar on Windows
  mainWindow.webContents.on("did-finish-load", () => {
    if (process.platform === "win32") {
      mainWindow.webContents
        .insertCSS(
          `body::before {
            content: "";
            position: fixed;
            top: 0;
            left: 0;
            right: 138px;
            height: 28px;
            -webkit-app-region: drag;
            z-index: 9998;
            pointer-events: none;
          }`
        )
        .catch(() => {});
    }
  });

  mainWindow.loadURL(APP_URL);
}

function createTray() {
  const icon = nativeImage.createFromPath(ICON_PATH).resize({
    width: 16,
    height: 16,
  });

  tray = new Tray(icon);
  tray.setToolTip("HnBee Music — Đang chạy dưới nền");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Mở HnBee Music",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Phát / Tạm dừng",
      click: () => sendMediaCommand("playPause"),
    },
    {
      label: "Bài tiếp theo",
      click: () => sendMediaCommand("next"),
    },
    {
      label: "Bài trước đó",
      click: () => sendMediaCommand("prev"),
    },
    { type: "separator" },
    {
      label: "Thoát hẳn HnBee Music",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function registerMediaKeys() {
  try {
    globalShortcut.register("MediaPlayPause", () =>
      sendMediaCommand("playPause")
    );
    globalShortcut.register("MediaNextTrack", () => sendMediaCommand("next"));
    globalShortcut.register("MediaPreviousTrack", () =>
      sendMediaCommand("prev")
    );
  } catch (err) {
    console.warn("[desktop] Media key registration skipped:", err);
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerMediaKeys();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
