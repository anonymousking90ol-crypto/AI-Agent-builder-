/* =========================================================================
   Floating AI Guide Assistant widget
   -------------------------------------------------------------------------
   Two modes, decided server-side per-message (see routers/guide_api.py):
    - Plain "how do I..." questions: answered by the local, zero-API-quota
      TF-IDF FAQ matcher (ml/guide_assistant.py), completely unchanged.
    - "Build/create/add..." instructions (e.g. "make a bot that replies to
      my emails"), sent while a bot is open (window.CURRENT_BOT_ID is set
      by builder.html): routed to the autonomous Agent (ml/flow_agent.py),
      which actually writes flow nodes/edges onto that bot and returns the
      updated flow graph. This widget then fires a `ai-guide:flow-updated`
      CustomEvent with the new flow so builder.html can redraw the canvas
      immediately without a page reload.
   ========================================================================= */

function initAIGuide() {
  if (document.getElementById("ai-guide-fab")) return;

  const fab = document.createElement("button");
  fab.id = "ai-guide-fab";
  fab.title = "AI Guide";
  fab.innerHTML = "🤖";
  document.body.appendChild(fab);

  const onBuilderPage = !!window.CURRENT_BOT_ID;
  const introText = onBuilderPage
    ? "Hi! 👋 I'm your AI Guide, now a full Active Bot Generator. Ask me how to use the platform, or tell me what to build — e.g. \"a hotel that needs room bookings\" — and I'll ask a few quick questions about your business, generate the full flow on this canvas, then help you pick a deployment channel (WhatsApp, Web Chat, or Telegram). You can also upload a PDF describing your bot's requirements instead of typing."
    : "Hi! 👋 I'm your AI Guide — I can explain how to use AI Chatbot Builder. Open a bot's Builder page and I can also have a conversation with you to build a complete flow (from a typed description or an uploaded PDF), then help you deploy it. Ask me anything, like \"How do I create a bot?\"";

  const panel = document.createElement("div");
  panel.id = "ai-guide-panel";
  // The PDF-upload row (an alternative to typing a prompt) only makes
  // sense when there's an actual bot open to build onto -- same guard
  // condition the Agent's build-routing logic already uses server-side.
  const uploadRow = onBuilderPage ? `
    <div class="ai-guide-upload-row">
      <label class="ai-guide-upload-btn" for="ai-guide-pdf-input" title="Upload a PDF describing the bot you want built">
        📎 Upload requirements PDF
      </label>
      <input type="file" id="ai-guide-pdf-input" accept="application/pdf" style="display:none;">
      <span id="ai-guide-upload-filename" class="text-xs text-muted"></span>
    </div>` : "";
  panel.innerHTML = `
    <div class="ai-guide-header">
      <div style="font-weight:700;display:flex;align-items:center;gap:8px;">🤖 AI Guide</div>
      <span class="pointer" id="ai-guide-close" style="font-size:1.2rem;color:var(--muted);">×</span>
    </div>
    <div class="ai-guide-messages" id="ai-guide-messages">
      <div class="ai-guide-msg bot">${introText}</div>
    </div>
    <div class="ai-guide-suggestions" id="ai-guide-suggestions"></div>
    ${uploadRow}
    <div class="ai-guide-input">
      <input type="text" id="ai-guide-input" placeholder="${onBuilderPage ? 'Ask a question, or tell me what to build...' : 'Type your question...'}" />
      <button class="btn btn-primary btn-sm" id="ai-guide-send">➤</button>
    </div>
  `;
  document.body.appendChild(panel);

  fab.onclick = () => {
    panel.classList.toggle("open");
    fab.classList.remove("has-hint");
    if (panel.classList.contains("open")) loadSuggestions();
  };
  document.getElementById("ai-guide-close").onclick = () => panel.classList.remove("open");

  // A single, subtle pulse glow a little while after the page loads, to
  // gently draw attention to the AI Guide without being distracting or
  // repeating indefinitely.
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setTimeout(() => {
      if (!panel.classList.contains("open")) fab.classList.add("has-hint");
    }, 4000);
  }

  const messagesEl = document.getElementById("ai-guide-messages");
  const inputEl = document.getElementById("ai-guide-input");
  const suggestionsEl = document.getElementById("ai-guide-suggestions");

  function addMessage(text, sender, opts) {
    const el = document.createElement("div");
    el.className = `ai-guide-msg ${sender}`;
    if (opts && opts.badge) {
      const badge = document.createElement("span");
      badge.className = "ai-guide-badge";
      badge.innerText = opts.badge;
      el.appendChild(badge);
    }
    const textNode = document.createElement("div");
    textNode.innerText = text;
    el.appendChild(textNode);
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function ask(query) {
    addMessage(query, "user");
    inputEl.value = "";

    // If a bot builder page is open, flush any unsaved canvas edits to the
    // server FIRST so the Agent (which reads/writes the bot's flow
    // directly in the database) always starts from what's actually on
    // screen, and never silently discards in-progress local changes when
    // its result gets adopted below.
    if (window.CURRENT_BOT_ID && typeof window.saveCurrentFlowSilently === "function") {
      try { await window.saveCurrentFlowSilently(); } catch (e) { /* non-fatal */ }
    }

    const typingEl = document.createElement("div");
    typingEl.className = "ai-guide-msg bot ai-guide-typing";
    typingEl.innerText = "...";
    messagesEl.appendChild(typingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const payload = { query };
    if (window.CURRENT_BOT_ID) payload.bot_id = window.CURRENT_BOT_ID;
    const result = await API.post("/api/guide/ask", payload);
    typingEl.remove();

    if (result.success) {
      if (result.agent_action) {
        // Conversational Requirements Gathering / Interactive Deployment
        // Prompting: the Agent may be mid-conversation (asking a
        // clarifying question, or waiting on a deployment-channel
        // answer) instead of having just built something -- badge it
        // accordingly so the user understands what's happening.
        let badge;
        if (result.conversation_stage === "clarifying") badge = "💬 Gathering requirements";
        else if (result.conversation_stage === "deployment_finalized") badge = "🚀 Deployment";
        else badge = result.used_ai ? "🤖 AI Agent" : "⚙️ Rule-based Agent";
        addMessage(result.answer, "bot", { badge });
        if (result.flow) {
          // Let the Bot Builder canvas (if open) pick up the new nodes
          // immediately, without requiring a page reload.
          document.dispatchEvent(new CustomEvent("ai-guide:flow-updated", { detail: { flow: result.flow, addedNodes: result.added_nodes || [] } }));
          toast?.("AI Guide added nodes to your flow. 🎉", "success");
        }
        if (result.deployment_prompt) renderDeploymentPrompt(result.deployment_prompt);
        if (result.conversation_stage === "deployment_finalized" && result.integrations_url) {
          renderDeploymentFinalizedLink(result.integrations_url);
        }
      } else {
        addMessage(result.answer, "bot");
      }
      renderSuggestions(result.suggestions || []);
    } else {
      addMessage(result.error || "Sorry, I couldn't process that right now.", "bot");
    }
  }

  // ------------- PDF upload: alternative to typing a build prompt -------------
  // Dynamic Bot Generation via a document: the Agent parses the PDF's
  // text server-side (routers/guide_api.py -> rag/text_extraction.py) and
  // runs it through the SAME build_and_apply() pipeline used for typed
  // instructions, so the result (nodes dropped on canvas + honest
  // used_ai labeling + deployment prompt) behaves identically either way.
  async function askWithFile(file) {
    if (!window.CURRENT_BOT_ID) return;
    addMessage(`📎 ${file.name}`, "user");

    if (typeof window.saveCurrentFlowSilently === "function") {
      try { await window.saveCurrentFlowSilently(); } catch (e) { /* non-fatal */ }
    }

    const typingEl = document.createElement("div");
    typingEl.className = "ai-guide-msg bot ai-guide-typing";
    typingEl.innerText = "Reading your PDF...";
    messagesEl.appendChild(typingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("bot_id", window.CURRENT_BOT_ID);
    const result = await API.postForm("/api/guide/ask-with-file", formData);
    typingEl.remove();

    if (result.success) {
      const badge = result.used_ai ? "🤖 AI Agent (from PDF)" : "⚙️ Rule-based Agent (from PDF)";
      addMessage(result.answer, "bot", { badge });
      if (result.flow) {
        document.dispatchEvent(new CustomEvent("ai-guide:flow-updated", { detail: { flow: result.flow, addedNodes: result.added_nodes || [] } }));
        toast?.("AI Guide built a flow from your PDF. 🎉", "success");
      }
      if (result.deployment_prompt) renderDeploymentPrompt(result.deployment_prompt);
      renderSuggestions(result.suggestions || []);
    } else {
      addMessage(result.error || "Sorry, I couldn't read that PDF.", "bot");
    }
  }

  // ------------- Deployment channel prompt -------------
  // Shown once the Agent has finished building/updating a flow (Platform
  // Deployment Selection step): a small set of channel buttons that just
  // deep-link into the Integrations page's already-working connect flows
  // (routers/integration_api.py) -- no new connect logic is duplicated
  // here, this is purely a guided "where next" prompt.
  function renderDeploymentPrompt(prompt) {
    const el = document.createElement("div");
    el.className = "ai-guide-msg bot ai-guide-deploy-prompt";
    const channelsHtml = (prompt.channels || []).map(c =>
      `<button class="ai-guide-channel-btn" data-channel="${c.id}" title="${escapeHtmlSafe(c.description)}">${c.icon} ${c.label}</button>`
    ).join("");
    el.innerHTML = `<div>${escapeHtmlSafe(prompt.message)}</div><div class="ai-guide-channels">${channelsHtml}</div>`;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    // Clicking a channel button answers the Agent's interactive
    // deployment-channel question exactly like typing it would (routes
    // through the same /api/guide/ask conversation turn), then hands off
    // to the Integrations page to finish connecting it.
    el.querySelectorAll(".ai-guide-channel-btn").forEach(btn => {
      btn.onclick = () => {
        const label = btn.innerText.trim();
        el.querySelectorAll(".ai-guide-channel-btn").forEach(b => b.disabled = true);
        ask(label);
      };
    });
  }
  function renderDeploymentFinalizedLink(url) {
    const el = document.createElement("div");
    el.className = "ai-guide-msg bot ai-guide-deploy-prompt";
    el.innerHTML = `<a class="btn btn-primary btn-sm" href="${url}">Open Integrations →</a>`;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function escapeHtmlSafe(s) { return typeof escapeHtml === "function" ? escapeHtml(s || "") : (s || ""); }

  function renderSuggestions(list) {
    suggestionsEl.innerHTML = "";
    list.slice(0, 4).forEach((q) => {
      const btn = document.createElement("button");
      btn.innerText = q;
      btn.onclick = () => ask(q);
      suggestionsEl.appendChild(btn);
    });
  }

  async function loadSuggestions() {
    if (suggestionsEl.childElementCount > 0) return;
    const result = await API.get("/api/guide/suggestions");
    if (result.success) renderSuggestions(result.suggestions);
  }

  document.getElementById("ai-guide-send").onclick = () => {
    const val = inputEl.value.trim();
    if (val) ask(val);
  };
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const val = inputEl.value.trim();
      if (val) ask(val);
    }
  });

  const pdfInput = document.getElementById("ai-guide-pdf-input");
  if (pdfInput) {
    pdfInput.addEventListener("change", () => {
      const file = pdfInput.files && pdfInput.files[0];
      if (!file) return;
      document.getElementById("ai-guide-upload-filename").innerText = file.name;
      askWithFile(file);
      pdfInput.value = "";
      setTimeout(() => { document.getElementById("ai-guide-upload-filename").innerText = ""; }, 3000);
    });
  }
}

document.addEventListener("DOMContentLoaded", initAIGuide);
