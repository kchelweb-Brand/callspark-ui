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
  let options = null;

  const MAX_MB = 5;

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

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  /** Reads a File as base64 without blowing the argument limit on larger recordings. */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.onload = () => {
        const bytes = new Uint8Array(reader.result);
        let binary = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        resolve(btoa(binary));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async function ensureOptions() {
    if (!options) options = await window.kchel.api("campaigns/options", {});
    return options;
  }

  // ---------- the recording form, shared by "New campaign" and "Recording and options" ----------

  /**
   * Renders the recording, voicemail, keys and "at once" controls into `container`.
   * `savedKey` is the recording already stored on the campaign: a file uploaded here but not
   * yet saved is deleted again if it is replaced or the form is abandoned.
   */
  function recordingForm(container, initial, savedKey) {
    const state = { file: initial.file || null };

    const voicemailOptions = options.voicemail
      .map((v) => `<option value="${v.id}" ${initial.voicemail === v.id ? "selected" : ""}>${escapeHtml(v.label)}</option>`)
      .join("");
    const atOnceOptions = Array.from({ length: options.maxCallsAtOnce }, (_, i) => i + 1)
      .map(
        (n) =>
          `<option value="${n}" ${Number(initial.callsAtOnce) === n ? "selected" : ""}>${n === 1 ? "1 (one call after another)" : n + " at once"}</option>`,
      )
      .join("");

    container.innerHTML = `
      <div class="stack">
        <div>
          <p class="eyebrow">Recording</p>
          <div id="rf-file"></div>
          <input id="rf-input" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" class="hidden" />
          <p class="hint">MP3 or WAV, up to ${MAX_MB} MB. Everyone who answers hears this. Start by saying who you are and that it is a recorded message. If you turn on a key below, say what it does in the recording, for example “Press 1 to speak with us.”</p>
        </div>
        <label>If voicemail answers
          <select id="rf-voicemail">${voicemailOptions}</select>
        </label>
        <p class="hint">Checking for voicemail adds a short pause before a person hears the recording.</p>
        <p class="eyebrow">While the recording plays, the person can press a key</p>
        <div class="checkbox-row"><input id="rf-connect" type="checkbox" ${initial.connectEnabled ? "checked" : ""} /><label for="rf-connect">Press 1 to be connected to a person</label></div>
        <label id="rf-transfer-row" class="${initial.connectEnabled ? "" : "hidden"}">Connect them to this number
          <input id="rf-transfer" type="text" placeholder="+14155550134" value="${escapeHtml(initial.transferNumber || "")}" />
        </label>
        <div class="checkbox-row"><input id="rf-optout" type="checkbox" ${initial.optOutEnabled ? "checked" : ""} /><label for="rf-optout">Press 2 to never be called again</label></div>
        <label>People rung at the same time
          <select id="rf-atonce">${atOnceOptions}</select>
        </label>
      </div>`;

    const q = (id) => container.querySelector("#" + id);

    function dropUnsaved() {
      if (state.file && state.file.key !== savedKey) {
        void window.kchel.api("media/delete", { key: state.file.key }).catch(() => {});
      }
    }

    function renderFile() {
      const area = q("rf-file");
      if (!state.file) {
        area.innerHTML = '<button type="button" id="rf-upload">Upload your recording</button>';
        q("rf-upload").addEventListener("click", () => q("rf-input").click());
        return;
      }
      const ext = (state.file.key.split(".").pop() || "").toUpperCase();
      area.innerHTML = `
        <div class="stack">
          <strong>${escapeHtml(state.file.fileName)}</strong>
          <span class="hint">${escapeHtml(ext)} · ${escapeHtml(formatBytes(state.file.bytes))}</span>
          <audio controls preload="none" style="width:100%" src="${escapeHtml(apiBase + state.file.url)}"></audio>
          <div><button type="button" id="rf-replace">Replace</button> <button type="button" id="rf-remove">Remove</button></div>
        </div>`;
      q("rf-replace").addEventListener("click", () => q("rf-input").click());
      q("rf-remove").addEventListener("click", () => {
        dropUnsaved();
        state.file = null;
        renderFile();
      });
    }

    q("rf-input").addEventListener("change", async (e) => {
      const picked = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!picked) return;
      const ext = (picked.name.split(".").pop() || "").toLowerCase();
      if (ext !== "mp3" && ext !== "wav") {
        window.KchelUi.toast("Use an MP3 or WAV recording. Other formats don't play reliably on phone calls.", "error");
        return;
      }
      if (picked.size > MAX_MB * 1024 * 1024) {
        window.KchelUi.toast("That file is too large. The most is " + MAX_MB + " MB.", "error");
        return;
      }
      q("rf-file").innerHTML = '<p class="hint">Uploading…</p>';
      try {
        const base64 = await fileToBase64(picked);
        const uploaded = await window.kchel.api("media/upload", {
          fileName: picked.name,
          contentType: picked.type || (ext === "wav" ? "audio/wav" : "audio/mpeg"),
          base64,
        });
        dropUnsaved();
        state.file = { key: uploaded.key, url: uploaded.url, fileName: uploaded.fileName, bytes: uploaded.bytes };
        window.KchelUi.toast("Recording uploaded", "info");
      } catch (err) {
        window.KchelUi.toast(err.message, "error");
      }
      renderFile();
    });

    q("rf-connect").addEventListener("change", () => {
      q("rf-transfer-row").classList.toggle("hidden", !q("rf-connect").checked);
    });

    renderFile();

    return {
      read() {
        return {
          file: state.file,
          voicemail: q("rf-voicemail").value,
          connectEnabled: q("rf-connect").checked,
          transferNumber: q("rf-transfer").value.trim(),
          optOutEnabled: q("rf-optout").checked,
          callsAtOnce: Number(q("rf-atonce").value),
        };
      },
      /** Call when the form is abandoned without saving. */
      discardUnsaved: dropUnsaved,
    };
  }

  function recordingProblem(settings) {
    if (settings.connectEnabled) {
      // Same rule as the server: a leading + is taken as it is, a bare 10-digit (or 11 starting with 1) number is North American.
      const raw = String(settings.transferNumber || "").trim();
      const digits = raw.replace(/[^\d]/g, "");
      const ok =
        digits.length >= 7 &&
        digits.length <= 15 &&
        (raw.startsWith("+") || digits.length === 10 || (digits.length === 11 && digits.startsWith("1")));
      if (!ok) return "Enter the number to connect people to when they press 1, with its country code, for example +14155550134.";
    }
    return null;
  }

  // ---------- the list ----------

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
        <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Progress</th><th></th></tr></thead>
        <tbody>
          ${campaigns
            .map((c) => {
              const broadcast = c.mode === "recording";
              const hasFile = broadcast && c.recording && c.recording.file;
              return `
            <tr>
              <td>${escapeHtml(c.name)}</td>
              <td>${broadcast ? "Voice broadcast" : "Manual"}</td>
              <td><span class="status status-${c.status === "Active" ? "ok" : "pending"}">${escapeHtml(c.status)}</span></td>
              <td class="mono">${broadcast || c.queue_total > 0 ? `${c.queue_completed + c.queue_failed}/${c.queue_total}` : "—"}</td>
              <td class="row-actions">
                ${c.mode === "manual" && c.list_id ? `<button data-action="power" data-id="${c.id}" data-name="${escapeHtml(c.name)}">Power dial</button>` : ""}
                ${
                  broadcast
                    ? c.status === "Active"
                      ? `<button data-action="pause" data-id="${c.id}">Pause</button>`
                      : `<button data-action="start" data-id="${c.id}">${c.queue_total > 0 ? "Resume" : "Start"} broadcast</button>`
                    : ""
                }
                ${hasFile ? `<button data-action="test" data-id="${c.id}" data-name="${escapeHtml(c.name)}">Test call</button>` : ""}
                ${broadcast && c.queue_total > 0 ? `<button data-action="log" data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-status="${c.status}">Log</button>` : ""}
                ${broadcast && c.queue_total > 0 ? `<button data-action="again" data-id="${c.id}" data-name="${escapeHtml(c.name)}">Call again</button>` : ""}
                ${broadcast ? `<button data-action="recording" data-id="${c.id}" data-name="${escapeHtml(c.name)}">Recording</button>` : ""}
              </td>
            </tr>
          `;
            })
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
        if (action === "power") void window.KchelPower.start({ id, name });
        if (action === "recording") void openRecording(id, name);
        if (action === "test") openTestCall(id, name);
        if (action === "again") void openRecall(id, name);
      });
    });
  }

  /** The recording and what happens around it, for one campaign. */
  async function openRecording(id, name) {
    try {
      await ensureOptions();
      const list = await window.kchel.api("campaigns/list", {});
      const campaign = list.campaigns.find((c) => c.id === id);
      const settings = Object.assign({}, options.defaults, campaign && campaign.recording);
      const savedKey = settings.file ? settings.file.key : null;

      els.modalRoot.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal modal-wide">
            <h2>${escapeHtml(name)} · recording and options</h2>
            <div id="rec-form"></div>
            <div class="modal-actions" style="margin-top:12px">
              <button type="button" id="rec-cancel">Cancel</button>
              <button type="button" id="rec-save-test">Save and test</button>
              <button type="button" id="rec-save">Save</button>
            </div>
            <p class="hint" id="rec-hint"></p>
          </div>
        </div>`;
      const form = recordingForm(document.getElementById("rec-form"), settings, savedKey);
      const hint = document.getElementById("rec-hint");

      async function save() {
        const next = form.read();
        const problem = recordingProblem(next);
        if (problem) {
          hint.textContent = problem;
          return false;
        }
        hint.textContent = "Saving…";
        try {
          await window.kchel.api("campaigns/update", { id, recording: next });
          hint.textContent = "";
          return next;
        } catch (err) {
          hint.textContent = err.message;
          return false;
        }
      }

      document.getElementById("rec-cancel").addEventListener("click", () => {
        form.discardUnsaved();
        closeModal();
      });
      document.getElementById("rec-save").addEventListener("click", async () => {
        if (!(await save())) return;
        closeModal();
        window.KchelUi.toast("Saved. Applies to the next call placed.", "info");
        await load();
      });
      document.getElementById("rec-save-test").addEventListener("click", async () => {
        const saved = await save();
        if (!saved) return;
        if (!saved.file) {
          hint.textContent = "Upload the recording first.";
          return;
        }
        closeModal();
        await load();
        openTestCall(id, name);
      });
    } catch (err) {
      window.KchelUi.toast(err.message, "error");
    }
  }

  /** Rings your own phone with the campaign's recording, exactly as a contact would hear it. */
  function openTestCall(id, name) {
    els.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h2>Send me a test call</h2>
          <p class="hint">${escapeHtml(name)} rings the number below and plays the recording just as a contact would hear it. Your keys work too, so press them to try them.</p>
          <label>Your mobile number<input id="tc-phone" type="text" placeholder="+14155550134" /></label>
          <div class="modal-actions" style="margin-top:12px">
            <button type="button" id="tc-cancel">Cancel</button>
            <button type="button" id="tc-go">Call me</button>
          </div>
          <p class="hint" id="tc-hint"></p>
        </div>
      </div>`;
    document.getElementById("tc-cancel").addEventListener("click", closeModal);
    document.getElementById("tc-go").addEventListener("click", async () => {
      const hint = document.getElementById("tc-hint");
      const to = document.getElementById("tc-phone").value.trim();
      if (!to) {
        hint.textContent = "Enter your mobile number.";
        return;
      }
      hint.textContent = "Calling…";
      try {
        const result = await window.kchel.api("campaigns/test-call", { campaignId: id, to });
        closeModal();
        window.KchelUi.toast("Calling " + result.to + ". Pick up to hear it.", "info");
      } catch (err) {
        hint.textContent = err.message;
      }
    });
  }

  /** Put the people whose last call ended a certain way back in the queue. */
  async function openRecall(id, name) {
    try {
      const result = await window.kchel.api("campaigns/outcomes", { campaignId: id });
      const U = window.KchelUi;
      const preset = ["no_answer", "voicemail"];
      const body = result.outcomes.length
        ? result.outcomes
            .map(
              (o) =>
                `<label class="checkbox-row"><input type="checkbox" data-key="${U.esc(o.key)}" ${preset.includes(o.key) ? "checked" : ""} /> ${U.esc(o.label)} <span class="hint">${o.count}</span></label>`,
            )
            .join("")
        : '<p class="hint">No finished calls to choose from yet.</p>';
      const m = U.modal({
        title: "Call people again · " + name,
        html:
          '<p class="hint">Choose who goes back in the queue. Do-not-call contacts and people who pressed 1 are never included.</p>' +
          body +
          (result.outcomes.length ? '<div class="modal-actions" style="margin-top:12px"><button id="rc-go">Queue them again</button></div>' : "") +
          '<p class="hint" id="rc-hint"></p>',
      });
      const go = m.el.querySelector("#rc-go");
      if (!go) return;
      go.addEventListener("click", async () => {
        const keys = [...m.el.querySelectorAll("input[data-key]:checked")].map((x) => x.dataset.key);
        const hint = m.el.querySelector("#rc-hint");
        try {
          const done = await window.kchel.api("campaigns/recall", { campaignId: id, outcomes: keys });
          m.close();
          U.toast(done.requeued + " queued again. Press Resume broadcast to call them.", "info");
          await load();
        } catch (err) {
          hint.textContent = err.message;
        }
      });
    } catch (err) {
      window.KchelUi.toast(err.message, "error");
    }
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
              <td>${r.status === "completed" ? "Reached" : escapeHtml(r.status)}</td>
              <td>${escapeHtml(r.outcome || "—")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  // ---------- new campaign ----------

  async function openNewCampaignModal() {
    let lists = [];
    try {
      await ensureOptions();
    } catch (err) {
      window.KchelUi.toast(err.message, "error");
      return;
    }
    try {
      const meta = await window.kchel.api("contacts/meta", {});
      lists = meta.lists;
    } catch {
      // The list dropdown just comes back empty — the form still surfaces
      // "Choose a contact list" clearly enough if none load.
    }

    els.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal modal-wide">
          <h2>New campaign</h2>
          <form id="new-campaign-form" class="stack">
            <label>Name<input id="nc-name" type="text" required /></label>
            <div class="toggle-row">
              <button type="button" id="nc-mode-manual" class="toggle-btn active">Manual dialing</button>
              <button type="button" id="nc-mode-rec" class="toggle-btn">Voice broadcast</button>
            </div>
            <p class="hint" id="nc-mode-hint"></p>
            <label>Contact list
              <select id="nc-list-id">
                <option value="">Choose a list…</option>
                ${lists.map((l) => `<option value="${l.id}">${escapeHtml(l.name)} (${l.contact_count})</option>`).join("")}
              </select>
            </label>
            <div id="nc-rec-fields" class="hidden">
              <div id="nc-rec-form"></div>
              <div class="checkbox-row">
                <input id="nc-compliance" type="checkbox" />
                <label for="nc-compliance">I confirm these contacts agreed to receive recorded calls, the recording says who is calling, and I will follow the calling rules where I operate.</label>
              </div>
              <p class="hint">Saved as a draft. Use Test call to hear it, then Start broadcast from the list.</p>
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

    const MODE_HINTS = {
      manual: "Choose a list to power-dial it from the Dialer, one contact after another.",
      recording:
        "Your recording is played automatically to everyone on the list who answers. You can add keys to connect them to a person or to stop future calls.",
    };
    const form = recordingForm(document.getElementById("nc-rec-form"), options.defaults, null);
    let mode = "manual";
    const setMode = (m) => {
      mode = m;
      document.getElementById("nc-mode-manual").classList.toggle("active", m === "manual");
      document.getElementById("nc-mode-rec").classList.toggle("active", m === "recording");
      document.getElementById("nc-rec-fields").classList.toggle("hidden", m !== "recording");
      document.getElementById("nc-mode-hint").textContent = MODE_HINTS[m];
    };
    setMode("manual");
    document.getElementById("nc-mode-manual").addEventListener("click", () => setMode("manual"));
    document.getElementById("nc-mode-rec").addEventListener("click", () => setMode("recording"));
    document.getElementById("nc-cancel").addEventListener("click", () => {
      form.discardUnsaved();
      closeModal();
    });

    document.getElementById("new-campaign-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const hint = document.getElementById("nc-hint");
      try {
        const listId = document.getElementById("nc-list-id").value || undefined;
        const recording = mode === "recording" ? form.read() : undefined;
        if (mode === "recording") {
          if (!listId) throw new Error("Choose a contact list.");
          if (!recording.file) throw new Error("Upload the recording first.");
          const problem = recordingProblem(recording);
          if (problem) throw new Error(problem);
          if (!document.getElementById("nc-compliance").checked) throw new Error("Confirm the consent checkbox first.");
        }
        await window.kchel.api("campaigns/create", {
          name: document.getElementById("nc-name").value.trim(),
          mode,
          listId,
          recording,
          complianceAck: mode === "recording" ? true : undefined,
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
      document.addEventListener("kchel:power-closed", () => void load());
      void load();
    },
  };
})();
