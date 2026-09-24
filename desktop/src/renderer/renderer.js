"use strict";

const els = {
  screenLogin: document.getElementById("screen-login"),
  screenApp: document.getElementById("screen-app"),
  formRequestCode: document.getElementById("form-request-code"),
  formVerifyCode: document.getElementById("form-verify-code"),
  inputSlug: document.getElementById("input-slug"),
  inputEmail: document.getElementById("input-email"),
  inputCode: document.getElementById("input-code"),
  loginHint: document.getElementById("login-hint"),
  verifyHint: document.getElementById("verify-hint"),
  regStatus: document.getElementById("reg-status"),
  btnLogout: document.getElementById("btn-logout"),
  callPanel: document.getElementById("call-panel"),
  callNumber: document.getElementById("call-number"),
  callState: document.getElementById("call-state"),
  callTimer: document.getElementById("call-timer"),
  btnAccept: document.getElementById("btn-accept"),
  btnHangup: document.getElementById("btn-hangup"),
  dtmfRow: document.getElementById("dtmf-row"),
  dialPanel: document.getElementById("dial-panel"),
  inputNumber: document.getElementById("input-number"),
  btnDial: document.getElementById("btn-dial"),
  dialerHint: document.getElementById("dialer-hint"),
};

let pendingEmail = "";
let pendingSlug = "";
let activeCall = null; // { callId, engineCallId, direction, answeredAt }
let timerInterval = null;
let sipRegistered = false;

const EMBEDDED_ROUTES = {
  "phone-system": "/phone-system",
  contacts: "/contacts",
  campaigns: "/campaigns",
};
const embeddedWebviews = {}; // view name -> <webview> element, created lazily

function show(screen) {
  els.screenLogin.classList.toggle("hidden", screen !== "login");
  els.screenApp.classList.toggle("hidden", screen !== "app");
}

function showView(name) {
  document.querySelectorAll(".view").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === name));
  document.getElementById(`view-${name}`).classList.remove("hidden");

  if (EMBEDDED_ROUTES[name]) openEmbeddedView(name);
}

/** Loads a real, already-working page from the website inside its own
 * <webview>, injecting this app's session so the person never has to sign
 * in twice. Built once per view, then just shown/hidden after that. */
async function openEmbeddedView(name) {
  if (embeddedWebviews[name]) return;

  const container = document.getElementById(`view-${name}`);
  const session = await window.kchel.getSession();
  const apiBase = await window.kchel.getApiBase();
  if (!session) return;

  const webview = document.createElement("webview");
  webview.setAttribute("partition", "persist:kchel-embedded");
  webview.setAttribute("src", `${apiBase}${EMBEDDED_ROUTES[name]}`);
  container.appendChild(webview);
  embeddedWebviews[name] = webview;

  const injectSession = () => {
    const payload = JSON.stringify({ token: session.token, user: session.user });
    webview.executeJavaScript(`
      (function() {
        var data = ${payload};
        sessionStorage.setItem("kchel_dialer_token", data.token);
        sessionStorage.setItem("kchel_dialer_user", JSON.stringify(data.user));
        sessionStorage.setItem("kchel_dialer_last_active", String(Date.now()));
      })();
    `).catch(() => {});
  };

  webview.addEventListener("dom-ready", injectSession);
  // Safety net: if the page's own auth check ran before injection landed and
  // sent it to /login, inject again and bounce back to the real page.
  webview.addEventListener("did-navigate", (e) => {
    if (e.url.includes("/login")) {
      injectSession();
      webview.loadURL(`${apiBase}${EMBEDDED_ROUTES[name]}`);
    }
  });
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function setRegStatus(text, kind) {
  els.regStatus.textContent = text;
  els.regStatus.className = `status status-${kind}`;
}

async function boot() {
  const session = await window.kchel.getSession();
  if (!session) {
    show("login");
    return;
  }
  show("app");
  try {
    const result = await window.kchel.resumeSession();
    applySipStatus(result?.sip);
  } catch (err) {
    setRegStatus("Not registered", "error");
    els.dialerHint.textContent = err.message;
  }
}

function applySipStatus(sip) {
  sipRegistered = Boolean(sip?.success);
  if (sipRegistered) {
    setRegStatus(`Registered (${sip.label})`, "ok");
    els.dialerHint.textContent = "";
  } else {
    setRegStatus("Not registered", "error");
    els.dialerHint.textContent = sip?.error
      ? `Not registered: ${sip.error}`
      : "Your SIP connection isn't registered. Check Phone System → Connection on the website, then reopen the app.";
  }
}

els.formRequestCode.addEventListener("submit", async (e) => {
  e.preventDefault();
  pendingEmail = els.inputEmail.value.trim();
  pendingSlug = els.inputSlug.value.trim();
  els.loginHint.textContent = "Sending code…";
  try {
    await window.kchel.requestCode(pendingEmail, pendingSlug);
    els.loginHint.textContent = "";
    els.formRequestCode.classList.add("hidden");
    els.formVerifyCode.classList.remove("hidden");
  } catch (err) {
    els.loginHint.textContent = err.message;
  }
});

els.formVerifyCode.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.verifyHint.textContent = "Signing in…";
  try {
    const result = await window.kchel.verifyCode(pendingEmail, els.inputCode.value.trim());
    show("app");
    applySipStatus(result?.sip);
  } catch (err) {
    els.verifyHint.textContent = err.message;
  }
});

