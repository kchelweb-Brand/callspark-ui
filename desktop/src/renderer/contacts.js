"use strict";

(function () {
  const els = {
    search: document.getElementById("contacts-search"),
    csvInput: document.getElementById("contacts-csv-input"),
    table: document.getElementById("contacts-table"),
    hint: document.getElementById("contacts-hint"),
  };

  let initialized = false;
  let searchTimer = null;

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  function render(contacts) {
    if (contacts.length === 0) {
      els.table.innerHTML = '<p class="hint" style="padding:16px">No contacts yet — import a CSV to get started.</p>';
      return;
    }
    els.table.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Name</th><th>Phone</th><th>List</th><th>Tags</th></tr></thead>
        <tbody>
          ${contacts
            .map(
              (c) => `
            <tr>
              <td>${escapeHtml(c.company || c.person || "—")}</td>
              <td class="mono">${escapeHtml(c.phone)}</td>
              <td>${escapeHtml(c.list_name || "—")}</td>
              <td>${(c.tags || []).map(escapeHtml).join(", ")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  async function load(search) {
    try {
      const result = await window.kchel.api("contacts/list", { search, pageSize: 200 });
      render(result.contacts);
    } catch (err) {
      els.hint.textContent = err.message;
    }
  }

  /** Minimal CSV parser: no embedded-comma/quote support, matches the
   * simple company,person,phone,email,tags export format. */
  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const row = {};
      header.forEach((h, i) => (row[h] = cells[i] ?? ""));
      return {
        company: row.company || undefined,
        person: row.person || row.name || undefined,
        phone: row.phone || "",
        email: row.email || undefined,
        tags: row.tags ? row.tags.split(";").map((t) => t.trim()).filter(Boolean) : undefined,
      };
    });
  }

  function bind() {
    els.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => load(els.search.value.trim()), 300);
    });

    els.csvInput.addEventListener("change", async () => {
      const file = els.csvInput.files?.[0];
      if (!file) return;
      els.hint.textContent = "Importing…";
      try {
        const text = await file.text();
        const rows = parseCsv(text).filter((r) => r.phone);
        if (rows.length === 0) throw new Error("No valid rows found in that file.");
        const result = await window.kchel.api("contacts/import", {
          rows,
          listName: file.name.replace(/\.csv$/i, ""),
        });
        els.hint.textContent = `Imported ${result.imported}, ${result.duplicates} duplicates skipped, ${result.invalidCount} invalid.`;
        await load(els.search.value.trim());
      } catch (err) {
        els.hint.textContent = err.message;
      } finally {
        els.csvInput.value = "";
      }
    });
  }

  window.KchelContacts = {
    init() {
      if (initialized) return;
      initialized = true;
      bind();
      void load();
    },
  };
})();
