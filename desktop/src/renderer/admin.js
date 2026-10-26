"use strict";

// Super admin: platform-wide view, only reachable for platform admins.
(function () {
  const U = window.KchelUi;
  const api = (route, body) => window.kchel.api(route, body || {});
  const root = document.getElementById("view-admin");
  const TABS = [
    ["overview", "Platform"],
    ["tenants", "Workspaces"],
    ["revenue", "Revenue"],
    ["health", "System health"],
    ["tickets", "Support"],
  ];
  const STATUSES = ["Open", "In progress", "Waiting on customer", "Escalated", "Resolved"];
  const money = (n) => "$" + Number(n || 0).toLocaleString();

  let started = false;
  let me = null;
  let tab = "overview";

  function shell(inner) {
    root.innerHTML = U.header("Super admin", "Platform-wide view across every workspace.") + inner;
  }

  function showUnlock(message) {
    shell(`
      <div class="panel stack" style="max-width:420px">
        <p class="eyebrow">Admin verification</p>
        <p class="hint">${U.esc(message || "Platform admin tools need a one-time code sent to " + me.email + ".")}</p>
        <button id="adm-send">Email me a code</button>
        <form id="adm-form" class="stack hidden">
          <label>6-digit code<input id="adm-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" /></label>
          <button type="submit">Unlock</button>
        </form>
        <p class="hint" id="adm-hint"></p>
      </div>`);
    const hint = document.getElementById("adm-hint");
    document.getElementById("adm-send").addEventListener("click", async () => {
      hint.textContent = "Sending…";
      try {
        await window.kchel.adminRequestCode(me.email);
        hint.textContent = "Code sent — check your email.";
        document.getElementById("adm-form").classList.remove("hidden");
        document.getElementById("adm-code").focus();
      } catch (err) {
        hint.textContent = err.message;
      }
    });
    document.getElementById("adm-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      hint.textContent = "Checking…";
      try {
        await window.kchel.adminVerifyCode(me.email, document.getElementById("adm-code").value.trim());
        me.isSuperAdmin = true;
        void render();
      } catch (err) {
        hint.textContent = err.message;
      }
    });
  }

  async function render() {
    shell(`<div class="toggle-row">${TABS.map(([k, l]) => `<button class="toggle-btn ${k === tab ? "active" : ""}" data-tab="${k}">${l}</button>`).join("")}</div><div data-body><p class="hint">Loading…</p></div>`);
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; void render(); }));
    const body = root.querySelector("[data-body]");
    try {
      await PANES[tab](body);
    } catch (err) {
      if (/super|admin|permission|not allowed/i.test(err.message)) {
        showUnlock();
        return;
      }
      body.innerHTML = `<p class="hint status-error" style="padding:14px;border-radius:12px">${U.esc(err.message)}</p>`;
    }
  }

  const PANES = {
    async overview(body) {
      const d = await api("admin/overview");
      const t = d.totals;
      body.innerHTML = `
        <div class="stats">
          ${U.stat("MRR", money(t.mrr))}
          ${U.stat("Workspaces", t.tenants, t.activeTenants + " active · " + t.pendingTenants + " pending")}
          ${U.stat("New this month", t.newThisMonth)}
          ${U.stat("Calls today", t.callsToday, t.callsActive + " live")}
          ${U.stat("Total calls", t.calls)}
          ${U.stat("Talk time (month)", U.dur(t.talkSecondsMonth))}
          ${U.stat("Users / agents", t.users + " / " + t.agents)}
          ${U.stat("Contacts", t.contacts.toLocaleString())}
          ${U.stat("SMS sent", t.smsSent)}
        </div>
        <div class="panel"><p class="eyebrow">New workspaces · 6 months</p>${U.bars(d.growth, "month", "tenants")}</div>
        <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Plan mix</p>${U.table(
          ["Plan", "Workspaces", "MRR"],
          d.plans.map((p) => [U.esc(p.plan), U.esc(String(p.tenants)), U.esc(money(p.mrr))]),
          "No paying workspaces yet.",
        )}</div>
        <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Largest workspaces</p>${U.table(
          ["Workspace", "Plan", "Status", "Users", "Contacts", "Calls"],
          d.largest.map((w) => [U.esc(w.name), U.esc(w.plan), U.esc(w.status), U.esc(String(w.users)), U.esc(String(w.contacts)), U.esc(String(w.calls))]),
          "No workspaces yet.",
        )}</div>`;
    },

    async tenants(body) {
      const d = await api("admin/tenants");
      body.innerHTML = `<div class="panel table-panel">${U.table(
        ["Workspace", "Owner", "Plan", "Status", "Users", "Dialer", "SIP"],
        d.tenants.map((t) => [
          `${U.esc(t.name)}<br><span class="hint mono">${U.esc(t.workspace_slug)}</span>`,
          U.esc(t.owner_email || "—"),
          U.esc(t.plan),
          `<select data-status="${t.id}">${["active", "pending", "suspended"].map((s) => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select>`,
          U.esc(String(t.user_count)),
          `<input type="checkbox" data-dialer="${t.id}" ${t.dialer_addon_enabled ? "checked" : ""} />`,
          `<input type="checkbox" data-sip="${t.id}" ${t.sip_addon_enabled ? "checked" : ""} />`,
        ]),
        "No workspaces.",
      )}</div>`;
      const act = (route, payload, okMsg) =>
        api(route, payload).then(
          () => U.toast(okMsg, "info"),
          (err) => { U.toast(err.message, "error"); void render(); },
        );
      body.querySelectorAll("[data-status]").forEach((s) => s.addEventListener("change", () => act("admin/tenant-status", { id: s.dataset.status, status: s.value }, "Status updated")));
      body.querySelectorAll("[data-dialer]").forEach((c) => c.addEventListener("change", () => act("admin/set-dialer", { tenantId: c.dataset.dialer, enabled: c.checked }, "Dialer add-on updated")));
      body.querySelectorAll("[data-sip]").forEach((c) => c.addEventListener("change", () => act("admin/set-sip", { tenantId: c.dataset.sip, enabled: c.checked }, "SIP add-on updated")));
    },

    async revenue(body) {
      const d = await api("admin/revenue");
      body.innerHTML = `
        <div class="stats">
          ${U.stat("MRR (active)", money(d.mrr))}
          ${U.stat("Wallet top-ups", "$" + (d.topupCents / 100).toLocaleString())}
          ${U.stat("Wallet balances", "$" + (d.walletCents / 100).toLocaleString())}
        </div>
        <div class="panel table-panel">${U.table(
          ["Workspace", "Plan", "Seats", "MRR", "Talk time", "SMS", "Wallet"],
          d.tenants.map((t) => [U.esc(t.name), U.esc(t.plan), U.esc(String(t.seats)), U.esc(money(t.mrr)), U.esc(U.dur(t.talk_seconds)), U.esc(String(t.sms_sent)), U.esc("$" + (t.wallet_cents / 100).toFixed(2))]),
          "No workspaces.",
        )}</div>`;
    },

    async health(body) {
      const d = await api("admin/health");
      body.innerHTML = `
        <div class="stats">
          ${U.stat("Live calls", d.activeCalls)}
          ${U.stat("Calls today", d.callsToday, d.failedToday + " failed · " + d.failureRate.toFixed(1) + "%")}
          ${U.stat("SIP trunks", d.trunksActive + " / " + d.trunksTotal, d.trunksFailed + " failing")}
        </div>
        <div class="panel"><p class="eyebrow">Calls today by hour</p>${U.bars(d.hourly, "hour", "calls")}</div>
        <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Registration failures</p>${U.table(
          ["Workspace", "Error", "When"],
          d.failures.map((f) => [U.esc(f.tenant_name), U.esc(f.last_error), U.esc(U.when(f.updated_at))]),
          "No failing trunks.",
        )}</div>`;
    },

    async tickets(body) {
      const d = await api("admin/tickets");
      body.innerHTML = `<div class="panel table-panel">${U.table(
        ["Ref", "Workspace", "Subject", "Priority", "Status", "Updated", ""],
        d.tickets.map((t) => [
          `<span class="mono">${U.esc(t.ticket_ref)}</span>`,
          U.esc(t.tenant_name || "—"),
          U.esc(t.subject),
          U.esc(t.priority),
          `<select data-tk="${t.id}">${STATUSES.map((s) => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select>`,
          U.esc(U.when(t.updated_at)),
          `<span class="row-actions"><button data-tk-del="${t.id}">Delete</button></span>`,
        ]),
        "No tickets.",
      )}</div>`;
      body.querySelectorAll("[data-tk]").forEach((s) =>
        s.addEventListener("change", () =>
          api("admin/ticket-update", { id: s.dataset.tk, status: s.value }).then(
            () => U.toast("Ticket updated", "info"),
            (err) => U.toast(err.message, "error"),
          ),
        ),
      );
      body.querySelectorAll("[data-tk-del]").forEach((b) =>
        b.addEventListener("click", async () => {
          const ok = await U.confirm({ title: "Delete ticket?", message: "This can't be undone.", confirmLabel: "Delete", danger: true });
          if (!ok) return;
          try {
            await api("admin/ticket-delete", { id: b.dataset.tkDel });
            void render();
          } catch (err) {
            U.toast(err.message, "error");
          }
        }),
      );
    },
  };

  window.KchelAdmin = {
    async init() {
      if (started) return;
      started = true;
      shell('<p class="hint">Loading…</p>');
      try {
        me = await api("me");
      } catch (err) {
        shell(`<p class="hint status-error">${U.esc(err.message)}</p>`);
        return;
      }
      if (!me.canAdmin) {
        shell('<p class="hint">This account is not a platform administrator.</p>');
        return;
      }
      if (!me.isSuperAdmin) {
        showUnlock();
        return;
      }
      void render();
    },
  };
})();
