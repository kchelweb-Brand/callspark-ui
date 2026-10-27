"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kchel", {
  getSession: () => ipcRenderer.invoke("auth:get-session"),
  getApiBase: () => ipcRenderer.invoke("app:get-api-base"),
  requestCode: (email, workspaceSlug) => ipcRenderer.invoke("auth:request-code", { email, workspaceSlug }),
  verifyCode: (email, code, workspaceSlug) => ipcRenderer.invoke("auth:verify-code", { email, code, workspaceSlug }),
  resumeSession: () => ipcRenderer.invoke("auth:resume"),
  logout: () => ipcRenderer.invoke("auth:logout"),

  recentCalls: () => ipcRenderer.invoke("calls:recent"),
  adminRequestCode: (email) => ipcRenderer.invoke("admin:request-code", { email }),
  adminVerifyCode: (email, code) => ipcRenderer.invoke("admin:verify-code", { email, code }),
  api: (route, body) => ipcRenderer.invoke("api:call", { route, body }),
  dial: (number) => ipcRenderer.invoke("call:dial", { number }),
  accept: () => ipcRenderer.invoke("call:accept"),
  hangup: (callId) => ipcRenderer.invoke("call:hangup", { callId }),
  reportAnswered: (callId) => ipcRenderer.invoke("call:answered", { callId }),
  sendDtmf: (digits) => ipcRenderer.invoke("call:dtmf", { digits }),
  reginfo: () => ipcRenderer.invoke("call:reginfo"),

  onCallEvent: (callback) => {
    const listener = (_event, msg) => callback(msg);
    ipcRenderer.on("call:event", listener);
    return () => ipcRenderer.removeListener("call:event", listener);
  },
  onEngineDisconnected: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("engine:disconnected", listener);
    return () => ipcRenderer.removeListener("engine:disconnected", listener);
  },
});
