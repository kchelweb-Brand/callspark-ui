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

  window.KchelUi = { toast, confirm: confirmDialog };
})();
