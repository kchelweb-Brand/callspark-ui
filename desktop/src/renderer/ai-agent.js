"use strict";

// The AI voice agent's settings form, shared by the AI receptionist (Automations)
// and AI campaigns: voice, speaking style, thinking, hearing a sample on your
// own phone, voicemail handling, and what the agent may do during a call.
(function () {
  const U = window.KchelUi;
  let options = null;

  async function ensureOptions() {
    if (!options) options = await window.kchel.api("ai/options", {});
    return options;
  }

  const opt = (value, label) => `<option value="${U.esc(value)}">${U.esc(label)}</option>`;

  const TIERS = [
    ["standard", "Standard"],
    ["natural", "Natural"],
    ["premium", "Premium"],
  ];

  const ACTIONS = [
    ["outcome", "Tag how each call went", "Interested, call back, not interested… shows in Call History and lets you call the right people again."],
    ["book", "Note appointment requests", "It writes down the time someone asks for. It never promises a slot: you confirm it."],
    ["text", "Text details during the call", "It can text the person once, only with information you gave it. Never to anyone who opted out."],
    ["transfer", "Hand over to a human", "If someone asks for a person, or it is urgent, the call is connected to your transfer number."],
  ];

  /** The form markup. Every control id starts with `p`, so two forms can share a page. */
  function formHtml(p, s, { voicemail, transfer, disabled } = {}) {
    const o = options;
    const voiceOptions = TIERS.map(
      ([tier, label]) =>
        `<optgroup label="${label}">${o.voices
          .filter((v) => v.tier === tier)
          .map((v) => opt(v.id, v.label))
          .join("")}</optgroup>`,
    ).join("");
    const choose = (id, inner, value) =>
      `<select id="${id}" ${disabled ? "disabled" : ""}>${inner}</select>`.replace(`value="${value}"`, `value="${value}" selected`);
    const voice = o.voices.find((v) => v.id === s.voice) || o.voices[0];
    const style = o.styles.find((x) => x.id === s.style);
    const model = o.models.find((x) => x.id === s.model);

    const script = voicemail && s.delivery === "script";
    const deliveryRow = voicemail
      ? `<label>How should it talk?
          ${choose(`${p}-delivery`, (o.delivery || []).map((x) => opt(x.id, x.label)).join(""), s.delivery || "ai")}
          <span class="hint" id="${p}-delivery-hint">${U.esc(((o.delivery || []).find((x) => x.id === (s.delivery || "ai")) || {}).hint || "")}</span>
        </label>`
      : "";
    return `
      <div class="ai-form stack">
        ${deliveryRow}
        <label>Voice
          ${choose(`${p}-voice`, voiceOptions, s.voice)}
          <span class="hint" id="${p}-voice-hint">${U.esc(o.tierNotes[voice.tier])}</span>
        </label>
        <label data-ai-only class="${script ? "hidden" : ""}">Speaking style
          ${choose(`${p}-style`, o.styles.map((x) => opt(x.id, x.label)).join(""), s.style)}
          <span class="hint" id="${p}-style-hint">${U.esc(style ? style.hint : "")}</span>
        </label>
        <label data-ai-only class="${script ? "hidden" : ""}">Thinking
          ${choose(`${p}-model`, o.models.map((x) => opt(x.id, x.label)).join(""), s.model)}
          <span class="hint" id="${p}-model-hint">${U.esc(model ? model.hint : "")}</span>
        </label>
        <label>Hear it on your phone
          <span class="row" style="display:flex;gap:8px">
            <input id="${p}-sample-phone" type="tel" placeholder="Your mobile number" ${disabled ? "disabled" : ""} />
            <button type="button" id="${p}-sample-go" ${disabled ? "disabled" : ""}>Call me</button>
          </span>
          <span class="hint">A short call to your own number with these settings. Up to 5 a day.</span>
        </label>
        ${
          voicemail
            ? `<label>If it reaches a voicemail
                ${choose(`${p}-vm`, o.voicemail.map((x) => opt(x.id, x.label)).join(""), s.voicemail)}
              </label>
              <label id="${p}-vm-msg-row" class="${s.voicemail === "message" ? "" : "hidden"}">Message left after the beep
                <textarea id="${p}-vm-msg" rows="3" maxlength="300" placeholder="Hi {{first_name}}, this is Sam from Acme. Sorry we missed you. Call us back on…">${U.esc(s.voicemailMessage || "")}</textarea>
                <span class="hint">Use {{first_name}} and {{company}}. Waiting for the beep adds a few seconds before a real person is connected.</span>
              </label>`
            : ""
        }
        ${voicemail
          ? `<div data-script-only class="stack ${script ? "" : "hidden"}">
              <label>Voice engine
                ${choose(`${p}-speech`, (o.speech || []).map((x) => opt(x.id, x.label)).join(""), s.speech || "built-in")}
                <span class="hint" id="${p}-speech-hint">${U.esc(((o.speech || []).find((x) => x.id === (s.speech || "built-in")) || {}).hint || "")}</span>
              </label>
              <div class="switch-row"><div><h3>Offer "press 1" to speak with someone</h3><p class="hint">After the script, the person can press 1 to be connected to the number below. Everyone else hears the script and the call ends.</p></div>
                <label class="switch"><input type="checkbox" id="${p}-press" ${s.pressToConnect ? "checked" : ""} ${disabled ? "disabled" : ""} /><span></span></label></div>
              <label id="${p}-press-row" class="${s.pressToConnect ? "" : "hidden"}">Connect them to
                <input id="${p}-press-number" type="text" placeholder="+14155550134" value="${U.esc(s.transferNumber || "")}" ${disabled ? "disabled" : ""} />
                <span class="hint">Your own phone number, with the country code.</span>
              </label>
            </div>`
          : ""}
        <div data-ai-only class="stack ${script ? "hidden" : ""}">
        <p class="eyebrow">What it can do during a call</p>
        ${ACTIONS.map(
          ([key, title, sub]) => `<div class="switch-row"><div><h3>${U.esc(title)}</h3><p class="hint">${U.esc(sub)}</p></div>
            <label class="switch"><input type="checkbox" id="${p}-act-${key}" ${s.actions[key] ? "checked" : ""} ${disabled ? "disabled" : ""} /><span></span></label></div>`,
        ).join("")}
        ${
          transfer
            ? `<label>Transfer number
                <input id="${p}-transfer" type="text" placeholder="+14155550134" value="${U.esc(s.transferNumber || "")}" ${disabled ? "disabled" : ""} />
                <span class="hint">Where a call is connected when someone asks for a human. Leave empty to turn handover off.</span>
              </label>`
            : ""
        }
        </div>
      </div>`;
  }

  function bindForm(root, p) {
    const $ = (id) => root.querySelector(`#${p}-${id}`);
    const o = options;
    $("voice").addEventListener("change", () => {
      const v = o.voices.find((x) => x.id === $("voice").value);
      if (v) $("voice-hint").textContent = o.tierNotes[v.tier];
    });
    $("style").addEventListener("change", () => {
      const v = o.styles.find((x) => x.id === $("style").value);
      $("style-hint").textContent = v ? v.hint : "";
    });
    $("model").addEventListener("change", () => {
      const v = o.models.find((x) => x.id === $("model").value);
      $("model-hint").textContent = v ? v.hint : "";
    });
    const delivery = $("delivery");
    if (delivery) {
      delivery.addEventListener("change", () => {
        const script = delivery.value === "script";
        root.querySelectorAll(`[data-ai-only]`).forEach((el) => el.classList.toggle("hidden", script));
        root.querySelectorAll(`[data-script-only]`).forEach((el) => el.classList.toggle("hidden", !script));
        const d = (o.delivery || []).find((x) => x.id === delivery.value);
        $("delivery-hint").textContent = d ? d.hint : "";
      });
    }
    const speech = $("speech");
    if (speech) {
      speech.addEventListener("change", () => {
        const d = (o.speech || []).find((x) => x.id === speech.value);
        $("speech-hint").textContent = d ? d.hint : "";
      });
    }
    const press = $("press");
    if (press) press.addEventListener("change", () => root.querySelector(`#${p}-press-row`).classList.toggle("hidden", !press.checked));
    const vm = $("vm");
    if (vm) {
      vm.addEventListener("change", () => root.querySelector(`#${p}-vm-msg-row`).classList.toggle("hidden", vm.value !== "message"));
    }
    $("sample-go").addEventListener("click", async () => {
      const button = $("sample-go");
      button.disabled = true;
      try {
        const result = await window.kchel.api("ai/sample", { settings: readForm(root, p), to: $("sample-phone").value });
        U.toast(`Calling ${result.to} now. Pick up to hear it, and talk back to it.`, "info");
      } catch (err) {
        U.toast(err.message, "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  /** Reads the form back into a settings object. Fields the form does not show keep their `base` value. */
  function readForm(root, p, base) {
    const $ = (id) => root.querySelector(`#${p}-${id}`);
    const b = base || options.defaults;
    return {
      delivery: $("delivery") ? $("delivery").value : b.delivery || "ai",
      speech: $("speech") ? $("speech").value : b.speech || "built-in",
      pressToConnect: $("press") ? $("press").checked : !!b.pressToConnect,
      voice: $("voice").value,
      style: $("style").value,
      model: $("model").value,
      voicemail: $("vm") ? $("vm").value : b.voicemail,
      voicemailMessage: $("vm-msg") ? $("vm-msg").value : b.voicemailMessage,
      transferNumber: $("press-number") && $("delivery") && $("delivery").value === "script" ? $("press-number").value : $("transfer") ? $("transfer").value : b.transferNumber,
      actions: {
        outcome: $("act-outcome").checked,
        book: $("act-book").checked,
        text: $("act-text").checked,
        transfer: $("act-transfer").checked,
      },
    };
  }

  window.KchelAi = { ensureOptions, formHtml, bindForm, readForm, defaults: () => options.defaults };
})();
