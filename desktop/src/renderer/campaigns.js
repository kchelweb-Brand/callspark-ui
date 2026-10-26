"use strict";

(function () {
  const els = {
    table: document.getElementById("campaigns-table"),
    btnNew: document.getElementById("btn-new-campaign"),
    modalRoot: document.getElementById("modal-root"),
  };

  let initialized = false;
  let logPollTimer = null;
  let apiBase = "";

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  function closeModal() {
    els.modalRoot.innerHTML = "";
    clearInterval(logPollTimer);
    logPollTimer = null;
  }

  async function load() {
    try {
      const result = await window.kchel.api("campaigns/list", {});
      render(result.campaigns);
    } catch (err) {
      els.table.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
    }
  }

  function render(campaigns) {
    if (campaigns.length === 0) {
      els.table.innerHTML = '<p class="hint" style="padding:16px">No campaigns yet.</p>';
      return;
    }
    els.table.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Name</th><th>Mode</th><th>Status</th><th>Progress</th><th></th></tr></thead>
        <tbody>
          ${campaigns
            .map(
              (c) => `
            <tr>
              <td>${escapeHtml(c.name)}</td>
              <td>${c.mode === "ai_agent" ? "AI agent" : "Manual"}</td>
              <td><span class="status status-${c.status === "Active" ? "ok" : "pending"}">${escapeHtml(c.status)}</span></td>
              <td class="mono">${c.mode === "ai_agent" ? `${c.queue_completed + c.queue_failed}/${c.queue_total}` : "—"}</td>
              <td class="row-actions">
                ${
                  c.mode === "ai_agent"
                    ? c.status === "Active"
                      ? `<button data-action="pause" data-id="${c.id}">Pause</button>`
                      : `<button data-action="start" data-id="${c.id}">${c.queue_total > 0 ? "Resume" : "Start"}</button>`
                    : ""
                }
                ${c.mode === "ai_agent" && c.queue_total > 0 ? `<button data-action="log" data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-status="${c.status}">Log</button>` : ""}
              </td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;

    els.table.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const { action, id, name, status } = btn.dataset;
        if (action === "start") void startCampaign(id);
        if (action === "pause") void pauseCampaign(id);
        if (action === "log") openLog(id, name, status);
      });
    });
  }

  async function startCampaign(id) {
    try {
      await window.kchel.api("campaigns/start-dialing", { campaignId: id, origin: apiBase });
      await load();
    } catch (err) {
      window.KchelUi.toast(err.message, "error");
    }
  }

  async function pauseCampaign(id) {
    try {
      await window.kchel.api("campaigns/pause-dialing", { campaignId: id });
      await load();
    } catch (err) {
      window.KchelUi.toast(err.message, "error");
    }
  }

  function openLog(campaignId, name, status) {
    els.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h2>${escapeHtml(name)} — call log</h2>
          <div id="log-body"><p class="hint">Loading…</p></div>
          <button id="log-close" style="margin-top:12px">Close</button>
        </div>
      </div>
    `;
    document.getElementById("log-close").addEventListener("click", closeModal);

    const refresh = async () => {
      try {
        const result = await window.kchel.api("campaigns/call-log", { campaignId });
        renderLog(result.log);
      } catch (err) {
        document.getElementById("log-body").innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
      }
    };

    void refresh();
    if (status === "Active") {
      logPollTimer = setInterval(async () => {
        try {
          await window.kchel.api("campaigns/reconcile", { campaignId, origin: apiBase });
        } catch {
          // best-effort
        }
        await refresh();
      }, 4000);
    }
  }

  function renderLog(rows) {
    const body = document.getElementById("log-body");
    if (!body) return;
    if (rows.length === 0) {
      body.innerHTML = '<p class="hint">Nothing dialed yet.</p>';
      return;
    }
    body.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Contact</th><th>Status</th><th>Outcome</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${escapeHtml(r.contact_name || r.phone || "—")}</td>
              <td>${r.status === "completed" ? "Successfully dialed" : escapeHtml(r.status)}</td>
              <td>${escapeHtml(r.outcome || "—")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  async function openNewCampaignModal() {
    let lists = [];
    try {
      const meta = await window.kchel.api("contacts/meta", {});
      lists = meta.lists;
    } catch {
      // The list dropdown just comes back empty — the form still surfaces
      // "Choose a contact list" clearly enough if none load.
    }

    els.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h2>New campaign</h2>
          <form id="new-campaign-form" class="stack">
            <label>Name<input id="nc-name" type="text" required /></label>
            <div class="toggle-row">
              <button type="button" id="nc-mode-manual" class="toggle-btn active">Manual</button>
              <button type="button" id="nc-mode-ai" class="toggle-btn">AI agent</button>
            </div>
            <div id="nc-ai-fields" class="hidden">
              <label>Contact list
                <select id="nc-list-id">
                  <option value="">Choose a list…</option>
                  ${lists.map((l) => `<option value="${l.id}">${escapeHtml(l.name)} (${l.contact_count})</option>`).join("")}
                </select>
              </label>
              <label>AI prompt / opening script
                <textarea id="nc-prompt" rows="5"></textarea>
              </label>
              <button type="button" id="nc-check-script">Check script</button>
              <div id="nc-check-result"></div>
              <div class="checkbox-row">
                <input id="nc-compliance" type="checkbox" />
                <label for="nc-compliance">I confirm this script discloses it's an automated call and complies with outbound calling rules</label>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" id="nc-cancel">Cancel</button>
              <button type="submit">Create</button>
            </div>
            <p class="hint" id="nc-hint"></p>
          </form>
        </div>
      </div>
    `;

    let mode = "manual";
    const setMode = (m) => {
      mode = m;
      document.getElementById("nc-mode-manual").classList.toggle("active", m === "manual");
      document.getElementById("nc-mode-ai").classList.toggle("active", m === "ai_agent");
      document.getElementById("nc-ai-fields").classList.toggle("hidden", m !== "ai_agent");
    };
    document.getElementById("nc-mode-manual").addEventListener("click", () => setMode("manual"));
    document.getElementById("nc-mode-ai").addEventListener("click", () => setMode("ai_agent"));
    document.getElementById("nc-cancel").addEventListener("click", closeModal);

    document.getElementById("nc-check-script").addEventListener("click", async () => {
      const prompt = document.getElementById("nc-prompt").value.trim();
      const resultEl = document.getElementById("nc-check-result");
      if (!prompt) {
        resultEl.textContent = "Write a prompt first.";
        return;
      }
      resultEl.textContent = "Checking…";
      try {
        const result = await window.kchel.api("campaigns/review-prompt", { prompt });
        resultEl.innerHTML =
          result.concerns.length === 0
            ? '<p class="hint" style="color:var(--accent)">No spam/scam concerns found.</p>'
            : `<ul class="hint">${result.concerns.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`;
      } catch (err) {
        resultEl.textContent = err.message;
      }
    });

    document.getElementById("new-campaign-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const hint = document.getElementById("nc-hint");
      try {
        const listId = mode === "ai_agent" ? document.getElementById("nc-list-id").value : undefined;
        if (mode === "ai_agent" && !listId) throw new Error("Choose a contact list.");
        await window.kchel.api("campaigns/create", {
          name: document.getElementById("nc-name").value.trim(),
          mode,
          listId,
          aiPrompt: mode === "ai_agent" ? document.getElementById("nc-prompt").value.trim() : undefined,
          complianceAck: mode === "ai_agent" ? document.getElementById("nc-compliance").checked : undefined,
        });
        closeModal();
        await load();
      } catch (err) {
        hint.textContent = err.message;
      }
    });
  }

  function bind() {
    els.btnNew.addEventListener("click", openNewCampaignModal);
  }

  window.KchelCampaigns = {
    async init() {
      if (initialized) return;
      initialized = true;
      apiBase = await window.kchel.getApiBase();
      bind();
      void load();
    },
  };
})();
