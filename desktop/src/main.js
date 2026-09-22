// Kchel Dialer desktop shell.
//
// This is a real standalone application — its own process, its own window,
// its own icon in the dock/taskbar — not the website opened in a browser tab.
// It loads the live product at kchel-dialer.kchelweb.workers.dev, so every
// feature the web app has works here immediately with zero duplication.
//
// What this does NOT change: calling still goes through the same sip.js /
// WebRTC softphone the browser uses, which still needs a carrier that speaks
// SIP over WebSocket (SignalWire today). A desktop *shell* around Chromium
// doesn't escape that — Electron's renderer is Chromium, same sandbox, same
// WSS requirement. Only a genuinely native calling engine (a bundled SIP/RTP
// stack instead of WebRTC) would open up carriers that only offer plain
// TLS/UDP SIP. That's real, separate work this file doesn't attempt.
"use strict";

const { app, BrowserWindow, Menu, shell, session, Tray, nativeImage } = require("electron");
const path = require("node:path");

const PRODUCT_URL = "https://kchel-dialer.kchelweb.workers.dev/?client=desktop";
const ICON_PATH = path.join(__dirname, "..", "build", "icon.png");

/** Only these hosts are ever allowed to open inside the app window. */
const ALLOWED_HOSTS = new Set(["kchel-dialer.kchelweb.workers.dev"]);

let mainWindow = null;
let tray = null;
let isQuitting = false;

function isAllowed(url) {
  try {
    return ALLOWED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Kchel Dialer",
    icon: ICON_PATH,
    backgroundColor: "#090e12", // matches the brand tile — no white flash on launch
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(PRODUCT_URL);

  // Closing the window keeps the app (and any active call) running in the
  // tray rather than hanging up on the caller. Quit from the tray or the app
  // menu ends it for real.
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  // Links to anything outside the product open in the user's real browser
  // instead of becoming a second app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowed(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowed(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Kchel Dialer");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Kchel Dialer",
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// The softphone needs the mic. Electron blocks getUserMedia by default unless
// the app explicitly grants it — a real browser tab prompts the person
// instead, so this is the one permission behaviour a desktop shell has to
// take over.
function allowMicrophone() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media");
  });
}

app.whenReady().then(() => {
  allowMicrophone();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

// Standard desktop convention on Windows/Linux; macOS apps stay running via
// the dock even with no window open, which the tray already covers here.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Actual close (from the tray Quit item) already set isQuitting and
    // called app.quit(), which gets here after windows are gone. A plain
    // window close never reaches this handler because it's intercepted above.
  }
});
