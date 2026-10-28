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

  /** WhatsApp can't be checked for a number, so the owner marks the ones that have it with a "whatsapp" tag. */
  function hasWhatsApp(c) {
    return (c.tags || []).some((t) => String(t).trim().toLowerCase() === "whatsapp");
  }

  function render(contacts) {
    if (contacts.length === 0) {
      els.table.innerHTML = '<p class="hint" style="padding:16px">No contacts yet — import a CSV to get started.</p>';
      return;
    }
    els.table.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Name</th><th>Phone</th><th>Location</th><th>List</th><th>Tags</th><th></th></tr></thead>
        <tbody>
          ${contacts
            .map(
              (c) => `
            <tr>
              <td>${escapeHtml([c.first_name, c.last_name].filter(Boolean).join(" ") || c.person || c.company || "—")}${c.company && (c.first_name || c.last_name || c.person) ? `<div class="hint">${escapeHtml(c.company)}</div>` : ""}</td>
              <td class="mono">${escapeHtml(c.phone)}</td>
              <td>${escapeHtml([c.location, c.country].filter(Boolean).join(", ") || "—")}</td>
              <td>${escapeHtml(c.list_name || "—")}</td>
              <td>${(c.tags || []).map(escapeHtml).join(", ")}</td>
              <td>
                <div class="row-actions">
                  <button type="button" class="primary" data-call="${escapeHtml(c.phone)}" data-label="${escapeHtml(c.company || c.person || c.phone)}" ${c.do_not_call ? 'disabled title="Marked do-not-call"' : 'title="Call this number"'}>Call</button>
                  ${hasWhatsApp(c) ? `<button type="button" data-wa="${escapeHtml(String(c.phone).replace(/\D/g, ""))}" title="This contact is on WhatsApp. Open a chat.">WhatsApp</button>` : ""}
                </div>
              </td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;
    // The main action: ring the number from the Dialer.
    els.table.querySelectorAll("[data-call]").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          window.showView("dialer");
          await window.KchelDialer.placeCall(b.dataset.call);
        } catch (err) {
          window.KchelUi.toast(err.message, "error");
        }
      }),
    );
    // Only shown for contacts tagged as being on WhatsApp. Opens a chat in the browser or the WhatsApp app.
    els.table.querySelectorAll("[data-wa]").forEach((b) =>
      b.addEventListener("click", () => window.open("https://wa.me/" + b.dataset.wa)),
    );
  }

  async function load(search) {
    try {
      const result = await window.kchel.api("contacts/list", { search, pageSize: 200 });
      render(result.contacts);
    } catch (err) {
      els.hint.textContent = err.message;
    }
  }

  function bind() {
    els.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => load(els.search.value.trim()), 300);
    });

    els.csvInput.addEventListener("change", async () => {
      const file = els.csvInput.files && els.csvInput.files[0];
      els.csvInput.value = "";
      if (!file) return;
      els.hint.textContent = "Reading file...";
      try {
        if (/\.(xlsx?|ods|numbers)$/i.test(file.name)) {
          throw new Error("That is a spreadsheet file. In Excel or Sheets choose File > Save as > CSV, then import that file.");
        }
        if (file.size === 0) throw new Error("That file is empty.");
        if (file.size > 8 * 1024 * 1024) throw new Error("That file is over 8 MB. Split it into smaller files.");
        const buffer = await file.arrayBuffer();
        if (window.KchelCsv.looksBinary(buffer)) {
          throw new Error("That does not look like a CSV text file. In Excel or Sheets choose File > Save as > CSV.");
        }
        const decoded = window.KchelCsv.decodeCsvBuffer(buffer);
        const parse = window.KchelCsv.csvToContacts(decoded.text);
        if (parse.rows.length === 0) {
          throw new Error(
            parse.totalRows === 0
              ? "The file has no data rows."
              : "No phone numbers found. Make sure there is a column named Phone, Mobile or Number.",
          );
        }
        if (parse.rows.length > MAX_IMPORT_ROWS) {
          throw new Error("That file has " + parse.rows.length.toLocaleString() + " contacts. Import up to " + MAX_IMPORT_ROWS.toLocaleString() + " at a time: split the file in parts.");
        }
        els.hint.textContent = "";
        openPreview(file, parse, decoded.encoding);
      } catch (err) {
        els.hint.textContent = err.message;
        window.KchelUi.toast(err.message, "error");
      }
    });
  }

  const MAX_IMPORT_ROWS = 10000;

  function openPreview(file, parse, encoding) {
    const U = window.KchelUi;
    const detected = Object.entries(parse.detectedColumns)
      .map(([field, label]) => "<li><span class=\"hint\">" + U.esc(field) + "</span> &larr; " + U.esc(label) + "</li>")
      .join("");
    const sample = parse.rows
      .slice(0, 5)
      .map((r) => "<div class=\"task-line\"><span class=\"mono\">" + U.esc(r.phone) + "</span><span>" + U.esc([[r.firstName, r.lastName].filter(Boolean).join(" ") || r.person, r.company, [r.location, r.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")) + "</span></div>")
      .join("");
    const m = U.modal({
      title: "Import contacts",
      wide: true,
      html:
        "<p class=\"hint\">" + parse.rows.length.toLocaleString() + " contact" + (parse.rows.length === 1 ? "" : "s") + " ready from " + U.esc(file.name) + "</p>" +
        "<div class=\"panel\"><p class=\"eyebrow\">Columns we found</p><ul class=\"hint\" style=\"margin:4px 0;padding-left:18px\">" + detected + "</ul>" +
        (parse.hadHeader ? "" : "<p class=\"hint\">No header row, so columns were guessed from the data.</p>") +
        (parse.ignoredColumns.length ? "<p class=\"hint\">Not imported: " + U.esc(parse.ignoredColumns.join(", ")) + "</p>" : "") +
        (encoding === "windows-1252" ? "<p class=\"hint\">Read as Windows text. Check that names with accents look right below.</p>" : "") +
        "</div>" +
        (parse.skippedNoPhone ? "<p class=\"hint lock-note\">" + parse.skippedNoPhone + " row" + (parse.skippedNoPhone === 1 ? "" : "s") + " had no phone number and will be skipped.</p>" : "") +
        "<label>Add to list<input id=\"imp-list\" type=\"text\" maxlength=\"100\" value=\"" + U.esc(file.name.replace(/\.(csv|txt)$/i, "").slice(0, 100)) + "\" /></label>" +
        "<p class=\"hint\">Created if it does not exist. Duplicates are skipped automatically.</p>" +
        "<div class=\"panel\"><p class=\"eyebrow\">Preview</p>" + sample + "</div>" +
        "<div class=\"modal-actions\" style=\"margin-top:12px\"><button id=\"imp-go\">Import " + parse.rows.length.toLocaleString() + " contacts</button></div>" +
        "<p class=\"hint\" id=\"imp-hint\"></p>",
    });
    const go = m.el.querySelector("#imp-go");
    go.addEventListener("click", async () => {
      go.disabled = true;
      const hint = m.el.querySelector("#imp-hint");
      hint.textContent = "Importing...";
      try {
        const result = await window.kchel.api("contacts/import", {
          rows: parse.rows,
          listName: m.el.querySelector("#imp-list").value.trim() || undefined,
        });
        m.close();
        showResult(result);
        await load(els.search.value.trim());
      } catch (err) {
        hint.textContent = err.message;
        go.disabled = false;
      }
    });
  }

  function showResult(result) {
    const U = window.KchelUi;
    const parts = [result.duplicates ? result.duplicates + " already existed" : "", result.invalidCount ? result.invalidCount + " could not be imported" : ""].filter(Boolean).join(" · ");
    els.hint.textContent = "Imported " + result.imported.toLocaleString() + (parts ? " · " + parts : "") + ".";
    if (result.imported > 0) U.toast(result.imported.toLocaleString() + " contacts imported", "info");
    else U.toast("No new contacts were added", "info");
    if (result.overLimit) {
      els.hint.textContent += " " + result.overLimit.toLocaleString() + " not added: your plan holds " + (result.planLimit || 0).toLocaleString() + " contacts.";
      U.toast(result.overLimit.toLocaleString() + " contacts left out: plan holds " + (result.planLimit || 0).toLocaleString(), "info");
    }
    if (!result.invalidCount && !result.droppedEmails) return;
    U.modal({
      title: "Some rows were not imported",
      wide: true,
      html:
        "<p class=\"hint\">" + result.imported.toLocaleString() + " imported, " + result.duplicates.toLocaleString() + " already existed, " + result.invalidCount.toLocaleString() + " could not be read" +
        (result.droppedEmails ? ", " + result.droppedEmails + " email" + (result.droppedEmails === 1 ? "" : "s") + " left blank because they were not valid" : "") + ".</p>" +
        (result.invalid.length
          ? "<div class=\"table-panel\">" +
            U.table(
              ["Line", "Value", "Why"],
              result.invalid.map((r) => ["<span class=\"mono\">" + r.row + "</span>", "<span class=\"mono\">" + U.esc(r.phone || "(blank)") + "</span>", U.esc(r.reason)]),
            ) +
            "</div>" +
            (result.invalidCount > result.invalid.length ? "<p class=\"hint\">Showing the first " + result.invalid.length + " of " + result.invalidCount.toLocaleString() + ".</p>" : "")
          : "") +
        "<p class=\"hint\">Fix those lines in your file and import it again. Contacts already added are skipped, so nothing is duplicated.</p>",
    });
  }

  window.KchelContacts = {
    init() {
      if (initialized) return;
      initialized = true;
      bind();
      // Importing is an owner task; the server refuses it for agents, so do not offer it.
      if (window.KchelTeam && window.KchelTeam.isAgent()) els.csvInput.closest(".file-btn").classList.add("hidden");
      void load();
    },
  };
})();
