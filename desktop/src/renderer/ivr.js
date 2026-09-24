"use strict";

(function () {
  const els = {
    container: document.getElementById("ivr-menus"),
    hint: document.getElementById("ivr-hint"),
    btnNew: document.getElementById("btn-new-ivr-menu"),
  };

  let initialized = false;
  let config = null; // full phone-system config, only `menus` is edited here

  const ACTIONS = {
    ring_extension: "Ring extension",
    ring_department: "Ring department",
    voicemail: "Send to voicemail",
    repeat_menu: "Repeat this menu",
    goto_menu: "Go to another menu",
    hangup: "Hang up",
  };

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function render() {
    const menus = config.menus;
    if (menus.length === 0) {
      els.container.innerHTML = '<p class="hint">No IVR menus yet — click "New menu" to build a press-1 auto attendant.</p>';
      return;
    }
    els.container.innerHTML = menus
      .map(
        (menu) => `
      <div class="panel" data-menu-id="${menu.id}">
        <div class="page-header">
          <input class="menu-name" data-menu-id="${menu.id}" type="text" value="${escapeHtml(menu.name)}" />
          <button data-action="delete-menu" data-menu-id="${menu.id}">Delete menu</button>
        </div>
        <label>Greeting (text-to-speech)
          <textarea class="menu-greeting" data-menu-id="${menu.id}" rows="2">${escapeHtml(menu.greetingText)}</textarea>
        </label>
        <table class="data-table">
          <thead><tr><th>Key</th><th>Action</th><th>Target</th><th></th></tr></thead>
          <tbody>
            ${menu.options
              .map(
                (opt) => `
              <tr data-option-id="${opt.id}" data-menu-id="${menu.id}">
                <td><input class="opt-key" style="width:40px" type="text" maxlength="1" value="${escapeHtml(opt.key)}" /></td>
                <td>
                  <select class="opt-action">
                    ${Object.entries(ACTIONS)
                      .map(([v, label]) => `<option value="${v}" ${v === opt.action ? "selected" : ""}>${label}</option>`)
                      .join("")}
                  </select>
                </td>
                <td><input class="opt-target" type="text" placeholder="extension # or menu name" value="${escapeHtml(opt.target)}" /></td>
                <td><button data-action="delete-option">Remove</button></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
        <button data-action="add-option" data-menu-id="${menu.id}">Add key press</button>
      </div>
    `,
      )
      .join("");

    bindMenuEvents();
  }

  function findMenu(id) {
    return config.menus.find((m) => m.id === id);
  }

  function bindMenuEvents() {
    els.container.querySelectorAll(".menu-name").forEach((input) => {
      input.addEventListener("change", () => {
        findMenu(input.dataset.menuId).name = input.value;
      });
    });
    els.container.querySelectorAll(".menu-greeting").forEach((input) => {
      input.addEventListener("change", () => {
        findMenu(input.dataset.menuId).greetingText = input.value;
      });
    });
    els.container.querySelectorAll('[data-action="delete-menu"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        config.menus = config.menus.filter((m) => m.id !== btn.dataset.menuId);
        render();
      });
    });
    els.container.querySelectorAll('[data-action="add-option"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        findMenu(btn.dataset.menuId).options.push({
          id: uid(),
          key: "",
          label: "",
          action: "ring_extension",
          target: "",
        });
        render();
      });
    });
    els.container.querySelectorAll("tr[data-option-id]").forEach((row) => {
      const menu = findMenu(row.dataset.menuId);
      const option = menu.options.find((o) => o.id === row.dataset.optionId);
      row.querySelector(".opt-key").addEventListener("change", (e) => (option.key = e.target.value));
      row.querySelector(".opt-action").addEventListener("change", (e) => (option.action = e.target.value));
      row.querySelector(".opt-target").addEventListener("change", (e) => (option.target = e.target.value));
      row.querySelector('[data-action="delete-option"]').addEventListener("click", () => {
        menu.options = menu.options.filter((o) => o.id !== option.id);
        render();
      });
    });
  }

  async function save() {
    els.hint.textContent = "Saving…";
    try {
      await window.kchel.api("phone-system/save", {
        menus: config.menus,
        extensions: config.extensions,
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
      const result = await window.kchel.api("phone-system/get", {});
      config = result.config;
      render();
    } catch (err) {
      els.hint.textContent = err.message;
    }
  }

  function bind() {
    els.btnNew.addEventListener("click", () => {
      config.menus.push({
        id: uid(),
        name: "New menu",
        greetingMode: "tts",
        greetingText: "",
        greetingFileName: null,
        timeoutSeconds: 10,
        repeatCount: 2,
        options: [],
      });
      render();
    });

    // Autosave on any change, debounced — same pattern the dial pad uses
    // for recent calls: cheap to re-run, no explicit save button needed
    // beyond the initial per-field change events already wired above.
    els.container.addEventListener(
      "change",
      () => {
        clearTimeout(els.container._saveTimer);
        els.container._saveTimer = setTimeout(save, 600);
      },
      true,
    );
  }

  window.KchelIvr = {
    init() {
      if (initialized) return;
      initialized = true;
      bind();
      void load();
    },
  };
})();
