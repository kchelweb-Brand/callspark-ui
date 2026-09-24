// Drives baresip (the native SIP/RTP engine) as a child process, over its
// ctrl_tcp module — a local, loopback-only JSON control socket. This is what
// lets the Electron main process register, dial, answer and hang up without
// any native Node addon: baresip does all real SIP/RTP work as a subprocess,
// and this file just speaks its wire protocol (netstrings: "<len>:<json>,").
"use strict";

const { spawn } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const CTRL_PORT = 44444;
const CTRL_HOST = "127.0.0.1";

class BaresipController extends EventEmitter {
  constructor({ exeDir, configDir }) {
    super();
    this.exeDir = exeDir;
    this.configDir = configDir;
    this.proc = null;
    this.socket = null;
    this.recvBuf = Buffer.alloc(0);
    this.pending = new Map(); // token -> {resolve, reject, timer}
    this.tokenSeq = 0;
  }

  /** Starts baresip if needed and connects the control socket. Idempotent. */
  async start() {
    if (this.socket) return;

    fs.mkdirSync(this.configDir, { recursive: true });
    await this._ensureConfigGenerated();
    this._patchConfigForCtrlTcp();

    const exePath = path.join(this.exeDir, "baresip.exe");
    this.proc = spawn(exePath, ["-f", this.configDir], {
      cwd: this.exeDir,
      windowsHide: true,
    });
    this.proc.on("exit", (code) => {
      this.emit("exit", code);
      this.socket = null;
      this.proc = null;
    });
    this.proc.stderr?.on("data", () => {});
    this.proc.stdout?.on("data", () => {});

    await this._connectWithRetry();
  }

  stop() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  /** Lets baresip generate a fresh config for THIS machine's audio devices,
   * only the first time this user profile runs the app. */
  async _ensureConfigGenerated() {
    const configPath = path.join(this.configDir, "config");
    if (fs.existsSync(configPath)) return;

    const exePath = path.join(this.exeDir, "baresip.exe");
    await new Promise((resolve) => {
      const p = spawn(exePath, ["-f", this.configDir, "-e", "/quit"], {
        cwd: this.exeDir,
        windowsHide: true,
      });
      p.on("exit", resolve);
      p.on("error", resolve);
      setTimeout(resolve, 8000);
    });
  }

  /** Turns on the ctrl_tcp module and pins it to a fixed loopback port,
   * regardless of what this machine's auto-generated config looks like. */
  _patchConfigForCtrlTcp() {
    const configPath = path.join(this.configDir, "config");
    let text = fs.readFileSync(configPath, "utf8");

    if (/^#module_app\s+ctrl_tcp\.dll/m.test(text)) {
      text = text.replace(/^#module_app\s+ctrl_tcp\.dll/m, "module_app\t\tctrl_tcp.dll");
    } else if (!/^module_app\s+ctrl_tcp\.dll/m.test(text)) {
      text += "\nmodule_app\t\tctrl_tcp.dll\n";
    }

    if (/^ctrl_tcp_listen\s+.*/m.test(text)) {
      text = text.replace(/^ctrl_tcp_listen\s+.*/m, `ctrl_tcp_listen\t\t${CTRL_HOST}:${CTRL_PORT}`);
    } else {
      text += `\nctrl_tcp_listen\t\t${CTRL_HOST}:${CTRL_PORT}\n`;
    }

    // Incoming calls are surfaced to the renderer and answered explicitly
    // from the UI, never auto-answered by the engine itself.
    text = text.replace(/^call_accept\s+.*/m, "call_accept\t\tno");

    fs.writeFileSync(configPath, text);
  }

  async _connectWithRetry() {
    const attempts = 20;
    for (let i = 0; i < attempts; i++) {
      try {
        await this._connectOnce();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    throw new Error("Could not connect to the local calling engine.");
  }

  _connectOnce() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: CTRL_HOST, port: CTRL_PORT }, () => {
        this.socket = socket;
        resolve();
      });
      socket.on("error", reject);
      socket.on("data", (chunk) => this._onData(chunk));
      socket.on("close", () => {
        this.socket = null;
        this.emit("disconnected");
      });
    });
  }

  _onData(chunk) {
    this.recvBuf = Buffer.concat([this.recvBuf, chunk]);

    for (;;) {
      const colonIdx = this.recvBuf.indexOf(0x3a); // ':'
      if (colonIdx === -1) return;

      const lenStr = this.recvBuf.subarray(0, colonIdx).toString("ascii");
      const len = Number.parseInt(lenStr, 10);
      if (!Number.isFinite(len) || len < 0) {
        // Corrupt stream — drop it and wait for the next connection.
        this.recvBuf = Buffer.alloc(0);
        return;
      }

      const totalLen = colonIdx + 1 + len + 1; // "len:" + payload + ","
      if (this.recvBuf.length < totalLen) return;

      const payload = this.recvBuf.subarray(colonIdx + 1, colonIdx + 1 + len).toString("utf8");
      this.recvBuf = this.recvBuf.subarray(totalLen);

      let msg;
      try {
        msg = JSON.parse(payload);
      } catch {
        continue;
      }
      this._onMessage(msg);
    }
  }

  _onMessage(msg) {
    if (msg.token && this.pending.has(msg.token)) {
      const { resolve, timer } = this.pending.get(msg.token);
      clearTimeout(timer);
      this.pending.delete(msg.token);
      resolve(msg);
      return;
    }
    if (msg.event) {
      this.emit("event", msg);
    }
  }

  /** Waits for the next event whose type matches, up to `timeoutMs`. Used
   * right after `uanew` — the command's own response only confirms the UA
   * object was created, not that the network REGISTER actually succeeded. */
  waitForEvent(types, timeoutMs) {
    return new Promise((resolve, reject) => {
      const onEvent = (msg) => {
        if (types.includes(msg.type)) {
          clearTimeout(timer);
          this.off("event", onEvent);
          resolve(msg);
        }
      };
      const timer = setTimeout(() => {
        this.off("event", onEvent);
        reject(new Error("Timed out waiting for the carrier to respond to registration."));
      }, timeoutMs);
      this.on("event", onEvent);
    });
  }

  sendCommand(command, params = "") {
    if (!this.socket) return Promise.reject(new Error("Not connected to the calling engine."));

    const token = `t${++this.tokenSeq}`;
    const json = JSON.stringify({ command, params, token });
    const body = Buffer.from(json, "utf8");
    const framed = Buffer.concat([Buffer.from(`${body.length}:`, "ascii"), body, Buffer.from(",")]);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(token);
        reject(new Error(`Timed out waiting for '${command}' to respond.`));
      }, 15000);
      this.pending.set(token, { resolve, reject, timer });
      this.socket.write(framed);
    });
  }
}

module.exports = { BaresipController, CTRL_PORT, CTRL_HOST };
