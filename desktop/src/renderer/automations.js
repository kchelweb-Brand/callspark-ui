"use strict";

// Automations (missed-call text-back, AI receptionist, number rotation) and
// the Number health page.
(function () {
  const U = window.KchelUi;
  const api = (route, body) => window.kchel.api(route, body || {});
  const $ = (id) => document.getElementById(id);

  const UNLOCK = {
    missedCallTextBack: "Starter",
    numberRotation: "Professional",
    aiReceptionist: "Business",
  };

  function showError(root, err) {
    root.querySelector("[data-body]").innerHTML = `<p class="hint status-error" style="padding:14px;border-radius:12px">${U.esc(err.message)}</p>`;
  }

  function lockNote(features, key) {
    return features[key] ? "" : `<p class="hint lock-note">Included from the ${U.esc(UNLOCK[key])} plan. Upgrade in Billing to switch this on.</p>`;
  }

  function switchRow(id, title, sub, on, locked) {
    return `<div class="switch-row"><div><h3>${U.esc(title)}</h3><p class="hint">${U.esc(sub)}</p></div>
      <label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""} ${locked ? "disabled" : ""} /><span></span></label></div>`;
  }

  // ---------- Automations ----------
  const automations = (() => {
    const root = $("view-automations");
    let started = false;

    async function load() {
      try {
        const [d, t] = await Promise.all([api("automations/get"), api("automations/texts").catch(() => ({ texts: [] }))]);
        const a = d.automations;
        const f = d.features;
        root.querySelector("[data-body]").innerHTML = `
          <div class="panel stack">
            ${switchRow("tb-on", "Missed-call text-back", "When a call isn't answered, text the caller straight away so the lead doesn't go cold.", a.missedCallTextBack.enabled, !f.missedCallTextBack)}
            ${lockNote(f, "missedCallTextBack")}
            <label>Message<textarea id="tb-msg" rows="3" maxlength="320" ${f.missedCallTextBack ? "" : "disabled"}>${U.esc(a.missedCallTextBack.message)}</textarea></label>
            <p class="hint">Use {business} for your workspace name. One text per caller every 6 hours, and never to contacts marked do-not-call. Sent from the number they called.</p>
          </div>

          <div class="panel stack">
            ${switchRow("ai-on", "AI receptionist", "An automated assistant answers when nobody can, finds out who is calling and why, and takes a message. You get a written summary on the call.", a.aiReceptionist.enabled, !f.aiReceptionist)}
            ${lockNote(f, "aiReceptionist")}
            <label>When should it answer?
              <select id="ai-mode" ${f.aiReceptionist ? "" : "disabled"}>
                <option value="after_hours" ${a.aiReceptionist.mode === "after_hours" ? "selected" : ""}>Only when you're closed</option>
                <option value="unanswered" ${a.aiReceptionist.mode === "unanswered" ? "selected" : ""}>When you're closed or nobody picks up</option>
                <option value="always" ${a.aiReceptionist.mode === "always" ? "selected" : ""}>Every call (front desk)</option>
              </select>
            </label>
            <label>Business name<input id="ai-name" type="text" value="${U.esc(a.aiReceptionist.businessName)}" ${f.aiReceptionist ? "" : "disabled"} /></label>
            <label>What should it know about your business?
              <textarea id="ai-about" rows="5" maxlength="1500" placeholder="Hours, services, prices you're happy to share, address, how to book…" ${f.aiReceptionist ? "" : "disabled"}>${U.esc(a.aiReceptionist.about)}</textarea>
            </label>
            <label>Urgent line (optional)<input id="ai-urgent" type="text" placeholder="+14155550134" value="${U.esc(a.aiReceptionist.transferNumber)}" ${f.aiReceptionist ? "" : "disabled"} /></label>
            <p class="hint">It always says it is an automated assistant, only answers from the description above, and never asks for card numbers or passwords. If you set an urgent line, it tells callers to use that number for emergencies.</p>
          </div>

          <div class="panel stack">
            ${switchRow("nr-on", "Number rotation", "Spreads automated outbound calls across your numbers, caps each one per day, and rests numbers whose answer rate collapses.", a.numberRotation.enabled, !f.numberRotation)}
            ${lockNote(f, "numberRotation")}
            <label>Calls per number per day<input id="nr-cap" type="number" min="10" max="1000" value="${a.numberRotation.dailyCap}" ${f.numberRotation ? "" : "disabled"} /></label>
            <p class="hint">Around 75–150 a day per number is the usual guidance. Rotation applies to AI campaign calls. Calls from the desktop softphone go out on the caller ID your SIP trunk sets. See the health of each number on Number health.</p>
          </div>

          <div class="page-actions"><button id="auto-save">Save changes</button><span class="hint" id="auto-hint"></span></div>

          <div class="panel table-panel"><p class="eyebrow" style="padding:10px 6px 0">Recent text-backs</p>
            ${U.table(
              ["To", "Message", "Result", "When"],
              (t.texts || []).map((x) => [
                `<span class="mono">${U.esc(x.to_number)}</span>`,
                U.esc(x.body),
                `<span class="status status-${x.status === "sent" ? "ok" : "error"}" title="${U.esc(x.error || "")}">${U.esc(x.status)}</span>`,
                U.esc(U.when(x.created_at)),
              ]),
              "No text-backs sent yet.",
            )}
          </div>`;

        $("auto-save").addEventListener("click", async () => {
          const hint = $("auto-hint");
          hint.textContent = "Saving…";
          try {
            await api("automations/save", {
              automations: {
                missedCallTextBack: { enabled: $("tb-on").checked, message: $("tb-msg").value },
                aiReceptionist: {
                  enabled: $("ai-on").checked,
                  mode: $("ai-mode").value,
                  businessName: $("ai-name").value,
                  about: $("ai-about").value,
                  transferNumber: $("ai-urgent").value,
                },
                numberRotation: { enabled: $("nr-on").checked, dailyCap: Number($("nr-cap").value) },
              },
            });
            hint.textContent = "";
            U.toast("Automations saved", "info");
          } catch (err) {
            hint.textContent = err.message;
          }
        });
      } catch (err) {
        showError(root, err);
      }
    }

    return {
      init() {
        if (started) return;
        started = true;
        root.innerHTML = U.header("Automations", "Things that happen on their own, so no call or lead slips away.") + '<div data-body><p class="hint">Loading…</p></div>';
        void load();
      },
    };
  })();

  // ---------- Number health ----------
  const health = (() => {
    const root = $("view-health");
    let started = false;

    const KIND = { Healthy: "ok", Watch: "pending", "At risk": "error", Resting: "pending", New: "" };
    const pct = (v) => (v === null || v === undefined ? "—" : Math.round(v * 100) + "%");

    async function load() {
      try {
        const d = await api("numbers/health");
        const counts = (s) => d.numbers.filter((n) => n.status === s).length;
        root.querySelector("[data-body]").innerHTML = `
          <div class="stats">
            ${U.stat("Numbers", d.numbers.length)}
            ${U.stat("Healthy", counts("Healthy"))}
            ${U.stat("Need attention", counts("Watch") + counts("At risk"))}
            ${U.stat("Resting", counts("Resting"))}
          </div>
          <div class="panel table-panel">
            ${U.table(
              ["Number", "Health", "Answer rate", "Calls today", "What to do", ""],
              d.numbers.map((n) => [
                `<span class="mono">${U.esc(n.number)}</span>${n.label ? `<br><span class="hint">${U.esc(n.label)}</span>` : ""}`,
                `<span class="status status-${KIND[n.status] || ""}">${U.esc(n.status)}${n.score === null ? "" : " · " + n.score}</span>`,
                U.esc(pct(n.answer_rate)),
                `<span class="${n.over_cap ? "status-error-text" : ""}">${n.calls_today} / ${d.dailyCap}</span>`,
                `<span class="hint">${U.esc(n.advice)}${n.rest_reason ? " (" + U.esc(n.rest_reason) + ")" : ""}</span>`,
                d.canRotate
                  ? n.status === "Resting"
                    ? `<button data-resume="${n.id}">Resume</button>`
                    : `<button data-rest="${n.id}">Rest 3 days</button>`
                  : "",
              ]),
              "No numbers yet. Add one under Phone numbers.",
            )}
          </div>
          <p class="hint">Scores come from your own call results in the last 7 days: how many calls are answered, how many answered calls end within seconds, failures and daily volume. These are the same signals carriers use to decide whether to label a number spam, but this isn't a lookup against their databases, so it can't show a label they have already applied. ${d.rotationOn ? "Rotation is on." : "Turn on rotation under Automations to cap and rest numbers automatically."}</p>`;

        root.querySelectorAll("[data-rest]").forEach((b) => b.addEventListener("click", () => act({ id: b.dataset.rest, days: 3 })));
        root.querySelectorAll("[data-resume]").forEach((b) => b.addEventListener("click", () => act({ id: b.dataset.resume, resume: true })));
      } catch (err) {
        showError(root, err);
      }
    }

    async function act(body) {
      try {
        await api("numbers/rest", body);
        void load();
      } catch (err) {
        U.toast(err.message, "error");
      }
    }

    return {
      init() {
        if (started) return;
        started = true;
        root.innerHTML = U.header("Number health", "Which of your numbers are at risk of being marked as spam.", '<button id="health-refresh">Refresh</button>') + '<div data-body><p class="hint">Loading…</p></div>';
        $("health-refresh").addEventListener("click", load);
        void load();
      },
    };
  })();

  window.KchelAutomations = automations;
  window.KchelHealth = health;
})();
