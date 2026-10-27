"use strict";

(function () {
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  function toast(message, kind) {
    const root = document.getElementById("toast-root");
    const el = document.createElement("div");
    el.className = `toast toast-${kind || "info"}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add("toast-out");
      setTimeout(() => el.remove(), 250);
    }, 3500);
  }

  function confirmDialog({ title, message, confirmLabel, danger }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML = `
        <div class="modal modal-sm" role="dialog" aria-modal="true">
          <h2>${escapeHtml(title)}</h2>
          <p class="modal-text">${escapeHtml(message)}</p>
          <div class="modal-actions">
            <button type="button" data-result="no">Cancel</button>
            <button type="button" data-result="yes" class="${danger ? "btn-danger" : ""}">${escapeHtml(confirmLabel || "Confirm")}</button>
          </div>
        </div>`;
      const finish = (value) => {
        document.removeEventListener("keydown", onKey);
        backdrop.remove();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === "Escape") finish(false);
      };
      document.addEventListener("keydown", onKey);
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) finish(false);
        const result = e.target.dataset && e.target.dataset.result;
        if (result) finish(result === "yes");
      });
      document.body.appendChild(backdrop);
      backdrop.querySelector('[data-result="yes"]').focus();
    });
  }

  function dur(sec) {
    const n = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const r = n % 60;
    if (h) return h + "h " + m + "m";
    return m + ":" + String(r).padStart(2, "0");
  }

  function when(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function header(title, sub, actionsHtml) {
    return `<div class="page-header"><div><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-sub">${escapeHtml(sub)}</p></div>${actionsHtml ? `<div class="page-actions">${actionsHtml}</div>` : ""}</div>`;
  }

  function stat(label, value, sub) {
    return `<div class="stat"><p class="stat-label">${escapeHtml(label)}</p><p class="stat-value">${escapeHtml(String(value))}</p>${sub ? `<p class="stat-sub">${escapeHtml(sub)}</p>` : ""}</div>`;
  }

  function bars(items, labelKey, valueKey) {
    const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
    return `<div class="bars">${items
      .map((i) => {
        const v = Number(i[valueKey]) || 0;
        return `<div class="bar" title="${escapeHtml(String(i[labelKey]))}: ${v}"><i style="height:${Math.max(3, (v / max) * 100)}%"></i><span>${escapeHtml(String(i[labelKey]))}</span></div>`;
      })
      .join("")}</div>`;
  }

  function table(headers, rows, empty) {
    if (!rows.length) return `<p class="hint" style="padding:18px">${escapeHtml(empty || "Nothing here yet.")}</p>`;
    return `<table class="data-table"><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  }

  /** Opens a modal with a form. fields: [{id,label,type,value,options,placeholder,required}]. */
  function formModal({ title, fields, submitLabel, onSubmit }) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `<div class="modal-backdrop"><div class="modal"><h2>${escapeHtml(title)}</h2><form class="stack">
      ${fields
        .map((f) => {
          const id = "mf-" + f.id;
          const input =
            f.type === "select"
              ? `<select id="${id}">${f.options.map((o) => `<option value="${escapeHtml(o.value ?? o)}" ${(o.value ?? o) === f.value ? "selected" : ""}>${escapeHtml(o.label ?? o)}</option>`).join("")}</select>`
              : f.type === "textarea"
                ? `<textarea id="${id}" rows="4" placeholder="${escapeHtml(f.placeholder || "")}">${escapeHtml(f.value || "")}</textarea>`
                : `<input id="${id}" type="${f.type || "text"}" value="${escapeHtml(f.value || "")}" placeholder="${escapeHtml(f.placeholder || "")}" ${f.required ? "required" : ""} />`;
          return `<label>${escapeHtml(f.label)}${input}</label>`;
        })
        .join("")}
      <p class="hint" data-error></p>
      <div class="modal-actions"><button type="button" data-cancel>Cancel</button><button type="submit">${escapeHtml(submitLabel || "Save")}</button></div>
    </form></div></div>`;
    const close = () => {
      document.removeEventListener("keydown", onKey);
      root.innerHTML = "";
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    root.querySelector("[data-cancel]").addEventListener("click", close);
    root.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = {};
      fields.forEach((f) => (values[f.id] = document.getElementById("mf-" + f.id).value.trim()));
      try {
        await onSubmit(values);
        close();
      } catch (err) {
        root.querySelector("[data-error]").textContent = err.message;
      }
    });
    const first = root.querySelector("input,select,textarea");
    if (first) first.focus();
  }

  /** A read-only dialog for long content. Returns { el, close }. */
  function modal({ title, html, wide }) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal${wide ? " modal-wide" : ""}" role="dialog" aria-modal="true"><h2>${escapeHtml(title)}</h2><div class="modal-body">${html}</div><div class="modal-actions"><button type="button" data-close>Close</button></div></div>`;
    const close = () => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop || (e.target.dataset && "close" in e.target.dataset)) close();
    });
    document.body.appendChild(backdrop);
    return { el: backdrop, close };
  }

  /** Chat bubbles for a support thread. `mine` is the role of whoever is looking at it. */
  function thread(messages, mine) {
    if (!messages.length) return '<p class="hint">No messages yet.</p>';
    return `<div class="thread">${messages
      .map((m) => {
        const own = m.sender_role === mine;
        const name = m.sender_role === "support" ? "Kchel support" : m.sender_email || "Customer";
        return `<div class="bubble ${own ? "bubble-own" : "bubble-other"}"><p class="bubble-meta">${escapeHtml(name)} · ${escapeHtml(when(m.created_at))}</p><p class="bubble-text">${escapeHtml(m.body)}</p></div>`;
      })
      .join("")}</div>`;
  }

  window.KchelUi = { toast, confirm: confirmDialog, esc: escapeHtml, dur, when, header, stat, bars, table, formModal, modal, thread };
})();
