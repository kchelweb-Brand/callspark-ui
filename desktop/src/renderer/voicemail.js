"use strict";

(function () {
  const els = {
    form: document.getElementById("form-voicemail"),
    greeting: document.getElementById("vm-greeting"),
    greetingNote: document.getElementById("vm-greeting-note"),
    transcription: document.getElementById("vm-transcription"),
    emailOn: document.getElementById("vm-email-on"),
    emailRow: document.getElementById("vm-email-row"),
    email: document.getElementById("vm-email"),
    hint: document.getElementById("voicemail-hint"),
  };

  let initialized = false;
  let voicemail = null;

  function syncEmailRow() {
    els.emailRow.classList.toggle("hidden", !els.emailOn.checked);
  }

  function fill() {
    els.greeting.value = voicemail.greetingText || "";
    els.transcription.checked = Boolean(voicemail.transcriptionEnabled);
    els.emailOn.checked = Boolean(voicemail.emailNotifications);
    els.email.value = voicemail.notifyEmail || "";
    els.greetingNote.classList.toggle("hidden", voicemail.greetingMode === "tts");
    syncEmailRow();
  }

  async function load() {
    try {
      const { config } = await window.kchel.api("phone-system/get", {});
      voicemail = config.voicemail;
      fill();
    } catch (err) {
      els.hint.textContent = err.message;
    }
  }

  async function save() {
    els.hint.textContent = "Saving…";
    try {
      // Fresh read so IVR/Extensions edits made this session are preserved.
      const { config } = await window.kchel.api("phone-system/get", {});
      const next = {
        ...config.voicemail,
        greetingMode: "tts",
        greetingText: els.greeting.value.trim(),
        transcriptionEnabled: els.transcription.checked,
        emailNotifications: els.emailOn.checked,
        notifyEmail: els.email.value.trim(),
      };
      if (next.emailNotifications && !next.notifyEmail) {
        els.hint.textContent = "Enter an email address to receive voicemails.";
        return;
      }
      await window.kchel.api("phone-system/save", {
        menus: config.menus,
        extensions: config.extensions,
        routing: config.routing,
        businessHours: config.businessHours,
        voicemail: next,
      });
      voicemail = next;
      fill();
      els.hint.textContent = "Saved.";
    } catch (err) {
      els.hint.textContent = err.message;
    }
  }

  window.KchelVoicemail = {
    init() {
      if (initialized) return;
      initialized = true;
      els.emailOn.addEventListener("change", syncEmailRow);
      els.form.addEventListener("submit", (e) => {
        e.preventDefault();
        void save();
      });
      void load();
    },
  };
})();
