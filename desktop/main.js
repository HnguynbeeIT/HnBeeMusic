const fs = require("fs");
const path = require("path");
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  shell,
} = require("electron");

const APP_URL = process.env.HNBEE_APP_URL || "https://hnbeemusic.vercel.app";
const APP_ORIGIN = new URL(APP_URL).origin;
const ICON_PATH = path.join(__dirname, "assets", "icon.png");
const PROTOCOL_SCHEME = "hnbeemusic";

// Allow instant audio playback without browser autoplay blocks & let globalShortcut own media keys
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");

let mainWindow = null;
let tray = null;
let isQuitting = false;
let currentIsPlaying = false;
let pendingDeepLinkUrl = null;
let saveStateTimer = null;

// Register custom protocol for secure Desktop OAuth deep links (hnbeemusic://auth-callback?handoff=...)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

function extractDeepLinkFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  return (
    argv.find(
      (arg) =>
        typeof arg === "string" &&
        arg.toLowerCase().startsWith(`${PROTOCOL_SCHEME}://`)
    ) || null
  );
}

function handleDeepLinkUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return;

    if (parsed.hostname === "auth-callback") {
      const handoff = parsed.searchParams.get("handoff");
      const provider = parsed.searchParams.get("provider") || "google";
      if (handoff && mainWindow && !mainWindow.isDestroyed()) {
        const exchangeUrl = `${APP_ORIGIN}/api/auth/desktop-exchange?handoff=${encodeURIComponent(
          handoff
        )}&provider=${encodeURIComponent(provider)}`;
        mainWindow.loadURL(exchangeUrl);
        restoreAndFocusWindow();
      }
    }
  } catch (err) {
    console.warn("[desktop] Invalid deep link ignored:", err?.message || err);
  }
}

function restoreAndFocusWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  if (process.platform === "win32") {
    updateThumbarButtons(currentIsPlaying);
  }
}

// Single Instance Lock: clicking desktop icon while running in System Tray focuses existing window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  pendingDeepLinkUrl = extractDeepLinkFromArgv(process.argv);

  app.on("second-instance", (_event, commandLine) => {
    const deepLink = extractDeepLinkFromArgv(commandLine);
    restoreAndFocusWindow();
    if (deepLink) {
      handleDeepLinkUrl(deepLink);
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      handleDeepLinkUrl(url);
    } else {
      pendingDeepLinkUrl = url;
    }
  });
}

// --- Window State Persistence (bounds + maximized state) ---
function getWindowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState() {
  const defaults = { width: 1280, height: 820, isMaximized: false };
  try {
    const raw = fs.readFileSync(getWindowStatePath(), "utf8");
    const state = JSON.parse(raw);
    const width =
      typeof state.width === "number" && state.width >= 940 ? state.width : 1280;
    const height =
      typeof state.height === "number" && state.height >= 620
        ? state.height
        : 820;
    const isMaximized = Boolean(state.isMaximized);

    if (typeof state.x === "number" && typeof state.y === "number") {
      const visible = screen.getAllDisplays().some((display) => {
        const area = display.workArea;
        return (
          state.x >= area.x - width + 100 &&
          state.x <= area.x + area.width - 100 &&
          state.y >= area.y - 40 &&
          state.y <= area.y + area.height - 80
        );
      });
      if (visible) {
        return { x: state.x, y: state.y, width, height, isMaximized };
      }
    }
    return { width, height, isMaximized };
  } catch {
    return defaults;
  }
}

function scheduleSaveWindowState() {
  if (saveStateTimer) clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const isMaximized = mainWindow.isMaximized();
      const bounds = isMaximized
        ? mainWindow.getNormalBounds()
        : mainWindow.getBounds();
      fs.writeFileSync(
        getWindowStatePath(),
        JSON.stringify(
          {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            isMaximized,
          },
          null,
          2
        )
      );
    } catch {
      // ignore disk write errors
    }
  }, 250);
}

// --- Programmatic 16x16 RGBA Bitmaps for Windows Taskbar Thumbar Buttons ---
function createThumbarIcon(kind) {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4, 0);

  const setPixel = (x, y, r = 244, g = 244, b = 245, a = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    // Windows BGRA byte order for nativeImage.createFromBitmap
    buf[idx] = b;
    buf[idx + 1] = g;
    buf[idx + 2] = r;
    buf[idx + 3] = a;
  };

  const fillRect = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) setPixel(x, y);
    }
  };

  if (kind === "play") {
    // Crisp right-pointing play triangle
    for (let row = 0; row < 10; row++) {
      const y = 3 + row;
      const distFromMid = Math.abs(row - 4.5);
      const len = Math.max(1, Math.round(9 - distFromMid * 1.8));
      for (let dx = 0; dx < len; dx++) setPixel(4 + dx, y);
    }
  } else if (kind === "pause") {
    fillRect(3, 3, 3, 10);
    fillRect(10, 3, 3, 10);
  } else if (kind === "prev") {
    // Left bar + left-pointing triangle
    fillRect(2, 3, 2, 10);
    for (let row = 0; row < 10; row++) {
      const y = 3 + row;
      const distFromMid = Math.abs(row - 4.5);
      const len = Math.max(1, Math.round(8 - distFromMid * 1.6));
      for (let dx = 0; dx < len; dx++) setPixel(13 - dx, y);
    }
  } else if (kind === "next") {
    // Right-pointing triangle + right bar
    for (let row = 0; row < 10; row++) {
      const y = 3 + row;
      const distFromMid = Math.abs(row - 4.5);
      const len = Math.max(1, Math.round(8 - distFromMid * 1.6));
      for (let dx = 0; dx < len; dx++) setPixel(2 + dx, y);
    }
    fillRect(12, 3, 2, 10);
  }

  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

