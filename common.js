/* =========================================================================
   AI Chatbot Builder — Shared front-end utilities
   ========================================================================= */

// ---------------- API client ----------------
const API = {
  async request(method, url, body, isForm) {
    const opts = { method, headers: {}, credentials: "same-origin" };
    if (body && !isForm) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    } else if (isForm) {
      opts.body = body;
    }
    let resp;
    try {
      resp = await fetch(url, opts);
    } catch (e) {
      throw { success: false, error: "Network error. Please check your connection.", status: 0 };
    }
    let data;
    try {
      data = await resp.json();
    } catch (e) {
      data = { success: resp.ok, error: "Unexpected server response." };
    }
    if (!resp.ok && !data.error) data.error = `Request failed (${resp.status})`;
    data._status = resp.status;
    return data;
  },
  get(url) { return this.request("GET", url); },
  post(url, body) { return this.request("POST", url, body || {}); },
  put(url, body) { return this.request("PUT", url, body || {}); },
  del(url) { return this.request("DELETE", url); },
  postForm(url, formData) { return this.request("POST", url, formData, true); },
};

// ---------------- Toasts ----------------
function toast(message, type = "info", timeout = 4200) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const icons = { success: "✅", error: "⚠️", info: "ℹ️" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s ease, transform .3s ease";
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

// ---------------- Confirm dialog ----------------
function confirmDialog(message, title = "Are you sure?") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>${title}</h3>
        <p class="text-muted text-sm">${message}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
          <button class="btn btn-danger" id="confirm-ok">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#confirm-cancel").onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector("#confirm-ok").onclick = () => { overlay.remove(); resolve(true); };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

// ---------------- Hover glow-spotlight effect ----------------
// NOTE: this used to apply a full perspective()/rotateX/rotateY 3D tilt on
// every [data-tilt] card. That's been removed -- the element's actual
// lift is now handled entirely by the plain `transform: translateY(-5px)`
// rule in main.css (.card:hover), so nothing here writes to `transform`
// at all. All this does now is track the cursor position as --mx/--my
// custom properties, which the [data-tilt]::before radial-gradient layer
// in main.css uses to draw a glow spotlight that follows the mouse.
// Skipped entirely when the user has requested reduced motion.
function initTiltEffect() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll("[data-tilt]").forEach((el) => {
    if (el.dataset.tiltBound) return;
    el.dataset.tiltBound = "1";
    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
    });
    el.addEventListener("mouseleave", () => {
      el.style.removeProperty("--mx");
      el.style.removeProperty("--my");
    });
  });
}

// ---------------- Auto-wrap leading button/nav-link emoji ----------------
// Lets a plain "➕ Create Bot" button gain a `.btn-icon` span (see main.css
// for the hover 3D spin keyframes) without having to hand-edit every
// template. Idempotent (dataset.iconWrapped guard) and safe to call
// repeatedly, including on dynamically-rendered cards -- a MutationObserver
// below re-runs it automatically whenever new buttons are injected.
function wrapButtonIcons(root) {
  root = root || document;
  const EMOJI_RE = /^(\s*)(\p{Extended_Pictographic}\uFE0F?)/u;
  root.querySelectorAll(".btn").forEach((btn) => {
    if (btn.dataset.iconWrapped) return;
    btn.dataset.iconWrapped = "1";
    if (btn.querySelector(".icon, .btn-icon, .spinner")) return;
    const firstNode = btn.childNodes[0];
    if (firstNode && firstNode.nodeType === Node.TEXT_NODE) {
      const m = firstNode.textContent.match(EMOJI_RE);
      if (m) {
        const emoji = m[2];
        const rest = firstNode.textContent.slice(m[0].length);
        const span = document.createElement("span");
        span.className = "btn-icon";
        span.textContent = emoji;
        firstNode.textContent = " " + rest;
        btn.insertBefore(span, firstNode);
      }
    }
  });
}

(function observeDynamicButtons() {
  wrapButtonIcons();
  if (typeof MutationObserver === "undefined") return;
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { wrapButtonIcons(); pending = false; });
  });
  document.addEventListener("DOMContentLoaded", () => {
    wrapButtonIcons();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();

// ---------------- Page transition (flat cross-fade, NOT 3D) ----------------
// Applies a small, flat opacity/translateY cross-fade when navigating
// between app pages (sidebar links, "View all", "Open", etc.) instead of
// an instant blank-then-reload swap. This does NOT rotate, tilt, or
// perspective-transform the page in any way -- the body and .app-shell
// stay completely flat at all times; see the .page-entering/.page-exiting
// rules in main.css. Scoped to pages that render the authenticated app
// shell (.app-shell in base_app.html / base_admin.html) so the public
// auth/landing page's own scene-transition system (which has its own
// animated flow) is completely untouched.
// Exposed globally so pages can trigger the same 3D exit transition after a
// button click that navigates programmatically once an async action
// completes (e.g. "Create Bot" -> redirect to the new bot's builder),
// instead of only covering plain <a href> clicks.
function navigateWithTransition(url) {
  const shell = document.querySelector(".app-shell");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!shell || prefersReducedMotion) { window.location.href = url; return; }
  shell.classList.add("page-exiting");
  setTimeout(() => { window.location.href = url; }, 380);
}

(function initPageTransitions() {
  const shell = document.querySelector(".app-shell");
  if (!shell) return;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function isTransitionableLink(a) {
    if (!a) return false;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) return false;
    if (a.target && a.target !== "" && a.target !== "_self") return false;
    if (a.hasAttribute("download") || a.dataset.noTransition !== undefined) return false;
    if (a.classList.contains("nav-link-disabled")) return false;
    try {
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return false;
      if (url.href === window.location.href) return false;
    } catch (e) { return false; }
    return true;
  }

  // Play the entrance half of the transition on every fresh load of an app
  // page (the exit half plays on the *previous* page just before it
  // navigates away -- see the click handler below). Runs on the next frame
  // so the initial (pre-animation) state actually paints first.
  shell.classList.add("page-entering");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => shell.classList.remove("page-entering"));
  });

  document.addEventListener("click", (e) => {
    if (prefersReducedMotion || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!isTransitionableLink(a)) return;
    e.preventDefault();
    shell.classList.add("page-exiting");
    setTimeout(() => { window.location.href = a.href; }, 380);
  });

  // If the page is restored from the back/forward cache mid-transition
  // (user clicked a link, then hit Back before the navigation completed),
  // make sure it isn't stuck showing the "exiting" state.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) shell.classList.remove("page-exiting");
  });
})();

// ---------------- Time formatting ----------------
function timeAgo(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString + (isoString.endsWith("Z") ? "" : "Z"));
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

document.addEventListener("DOMContentLoaded", initTiltEffect);
