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
    ["outreach", "Outreach"],
    ["payments", "Payment links"],
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

    // Payment links: regional prices and other ways to pay (crypto, gift card, bank).
    async payments(body) {
      const d = await api("admin/payment-links");
      const regionName = (id) => (d.regions.find((r) => r.id === id) || {}).label || id;
      const opt = (items, value) => items.map((i) => `<option value="${U.esc(i.id)}" ${i.id === value ? "selected" : ""}>${U.esc(i.label)}</option>`).join("");
      const plans = ["starter", "professional", "business", "managed"];
      body.innerHTML = `
        <div class="panel stack">
          <p class="eyebrow">How this works</p>
          <p class="hint">Each link is a fixed-amount payment page you create at your payment provider. Customers see the links for their own region, and a regional link replaces the standard one for the same plan, seats, interval and method. Paying activates nothing by itself: you confirm the money and activate the plan. Customers tell you they've paid from Billing, and it arrives in Support.</p>
        </div>
        <div class="panel stack" id="pl-form">
          <p class="eyebrow" id="pl-title">Add link</p>
          <div class="perm-grid">
            <label>Region<select id="pl-region">${opt(d.regions, "default")}</select></label>
            <label>Paid by<select id="pl-method">${opt(d.methods, "crypto")}</select></label>
            <label>Plan<select id="pl-plan">${plans.map((p) => `<option value="${p}">${p}</option>`).join("")}</select></label>
            <label>Billing<select id="pl-interval"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
            <label>Seats<input id="pl-seats" type="number" min="1" value="1" /></label>
            <label>Amount in US dollars<input id="pl-amount" type="number" min="1" step="0.01" /></label>
          </div>
          <label>Button text (optional)<input id="pl-label" type="text" maxlength="60" placeholder="Crypto (USDT)" /></label>
          <label>Payment link<input id="pl-url" type="text" placeholder="https://" /></label>
          <label class="inline"><input id="pl-active" type="checkbox" checked /> Show to customers</label>
          <div class="row-actions"><button id="pl-save">Save link</button><button id="pl-cancel" class="hidden">Cancel edit</button><span class="hint" id="pl-hint"></span></div>
        </div>
        <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Links</p>${U.table(
          ["Plan", "Region", "Paid by", "Amount", "Link", ""],
          d.links.map((l) => [
            U.esc(`${l.plan_id} · ${l.seats} seat${l.seats === 1 ? "" : "s"} · ${l.interval}`),
            U.esc(regionName(l.region)),
            U.esc(l.method + (l.label ? " · " + l.label : "") + (l.active ? "" : " (hidden)")),
            U.esc("$" + l.amount_usd),
            `<span class="mono">${U.esc(l.url.slice(0, 40))}</span>`,
            `<button data-edit="${l.id}">Edit</button> <button data-del="${l.id}">Delete</button>`,
          ]),
          "Nothing added yet. The built-in card links keep working.",
        )}</div>`;

      const $ = (id) => document.getElementById(id);
      let editing = null;
      const reset = () => {
        editing = null;
        $("pl-title").textContent = "Add link";
        $("pl-cancel").classList.add("hidden");
        $("pl-url").value = "";
        $("pl-label").value = "";
        $("pl-amount").value = "";
      };
      $("pl-cancel").addEventListener("click", reset);
      body.querySelectorAll("[data-edit]").forEach((b) =>
        b.addEventListener("click", () => {
          const l = d.links.find((x) => x.id === b.dataset.edit);
          if (!l) return;
          editing = l.id;
          $("pl-title").textContent = "Edit link";
          $("pl-cancel").classList.remove("hidden");
          $("pl-region").value = l.region;
          $("pl-method").value = l.method;
          $("pl-plan").value = l.plan_id;
          $("pl-interval").value = l.interval;
          $("pl-seats").value = l.seats;
          $("pl-amount").value = l.amount_usd;
          $("pl-label").value = l.label;
          $("pl-url").value = l.url;
          $("pl-active").checked = l.active;
        }),
      );
      body.querySelectorAll("[data-del]").forEach((b) =>
        b.addEventListener("click", async () => {
          try {
            await api("admin/payment-link-delete", { id: b.dataset.del });
            await PANES.payments(body);
          } catch (err) {
            U.toast(err.message, "error");
          }
        }),
      );
      $("pl-save").addEventListener("click", async () => {
        $("pl-hint").textContent = "Saving…";
        try {
          await api("admin/payment-link-save", {
            id: editing || undefined,
            region: $("pl-region").value,
            method: $("pl-method").value,
            planId: $("pl-plan").value,
            interval: $("pl-interval").value,
            seats: Number($("pl-seats").value),
            amountUsd: Number($("pl-amount").value),
            label: $("pl-label").value,
            url: $("pl-url").value,
            active: $("pl-active").checked,
          });
          U.toast("Saved", "info");
          await PANES.payments(body);
        } catch (err) {
          $("pl-hint").textContent = err.message;
        }
      });
    },

    // Outreach: tell every user (or a chosen group) about an update.
    async outreach(body) {
      const d = await api("admin/broadcasts");
      body.innerHTML = `
        <div class="panel stack">
          <p class="eyebrow">New announcement</p>
          <label>Title<input id="bc-title" type="text" maxlength="150" placeholder="New: power dialer is live" /></label>
          <label>What changed<textarea id="bc-body" rows="4" maxlength="4000" placeholder="Explain the update in a few sentences."></textarea></label>
          <label>How to use it (one step per line, optional)<textarea id="bc-how" rows="4" maxlength="2000" placeholder="Open Campaigns&#10;Pick a contact list&#10;Press Power dial"></textarea></label>
          <div class="perm-grid">
            <label>Link (optional)<input id="bc-link" type="text" placeholder="https://..." /></label>
            <label>Link button text<input id="bc-linklabel" type="text" maxlength="60" placeholder="Read the guide" /></label>
          </div>
          <p class="eyebrow">Who gets it</p>
          <div class="perm-grid">
            <label>People<select id="bc-roles"><option value="all">Everyone (owners and agents)</option><option value="owners">Workspace owners only</option><option value="agents">Agents only</option></select></label>
            <label>Plan<select id="bc-plan"><option value="">All plans</option>${d.plans.map((p) => `<option value="${U.esc(p)}">${U.esc(p)}</option>`).join("")}</select></label>
            <label>Workspace<select id="bc-tenant"><option value="">All workspaces</option>${d.tenants.map((t) => `<option value="${t.id}">${U.esc(t.name)}</option>`).join("")}</select></label>
          </div>
          <label class="inline"><input id="bc-email" type="checkbox" /> Also send as an email</label>
          <p class="hint" id="bc-count">Counting...</p>
          <div class="row-actions"><button id="bc-send">Send announcement</button><span class="hint" id="bc-hint"></span></div>
        </div>
        <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Sent</p>${U.table(
          ["Announcement", "Sent to", "Opened", "Email", "When"],
          d.broadcasts.map((b) => [
            `<strong>${U.esc(b.title)}</strong><br><span class="hint">${U.esc(b.body.slice(0, 90))}</span>`,
            U.esc(String(b.recipient_count)),
            U.esc(b.read_count + " (" + (b.recipient_count ? Math.round((b.read_count / b.recipient_count) * 100) : 0) + "%)"),
            b.send_email ? U.esc(b.email_sent + " sent" + (b.email_failed ? ", " + b.email_failed + " failed" : "")) : "-",
            U.esc(U.when(b.created_at)),
          ]),
          "Nothing sent yet.",
        )}</div>`;

      const audience = () => {
        const plan = document.getElementById("bc-plan").value;
        const tenant = document.getElementById("bc-tenant").value;
        return { roles: document.getElementById("bc-roles").value, plans: plan ? [plan] : [], tenantIds: tenant ? [tenant] : [] };
      };
      let countTimer = null;
      const refreshCount = () => {
        clearTimeout(countTimer);
        countTimer = setTimeout(async () => {
          const el = document.getElementById("bc-count");
          if (!el) return;
          try {
            const r = await api("admin/broadcast-audience", { audience: audience() });
            el.textContent = r.users + " people in " + r.workspaces + " workspace" + (r.workspaces === 1 ? "" : "s") + " will get this.";
          } catch (err) {
            el.textContent = err.message;
          }
        }, 250);
      };
      ["bc-roles", "bc-plan", "bc-tenant"].forEach((id) => document.getElementById(id).addEventListener("change", refreshCount));
      refreshCount();

      document.getElementById("bc-send").addEventListener("click", async () => {
        const hint = document.getElementById("bc-hint");
        const title = document.getElementById("bc-title").value.trim();
        const text = document.getElementById("bc-body").value.trim();
        if (!title || !text) {
          hint.textContent = "Add a title and a message first.";
          return;
        }
        const count = document.getElementById("bc-count").textContent;
        const ok = await U.confirm({ title: "Send to everyone selected?", message: count + " It cannot be unsent.", confirmLabel: "Send now" });
        if (!ok) return;
        hint.textContent = "Sending...";
        try {
          const r = await api("admin/broadcast-send", {
            title,
            body: text,
            howTo: document.getElementById("bc-how").value,
            linkUrl: document.getElementById("bc-link").value,
            linkLabel: document.getElementById("bc-linklabel").value,
            audience: audience(),
            sendEmail: document.getElementById("bc-email").checked,
          });
          U.toast("Sent to " + r.recipients + " people" + (r.emailSent ? " (" + r.emailSent + " emailed)" : ""), "info");
          void render();
        } catch (err) {
          hint.textContent = err.message;
        }
      });
    },

    // Support inbox: every customer conversation on the left, the open thread
    // and who the customer is on the right.
    async tickets(body) {
      const d = await api("admin/conversations");
      let filter = "all";
      let activeId = null;

      const visible = () =>
        d.conversations.filter((c) =>
          filter === "unread" ? c.admin_unread : filter === "open" ? c.status !== "Resolved" : true,
        );

      body.innerHTML = `
        <div class="toggle-row">
          <button class="toggle-btn active" data-f="all">All (${d.conversations.length})</button>
          <button class="toggle-btn" data-f="unread">Needs reply (${d.unread})</button>
          <button class="toggle-btn" data-f="open">Open</button>
        </div>
        <div class="inbox">
          <div class="inbox-list" id="inbox-list"></div>
          <div class="inbox-view" id="inbox-view"><p class="hint" style="padding:18px">Pick a conversation to read and reply.</p></div>
        </div>`;

      const list = body.querySelector("#inbox-list");
      const view = body.querySelector("#inbox-view");

      function renderList() {
        const items = visible();
        list.innerHTML = items.length
          ? items
              .map(
                (c) => `<button class="inbox-item ${c.id === activeId ? "active" : ""}" data-id="${c.id}">
                  <span class="inbox-top"><strong>${U.esc(c.tenant_name || "No workspace")}</strong>${c.admin_unread ? '<i class="dot"></i>' : ""}</span>
                  <span class="inbox-sub">${c.plan_name ? `<span class="chip">${U.esc(c.plan_name)}</span>` : ""}<span class="chip chip-${c.status === "Resolved" ? "ok" : "warn"}">${U.esc(c.status)}</span>${c.priority === "High" ? '<span class="chip chip-hot">High</span>' : ""}</span>
                  <span class="inbox-subject">${U.esc(c.subject)}</span>
                  <span class="inbox-preview">${U.esc((c.last_message || "").slice(0, 90))}</span>
                  <span class="inbox-time">${U.esc(U.when(c.updated_at))}</span>
                </button>`,
              )
              .join("")
          : '<p class="hint" style="padding:18px">Nothing here.</p>';
        list.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => openConversation(b.dataset.id)));
      }

      body.querySelectorAll("[data-f]").forEach((b) =>
        b.addEventListener("click", () => {
          filter = b.dataset.f;
          body.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("active", x === b));
          renderList();
        }),
      );

      function customerCard(c) {
        if (!c) return '<div class="customer-card"><p class="hint">This ticket isn\'t linked to a workspace.</p></div>';
        const rows = [
          ["Workspace", `${U.esc(c.name)} <span class="hint mono">${U.esc(c.workspace_slug)}</span>`],
          ["Plan", `${U.esc(c.plan_name)} · $${Number(c.monthly_usd).toLocaleString()}/mo`],
          ["Account", U.esc(c.status)],
          ["Owner", U.esc(c.owner_email || "—")],
          ["Signed up as", U.esc([c.contact_name, c.company_name].filter(Boolean).join(" · ") || "—")],
          ["Phone", U.esc(c.contact_phone ? c.contact_phone + (c.phone_verified ? " (verified)" : " (not verified)") : "—")],
          ["Location", U.esc(c.location || "—")],
          ["Website", U.esc(c.website || "—")],
          ["Customer since", U.esc(U.when(c.created_at))],
          c.trial_ends_at ? ["Trial ends", U.esc(U.when(c.trial_ends_at))] : null,
          ["Users / agents", `${c.user_count} / ${c.agent_count}`],
          ["Contacts", Number(c.contact_count).toLocaleString()],
          ["Phone numbers", String(c.number_count)],
          ["Calls", `${Number(c.call_count).toLocaleString()} · last ${U.esc(c.last_call_at ? U.when(c.last_call_at) : "never")}`],
          ["Add-ons", [c.dialer_addon ? "Dialer" : "", c.sip_addon ? "Managed SIP" : ""].filter(Boolean).join(", ") || "None"],
          ["Support", `${c.open_ticket_count} open · ${c.ticket_count} total`],
        ].filter(Boolean);
        return `<div class="customer-card"><p class="eyebrow">Customer</p>${rows.map(([k, v]) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`).join("")}</div>`;
      }

      async function openConversation(id) {
        activeId = id;
        renderList();
        view.innerHTML = '<p class="hint" style="padding:18px">Loading…</p>';
        let data;
        try {
          data = await api("admin/conversation", { id });
        } catch (err) {
          view.innerHTML = `<p class="hint status-error" style="padding:14px">${U.esc(err.message)}</p>`;
          return;
        }
        const t = data.ticket;
        const row = d.conversations.find((c) => c.id === id);
        if (row) row.admin_unread = false;
        renderList();

        view.innerHTML = `
          <div class="inbox-head">
            <div><p class="eyebrow">${U.esc(t.ticket_ref)}</p><h3>${U.esc(t.subject)}</h3></div>
            <div class="row-actions">
              <select id="inbox-status">${STATUSES.map((s) => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select>
              <button id="inbox-del" class="btn-danger">Delete</button>
            </div>
          </div>
          ${customerCard(data.customer)}
          <div id="inbox-thread">${U.thread(data.messages, "support")}</div>
          <form id="inbox-form" class="stack">
            <textarea id="inbox-text" rows="4" maxlength="4000" placeholder="Reply to ${U.esc(data.customer ? data.customer.name : "the customer")}…"></textarea>
            <div class="row-actions">
              <label class="inline">After sending, mark as
                <select id="inbox-after"><option>Waiting on customer</option><option>In progress</option><option>Resolved</option></select>
              </label>
              <button type="submit">Send reply</button>
            </div>
            <p class="hint" id="inbox-hint"></p>
          </form>`;

        const thread = view.querySelector("#inbox-thread");
        thread.scrollTop = thread.scrollHeight;

        view.querySelector("#inbox-status").addEventListener("change", (e) =>
          api("admin/ticket-update", { id, status: e.target.value }).then(
            () => {
              U.toast("Status updated", "info");
              if (row) row.status = e.target.value;
              renderList();
            },
            (err) => U.toast(err.message, "error"),
          ),
        );
        view.querySelector("#inbox-del").addEventListener("click", async () => {
          const ok = await U.confirm({ title: "Delete conversation?", message: "The whole thread is removed for good.", confirmLabel: "Delete", danger: true });
          if (!ok) return;
          try {
            await api("admin/ticket-delete", { id });
            d.conversations = d.conversations.filter((c) => c.id !== id);
            activeId = null;
            view.innerHTML = '<p class="hint" style="padding:18px">Deleted.</p>';
            renderList();
          } catch (err) {
            U.toast(err.message, "error");
          }
        });
        view.querySelector("#inbox-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const hint = view.querySelector("#inbox-hint");
          const text = view.querySelector("#inbox-text");
          hint.textContent = "Sending…";
          try {
            const r = await api("admin/reply", { id, body: text.value, status: view.querySelector("#inbox-after").value });
            thread.innerHTML = U.thread(r.messages, "support");
            thread.scrollTop = thread.scrollHeight;
            text.value = "";
            hint.textContent = "Sent. The customer was emailed.";
            view.querySelector("#inbox-status").value = r.status;
            if (row) {
              row.status = r.status;
              row.last_message = r.messages[r.messages.length - 1].body;
              row.updated_at = new Date().toISOString();
            }
            renderList();
          } catch (err) {
            hint.textContent = err.message;
          }
        });
      }

      renderList();
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