els.btnLogout.addEventListener("click", async () => {
  await window.kchel.logout();
  show("login");
  els.formRequestCode.classList.remove("hidden");
  els.formVerifyCode.classList.add("hidden");
  els.inputCode.value = "";
});

els.btnDial.addEventListener("click", async () => {
  const number = els.inputNumber.value.trim();
  if (!number) return;
  if (!sipRegistered) {
    els.dialerHint.textContent = "Not registered yet — can't place a call.";
    return;
  }
  els.dialerHint.textContent = "";
  try {
    enterCall({ number, direction: "outgoing", state: "Calling…" });
    const { callId, engineCallId } = await window.kchel.dial(number);
    activeCall = { ...activeCall, callId, engineCallId };
  } catch (err) {
    els.dialerHint.textContent = err.message;
    exitCall();
  }
});

els.btnHangup.addEventListener("click", async () => {
  const callId = activeCall?.callId;
  exitCall();
  try {
    await window.kchel.hangup(callId);
  } catch {
    // The call is already gone from the UI's perspective either way.
  }
});

els.btnAccept.addEventListener("click", async () => {
  try {
    await window.kchel.accept();
  } catch (err) {
    els.dialerHint.textContent = err.message;
  }
});

els.dtmfRow.addEventListener("click", (e) => {
  const digit = e.target.dataset.digit;
  if (digit) window.kchel.sendDtmf(digit);
});

function enterCall({ number, direction, state }) {
  activeCall = { number, direction, callId: null, engineCallId: null, answeredAt: null };
  els.dialPanel.classList.add("hidden");
  els.callPanel.classList.remove("hidden");
  els.callNumber.textContent = number || "Unknown";
  els.callState.textContent = state;
  els.btnAccept.classList.toggle("hidden", direction !== "incoming");
  els.dtmfRow.classList.add("hidden");
  els.callTimer.textContent = "";
}

function exitCall() {
  activeCall = null;
  clearInterval(timerInterval);
  timerInterval = null;
  els.callPanel.classList.add("hidden");
  els.dialPanel.classList.remove("hidden");
  els.inputNumber.value = "";
}

function startTimer() {
  const start = Date.now();
  timerInterval = setInterval(() => {
    const secs = Math.floor((Date.now() - start) / 1000);
    const m = String(Math.floor(secs / 60)).padStart(2, "0");
    const s = String(secs % 60).padStart(2, "0");
    els.callTimer.textContent = `${m}:${s}`;
  }, 500);
}

window.kchel.onCallEvent(async (msg) => {
  switch (msg.type) {
    case "CALL_INCOMING": {
      const number = (msg.peeruri || "").replace(/^sip:/, "").split("@")[0];
      enterCall({ number, direction: "incoming", state: "Incoming call…" });
      break;
    }
    case "CALL_RINGING":
    case "CALL_PROGRESS":
      if (activeCall) els.callState.textContent = "Ringing…";
      break;
    case "CALL_ANSWERED":
    case "CALL_ESTABLISHED":
      if (activeCall) {
        els.callState.textContent = "Connected";
        els.btnAccept.classList.add("hidden");
        els.dtmfRow.classList.remove("hidden");
        if (!activeCall.answeredAt) {
          activeCall.answeredAt = Date.now();
          startTimer();
          if (activeCall.callId) window.kchel.reportAnswered(activeCall.callId);
        }
      }
      break;
    case "CALL_CLOSED":
      exitCall();
      break;
  }
});

window.kchel.onEngineDisconnected(() => {
  setRegStatus("Reconnecting…", "pending");
});

boot();
