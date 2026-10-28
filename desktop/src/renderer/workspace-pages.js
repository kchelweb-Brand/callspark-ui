"use strict";

// Managed pages: Agents, SMS, Phone numbers, Billing, Support.
(function () {
  const U = window.KchelUi;
  const api = (route, body) => window.kchel.api(route, body || {});
  const $ = (id) => document.getElementById(id);

  function skeleton(root, title, sub, actions) {
    root.innerHTML = U.header(title, sub, actions) + '<div data-body><p class="hint">Loading…</p></div>';
  }

  function showError(root, err) {
    root.querySelector("[data-body]").innerHTML = `<p class="hint status-error" style="padding:14px;border-radius:12px">${U.esc(err.message)}</p>`;
  }

  function openLink(url) {
    if (/^https:\/\//.test(url)) window.open(url);
  }

  // ---------- Agents ----------
  const agents = (() => {
    const root = $("view-agents");
    const STATUSES = ["Available", "On call", "Wrap-up", "Offline"];
    const ROLES = ["Agent", "Team lead", "Supervisor", "Admin"];
    let started = false;

    async function load() {
      try {
        const d = await api("agents/list");
        const body = root.querySelector("[data-body]");
        const ACCESS = { invited: ["Invited", "pending"], active: ["Active", "ok"], disabled: ["Access off", "error"] };
        body.innerHTML = `<div class="panel table-panel">${U.table(
          ["Agent", "Login", "Role", "Status", "Today", ""],
          d.agents.map((a) => {
            const acc = ACCESS[a.access] || ["No login", ""];
            return [
              `${U.esc(a.name)} <span class="mono hint">ext ${U.esc(a.extension || "—")}</span><br><span class="hint">${U.esc(a.email || "")}</span>`,
              `<span class="status status-${acc[1]}">${acc[0]}</span>${a.last_seen_at ? `<br><span class="hint">seen ${U.esc(U.when(a.last_seen_at))}</span>` : ""}`,
              U.esc(a.role),
              `<select data-status="${a.id}">${STATUSES.map((s) => `<option ${s === a.status ? "selected" : ""}>${s}</option>`).join("")}</select>`,
              `${U.esc(String(a.calls_today ?? 0))} calls<br><span class="hint">${U.esc(U.dur(a.talk_seconds))} talk</span>`,
              `<span class="row-actions">
                ${a.user_id ? `<button data-msg="${a.id}">Message</button><button data-task="${a.id}">Task</button><button data-access="${a.id}">Access</button>` : ""}
                ${a.access === "invited" ? `<button data-resend="${a.id}">Resend invite</button>` : ""}
                ${a.access === "disabled" ? `<button data-enable="${a.id}">Turn on</button>` : a.access ? `<button data-disable="${a.id}">Turn off</button>` : ""}
                <button data-del="${a.id}" data-name="${U.esc(a.name)}">Remove</button></span>`,
            ];
          }),
          "No agents yet. Invite your first one.",
        )}</div>`;
        const find = (id) => d.agents.find((x) => x.id === id);
        body.querySelectorAll("[data-msg]").forEach((b) => b.addEventListener("click", () => window.KchelTeam.messagesFor(find(b.dataset.msg))));
        body.querySelectorAll("[data-task]").forEach((b) => b.addEventListener("click", () => window.KchelTeam.tasksFor(find(b.dataset.task))));
        body.querySelectorAll("[data-access]").forEach((b) =>
          b.addEventListener("click", () => {
            const ag = find(b.dataset.access);
            window.KchelTeam.accessModal({
              title: "What " + ag.name + " can do",
              submitLabel: "Save access",
              perms: ag.permissions,
              onSubmit: async (_v, permissions) => {
                await api("agents/update", { id: ag.id, permissions });
                U.toast("Access updated. It applies straight away.", "info");
                void load();
              },
            });
          }),
        );
        body.querySelectorAll("[data-resend]").forEach((b) =>
          b.addEventListener("click", () => api("agents/resend-invite", { id: b.dataset.resend }).then(() => U.toast("Invitation sent again", "info"), (e) => U.toast(e.message, "error"))),
        );
        const setAccess = (id, access) => api("agents/update", { id, access }).then(() => { U.toast(access === "disabled" ? "Access turned off" : "Access turned on", "info"); void load(); }, (e) => U.toast(e.message, "error"));
        body.querySelectorAll("[data-disable]").forEach((b) => b.addEventListener("click", () => setAccess(b.dataset.disable, "disabled")));
        body.querySelectorAll("[data-enable]").forEach((b) => b.addEventListener("click", () => setAccess(b.dataset.enable, "enabled")));
        body.querySelectorAll("[data-status]").forEach((sel) =>
          sel.addEventListener("change", async () => {
            try {
              await api("agents/update", { id: sel.dataset.status, status: sel.value });
              U.toast("Status updated", "info");
            } catch (err) {
              U.toast(err.message, "error");
              void load();
            }
          }),
        );
        body.querySelectorAll("[data-del]").forEach((btn) =>
          btn.addEventListener("click", async () => {
            const ok = await U.confirm({ title: `Remove ${btn.dataset.name}?`, message: "Their login is removed, along with their tasks and messages.", confirmLabel: "Remove", danger: true });
            if (!ok) return;
            try {
              await api("agents/delete", { id: btn.dataset.del });
              void load();
            } catch (err) {
              U.toast(err.message, "error");
            }
          }),
        );
      } catch (err) {
        showError(root, err);
      }
    }

    function openAdd() {
      window.KchelTeam.accessModal({
        title: "Invite an agent",
        submitLabel: "Send invitation",
        fields: [
          { id: "name", label: "Name", required: true },
          { id: "email", label: "Email", type: "email", required: true },
          { id: "extension", label: "Extension (optional)" },
          { id: "role", label: "Role", type: "select", options: ROLES, value: "Agent" },
        ],
        onSubmit: async (v, permissions) => {
          await api("agents/create", { name: v.name, email: v.email, extension: v.extension || undefined, role: v.role, permissions });
          U.toast("Invitation sent to " + v.email, "info");
          void load();
        },
      });
    }

    return {
      init() {
        if (started) return;
        started = true;
        skeleton(root, "Agents", "Invite your team, choose what each person can do, and follow their day.", '<button id="btn-add-agent">Invite agent</button>');
        $("btn-add-agent").addEventListener("click", openAdd);
        void load();
      },
    };
  })();

  // ---------- SMS ----------
  const sms = (() => {
    const root = $("view-sms");
    let started = false;
    let lists = [];

    async function load() {
      try {
        const d = await api("sms/list");
        root.querySelector("[data-body]").innerHTML = `
          <p class="hint">Messages are queued for delivery by the platform. Replies appear in the web dashboard.</p>
          <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Campaigns</p>${U.table(
            ["Name", "List", "Status", "Sent", "Delivered", "Replies", ""],
            d.campaigns.map((c) => [
              U.esc(c.name),
              U.esc(c.list_name || "—"),
              `<span class="status status-${c.status === "Active" ? "ok" : "pending"}">${U.esc(c.status)}</span>`,
              U.esc(String(c.sent)),
              U.esc(String(c.delivered)),
              U.esc(String(c.replies)),
              `<span class="row-actions"><button data-toggle="${c.id}" data-next="${c.status === "Active" ? "Paused" : "Active"}">${c.status === "Active" ? "Pause" : "Resume"}</button></span>`,
            ]),
            "No SMS campaigns yet.",
          )}</div>
          <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Drafts</p>${U.table(
            ["List", "Message", "Saved", ""],
            d.drafts.map((x) => [
              U.esc(x.list_name || "—"),
              U.esc(x.body.length > 80 ? x.body.slice(0, 80) + "…" : x.body),
              U.esc(U.when(x.created_at)),
              `<span class="row-actions"><button data-draft-del="${x.id}">Delete</button></span>`,
            ]),
            "No drafts saved.",
          )}</div>`;
        root.querySelectorAll("[data-toggle]").forEach((b) =>
          b.addEventListener("click", async () => {
            try {
              await api("sms/update-campaign", { id: b.dataset.toggle, status: b.dataset.next });
              void load();
            } catch (err) {
              U.toast(err.message, "error");
            }
          }),
        );
        root.querySelectorAll("[data-draft-del]").forEach((b) =>
          b.addEventListener("click", async () => {
            try {
              await api("sms/delete-draft", { id: b.dataset.draftDel });
              void load();
            } catch (err) {
              U.toast(err.message, "error");
            }
          }),
        );
      } catch (err) {
        showError(root, err);
      }
    }

    async function openNew() {
      try {
        lists = (await api("contacts/meta")).lists || [];
      } catch {
        lists = [];
      }
      const fields = [
        { id: "name", label: "Campaign name", required: true },
        { id: "listName", label: "Contact list", type: "select", options: [{ value: "", label: "— none —" }, ...lists.map((l) => ({ value: l.name, label: `${l.name} (${l.contact_count})` }))], value: "" },
        { id: "body", label: "Message", type: "textarea", placeholder: "Hi {name}, …" },
      ];
      U.formModal({
        title: "New SMS campaign",
        submitLabel: "Schedule campaign",
        fields,
        onSubmit: async (v) => {
          if (!v.body) throw new Error("Write the message first.");
          await api("sms/create-campaign", { name: v.name, listName: v.listName || undefined, body: v.body, status: "Scheduled" });
          void load();
        },
      });
      const form = document.querySelector("#modal-root .modal-actions");
      const draft = document.createElement("button");
      draft.type = "button";
      draft.textContent = "Save as draft";
      draft.addEventListener("click", async () => {
        const body = $("mf-body").value.trim();
        try {
          await api("sms/save-draft", { listName: $("mf-listName").value || undefined, body });
          document.getElementById("modal-root").innerHTML = "";
          U.toast("Draft saved", "info");
          void load();
        } catch (err) {
          document.querySelector("#modal-root [data-error]").textContent = err.message;
        }
      });
      form.insertBefore(draft, form.lastElementChild);
    }

    return {
      init() {
        if (started) return;
        started = true;
        skeleton(root, "SMS", "Text campaigns to your contact lists.", '<button id="btn-new-sms">New campaign</button>');
        $("btn-new-sms").addEventListener("click", () => void openNew());
        void load();
      },
    };
  })();

  // ---------- Phone numbers ----------
  const numbers = (() => {
    const root = $("view-numbers");
    let started = false;
    let config = null;

    const clean = (n) => ({
      number: n.number,
      label: n.label ?? null,
      type: n.type ?? null,
      region: n.region ?? null,
      status: n.status ?? "Pending",
      ivrMenuId: n.ivr_menu_id ?? null,
      smsEnabled: Boolean(n.sms_enabled),
    });

    async function save(next) {
      await api("phone-system/save-numbers", { numbers: next.map(clean) });
      await load();
    }

    async function load() {
      try {
        const d = await api("phone-system/get");
        config = d.config;
        const menus = config.menus || [];
        const menuName = (id) => (menus.find((m) => m.id === id) || {}).name || "";
        root.querySelector("[data-body]").innerHTML = `
          <div class="panel table-panel">${U.table(
            ["Number", "Label", "Status", "Answers with", "SMS", ""],
            config.numbers.map((n) => [
              `<span class="mono">${U.esc(n.number)}</span>`,
              U.esc(n.label || "—"),
              `<span class="status status-${n.status === "Active" ? "ok" : "pending"}">${U.esc(n.status || "Pending")}</span>`,
              `<select data-menu="${U.esc(n.number)}"><option value="">Default routing</option>${menus
                .map((m) => `<option value="${U.esc(m.id)}" ${m.id === n.ivr_menu_id ? "selected" : ""}>${U.esc(m.name || menuName(m.id) || "Menu")}</option>`)
                .join("")}</select>`,
              n.sms_enabled ? "On" : "Off",
              `<span class="row-actions"><button data-rm="${U.esc(n.number)}">Remove</button></span>`,
            ]),
            "No phone numbers yet.",
          )}</div>`;
        root.querySelectorAll("[data-menu]").forEach((sel) =>
          sel.addEventListener("change", async () => {
            try {
              await save(config.numbers.map((n) => (n.number === sel.dataset.menu ? { ...n, ivr_menu_id: sel.value || null } : n)));
              U.toast("Routing updated", "info");
            } catch (err) {
              U.toast(err.message, "error");
              void load();
            }
          }),
        );
        root.querySelectorAll("[data-rm]").forEach((b) =>
          b.addEventListener("click", async () => {
            const ok = await U.confirm({ title: `Remove ${b.dataset.rm}?`, message: "Calls to this number will stop reaching your workspace.", confirmLabel: "Remove", danger: true });
            if (!ok) return;
            try {
              await save(config.numbers.filter((n) => n.number !== b.dataset.rm));
            } catch (err) {
              U.toast(err.message, "error");
            }
          }),
        );
      } catch (err) {
        showError(root, err);
      }
    }

    function openAdd() {
      U.formModal({
        title: "Add phone number",
        submitLabel: "Add number",
        fields: [
          { id: "number", label: "Number (E.164)", placeholder: "+18665551234", required: true },
          { id: "label", label: "Label", placeholder: "Main line" },
        ],
        onSubmit: async (v) => {
          if (!/^\+\d{7,15}$/.test(v.number)) throw new Error("Use the international format, e.g. +18665551234.");
          if (config.numbers.some((n) => n.number === v.number)) throw new Error("That number is already added.");
          await save([...config.numbers, { number: v.number, label: v.label || null, status: "Pending" }]);
        },
      });
    }

    return {
      init() {
        if (started) return;
        started = true;
        skeleton(root, "Phone numbers", "The numbers callers dial, and which menu answers each one.", '<button id="btn-add-number">Add number</button>');
        $("btn-add-number").addEventListener("click", openAdd);
        void load();
      },
    };
  })();

  // ---------- Billing ----------
  const billing = (() => {
    const root = $("view-billing");
    let started = false;
    const LABELS = { agents: "Agents", contacts: "Contacts", campaigns: "Campaigns", ivrMenus: "IVR menus", phoneNumbers: "Phone numbers", calls: "Calls", smsCampaigns: "SMS campaigns" };

    const FEATURES = [
      ["powerDialer", "Power dialer"],
      ["missedCallTextBack", "Text-back"],
      ["numberRotation", "Number rotation"],
      ["callSummaries", "Call summaries"],
      ["aiReceptionist", "AI receptionist"],
    ];

    function addonRow(name, price, a, key) {
      const state = a.enabled ? '<span class="status status-ok">Active</span>' : a.requestedAt ? '<span class="status status-pending">Requested</span>' : "";
      const action = a.enabled ? "" : a.requestedAt ? "" : `<button data-addon="${key}">Request</button>`;
      return `<div class="addon-row"><div><strong>${U.esc(name)}</strong><p class="hint">${U.esc(price)}${a.includedInPlan ? " · included in your plan" : ""}</p></div><div>${state}${action}</div></div>`;
    }

    async function load() {
      try {
        const [u, p, a] = await Promise.all([api("billing/usage"), api("billing/plans"), api("billing/addons")]);
        const priceOf = (pl) => (pl.priceFlatMonthly ? `$${pl.priceFlatMonthly.toLocaleString()}/mo flat` : pl.price ? `$${pl.price}/agent/mo` : "Free trial");
        const trialLine = u.plan.id === "trial" ? (u.trialExpired ? "Your trial has ended." : `${u.daysRemaining} day(s) left in your trial.`) : "";
        root.querySelector("[data-body]").innerHTML = `
          <div class="panel">
            <p class="eyebrow">Current plan</p>
            <h2 style="margin:4px 0">${U.esc(u.plan.name)} <span class="hint">${U.esc(priceOf(u.plan))}</span></h2>
            <p class="hint">${U.esc(u.plan.blurb || "")} ${U.esc(trialLine)}</p>
          </div>
          <div class="panel"><p class="eyebrow">Usage</p>
            ${u.usage
              .map((x) => {
                const pct = x.limit == null ? 0 : Math.min(100, Math.round((x.used / Math.max(1, x.limit)) * 100));
                return `<div class="meter"><div class="meter-top"><span>${U.esc(LABELS[x.key] || x.key)}</span><span>${x.used} / ${x.limit == null ? "Unlimited" : x.limit}</span></div><div class="meter-bar"><i style="width:${pct}%" class="${pct >= 90 ? "hot" : ""}"></i></div></div>`;
              })
              .join("")}
          </div>
          <div class="panel"><p class="eyebrow">Add-ons</p>
            ${addonRow("Kchel Dialer (desktop app)", "$500 one-time", a.dialer, "dialer")}
            ${addonRow("Managed SIP", "$200 add-on", a.sip, "sip")}
          </div>
          <div class="panel"><p class="eyebrow">Plans</p>
            <div class="plan-grid">${p.plans
              .filter((pl) => pl.id !== "trial")
              .map((pl) => {
                const opts = (p.checkout || []).filter((o) => o.planId === pl.id && o.interval === "monthly");
                return `<div class="plan-card ${pl.id === u.plan.id ? "current" : ""}">
                  <strong>${U.esc(pl.name)}</strong><p class="plan-price">${U.esc(priceOf(pl))}</p>
                  <p class="hint">${U.esc(pl.blurb || "")}</p>
                  <p class="hint">${pl.limits.agents ?? "∞"} agents · ${pl.limits.contacts?.toLocaleString() ?? "∞"} contacts · ${pl.limits.ivrMenus ?? "∞"} IVR · ${pl.limits.phoneNumbers ?? "∞"} numbers</p>
                  <p class="hint">${FEATURES.filter(([k]) => pl.features && pl.features[k]).map(([, l]) => l).join(" · ")}</p>
                  ${pl.id === u.plan.id ? '<span class="status status-ok">Current</span>' : opts.map((o) => `<button data-pay="${U.esc(o.url)}">${o.seats} seat${o.seats > 1 ? "s" : ""} · $${o.amountUsd}/mo · ${U.esc(o.label || "Pay")}</button>`).join("") + (opts.length ? `<button data-claim="${U.esc(pl.id)}" class="link-btn">I've paid</button>` : "") || `<button data-plan="${U.esc(pl.id)}">Request ${U.esc(pl.name)}</button>`}
                </div>`;
              })
              .join("")}</div>
          </div>`;
        root.querySelectorAll("[data-pay]").forEach((b) => b.addEventListener("click", () => openLink(b.dataset.pay)));
        root.querySelectorAll("[data-claim]").forEach((b) =>
          b.addEventListener("click", () => {
            const options = (p.checkout || []).filter((o) => o.planId === b.dataset.claim && o.interval === "monthly");
            const m = U.modal({
              title: "Tell us you've paid",
              html:
                '<p class="hint">We\'ll confirm the payment and activate your plan. Add something we can find: a transaction ID, a receipt number, or the name you paid with. Never type a gift card code or card number here.</p>' +
                `<label>Which payment<select id="claim-which">${options.map((o, i) => `<option value="${i}">${o.seats} seat${o.seats > 1 ? "s" : ""} · $${o.amountUsd} · ${U.esc(o.label || o.method)}</option>`).join("")}</select></label>` +
                '<label>Reference<input id="claim-ref" type="text" maxlength="300" /></label>' +
                '<div class="modal-actions" style="margin-top:12px"><button id="claim-send">Send</button></div><p class="hint" id="claim-hint"></p>',
            });
            m.el.querySelector("#claim-send").addEventListener("click", async () => {
              const o = options[Number(m.el.querySelector("#claim-which").value)];
              try {
                await api("billing/claim-payment", { planId: o.planId, seats: o.seats, interval: o.interval, method: o.method, reference: m.el.querySelector("#claim-ref").value });
                m.close();
                U.toast("Thanks. We'll confirm it and activate your plan.", "info");
              } catch (err) {
                m.el.querySelector("#claim-hint").textContent = err.message;
              }
            });
          }),
        );
        root.querySelectorAll("[data-plan]").forEach((b) =>
          b.addEventListener("click", async () => {
            try {
              const r = await api("billing/request-plan", { planId: b.dataset.plan });
              U.toast(r.alreadyRequested ? `You already have an open request (${r.ticketRef}). We'll reply in Support.` : `Request sent (${r.ticketRef}). We'll reply in Support.`, "info");
            } catch (err) {
              U.toast(err.message, "error");
            }
          }),
        );
        root.querySelectorAll("[data-addon]").forEach((b) =>
          b.addEventListener("click", async () => {
            try {
              await api(b.dataset.addon === "dialer" ? "billing/request-dialer" : "billing/request-sip");
              U.toast("Request sent — we'll be in touch.", "info");
              void load();
            } catch (err) {
              U.toast(err.message, "error");
            }
          }),
        );
      } catch (err) {
        showError(root, err);
      }
    }

    return {
      init() {
        if (started) return;
        started = true;
        skeleton(root, "Billing", "Your plan, usage and add-ons.");
        void load();
      },
    };
  })();

  // ---------- Support ----------
  const support = (() => {
    const root = $("view-support");
    let started = false;

    async function load() {
      try {
        const d = await api("support/list");
        root.querySelector("[data-body]").innerHTML = `<div class="panel table-panel">${U.table(
          ["Ref", "Subject", "Status", "Updated", ""],
          d.tickets.map((t) => [
            `<span class="mono">${U.esc(t.ticket_ref)}</span>`,
            `${U.esc(t.subject)}${t.customer_unread ? ' <span class="status status-ok">New reply</span>' : ""}`,
            `<span class="status status-${t.status === "Resolved" ? "ok" : "pending"}">${U.esc(t.status)}</span>`,
            U.esc(U.when(t.updated_at)),
            `<span class="row-actions"><button data-open="${t.id}">Open</button></span>`,
          ]),
          "No requests yet. Message us if something isn't working.",
        )}</div>`;
        root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openThread(b.dataset.open)));
      } catch (err) {
        showError(root, err);
      }
    }

    async function openThread(id) {
      let data;
      try {
        data = await api("support/thread", { id });
      } catch (err) {
        U.toast(err.message, "error");
        return;
      }
      const m = U.modal({
        title: `${data.ticket.ticket_ref} · ${data.ticket.subject}`,
        wide: true,
        html: `<p class="hint">Status: ${U.esc(data.ticket.status)}</p>
          <div id="thread-box">${U.thread(data.messages, "customer")}</div>
          <form id="thread-form" class="stack"><textarea id="thread-text" rows="3" maxlength="4000" placeholder="Write a reply…"></textarea>
          <p class="hint" id="thread-hint"></p><button type="submit">Send reply</button></form>`,
      });
      const box = m.el.querySelector("#thread-box");
      box.scrollTop = box.scrollHeight;
      m.el.querySelector("#thread-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = m.el.querySelector("#thread-text");
        const hint = m.el.querySelector("#thread-hint");
        hint.textContent = "Sending…";
        try {
          const r = await api("support/reply", { id, body: text.value });
          box.innerHTML = U.thread(r.messages, "customer");
          box.scrollTop = box.scrollHeight;
          text.value = "";
          hint.textContent = "";
          void load();
        } catch (err) {
          hint.textContent = err.message;
        }
      });
      void load();
    }

    function openNew() {
      U.formModal({
        title: "Message support",
        submitLabel: "Submit",
        fields: [
          { id: "subject", label: "Subject", required: true },
          { id: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"], value: "Medium" },
          { id: "body", label: "What's happening?", type: "textarea" },
        ],
        onSubmit: async (v) => {
          await api("support/create", { subject: v.subject, body: v.body, priority: v.priority });
          U.toast("Message sent. We'll reply here and by email.", "info");
          void load();
        },
      });
    }

    return {
      init() {
        if (started) return;
        started = true;
        skeleton(root, "Support", "Message our team and follow the conversation here.", '<button id="btn-new-ticket">New message</button>');
        $("btn-new-ticket").addEventListener("click", openNew);
        void load();
      },
    };
  })();

  window.KchelAgents = agents;
  window.KchelSms = sms;
  window.KchelNumbers = numbers;
  window.KchelBilling = billing;
  window.KchelSupport = support;
})();
