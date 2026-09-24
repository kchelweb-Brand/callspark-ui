// Kchel Dialer desktop app — the REAL native version.
//
// Earlier versions of this file just loaded the website in a BrowserWindow,
// which meant calling still went through the browser's WebRTC/DTLS-SRTP
// softphone. That path reliably failed against the real carrier
// (SignalWire) with MEDIA_TIMEOUT, even with TURN configured correctly. A
// native SIP client using plain RTP — no browser, no DTLS-SRTP requirement —
// was proven to work with the exact same credentials and destination.
//
// This app bundles that native engine (baresip, compiled for Windows) and
// drives it as a subprocess over its local JSON control socket. The window
// you see is a small custom UI (desktop/src/renderer/), not the website.
"use strict";

const { app, BrowserWindow, Menu, shell, Tray, nativeImage, ipcMain, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { BaresipController } = require("./baresip-controller");

const API_BASE = process.env.KCHEL_API_BASE || "https://kchel-dialer.kchelweb.workers.dev";
const ICON_PATH = path.join(__dirname, "..", "build", "icon.png");
const SESSION_PATH = path.join(app.getPath("userData"), "session.bin");

let mainWindow = null;
let tray = null;
let isQuitting = false;
let baresip = null;

// -------------------------------------------------------------------------
// Session persistence — deliberately no idle/inactivity timeout here. The
// web app signs people out after 10 minutes idle (src/components/auth/AuthGuard.tsx);
// this desktop app is meant to sit registered and ready to receive/place
// calls all day, so it only ever signs out when the token itself expires
// (24h, server-enforced) or the person explicitly logs out.
// -------------------------------------------------------------------------

function saveSession(session) {
  const json = JSON.stringify(session);
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(SESSION_PATH, safeStorage.encryptString(json));
  } else {
    fs.writeFileSync(SESSION_PATH, json, "utf8");
  }
}

