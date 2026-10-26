"use strict";

(function () {
  const els = {
    table: document.getElementById("extensions-table"),
    hint: document.getElementById("extensions-hint"),
    btnNew: document.getElementById("btn-new-extension"),
    modalRoot: document.getElementById("modal-root"),
  };

  const TYPES = ["User", "Department", "Ring group"];
  let initialized = false;
  let extensions = [];

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  function uid() {
    return "ext_" + Math.random().toString(36).slice(2, 10);
  }

  function render() {
    if (extensions.length === 0) {
      els.table.innerHTML =
        '<p class="hint" style="padding:20px">No extensions yet — add a user, department or ring group that inbound callers can be routed to.</p>';
      return;
    }
    els.table.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Extension</th><th>Label</th><th>Type</th><th>Forwards to</th><th></th></tr></thead>
        <tbody>
          ${extensions
            .map(
              (ext) => `
            <tr>
              <td class="mono">${escapeHtml(ext.number)}</td>
              <td>${escapeHtml(ext.label)}</td>
              <td>${escapeHtml(ext.type)}</td>
              <td>${escapeHtml(ext.forwardsTo) || "—"}</td>
              <td class="row-actions">
                <button data-action="edit" data-id="${ext.id}">Edit</button>
                <button data-action="delete" data-id="${ext.id}">Delete</button>
              </td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>`;

    els.table.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener("click", () => openEditor(extensions.find((e) => e.id === btn.dataset.id)));
    });
    els.table.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ext = extensions.find((e) => e.id === btn.dataset.id);
        if (!ext) return;
        const ok = await window.KchelUi.confirm({
          title: `Delete extension ${ext.number}?`,
          message: "Any IVR menu pointing at this extension will need to be updated.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (ok) {
          extensions = extensions.filter((e) => e.id !== ext.id);
          render();
          void persist();
        }
      });
    });
  }

  function closeModal() {
    els.modalRoot.innerHTML = "";
  }

  function openEditor(existing) {
    const ext = existing || { id: "", number: "", label: "", type: "User", forwardsTo: "" };
    els.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h2>${existing ? `Edit extension ${escapeHtml(ext.number)}` : "Add extension"}</h2>
          <form id="ext-form" class="stack">
            <label>Number<input id="ext-number" type="text" placeholder="200" value="${escapeHtml(ext.number)}" required /></label>
            <label>Label<input id="ext-label" type="text" placeholder="Sales desk" value="${escapeHtml(ext.label)}" required /></label>
            <label>Type
              <select id="ext-type">
                ${TYPES.map((t) => `<option ${t === ext.type ? "selected" : ""}>${t}</option>`).join("")}
              </select>
            </label>
            <label>Forwards to <span class="hint-inline">(voicemail, or a mobile number)</span>
              <input id="ext-forward" type="text" value="${escapeHtml(ext.forwardsTo)}" />
            </label>
            <p class="hint" id="ext-error"></p>
            <div class="modal-actions">
              <button type="button" id="ext-cancel">Cancel</button>
              <button type="submit">${existing ? "Save changes" : "Add extension"}</button>
            </div>
          </form>
        </div>
      </div>`;

    document.getElementById("ext-cancel").addEventListener("click", closeModal);
    document.getElementById("ext-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const number = document.getElementById("ext-number").value.trim();
      const label = document.getElementById("ext-label").value.trim();
      if (!number || !label) {
        document.getElementById("ext-error").textContent = "Extension number and label are required.";
        return;
      }
      if (extensions.some((x) => x.number === number && x.id !== ext.id)) {
        document.getElementById("ext-error").textContent = `Extension ${number} already exists.`;
        return;
      }
      const next = {
        id: ext.id || uid(),
        number,
        label,
        type: document.getElementById("ext-type").value,
        forwardsTo: document.getElementById("ext-forward").value.trim(),
      };
      extensions = existing ? extensions.map((x) => (x.id === ext.id ? next : x)) : [...extensions, next];
      closeModal();
      render();
      void persist();
    });
  }

  // Re-read the live config before saving so edits made on the IVR or
  // Voicemail pages in the same session are never overwritten.
  async function persist() {
    els.hint.textContent = "Saving…";
    try {
      const { config } = await window.kchel.api("phone-system/get", {});
      await window.kchel.api("phone-system/save", {
        menus: config.menus,
        extensions,
        routing: config.routing,
        businessHours: config.businessHours,
        voicemail: config.voicemail,
      });
      els.hint.textContent = "Saved.";
    } catch (err) {
      els.hint.textContent = err.message;
    }
  }

  async function load() {
    try {
      const { config } = await window.kchel.api("phone-system/get", {});
      extensions = config.extensions || [];
      render();
    } catch (err) {
      els.hint.textContent = err.message;
    }
  }

  window.KchelExtensions = {
    init() {
      if (initialized) return;
      initialized = true;
      els.btnNew.addEventListener("click", () => openEditor(null));
      void load();
    },
  };
})();
