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
  loginSteps: document.getElementById("login-steps"),
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
  numberDisplay: document.getElementById("number-display"),
  keypad: document.getElementById("keypad"),
  btnDial: document.getElementById("btn-dial"),
  btnBackspace: document.getElementById("btn-backspace"),
  dialerHint: document.getElementById("dialer-hint"),
  recentsList: document.getElementById("recents-list"),
};

let pendingEmail = "";
let pendingSlug = "";
let activeCall = null; // { callId, engineCallId, direction, answeredAt }
let timerInterval = null;
let sipRegistered = false;
let dialedNumber = "";

// Each of these pages (sip-config.js, contacts.js, campaigns.js, ivr.js,
// settings.js) is a real native screen — its own DOM, its own calls to
// window.kchel.api(), no embedded website page and no idle timer.
const PAGE_INIT = {
  "sip-config": () => window.KchelSipConfig?.init(),
  contacts: () => window.KchelContacts?.init(),
  campaigns: () => window.KchelCampaigns?.init(),
  ivr: () => window.KchelIvr?.init(),
  extensions: () => window.KchelExtensions?.init(),
  voicemail: () => window.KchelVoicemail?.init(),
  settings: () => window.KchelSettings?.init(),
  overview: () => window.KchelOverview?.init(),
  live: () => window.KchelLive?.init(),
  history: () => window.KchelHistory?.init(),
  recordings: () => window.KchelRecordings?.init(),
  analytics: () => window.KchelAnalytics?.init(),
  agents: () => window.KchelAgents?.init(),
  sms: () => window.KchelSms?.init(),
  numbers: () => window.KchelNumbers?.init(),
  billing: () => window.KchelBilling?.init(),
  support: () => window.KchelSupport?.init(),
  admin: () => window.KchelAdmin?.init(),
  automations: () => window.KchelAutomations?.init(),
  health: () => window.KchelHealth?.init(),
};
const pageLoaded = {};

function show(screen) {
  if (screen === "app") void revealAdminNav();
  document.getElementById("screen-splash").classList.add("hidden");
  els.screenLogin.classList.toggle("hidden", screen !== "login");
  els.screenApp.classList.toggle("hidden", screen !== "app");
}

function showView(name) {
  document.querySelectorAll(".view").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === name));
  document.getElementById(`view-${name}`).classList.remove("hidden");
  document.getElementById("screen-app").classList.remove("nav-open");

  if (PAGE_INIT[name] && !pageLoaded[name]) {
    pageLoaded[name] = true;
    PAGE_INIT[name]();
  }
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

document.getElementById("btn-menu").addEventListener("click", () => {
  document.getElementById("screen-app").classList.toggle("nav-open");
});
document.getElementById("nav-scrim").addEventListener("click", () => {
  document.getElementById("screen-app").classList.remove("nav-open");
});

async function revealAdminNav() {
  try {
    const me = await window.kchel.api("me", {});
    document.getElementById("admin-nav").classList.toggle("hidden", !me.canAdmin);
  } catch {
    document.getElementById("admin-nav").classList.add("hidden");
  }
}

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
  renderNumberDisplay();
  void loadRecentCalls();
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
    document.getElementById("verify-email").textContent = pendingEmail;
    els.loginSteps.dataset.step = "2";
    els.inputCode.focus();
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
    renderNumberDisplay();
    void loadRecentCalls();
    applySipStatus(result?.sip);
  } catch (err) {
    els.verifyHint.textContent = err.message;
  }
});

els.btnLogout.addEventListener("click", async () => {
  await window.kchel.logout();
  show("login");
  els.formRequestCode.classList.remove("hidden");
  resetLoginForm();
});

function resetLoginForm() {
  els.formRequestCode.classList.remove("hidden");
  els.formVerifyCode.classList.add("hidden");
  els.inputCode.value = "";
  els.verifyHint.textContent = "";
  els.loginSteps.dataset.step = "1";
}

document.getElementById("btn-login-back").addEventListener("click", resetLoginForm);

function renderNumberDisplay() {
  els.numberDisplay.textContent = dialedNumber || "—";
}

els.keypad.addEventListener("click", (e) => {
  const digit = e.target.dataset.digit;
  if (!digit) return;
  dialedNumber += digit;
  renderNumberDisplay();
});

els.btnBackspace.addEventListener("click", () => {
  dialedNumber = dialedNumber.slice(0, -1);
  renderNumberDisplay();
});

els.btnDial.addEventListener("click", async () => {
  const number = dialedNumber.trim();
  if (!number) return;
  if (!sipRegistered) {
    els.dialerHint.textContent = "Not registered yet — can't place a call.";
    return;
  }
  els.dialerHint.textContent = "";
  try {
    await placeCall(number);
  } catch (err) {
    els.dialerHint.textContent = err.message;
    exitCall();
  }
});

/** Places an outgoing call and returns its call-record id. Used by the keypad and the power dialer. */
async function placeCall(number) {
  if (!sipRegistered) throw new Error("Not registered yet. Can't place a call.");
  if (activeCall) throw new Error("You're already on a call.");
  enterCall({ number, direction: "outgoing", state: "Calling…" });
  const { callId, engineCallId } = await window.kchel.dial(number);
  activeCall = { ...activeCall, callId, engineCallId };
  return callId;
}

window.KchelDialer = { placeCall };

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
  dialedNumber = "";
  renderNumberDisplay();
  void loadRecentCalls();
}

function formatRecentMeta(call) {
  if (call.status === "no_answer") return "No answer";
  if (call.status === "failed") return "Failed";
  if (call.direction === "inbound" && !call.duration_seconds) return "Missed";
  const mins = Math.floor((call.duration_seconds || 0) / 60);
  const secs = (call.duration_seconds || 0) % 60;
  const label = call.direction === "outbound" ? "Outgoing" : "Incoming";
  return `${label} · ${mins}m ${secs}s`;
}

async function loadRecentCalls() {
  let calls = [];
  try {
    calls = await window.kchel.recentCalls();
  } catch {
    // Best-effort — an empty list just shows nothing.
  }

  if (calls.length === 0) {
    els.recentsList.innerHTML = '<p class="recents-empty">No calls yet</p>';
    return;
  }

  els.recentsList.innerHTML = calls
    .map((call) => {
      const name = call.contact_name || call.to_number || call.from_number || "Unknown";
      const isOutbound = call.direction === "outbound";
      return `
        <div class="recent-row">
          <div>
            <p class="recent-row-name">${escapeHtml(name)}</p>
            <p class="recent-row-meta">${escapeHtml(formatRecentMeta(call))}</p>
          </div>
          <span class="recent-row-icon ${isOutbound ? "out" : "in"}">${isOutbound ? "↗" : "↙"}</span>
        </div>
      `;
    })
    .join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
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
          window.KchelPower?.onCallAnswered();
        }
      }
      break;
    case "CALL_CLOSED":
      window.KchelPower?.onCallClosed({
        direction: activeCall?.direction,
        callId: activeCall?.callId,
        answered: Boolean(activeCall?.answeredAt),
      });
      exitCall();
      break;
  }
});

window.kchel.onEngineDisconnected(() => {
  setRegStatus("Reconnecting…", "pending");
});

boot();