let thumbarIcons = null;
function getThumbarIcons() {
  if (!thumbarIcons) {
    thumbarIcons = {
      prev: createThumbarIcon("prev"),
      play: createThumbarIcon("play"),
      pause: createThumbarIcon("pause"),
      next: createThumbarIcon("next"),
    };
  }
  return thumbarIcons;
}

function updateThumbarButtons(isPlaying) {
  if (
    process.platform !== "win32" ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return;
  }
  try {
    const icons = getThumbarIcons();
    mainWindow.setThumbarButtons([
      {
        tooltip: "Bài trước",
        icon: icons.prev,
        click: () => sendMediaCommand("prev"),
      },
      {
        tooltip: isPlaying ? "Tạm dừng" : "Phát nhạc",
        icon: isPlaying ? icons.pause : icons.play,
        click: () => sendMediaCommand("playPause"),
      },
      {
        tooltip: "Bài tiếp theo",
        icon: icons.next,
        click: () => sendMediaCommand("next"),
      },
    ]);
  } catch (err) {
    console.warn("[desktop] setThumbarButtons skipped:", err?.message || err);
  }
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
  const winState = loadWindowState();

  mainWindow = new BrowserWindow({
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
    minWidth: 940,
    minHeight: 620,
    title: "HnBeeMusic",
    backgroundColor: "#0B0D12",
    icon,
    autoHideMenuBar: true,
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    ...(process.platform === "win32"
      ? {
          titleBarOverlay: {
            color: "#0B0D12",
            symbolColor: "#F4F6FA",
            height: 36,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (winState.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
    updateThumbarButtons(currentIsPlaying);
  });

  // Security: strictly deny insecure popup windows; open external http(s) URLs in OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Security: keep main window navigation inside HnBee Music origin; open external pages in OS browser
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      if (target.origin !== APP_ORIGIN) {
        event.preventDefault();
        if (target.protocol === "https:" || target.protocol === "http:") {
          shell.openExternal(url);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.on("resize", scheduleSaveWindowState);
  mainWindow.on("move", scheduleSaveWindowState);
  mainWindow.on("maximize", scheduleSaveWindowState);
  mainWindow.on("unmaximize", scheduleSaveWindowState);

  mainWindow.on("show", () => {
    updateThumbarButtons(currentIsPlaying);
  });

  // Minimize to System Tray instead of quitting when clicking X
  mainWindow.on("close", (event) => {
    scheduleSaveWindowState();
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("did-finish-load", () => {
    updateThumbarButtons(currentIsPlaying);
    if (pendingDeepLinkUrl) {
      const urlToHandle = pendingDeepLinkUrl;
      pendingDeepLinkUrl = null;
      handleDeepLinkUrl(urlToHandle);
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
      click: () => restoreAndFocusWindow(),
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
      label: "Giới thiệu HnBeeMusic",
      click: () => {
        dialog.showMessageBox(mainWindow || undefined, {
          type: "info",
          title: "Giới thiệu HnBeeMusic",
          message: "HnBeeMusic Desktop v2.5.1 — Powered by HNT & HNM",
          detail:
            "Tập đoàn chủ quản: HNG — Hyper Next Generation Group (hng.vn)\nCông nghệ & Hạ tầng: HNT — Hyper Next Technologies (tech.hng.vn)\nÂm nhạc & Nội dung: HNM — Hyper Next Media (media.hng.vn)\nTác giả: Nguyễn Ngọc Hà Nguyên\nHỗ trợ kỹ thuật: support.hnt@hng.vn | dev@hng.vn\n\nCopyright © 2026 Nguyễn Ngọc Hà Nguyên — HNG (Hyper Next Generation Group)",
          buttons: ["Đóng"],
        });
      },
    },
    {
      label: "Thoát hẳn HnBee Music",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => restoreAndFocusWindow());
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

// IPC from Renderer (secure preload bridge)
ipcMain.on("hnbee:playback-state", (_event, isPlaying) => {
  currentIsPlaying = Boolean(isPlaying);
  updateThumbarButtons(currentIsPlaying);
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(
      currentIsPlaying
        ? "HnBee Music — Đang phát nhạc"
        : "HnBee Music — Đang chạy dưới nền"
    );
  }
});

ipcMain.on("hnbee:open-oauth", (_event, provider) => {
  if (provider !== "google" && provider !== "facebook") return;
  const authUrl = `${APP_ORIGIN}/api/auth/signin/${provider}?desktop=1`;
  shell.openExternal(authUrl);
});

app.whenReady().then(() => {
  app.setAboutPanelOptions({
    applicationName: "HnBeeMusic",
    applicationVersion: "2.5.1",
    copyright:
      "Copyright © 2026 Nguyễn Ngọc Hà Nguyên — HNG (Hyper Next Generation Group)",
    credits:
      "HnBeeMusic — Powered by HNT (Hyper Next Technologies) & HNM (Hyper Next Media) • hng.vn",
  });
  createWindow();
  createTray();
  registerMediaKeys();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      restoreAndFocusWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
