"use strict";

// Power dialer: works through a manual campaign's contact list. It asks the
// server for the next contact, counts down, places the call through the normal
// Dialer, and asks how it went. One call at a time — it never dials ahead of an
// agent who is still on the phone.
(function () {
  const U = window.KchelUi;
  const api = (route, body) => window.kchel.api(route, body || {});

  const RESULTS = [
    ["connected", "Connected"],
    ["callback", "Call back"],
    ["not_interested", "Not interested"],
    ["voicemail", "Voicemail"],
    ["busy", "Busy"],
    ["wrong_number", "Wrong number"],
    ["dnc", "Do not call"],
  ];
  // How fast the agent wants to work, remembered between sessions.
  const DELAYS = [[0, "No wait"], [3, "3 seconds"], [5, "5 seconds"], [10, "10 seconds"]];
  const RINGS = [[15, "15 seconds"], [25, "25 seconds"], [40, "40 seconds"], [60, "60 seconds"]];
  const pace = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem("kchelPowerPace") || "{}");
      return { delay: DELAYS.some(([v]) => v === saved.delay) ? saved.delay : 3, ring: RINGS.some(([v]) => v === saved.ring) ? saved.ring : 40 };
    } catch {
      return { delay: 3, ring: 40 };
    }
  })();
  function savePace() {
    try {
      localStorage.setItem("kchelPowerPace", JSON.stringify(pace));
    } catch {
      // Remembering the setting is a convenience, never a requirement.
    }
  }
  let ringTimer = null;

  let overlay = null;
  let campaign = null; // { id, name }
  let current = null; // { queueId, contact }
  let progress = null;
  let state = "idle"; // idle | loading | countdown | paused | dialing | incall | wrap | done
  let timer = null;
  let answered = false;
  let callId = null;

  function close() {
    clearInterval(timer);
    clearTimeout(ringTimer);
    timer = null;
    if (overlay) overlay.remove();
    overlay = null;
    state = "idle";
    current = null;
    document.dispatchEvent(new CustomEvent("kchel:power-closed"));
  }

  function setProgress(p) {
    if (p) progress = p;
  }

  function render(extra) {
    if (!overlay) return;
    const done = progress ? progress.completed + progress.failed + progress.skipped : 0;
    const total = progress ? progress.total : 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const c = current && current.contact;
    const who = c ? c.person || c.company || c.phone : "";

    let body = "";
    if (state === "loading") body = '<p class="hint">Finding the next contact…</p>';
    else if (state === "done") body = `<div class="power-card"><h2>List finished</h2><p class="hint">Everyone on this list has been called. ${done} of ${total} done.</p></div><div class="modal-actions"><button data-act="close">Close</button></div>`;
    else if (c) {
      const stateText = {
        countdown: `Calling in ${extra ?? ""}…`,
        paused: "Paused",
        dialing: "Calling…",
        incall: "On the call",
        wrap: "How did it go?",
      }[state];
      body = `
        <div class="power-card">
          <p class="eyebrow">${U.esc(stateText)}</p>
          <h2>${U.esc(who)}</h2>
          ${c.company && c.person ? `<p class="hint">${U.esc(c.company)}</p>` : ""}
          <p class="mono power-phone">${U.esc(c.phone)}</p>
        </div>
        ${
          state === "wrap"
            ? `<div class="power-results">${RESULTS.map(([k, l]) => `<button data-result="${k}" class="${answered && k === "connected" ? "primary" : ""}">${l}</button>`).join("")}</div>`
            : `<div class="modal-actions">
                ${state === "countdown" ? '<button data-act="pause">Pause</button><button data-act="skip">Skip</button><button data-act="now">Call now</button>' : ""}
                ${state === "paused" ? '<button data-act="skip">Skip</button><button data-act="now">Call now</button>' : ""}
                ${state === "dialing" || state === "incall" ? '<button data-act="hangup" class="btn-danger">Hang up</button>' : ""}
              </div>`
        }`;
    }

    overlay.innerHTML = `
      <div class="power-panel">
        <div class="power-top">
          <div><p class="eyebrow">Power dialer</p><h3>${U.esc(campaign.name)}</h3></div>
          <button data-act="stop">${state === "done" ? "Close" : "Stop"}</button>
        </div>
        <div class="meter-bar"><i style="width:${pct}%"></i></div>
        <p class="hint">${done} of ${total} done${progress ? ` · ${progress.pending} left` : ""}</p>
        <div class="power-pace">
          <label>Wait between calls <select data-pace="delay">${DELAYS.map(([v, l]) => `<option value="${v}" ${v === pace.delay ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label>Stop ringing after <select data-pace="ring">${RINGS.map(([v, l]) => `<option value="${v}" ${v === pace.ring ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        </div>
        ${body}
      </div>`;
  }

  async function next() {
    clearInterval(timer);
    state = "loading";
    current = null;
    render();
    try {
      const r = await api("power/next", { campaignId: campaign.id });
      setProgress(r.progress);
      if (r.done) {
        state = "done";
        render();
        return;
      }
      current = { queueId: r.queueId, contact: r.contact };
      answered = false;
      callId = null;
      startCountdown(pace.delay);
    } catch (err) {
      U.toast(err.message, "error");
      close();
    }
  }

  function startCountdown(n) {
    if (n <= 0) {
      void dial();
      return;
    }
    state = "countdown";
    let left = n;
    render(left);
    clearInterval(timer);
    timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        void dial();
      } else render(left);
    }, 1000);
  }

  async function dial() {
    clearInterval(timer);
    state = "dialing";
    render();
    try {
      callId = await window.KchelDialer.placeCall(current.contact.phone);
      // Nobody is going to pick up after this long: hang up and move on.
      clearTimeout(ringTimer);
      ringTimer = setTimeout(() => {
        if (state === "dialing") document.getElementById("btn-hangup").click();
      }, pace.ring * 1000);
    } catch (err) {
      U.toast(err.message, "error");
      // Hand the contact back rather than losing it, and stop.
      await stop();
    }
  }

  async function report(disposition) {
    const queueId = current.queueId;
    const id = callId;
    current = { ...current, queueId: null };
    try {
      const r = await api("power/result", { queueId, disposition, callId: id || undefined });
      setProgress(r.progress);
    } catch (err) {
      U.toast(err.message, "error");
    }
  }

  async function stop() {
    clearInterval(timer);
    clearTimeout(ringTimer);
    if (state === "dialing" || state === "incall") document.getElementById("btn-hangup").click();
    // A call that was answered but not yet logged still counts: record it, or it
    // would be handed out again after the abandoned-contact timeout.
    if (state === "wrap" && current && current.queueId) await report("connected");
    try {
      await api("power/stop", { campaignId: campaign.id, queueId: current && current.queueId && state !== "wrap" ? current.queueId : undefined });
    } catch {
      // Closing matters more than the bookkeeping.
    }
    close();
  }

  function onChange(e) {
    const key = e.target.dataset && e.target.dataset.pace;
    if (!key) return;
    pace[key] = Number(e.target.value);
    savePace();
  }

  function onClick(e) {
    const act = e.target.dataset && e.target.dataset.act;
    const result = e.target.dataset && e.target.dataset.result;
    if (result) {
      void report(result).then(next);
    } else if (act === "pause") {
      clearInterval(timer);
      state = "paused";
      render();
    } else if (act === "now") {
      void dial();
    } else if (act === "skip") {
      void report("skipped").then(next);
    } else if (act === "hangup") {
      document.getElementById("btn-hangup").click();
    } else if (act === "stop") {
      void stop();
    } else if (act === "close") {
      close();
    }
  }

  window.KchelPower = {
    async start(c) {
      if (overlay) return;
      try {
        const r = await api("power/start", { campaignId: c.id });
        campaign = { id: c.id, name: r.name || c.name };
        setProgress(r.progress);
      } catch (err) {
        U.toast(err.message, "error");
        return;
      }
      overlay = document.createElement("div");
      overlay.className = "power-overlay";
      overlay.addEventListener("click", onClick);
      overlay.addEventListener("change", onChange);
      document.body.appendChild(overlay);
      void next();
    },
    onCallAnswered() {
      clearTimeout(ringTimer);
      if (state === "dialing") {
        answered = true;
        state = "incall";
        render();
      }
    },
    onCallClosed(info) {
      clearTimeout(ringTimer);
      if (!overlay || (state !== "dialing" && state !== "incall")) return;
      if (info && info.direction && info.direction !== "outgoing") return;
      if (info && info.callId) callId = info.callId;
      if (info && info.answered) answered = true;
      if (answered) {
        state = "wrap";
        render();
      } else {
        // Never picked up: record it and move straight on.
        void report("no_answer").then(next);
      }
    },
  };
})();
