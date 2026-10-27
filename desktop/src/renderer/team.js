"use strict";

// Team features: the agent's own home, tasks, direct messages, the notification
// bell and the role-aware menu. The same screens serve both sides: an owner
// sees the whole team, an agent sees only their own work.
(function () {
  const U = window.KchelUi;
  const api = (route, body) => window.kchel.api(route, body || {});
  const $ = (id) => document.getElementById(id);
  const esc = U.esc;

  let me = null;
  let pollTimer = null;
  let seen = new Set();
  let firstPoll = true;
  let lastCounts = {};

  const PRESETS = {
    caller: { dial: true, powerDialer: true, contacts: "assigned", editContacts: false, callHistory: "own", recordings: false },
    senior: { dial: true, powerDialer: true, contacts: "all", editContacts: true, callHistory: "own", recordings: true },
    supervisor: { dial: true, powerDialer: true, contacts: "all", editContacts: true, callHistory: "all", recordings: true },
  };

  const isAgent = () => Boolean(me && me.isAgent);
  const go = (view) => window.showView(view);

  function showError(root, err) {
    const body = root.querySelector("[data-body]") || root;
    body.innerHTML = `<p class="hint status-error" style="padding:14px;border-radius:12px">${esc(err.message)}</p>`;
  }

  function dueLabel(t) {
    if (!t.due_at) return "No due date";
    const text = U.when(t.due_at);
    return t.overdue ? `Overdue · ${text}` : `Due ${text}`;
  }

  // ---------- who can see what ----------

  function applyRole() {
    const nav = document.querySelector(".sidebar");
    if (!nav) return;
    const p = (me && me.permissions) || {};
    const allowed = new Set(["agenthome", "tasks", "messages", "history"]);
    if (p.dial) allowed.add("dialer");
    if (p.contacts && p.contacts !== "none") allowed.add("contacts");
    if (p.recordings) allowed.add("recordings");

    $("nav-agenthome").classList.toggle("hidden", !isAgent());
    $("nav-tasks-label").textContent = isAgent() ? "My tasks" : "Team tasks";

    if (isAgent()) {
      nav.querySelectorAll(".nav-item[data-view]").forEach((b) => b.classList.toggle("hidden", !allowed.has(b.dataset.view)));
      $("admin-nav").classList.add("hidden");
    }
    // Hide any group heading with nothing visible beneath it.
    let heading = null;
    let any = false;
    const flush = () => heading && heading.classList.toggle("hidden", !any);
    nav.querySelectorAll(".nav-group, .nav-item[data-view], #admin-nav").forEach((el) => {
      if (el.classList.contains("nav-group")) {
        flush();
        heading = el;
        any = false;
      } else if (el.id !== "admin-nav" && !el.classList.contains("hidden")) any = true;
    });
    flush();
  }

  // ---------- notifications ----------

  function openLinkTarget(n) {
    if (!n.link) return;
    if (/^https?:\/\//.test(n.link)) {
      window.open(n.link);
    } else if (n.link.startsWith("messages")) {
      const id = n.link.split(":")[1];
      if (id) messages.focus(id);
      go("messages");
    } else if (n.link === "tasks" || n.link === "team-tasks") go("tasks");
  }

  function showAnnouncement(n) {
    const link = n.link && /^https?:\/\//.test(n.link) ? n.link : null;
    const m = U.modal({
      title: n.title,
      wide: true,
      html: `<p class="summary-text">${esc(n.body || "")}</p>${link ? `<p><button data-open-link>Open link</button></p>` : ""}`,
    });
    const btn = m.el.querySelector("[data-open-link]");
    if (btn) btn.addEventListener("click", () => window.open(link));
  }

  function renderBell(data) {
    const total = data.unread || 0;
    for (const id of ["bell-badge", "bell-badge-m"]) {
      const el = $(id);
      el.textContent = total > 99 ? "99+" : String(total);
      el.classList.toggle("hidden", total === 0);
    }
    const setBadge = (id, n) => {
      const el = $(id);
      el.textContent = String(n);
      el.classList.toggle("hidden", !n);
    };
    setBadge("badge-tasks", (data.byKind && data.byKind.task) || 0);
    setBadge("badge-messages", (data.byKind && data.byKind.message) || 0);

    const panel = $("bell-panel");
    if (panel.classList.contains("hidden")) return;
    panel.innerHTML = `
      <div class="bell-head"><strong>Notifications</strong><button data-act="read-all">Mark all read</button></div>
      <div class="bell-list">${
        data.notifications.length
          ? data.notifications
              .map(
                (n) => `<button class="bell-item-row ${n.read_at ? "" : "unread"}" data-nid="${n.id}">
                  <span class="bell-kind kind-${esc(n.kind)}">${esc(n.kind === "announcement" ? "Update" : n.kind)}</span>
                  <strong>${esc(n.title)}</strong>
                  ${n.body ? `<span class="bell-body">${esc(n.body.slice(0, 140))}</span>` : ""}
                  <span class="bell-time">${esc(U.when(n.created_at))}</span>
                </button>`,
              )
              .join("")
          : '<p class="hint" style="padding:18px">Nothing yet.</p>'
      }</div>`;
    panel.querySelector("[data-act='read-all']").addEventListener("click", async () => {
      await api("notifications/read", { all: true }).catch(() => {});
      void poll();
    });
    panel.querySelectorAll("[data-nid]").forEach((b) =>
      b.addEventListener("click", async () => {
        const n = data.notifications.find((x) => x.id === b.dataset.nid);
        if (!n) return;
        await api("notifications/read", { ids: [n.id] }).catch(() => {});
        panel.classList.add("hidden");
        if (n.kind === "announcement") showAnnouncement(n);
        else openLinkTarget(n);
        void poll();
      }),
    );
  }

  function pushNative(n) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission !== "denied") {
        const show = () => new Notification(n.title, { body: (n.body || "").slice(0, 160) });
        if (Notification.permission === "granted") show();
        else Notification.requestPermission().then((p) => p === "granted" && show());
      }
    } catch {
      // Desktop pop-ups are a nicety; the in-app toast already told them.
    }
  }

  let lastData = null;
  async function poll() {
    try {
      const data = await api("notifications/list", { limit: 30 });
      lastData = data;
      const fresh = data.notifications.filter((n) => !n.read_at && !seen.has(n.id));
      data.notifications.forEach((n) => seen.add(n.id));
      if (!firstPoll) {
        fresh.slice(0, 3).forEach((n) => {
          U.toast(n.title, "info");
          pushNative(n);
        });
      }
      firstPoll = false;
      lastCounts = data.byKind || {};
      renderBell(data);
    } catch {
      // Offline or signed out: try again next tick.
    }
  }

  function toggleBell(e) {
    e.stopPropagation();
    const panel = $("bell-panel");
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden") && lastData) renderBell(lastData);
    document.getElementById("screen-app").classList.remove("nav-open");
  }

  // ---------- access / permissions modal ----------

  /**
   * Fields plus the permission switches an owner can set for an agent.
   * `fields`: [{id,label,type,value,options,required}] shown above the switches.
   */
  function accessModal({ title, submitLabel, fields, perms, onSubmit }) {
    const p = Object.assign({}, PRESETS.caller, perms || {});
    const yn = (v) => (v ? "1" : "0");
    const sel = (id, label, value, options) =>
      `<label>${esc(label)}<select id="ac-${id}">${options.map(([v, l]) => `<option value="${v}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    const field = (f) =>
      f.type === "select"
        ? `<label>${esc(f.label)}<select id="af-${f.id}">${f.options.map((o) => `<option ${o === f.value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`
        : `<label>${esc(f.label)}<input id="af-${f.id}" type="${f.type || "text"}" value="${esc(f.value || "")}" ${f.required ? "required" : ""} /></label>`;
    const m = U.modal({
      title,
      wide: true,
      html: `<form class="stack" id="ac-form">
        ${(fields || []).map(field).join("")}
        <p class="eyebrow">What they can do</p>
        <div class="toggle-row">
          <button type="button" class="toggle-btn" data-preset="caller">Caller</button>
          <button type="button" class="toggle-btn" data-preset="senior">Senior</button>
          <button type="button" class="toggle-btn" data-preset="supervisor">Supervisor</button>
        </div>
        <div class="perm-grid">
          ${sel("dial", "Place and answer calls", yn(p.dial), [["1", "Yes"], ["0", "No"]])}
          ${sel("powerDialer", "Power dialer", yn(p.powerDialer), [["1", "Yes"], ["0", "No"]])}
          ${sel("contacts", "Contacts they can see", p.contacts, [["none", "None"], ["assigned", "Only ones on their tasks"], ["all", "All contacts"]])}
          ${sel("editContacts", "Add new contacts", yn(p.editContacts), [["0", "No"], ["1", "Yes"]])}
          ${sel("callHistory", "Call history", p.callHistory, [["own", "Only their own calls"], ["all", "Everyone's calls"]])}
          ${sel("recordings", "Listen to recordings", yn(p.recordings), [["0", "No"], ["1", "Yes"]])}
        </div>
        <p class="hint">Agents never see billing, phone system, settings, automations or your team list. Change any of this later and it takes effect straight away.</p>
        <p class="hint status-error-text" data-error></p>
        <div class="modal-actions" style="margin-top:0"><button type="submit">${esc(submitLabel || "Save")}</button></div>
      </form>`,
    });
    const set = (preset) => {
      const x = PRESETS[preset];
      $("ac-dial").value = yn(x.dial);
      $("ac-powerDialer").value = yn(x.powerDialer);
      $("ac-contacts").value = x.contacts;
      $("ac-editContacts").value = yn(x.editContacts);
      $("ac-callHistory").value = x.callHistory;
      $("ac-recordings").value = yn(x.recordings);
    };
    m.el.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => set(b.dataset.preset)));
    m.el.querySelector("#ac-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = {};
      (fields || []).forEach((f) => (values[f.id] = $("af-" + f.id).value.trim()));
      const permissions = {
        dial: $("ac-dial").value === "1",
        powerDialer: $("ac-powerDialer").value === "1",
        contacts: $("ac-contacts").value,
        editContacts: $("ac-editContacts").value === "1",
        callHistory: $("ac-callHistory").value,
        recordings: $("ac-recordings").value === "1",
      };
      try {
        await onSubmit(values, permissions);
        m.close();
      } catch (err) {
        m.el.querySelector("[data-error]").textContent = err.message;
      }
    });
  }

  // ---------- agent home ----------

  const agentHome = (() => {
    const root = $("view-agenthome");
    let started = false;
    async function load() {
      try {
        const { home } = await api("agent/home");
        const h = home;
        const rate = h.today.calls ? Math.round((h.today.connected / h.today.calls) * 100) + "%" : "—";
        root.querySelector("[data-body]").innerHTML = `
          <div class="stats">
            ${U.stat("Calls today", h.today.calls, h.today.connected + " connected · " + rate)}
            ${U.stat("Talk time today", U.dur(h.today.talkSeconds))}
            ${U.stat("Open tasks", h.tasks.open, h.tasks.overdue ? h.tasks.overdue + " overdue" : h.tasks.dueToday + " due today")}
            ${U.stat("Unread messages", h.unreadMessages)}
          </div>
          <div class="panel">
            <p class="eyebrow">Up next</p>
            ${
              h.upcoming.length
                ? h.upcoming
                    .map(
                      (t) => `<div class="task-line"><span class="chip chip-${t.priority === "High" ? "hot" : t.priority === "Low" ? "ok" : "warn"}">${esc(t.priority)}</span><strong>${esc(t.title)}</strong><span class="hint ${t.overdue ? "status-error-text" : ""}">${esc(t.due_at ? (t.overdue ? "Overdue · " : "Due ") + U.when(t.due_at) : "No due date")}</span></div>`,
                    )
                    .join("")
                : '<p class="hint">Nothing waiting for you. Nice.</p>'
            }
            <div class="row-actions" style="margin-top:12px"><button data-go="tasks">All my tasks</button><button data-go="messages">Messages</button>${h.permissions.dial ? '<button data-go="dialer">Open dialer</button>' : ""}</div>
          </div>
          <div class="panel"><p class="eyebrow">This month</p>
            <div class="stats">${U.stat("Calls", h.month.calls)}${U.stat("Connected", h.month.connected)}${U.stat("Talk time", U.dur(h.month.talkSeconds))}</div>
          </div>`;
        root.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
        root.querySelector("[data-sub]").textContent = `${h.workspaceName}`;
      } catch (err) {
        showError(root, err);
      }
    }
    return {
      init() {
        if (!started) {
          started = true;
          root.innerHTML = U.header("My day", "", "") + '<div data-body><p class="hint">Loading…</p></div>';
          root.querySelector(".page-sub").setAttribute("data-sub", "");
        }
        void load();
      },
    };
  })();

  // ---------- tasks ----------

  const tasks = (() => {
    const root = $("view-tasks");
    let started = false;
    let filter = "open";
    let agentList = [];

    function priorityChip(p) {
      return `<span class="chip chip-${p === "High" ? "hot" : p === "Low" ? "ok" : "warn"}">${esc(p)}</span>`;
    }

    async function resolveContactId(phone) {
      if (!phone) return undefined;
      const r = await api("contacts/list", { search: phone, pageSize: 1 });
      if (!r.contacts.length) throw new Error("No contact has that phone number. Add them under Contacts first.");
      return r.contacts[0].id;
    }

    function taskFields(t) {
      return [
        { id: "assigneeId", label: "Assign to", type: "select", options: agentList.map((a) => ({ value: a.user_id, label: a.name })), value: t ? t.assignee_id : agentList[0] && agentList[0].user_id },
        { id: "title", label: "What needs doing?", required: true, value: t ? t.title : "" },
        { id: "details", label: "Details (optional)", type: "textarea", value: t ? t.details || "" : "" },
        { id: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"], value: t ? t.priority : "Medium" },
        { id: "dueAt", label: "Due (optional)", type: "datetime-local", value: t && t.due_at ? toLocalInput(t.due_at) : "" },
        ...(t ? [] : [{ id: "phone", label: "Contact's phone (optional)", placeholder: "+14155550134" }]),
      ];
    }
    function toLocalInput(iso) {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    async function openAssign(existing) {
      if (!agentList.length) {
        U.toast("Invite an agent first, under Agents. Only active agents can be given tasks.", "error");
        return;
      }
      U.formModal({
        title: existing ? "Edit task" : "Assign a task",
        submitLabel: existing ? "Save" : "Assign",
        fields: taskFields(existing),
        onSubmit: async (v) => {
          const dueAt = v.dueAt ? new Date(v.dueAt).toISOString() : existing ? null : undefined;
          if (existing) {
            await api("tasks/update", { id: existing.id, assigneeId: v.assigneeId, title: v.title, details: v.details, priority: v.priority, dueAt });
          } else {
            await api("tasks/create", { assigneeId: v.assigneeId, title: v.title, details: v.details, priority: v.priority, dueAt, contactId: await resolveContactId(v.phone) });
          }
          void load();
        },
      });
    }

    function askNote(task, status) {
      U.formModal({
        title: status === "Done" ? "Mark as done" : "Update task",
        submitLabel: "Save",
        fields: [{ id: "note", label: "Note for your team lead (optional)", type: "textarea", value: task.completion_note || "" }],
        onSubmit: async (v) => {
          await api("tasks/update", { id: task.id, status, note: v.note || undefined });
          void load();
        },
      });
    }

    async function load() {
      const body = root.querySelector("[data-body]");
      try {
        if (!isAgent() && !agentList.length) {
          const a = await api("agents/list");
          agentList = a.agents.filter((x) => x.user_id && x.access !== "disabled");
        }
        const d = await api("tasks/list", { status: filter === "open" ? "open" : undefined });
        if (isAgent()) {
          body.innerHTML = d.tasks.length
            ? d.tasks
                .map(
                  (t) => `<div class="panel task-card ${t.status === "Done" ? "done" : ""}">
                    <div class="task-top">${priorityChip(t.priority)}<span class="hint ${t.overdue ? "status-error-text" : ""}">${esc(dueLabel(t))}</span></div>
                    <h3>${esc(t.title)}</h3>
                    ${t.details ? `<p class="summary-text">${esc(t.details)}</p>` : ""}
                    ${t.contact_name ? `<p class="hint">Contact: <strong>${esc(t.contact_name)}</strong> <span class="mono">${esc(t.contact_phone || "")}</span></p>` : ""}
                    ${t.completion_note ? `<p class="hint">Your note: ${esc(t.completion_note)}</p>` : ""}
                    <div class="row-actions">
                      ${t.contact_phone && me.permissions && me.permissions.dial && t.status !== "Done" ? `<button data-call="${esc(t.contact_phone)}">Call now</button>` : ""}
                      ${t.status === "To do" ? `<button data-start="${t.id}">Start</button>` : ""}
                      ${t.status !== "Done" ? `<button data-done="${t.id}" class="primary">Mark done</button>` : `<button data-reopen="${t.id}">Reopen</button>`}
                    </div></div>`,
                )
                .join("")
            : `<div class="panel"><p class="hint">${filter === "open" ? "No open tasks. You're all caught up." : "No tasks yet."}</p></div>`;
          body.querySelectorAll("[data-call]").forEach((b) =>
            b.addEventListener("click", async () => {
              try {
                go("dialer");
                await window.KchelDialer.placeCall(b.dataset.call);
              } catch (err) {
                U.toast(err.message, "error");
              }
            }),
          );
          const byId = (id) => d.tasks.find((t) => t.id === id);
          body.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => api("tasks/update", { id: b.dataset.start, status: "In progress" }).then(load, (e) => U.toast(e.message, "error"))));
          body.querySelectorAll("[data-done]").forEach((b) => b.addEventListener("click", () => askNote(byId(b.dataset.done), "Done")));
          body.querySelectorAll("[data-reopen]").forEach((b) => b.addEventListener("click", () => api("tasks/update", { id: b.dataset.reopen, status: "To do" }).then(load, (e) => U.toast(e.message, "error"))));
        } else {
          body.innerHTML = `<div class="panel table-panel">${U.table(
            ["Task", "Agent", "Priority", "Due", "Status", ""],
            d.tasks.map((t) => [
              `<strong>${esc(t.title)}</strong>${t.details ? `<br><span class="hint">${esc(t.details.slice(0, 90))}</span>` : ""}${t.contact_name ? `<br><span class="hint">Contact: ${esc(t.contact_name)}</span>` : ""}${t.completion_note ? `<br><span class="hint">Note: ${esc(t.completion_note)}</span>` : ""}`,
              esc(t.assignee_name || t.assignee_email),
              priorityChip(t.priority),
              `<span class="${t.overdue ? "status-error-text" : ""}">${esc(t.due_at ? U.when(t.due_at) : "—")}</span>`,
              `<select data-st="${t.id}">${["To do", "In progress", "Done"].map((s) => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select>`,
              `<span class="row-actions"><button data-edit="${t.id}">Edit</button><button data-del="${t.id}">Delete</button></span>`,
            ]),
            filter === "open" ? "No open tasks. Assign one to get your team moving." : "No tasks yet.",
          )}</div>`;
          const byId = (id) => d.tasks.find((t) => t.id === id);
          body.querySelectorAll("[data-st]").forEach((s) => s.addEventListener("change", () => api("tasks/update", { id: s.dataset.st, status: s.value }).then(() => U.toast("Updated", "info"), (e) => U.toast(e.message, "error"))));
          body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openAssign(byId(b.dataset.edit))));
          body.querySelectorAll("[data-del]").forEach((b) =>
            b.addEventListener("click", async () => {
              const ok = await U.confirm({ title: "Delete this task?", message: "It disappears from the agent's list too.", confirmLabel: "Delete", danger: true });
              if (!ok) return;
              await api("tasks/delete", { id: b.dataset.del }).catch((e) => U.toast(e.message, "error"));
              void load();
            }),
          );
        }
      } catch (err) {
        showError(root, err);
      }
    }

    return {
      init() {
        if (started) {
          void load();
          return;
        }
        started = true;
        const toggles = `<div class="toggle-row"><button class="toggle-btn active" data-f="open">Open</button><button class="toggle-btn" data-f="all">All</button></div>`;
        root.innerHTML =
          U.header(isAgent() ? "My tasks" : "Team tasks", isAgent() ? "What your team lead has asked you to do." : "Assign work to your agents and follow it through.", isAgent() ? "" : '<button id="btn-assign">Assign task</button>') +
          toggles +
          '<div data-body><p class="hint">Loading…</p></div>';
        root.querySelectorAll("[data-f]").forEach((b) =>
          b.addEventListener("click", () => {
            filter = b.dataset.f;
            root.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("active", x === b));
            void load();
          }),
        );
        const assign = $("btn-assign");
        if (assign) assign.addEventListener("click", () => void openAssign());
        void load();
        api("notifications/read", { kind: "task" }).catch(() => {});
      },
      refreshAgents() {
        agentList = [];
      },
      openAssignFor(agent) {
        agentList = [agent, ...agentList.filter((a) => a.user_id !== agent.user_id)];
        go("tasks");
        void openAssign();
      },
    };
  })();

  // ---------- messages ----------

  const messages = (() => {
    const root = $("view-messages");
    let started = false;
    let activeAgent = null; // user id (owner view)
    let lastAt = null;
    let chatTimer = null;
    let threads = [];

    function bubble(m) {
      const own = isAgent() ? m.sender_role === "agent" : m.sender_role === "admin";
      const task = m.task_id
        ? `<div class="task-chip"><strong>Task</strong> ${esc(m.task_title || "(deleted)")} <span class="hint">${esc(m.task_status || "")}${m.task_due_at ? " · due " + esc(U.when(m.task_due_at)) : ""}</span></div>`
        : "";
      return `<div class="bubble ${own ? "bubble-own" : "bubble-other"}"><p class="bubble-meta">${esc(m.sender_email || (own ? "You" : "Team"))} · ${esc(U.when(m.created_at))}</p>${task}<p class="bubble-text">${esc(m.body)}</p></div>`;
    }

    function stopChatTimer() {
      clearInterval(chatTimer);
      chatTimer = null;
    }

    async function loadThread(initial) {
      const box = $("chat-box");
      if (!box) return;
      try {
        const r = await api("messages/thread", { agentUserId: isAgent() ? undefined : activeAgent, since: initial ? undefined : lastAt || undefined });
        if (initial) box.innerHTML = r.messages.length ? "" : '<p class="hint">No messages yet. Say hello.</p>';
        if (r.messages.length) {
          if (!initial && box.querySelector("p.hint")) box.innerHTML = "";
          box.insertAdjacentHTML("beforeend", r.messages.map(bubble).join(""));
          lastAt = r.messages[r.messages.length - 1].created_at;
          box.scrollTop = box.scrollHeight;
        }
      } catch (err) {
        if (initial) box.innerHTML = `<p class="hint status-error">${esc(err.message)}</p>`;
      }
    }

    function chatPane(taskOptions) {
      return `<div class="chat">
        <div id="chat-box" class="chat-box"><p class="hint">Loading…</p></div>
        <form id="chat-form" class="chat-form">
          <textarea id="chat-text" rows="2" maxlength="2000" placeholder="Write a message…"></textarea>
          ${taskOptions ? `<select id="chat-task"><option value="">No task attached</option>${taskOptions}</select>` : ""}
          <button type="submit">Send</button>
        </form></div>`;
    }

    function wireChat() {
      $("chat-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = $("chat-text");
        const body = text.value.trim();
        if (!body) return;
        try {
          await api("messages/send", { agentUserId: isAgent() ? undefined : activeAgent, body, taskId: ($("chat-task") && $("chat-task").value) || undefined });
          text.value = "";
          if ($("chat-task")) $("chat-task").value = "";
          await loadThread(false);
        } catch (err) {
          U.toast(err.message, "error");
        }
      });
      $("chat-text").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          $("chat-form").requestSubmit();
        }
      });
      stopChatTimer();
      chatTimer = setInterval(() => {
        if (root.classList.contains("hidden")) return stopChatTimer();
        void loadThread(false);
      }, 5000);
    }

    async function openOwnerThread(id) {
      activeAgent = id;
      lastAt = null;
      root.querySelectorAll("[data-agent]").forEach((b) => b.classList.toggle("active", b.dataset.agent === id));
      const pane = $("chat-pane");
      let taskOptions = "";
      try {
        const t = await api("tasks/list", { assigneeId: id, status: "open" });
        taskOptions = t.tasks.map((x) => `<option value="${x.id}">${esc(x.title)}</option>`).join("");
      } catch {
        // Attaching a task is optional.
      }
      pane.innerHTML = chatPane(taskOptions);
      wireChat();
      await loadThread(true);
      void refreshThreads(true);
    }

    async function refreshThreads(quiet) {
      try {
        const r = await api("messages/threads");
        threads = r.threads;
        const list = $("thread-list");
        if (!list) return;
        list.innerHTML = threads.length
          ? threads
              .map(
                (t) => `<button class="inbox-item ${t.agent_user_id === activeAgent ? "active" : ""}" data-agent="${t.agent_user_id}">
                  <span class="inbox-top"><strong>${esc(t.name || t.email)}</strong>${t.unread ? `<i class="badge">${t.unread}</i>` : ""}</span>
                  <span class="inbox-preview">${esc((t.last_message || "No messages yet").slice(0, 70))}</span>
                  ${t.status === "invited" ? '<span class="chip chip-warn">Invited</span>' : ""}
                </button>`,
              )
              .join("")
          : '<p class="hint" style="padding:14px">Invite an agent under Agents to start chatting.</p>';
        list.querySelectorAll("[data-agent]").forEach((b) => b.addEventListener("click", () => void openOwnerThread(b.dataset.agent)));
      } catch (err) {
        if (!quiet) showError(root, err);
      }
    }

    return {
      init() {
        if (!started) {
          started = true;
          root.innerHTML = U.header("Messages", isAgent() ? "Chat with your team lead." : "Chat with each of your agents.", "") + '<div data-body></div>';
        }
        const body = root.querySelector("[data-body]");
        if (isAgent()) {
          body.innerHTML = `<div id="chat-pane" class="panel">${chatPane("")}</div>`;
          wireChat();
          void loadThread(true);
        } else {
          body.innerHTML = `<div class="inbox"><div class="inbox-list" id="thread-list"><p class="hint">Loading…</p></div><div class="inbox-view" id="chat-pane"><p class="hint" style="padding:18px">Pick an agent to start chatting.</p></div></div>`;
          void refreshThreads(false).then(() => {
            const wanted = activeAgent || (threads[0] && threads[0].agent_user_id);
            if (wanted) void openOwnerThread(wanted);
          });
        }
        api("notifications/read", { kind: "message" }).catch(() => {});
      },
      focus(id) {
        activeAgent = id;
      },
      openFor(agent) {
        activeAgent = agent.user_id;
        go("messages");
      },
    };
  })();

  // ---------- lifecycle ----------

  window.KchelTeam = {
    accessModal,
    tasksFor: (agent) => tasks.openAssignFor(agent),
    messagesFor: (agent) => messages.openFor(agent),
    async start(meInfo) {
      me = meInfo;
      applyRole();
      if (!pollTimer) {
        seen = new Set();
        firstPoll = true;
        void poll();
        pollTimer = setInterval(poll, 20000);
      }
    },
    stop() {
      clearInterval(pollTimer);
      pollTimer = null;
      me = null;
      lastData = null;
    },
    isAgent,
  };

  window.KchelAgentHome = agentHome;
  window.KchelTasks = tasks;
  window.KchelMessages = messages;

  $("btn-bell").addEventListener("click", toggleBell);
  $("btn-bell-m").addEventListener("click", toggleBell);
  document.addEventListener("click", (e) => {
    const panel = $("bell-panel");
    if (!panel.classList.contains("hidden") && !panel.contains(e.target)) panel.classList.add("hidden");
  });
})();
