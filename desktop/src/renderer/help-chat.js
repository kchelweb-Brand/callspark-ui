"use strict";

// The help assistant: a button in the corner that opens a small chat. It answers
// how-to questions from Kchel's own guides, and can pass the conversation to the
// team as a support thread when it isn't sure. Text is only ever written with
// textContent, so nothing the assistant says can inject markup.
(function () {
  const WELCOME = "Hi! I can answer questions about using Kchel Dialer. What do you need help with?";
  const IDEAS = ["How do I import contacts?", "How do I add an agent?", "How do I set up the AI receptionist?", "Why can't I make calls?"];
  const MAX_STORED = 30;

  let messages = [];
  let busy = false;
  let panel = null;
  let button = null;
  let list = null;
  let input = null;
  let offer = null;

  try {
    messages = JSON.parse(sessionStorage.getItem("kchel-help-chat") || "[]").filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string");
  } catch {
    messages = [];
  }

  function save() {
    try {
      sessionStorage.setItem("kchel-help-chat", JSON.stringify(messages.slice(-MAX_STORED)));
    } catch {
      // The chat works without remembering itself.
    }
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function bubble(role, text) {
    const row = el("div", "help-row " + (role === "user" ? "help-row-me" : ""));
    row.appendChild(el("p", "help-bubble " + (role === "user" ? "help-me" : "help-bot"), text));
    return row;
  }

  function currentPage() {
    const active = document.querySelector(".nav-item.active");
    return active && active.dataset ? "/" + (active.dataset.view || "") : "";
  }

  function render() {
    if (!list) return;
    list.textContent = "";
    list.appendChild(bubble("assistant", WELCOME));
    if (messages.length === 0) {
      const ideas = el("div", "help-ideas");
      IDEAS.forEach((idea) => {
        const b = el("button", "help-idea", idea);
        b.type = "button";
        b.addEventListener("click", () => void send(idea));
        ideas.appendChild(b);
      });
      list.appendChild(ideas);
    }
    messages.forEach((m) => list.appendChild(bubble(m.role, m.content)));
    if (busy) list.appendChild(el("p", "help-thinking", "Thinking…"));
    if (offer) list.appendChild(offer);
    list.scrollTop = list.scrollHeight;
  }

  function notice(text, cls) {
    offer = el("p", "help-note " + (cls || ""), text);
    render();
  }

  async function send(text) {
    const question = String(text || "").trim().slice(0, 600);
    if (!question || busy) return;
    messages.push({ role: "user", content: question });
    save();
    input.value = "";
    offer = null;
    busy = true;
    render();
    try {
      const result = await window.kchel.api("help/chat", { messages, page: currentPage() });
      messages.push({ role: "assistant", content: result.reply });
      save();
      busy = false;
      if (result.escalate) {
        const box = el("div", "help-note");
        box.appendChild(el("p", "", "Want a person to look at this? I'll send them this conversation."));
        const go = el("button", "help-go", "Talk to a person");
        go.type = "button";
        go.addEventListener("click", () => void escalate());
        box.appendChild(go);
        offer = box;
      }
      render();
    } catch (err) {
      busy = false;
      notice(err.message, "help-error");
    }
  }

  async function escalate() {
    busy = true;
    offer = null;
    render();
    try {
      const result = await window.kchel.api("help/escalate", { messages });
      busy = false;
      notice("Sent to the team (" + result.ticketRef + "). Their reply will appear in Support.");
    } catch (err) {
      busy = false;
      notice(err.message, "help-error");
    }
  }

  function open() {
    if (panel) {
      close();
      return;
    }
    panel = el("section", "help-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Kchel help assistant");

    const head = el("header", "help-head");
    const title = el("div");
    title.appendChild(el("strong", "", "Kchel help"));
    title.appendChild(el("span", "", "Ask how to do anything"));
    head.appendChild(title);
    const actions = el("div", "help-head-actions");
    const fresh = el("button", "", "New chat");
    fresh.type = "button";
    fresh.addEventListener("click", () => {
      messages = [];
      offer = null;
      save();
      render();
    });
    const x = el("button", "", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Close help");
    x.addEventListener("click", close);
    actions.appendChild(fresh);
    actions.appendChild(x);
    head.appendChild(actions);
    panel.appendChild(head);

    list = el("div", "help-list");
    list.setAttribute("aria-live", "polite");
    panel.appendChild(list);

    const form = el("form", "help-form");
    input = el("textarea");
    input.rows = 1;
    input.maxLength = 600;
    input.placeholder = "Type your question…";
    input.setAttribute("aria-label", "Your question");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send(input.value);
      }
    });
    const sendBtn = el("button", "help-send", "Send");
    sendBtn.type = "submit";
    form.appendChild(input);
    form.appendChild(sendBtn);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void send(input.value);
    });
    panel.appendChild(form);
    panel.appendChild(el("p", "help-foot", "AI assistant: it can make mistakes. Never share passwords, sign-in codes or card numbers here."));

    document.body.appendChild(panel);
    render();
    input.focus();
  }

  function close() {
    if (panel) panel.remove();
    panel = null;
    list = null;
    input = null;
  }

  function mount() {
    button = el("button", "help-fab", "Help");
    button.type = "button";
    button.setAttribute("aria-label", "Open help");
    button.addEventListener("click", open);
    document.body.appendChild(button);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel) close();
    });
  }

  // Only a signed-in person has a workspace to ask about.
  window.KchelHelp = {
    show() {
      if (!button) mount();
      button.classList.remove("hidden");
    },
    hide() {
      close();
      if (button) button.classList.add("hidden");
    },
  };
})();