function loadSession() {
  if (!fs.existsSync(SESSION_PATH)) return null;
  try {
    const raw = fs.readFileSync(SESSION_PATH);
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function clearSession() {
  if (fs.existsSync(SESSION_PATH)) fs.unlinkSync(SESSION_PATH);
}

// -------------------------------------------------------------------------
// Backend — plain REST calls to src/backend/native-api.ts. Every call this
// app places is recorded through the SAME calls table the web app uses, so
// it shows up in Call History/Recordings no matter which client made it.
// -------------------------------------------------------------------------

async function apiPost(route, body) {
  const res = await fetch(`${API_BASE}/api/native/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "Bad response from server." }));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

// -------------------------------------------------------------------------
// baresip lifecycle
// -------------------------------------------------------------------------

function baresipExeDir() {
  // In dev this is desktop/resources/baresip; packaged, electron-builder's
  // extraResources puts it next to the app under process.resourcesPath.
  return app.isPackaged
    ? path.join(process.resourcesPath, "baresip")
    : path.join(__dirname, "..", "resources", "baresip");
}

function ensureBaresip() {
  if (baresip) return baresip;
  baresip = new BaresipController({
    exeDir: baresipExeDir(),
    configDir: path.join(app.getPath("userData"), "baresip-config"),
  });
  baresip.on("event", (msg) => {
    mainWindow?.webContents.send("call:event", msg);
  });
  baresip.on("disconnected", () => {
    mainWindow?.webContents.send("engine:disconnected");
  });
  return baresip;
}

function sipAccountLine(config) {
  const transport = config.transport === "wss" ? "udp" : config.transport;
  return `<sip:${config.username}@${config.host};transport=${transport}>;auth_user=${config.username};auth_pass=${config.password};regint=120;answermode=manual`;
}

// -------------------------------------------------------------------------
// IPC — the renderer never talks to the network or to baresip directly.
// -------------------------------------------------------------------------

ipcMain.handle("auth:get-session", () => loadSession());
ipcMain.handle("app:get-api-base", () => API_BASE);

ipcMain.handle("auth:request-code", async (_e, { email, workspaceSlug }) => {
  return apiPost("login/request-code", { email, workspaceSlug });
});

ipcMain.handle("auth:verify-code", async (_e, { email, code }) => {
  const result = await apiPost("login/verify-code", { email, code });
  saveSession({ token: result.token, user: result.user });
  const sip = await connectSip(result.token);
  return { ...result, sip };
});

ipcMain.handle("auth:resume", async () => {
  const session = loadSession();
  if (!session) return null;
  const sip = await connectSip(session.token);
  return { ...session, sip };
});

ipcMain.handle("auth:logout", async () => {
  try {
    await ensureBaresip().sendCommand("uadelall");
  } catch {
    // Engine may already be gone — logging out should never get stuck on it.
  }
  clearSession();
  return { ok: true };
});

async function connectSip(token) {
  const { config } = await apiPost("sip-config", { token });
  const engine = ensureBaresip();
  await engine.start();
  await engine.sendCommand("uadelall");

  // uanew's own response only confirms the UA object was created — the real
  // network REGISTER happens afterward, asynchronously. Waiting for the
  // actual REGISTER_OK/REGISTER_FAIL event is what catches a silently
  // dropped response (e.g. a firewall blocking the carrier's reply), which
  // uanew's immediate "ok" would otherwise mask.
  const eventWait = engine.waitForEvent(["REGISTER_OK", "REGISTER_FAIL"], 10000);
  const created = await engine.sendCommand("uanew", sipAccountLine(config));

  let success = false;
  let errorDetail;
  if (!created?.ok) {
    errorDetail = created?.data || "Could not create the SIP account.";
  } else {
    try {
      const regEvent = await eventWait;
      success = regEvent.type === "REGISTER_OK";
      errorDetail = success ? undefined : regEvent.param || "Registration was rejected by the carrier.";
    } catch (err) {
      errorDetail = err.message;
    }
  }

  try {
    await apiPost("registration", { token, success, error: errorDetail });
  } catch {
    // Reporting registration status is best-effort — never block on it.
  }
  return { success, label: config.label, error: errorDetail };
}

ipcMain.handle("call:dial", async (_e, { number }) => {
  const session = loadSession();
  if (!session) throw new Error("Not signed in.");

  const started = await apiPost("calls/start", { token: session.token, direction: "outbound", toNumber: number });
  const engine = ensureBaresip();
  const resp = await engine.sendCommand("dial", number.replace(/[^\d+]/g, ""));
  if (!resp?.ok) {
    try {
      await apiPost("calls/end", { token: session.token, callId: started.callId, status: "failed", error: resp?.data });
    } catch {
      // The dial itself already failed — a bookkeeping miss here is secondary.
    }
    throw new Error(resp?.data || "The calling engine could not place this call.");
  }
  return { callId: started.callId, engineCallId: extractCallId(resp) };
});

ipcMain.handle("calls:recent", async () => {
  const session = loadSession();
  if (!session) return [];
  const result = await apiPost("calls/recent", { token: session.token });
  return result.calls;
});

// Generic bridge for the duplicated pages (Contacts, Campaigns, SIP
// Configuration, IVR, Settings) — each is a real native screen calling its
// own native-api route directly, with the session token attached here so
// the renderer never has to touch it. No AuthGuard, no idle timer: this is
// a plain fetch, not the website's own React app.
ipcMain.handle("api:call", async (_e, { route, body }) => {
  const session = loadSession();
  if (!session) throw new Error("Not signed in.");
  return apiPost(route, { ...body, token: session.token });
});

ipcMain.handle("call:accept", async () => {
  const resp = await ensureBaresip().sendCommand("accept");
  if (!resp?.ok) throw new Error(resp?.data || "Could not accept the call.");
  return resp;
});

ipcMain.handle("call:hangup", async (_e, { callId } = {}) => {
  const engine = ensureBaresip();
  const resp = await engine.sendCommand("hangup");

  const session = loadSession();
  if (session && callId) {
    try {
      await apiPost("calls/end", { token: session.token, callId });
    } catch {
      // The call already ended on the wire either way.
    }
  }
  return resp;
});

ipcMain.handle("call:answered", async (_e, { callId }) => {
  const session = loadSession();
  if (!session || !callId) return;
  try {
    await apiPost("calls/answer", { token: session.token, callId });
  } catch {
    // Best-effort — the call itself is unaffected.
  }
});

ipcMain.handle("call:dtmf", async (_e, { digits }) => {
  return ensureBaresip().sendCommand("sndcode", digits);
});

ipcMain.handle("call:reginfo", async () => {
  return ensureBaresip().sendCommand("reginfo");
});

function extractCallId(resp) {
  const match = /call id:\s*(\S+)/.exec(resp?.data ?? "");
  return match ? match[1] : null;
}

// -------------------------------------------------------------------------
// Window / tray
// -------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Kchel Dialer",
    icon: ICON_PATH,
    backgroundColor: "#090e12",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
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
          baresip?.stop();
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

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  baresip?.stop();
});

app.on("window-all-closed", () => {
  // Closing the window keeps the app in the tray (see the "close" handler
  // above) so an active call — or just being registered and reachable —
  // survives it. This only fires on the real quit path.
});
