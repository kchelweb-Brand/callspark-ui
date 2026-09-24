"use strict";

(function () {
  const els = {
    form: document.getElementById("form-settings"),
    company: document.getElementById("settings-company"),
    phone: document.getElementById("settings-phone"),
    prefRecord: document.getElementById("settings-pref-record"),
    prefTranscribe: document.getElementById("settings-pref-transcribe"),
    prefCoach: document.getElementById("settings-pref-coach"),
    hint: document.getElementById("settings-hint"),
  };

  let initialized = false;

  async function load() {
    try {
      const result = await window.kchel.api("settings/get", {});
      const workspace = result.workspace || {};
      const preferences = result.preferences || {};
      els.company.value = workspace.company || "";
      els.phone.value = workspace.phone || "";
      els.prefRecord.checked = Boolean(preferences["Record all inbound calls"]);
      els.prefTranscribe.checked = Boolean(preferences["Voicemail transcription"]);
      els.prefCoach.checked = Boolean(preferences["Whisper coaching for supervisors"]);
    } catch (err) {
      els.hint.textContent = err.message;
    }
  }

  function bind() {
    els.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      els.hint.textContent = "Saving…";
      try {
        await window.kchel.api("settings/save", {
          workspace: { company: els.company.value.trim(), phone: els.phone.value.trim() },
          preferences: {
            "Record all inbound calls": els.prefRecord.checked,
            "Voicemail transcription": els.prefTranscribe.checked,
            "Whisper coaching for supervisors": els.prefCoach.checked,
          },
        });
        els.hint.textContent = "Saved.";
      } catch (err) {
        els.hint.textContent = err.message;
      }
    });
  }

  window.KchelSettings = {
    init() {
      if (initialized) return;
      initialized = true;
      bind();
      void load();
    },
  };
})();
