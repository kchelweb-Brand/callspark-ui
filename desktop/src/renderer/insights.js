"use strict";

// Read-only dashboard pages: Overview, Live calls, Call history, Recordings, Analytics.
(function () {
  const U = window.KchelUi;
  const api = (route, body) => window.kchel.api(route, body || {});
  const $ = (id) => document.getElementById(id);

  function showError(root, err) {
    root.querySelector("[data-body]").innerHTML = `<p class="hint status-error" style="padding:14px;border-radius:12px">${U.esc(err.message)}</p>`;
  }

  function skeleton(root, title, sub, actions) {
    root.innerHTML = U.header(title, sub, actions) + '<div data-body><p class="hint">Loading…</p></div>';
  }

  function who(call) {
    return call.contact_name || (call.direction === "inbound" ? call.from_number : call.to_number) || "Unknown";
  }

  function statusPill(call) {
    const s = call.outcome || call.status || "—";
    const kind = call.status === "failed" || call.status === "busy" ? "error" : call.status === "no_answer" ? "pending" : "ok";
    return `<span class="status status-${kind}">${U.esc(String(s).replace(/_/g, " "))}</span>`;
  }

  /** Opens the written summary and transcript for a call, creating them first if needed. */
  async function showSummary(callId, hasSummary) {
    const m = U.modal({ title: "Call summary", wide: true, html: `<p class="hint">${hasSummary ? "Loading…" : "Listening to the recording and writing a summary. This can take up to a minute…"}</p>` });
    const bodyEl = m.el.querySelector(".modal-body");
    try {
      const r = await api(hasSummary ? "calls/summary" : "calls/summarize", { callId });
      if (!r.summary) {
        bodyEl.innerHTML = '<p class="hint">No summary was saved for this call.</p>';
        return;
      }
      bodyEl.innerHTML = `
        <p class="eyebrow">Summary</p>
        <p class="summary-text">${U.esc(r.summary)}</p>
        ${r.transcript ? `<details><summary>Full transcript</summary><p class="summary-transcript">${U.esc(r.transcript)}</p></details>` : ""}`;
    } catch (err) {
      bodyEl.innerHTML = `<p class="hint status-error" style="padding:12px;border-radius:10px">${U.esc(err.message)}</p>`;
    }
  }

  function summaryButton(c) {
    if (c.has_summary) return `<button data-summary="${c.id}" data-has="1">View summary</button>`;
    if (c.has_recording !== false && (c.recording_url || c.has_recording)) return `<button data-summary="${c.id}">Summarize</button>`;
    return "—";
  }

  function wireSummaryButtons(scope, reload) {
    scope.querySelectorAll("[data-summary]").forEach((b) =>
      b.addEventListener("click", async () => {
        await showSummary(b.dataset.summary, b.dataset.has === "1");
        if (reload) reload();
      }),
    );
  }

  // ---------- Overview ----------
  const overview = (() => {
    const root = $("view-overview");
    let started = false;
    async function load() {
      try {
        const d = await api("overview");
        const rate = d.connectRate == null ? "—" : Math.round(d.connectRate) + "%";
        root.querySelector("[data-body]").innerHTML = `
          <div class="stats">
            ${U.stat("Calls today", d.callsToday, d.callsActive + " live now")}
            ${U.stat("Connect rate", rate, d.connectedToday + " connected today")}
            ${U.stat("Agents online", d.agentsOnline + " / " + d.agentsTotal)}
            ${U.stat("Talk time (month)", U.dur(d.talkSecondsMonth))}
            ${U.stat("Active campaigns", d.campaignsActive)}
            ${U.stat("SMS sent", d.smsSent)}
          </div>
          <div class="panel"><p class="eyebrow">Call volume · last 7 days</p>${U.bars(d.volume, "day", "calls")}</div>
          <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Recent activity</p>
            ${U.table(
              ["Who", "Direction", "Result", "When"],
              d.activity.map((c) => [U.esc(who(c)), U.esc(c.direction), statusPill(c), U.esc(U.when(c.started_at))]),
              "No calls yet today.",
            )}
          </div>`;
      } catch (err) {
        showError(root, err);
      }
    }
    return {
      init() {
        if (started) return;
        started = true;
        skeleton(root, "Overview", "How your workspace is doing right now.", '<button id="ov-refresh">Refresh</button>');
        $("ov-refresh").addEventListener("click", load);
        void load();
      },
    };
  })();

  // ---------- Live calls ----------
  const live = (() => {
    const root = $("view-live");
    let started = false;
    let timer = null;
    async function load() {
      if (root.classList.contains("hidden")) return;
      try {
        const d = await api("live-floor");
        const onCall = d.agents.filter((a) => a.call_id);
        root.querySelector("[data-body]").innerHTML = `
          <div class="stats">
            ${U.stat("On a call", onCall.length)}
            ${U.stat("Waiting", d.waiting.length)}
            ${U.stat("Avg talk time", U.dur(d.avgTalkSeconds))}
          </div>
          <div class="panel table-panel">
            ${U.table(
              ["Agent", "Ext", "Status", "Talking to", "Time"],
              d.agents.map((a) => [
                U.esc(a.name),
                `<span class="mono">${U.esc(a.extension || "—")}</span>`,
                `<span class="status status-${a.call_id ? "ok" : a.status === "Offline" ? "" : "pending"}">${U.esc(a.call_id ? "On call" : a.status)}</span>`,
                U.esc(a.call_id ? a.contact_name || a.to_number || a.from_number || "—" : "—"),
                a.answered_at ? U.esc(U.dur((Date.now() - new Date(a.answered_at).getTime()) / 1000)) : "—",
              ]),
              "No agents yet — add one on the Agents page.",
            )}
          </div>`;
      } catch (err) {
        showError(root, err);
      }
    }
    return {
      init() {
        if (started) return;
        started = true;
        skeleton(root, "Live calls", "Who is on the phone right now. Updates every few seconds.");
        void load();
        timer = setInterval(load, 5000);
      },
    };
  })();

  // ---------- Call history ----------
  const history = (() => {
    const root = $("view-history");
    let started = false;
    let page = 1;
    let searchTimer = null;
    const PAGE = 25;
    async function load() {
      const search = ($("hist-search")?.value || "").trim();
      try {
        const d = await api("calls/list", { search, page, pageSize: PAGE });
        const calls = d.calls || [];
        const total = d.total ?? calls.length;
        root.querySelector("[data-body]").innerHTML = `
          <div class="panel table-panel">
            ${U.table(
              ["Who", "Direction", "Agent", "Result", "Duration", "When", "Notes"],
              calls.map((c) => [
                U.esc(who(c)),
                U.esc(c.direction),
                c.handled_by === "ai" ? '<span class="status status-ok">AI receptionist</span>' : U.esc(c.agent_email || "—"),
                statusPill(c),
                U.esc(U.dur(c.duration_seconds)),
                U.esc(U.when(c.started_at)),
                summaryButton(c),
              ]),
              "No calls match.",
            )}
          </div>
          <div class="pager">
            <button id="hist-prev" ${page <= 1 ? "disabled" : ""}>Previous</button>
            <span class="hint">Page ${page} · ${total} calls</span>
            <button id="hist-next" ${page * PAGE >= total ? "disabled" : ""}>Next</button>
          </div>`;
        wireSummaryButtons(root, () => void load());
        $("hist-prev").addEventListener("click", () => { page -= 1; void load(); });
        $("hist-next").addEventListener("click", () => { page += 1; void load(); });
      } catch (err) {
        showError(root, err);
      }
    }
    return {
      init() {
        if (started) return;
        started = true;
        skeleton(root, "Call history", "Every call placed and received.", '<input id="hist-search" type="text" placeholder="Search number or name…" />');
        $("hist-search").addEventListener("input", () => {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => { page = 1; void load(); }, 300);
        });
        void load();
      },
    };
  })();

  // ---------- Recordings ----------
  const recordings = (() => {
    const root = $("view-recordings");
    let started = false;
    let searchTimer = null;
    async function load() {
      const search = ($("rec-search")?.value || "").trim();
      try {
        const d = await api("recordings/list", { search });
        root.querySelector("[data-body]").innerHTML = `
          <p class="hint">${U.esc(String(d.completedCalls ?? 0))} completed calls · ${d.recordings.length} with a recording</p>
          <div class="panel table-panel">
            ${U.table(
              ["Who", "Agent", "Length", "When", "Listen", "Summary"],
              d.recordings.map((r) => [
                U.esc(who(r)),
                U.esc(r.agent_email || "—"),
                U.esc(U.dur(r.recording_seconds || r.duration_seconds)),
                U.esc(U.when(r.started_at)),
                r.recording_url && /^https:/.test(r.recording_url)
                  ? `<audio controls preload="none" src="${U.esc(r.recording_url)}"></audio>`
                  : "—",
                summaryButton({ ...r, has_recording: true }),
              ]),
              "No recordings yet. Turn on call recording in Settings.",
            )}
          </div>`;
        wireSummaryButtons(root, () => void load());
      } catch (err) {
        showError(root, err);
      }
    }
    return {
      init() {
        if (started) return;
        started = true;
        skeleton(root, "Recordings", "Listen back to recorded calls.", '<input id="rec-search" type="text" placeholder="Search…" />');
        $("rec-search").addEventListener("input", () => {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(load, 300);
        });
        void load();
      },
    };
  })();

  // ---------- Analytics ----------
  const analytics = (() => {
    const root = $("view-analytics");
    let started = false;
    let range = "7d";
    async function load() {
      try {
        const d = await api("analytics", { range });
        root.querySelector("[data-body]").innerHTML = `
          <div class="toggle-row">${["7d", "30d", "90d"]
            .map((r) => `<button class="toggle-btn ${r === range ? "active" : ""}" data-range="${r}">${r.replace("d", " days")}</button>`)
            .join("")}</div>
          <div class="stats">
            ${U.stat("Dials", d.dials)}
            ${U.stat("Connected", d.connected, Math.round(d.connectRate || 0) + "% connect rate")}
            ${U.stat("Avg handle time", U.dur(d.avgHandleSeconds))}
          </div>
          <div class="panel"><p class="eyebrow">Calls by hour</p>${U.bars(d.hourly, "hour", "calls")}</div>
          <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Outcomes</p>
            ${U.table(["Outcome", "Calls"], d.outcomes.map((o) => [U.esc(String(o.name).replace(/_/g, " ")), U.esc(String(o.value))]), "No calls in this range.")}
          </div>
          <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Agent leaderboard</p>
            ${U.table(
              ["Agent", "Calls", "Connected", "Rate", "Talk time"],
              d.leaderboard.map((a) => [U.esc(a.name), U.esc(String(a.calls)), U.esc(String(a.connected)), U.esc(Math.round(a.connectRate || 0) + "%"), U.esc(U.dur(a.talk_seconds))]),
              "No agent activity yet.",
            )}
          </div>`;
        root.querySelectorAll("[data-range]").forEach((b) =>
          b.addEventListener("click", () => { range = b.dataset.range; void load(); }),
        );
      } catch (err) {
        showError(root, err);
      }
    }
    return {
      init() {
        if (started) return;
        started = true;
        skeleton(root, "Analytics", "Performance across your calls and agents.");
        void load();
      },
    };
  })();

  window.KchelOverview = overview;
  window.KchelLive = live;
  window.KchelHistory = history;
  window.KchelRecordings = recordings;
  window.KchelAnalytics = analytics;
})();
