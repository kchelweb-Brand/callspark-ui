"use strict";

(function () {
  const els = {
    statusPanel: document.getElementById("sip-status-panel"),
    form: document.getElementById("form-sip"),
    label: document.getElementById("sip-label"),
    username: document.getElementById("sip-username"),
    password: document.getElementById("sip-password"),
    transport: document.getElementById("sip-transport"),
    host: document.getElementById("sip-host"),
    wssUrl: document.getElementById("sip-wss-url"),
    port: document.getElementById("sip-port"),
    realm: document.getElementById("sip-realm"),
    hint: document.getElementById("sip-hint"),
  };

  let initialized = false;

  function renderStatus(connection) {
    if (!connection) {
      els.statusPanel.innerHTML = '<p class="hint">No SIP connection configured yet.</p>';
      return;
    }
    els.statusPanel.innerHTML = `
      <div class="status-row">
        <span class="status status-${connection.status === "active" ? "ok" : connection.status === "failed" ? "error" : "pending"}">
          ${connection.status}
        </span>
        <span>${connection.label} — ${connection.sip_username}</span>
      </div>
      ${connection.last_error ? `<p class="hint" style="color:var(--danger)">${connection.last_error}</p>` : ""}
    `;
  }

  async function load() {
    try {
      const result = await window.kchel.api("sip/get", {});
      const c = result.connection;
      renderStatus(c);
      if (c) {
        els.label.value = c.label || "";
        els.username.value = c.sip_username || "";
        els.transport.value = c.sip_transport || "wss";
        els.host.value = c.sip_host || "";
        els.wssUrl.value = c.sip_wss_url || "";
        els.port.value = c.sip_port || "";
        els.realm.value = c.sip_realm || "";
      }
    } catch (err) {
      els.hint.textContent = err.message;
    }
  }

  function bind() {
    els.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      els.hint.textContent = "Saving…";
      try {
        const result = await window.kchel.api("sip/save-byo", {
          label: els.label.value.trim(),
          sipHost: els.host.value.trim(),
          sipWssUrl: els.wssUrl.value.trim(),
          sipUsername: els.username.value.trim(),
          sipPassword: els.password.value,
          sipRealm: els.realm.value.trim(),
          sipPort: els.port.value ? Number(els.port.value) : undefined,
          sipTransport: els.transport.value,
        });
        renderStatus(result.connection);
        els.password.value = "";
        els.hint.textContent = "Saved.";
      } catch (err) {
        els.hint.textContent = err.message;
      }
    });
  }

  window.KchelSipConfig = {
    init() {
      if (initialized) return;
      initialized = true;
      bind();
      void load();
    },
  };
})();
