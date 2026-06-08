// ==UserScript==
// @name         Rod / Docs / DevDocs Go
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Modern mobile UI for DevDocs Go pages.
// @author       Rod
// @match        https://devdocs.io/go/**/*
// @run-at       document-idle
// @weight       430
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  /**
   * Runtime configuration.
   *
   * @type {{
   *   debug: boolean;
   *   rootClass: string;
   *   readyIntervalMs: number;
   *   maxReadyTries: number;
   * }}
   */
  const CONFIG = {
    debug: false,
    rootClass: "migos-devdocs-modern",
    readyIntervalMs: 250,
    maxReadyTries: 80,
  };

  /**
   * Writes debug logs when enabled.
   *
   * @param {...unknown} args Values to log.
   * @returns {void}
   */
  function debugLog(...args) {
    if (!CONFIG.debug) return;
    console.debug("[DevDocs Modern]", ...args);
  }

  /**
   * Injects the modern stylesheet.
   *
   * @returns {void}
   */
  function injectStyles() {
    const style = document.createElement("style");
    style.id = "migos-devdocs-modern-style";

    style.textContent = `
      :root {
        --migos-bg: #09090b;
        --migos-bg-soft: #0f1014;
        --migos-panel: rgba(24, 24, 27, 0.82);
        --migos-panel-solid: #18181b;
        --migos-border: rgba(255, 255, 255, 0.08);
        --migos-border-strong: rgba(255, 255, 255, 0.14);
        --migos-text: #f4f4f5;
        --migos-muted: #a1a1aa;
        --migos-dim: #71717a;
        --migos-accent: #fafafa;
        --migos-code: #d4d4d8;
        --migos-radius: 14px;
        --migos-radius-sm: 10px;
        --migos-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
        --migos-font: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --migos-mono: "SFMono-Regular", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
      }

      html.${CONFIG.rootClass},
      html.${CONFIG.rootClass} body {
        background:
          radial-gradient(circle at top left, rgba(82, 82, 91, 0.20), transparent 34rem),
          radial-gradient(circle at bottom right, rgba(63, 63, 70, 0.18), transparent 30rem),
          var(--migos-bg) !important;
        color: var(--migos-text) !important;
        font-family: var(--migos-font) !important;
      }

      html.${CONFIG.rootClass} body {
        overflow: auto !important;
      }

      html.${CONFIG.rootClass} ::selection {
        background: rgba(244, 244, 245, 0.22) !important;
        color: #fff !important;
      }

      html.${CONFIG.rootClass} #app,
      html.${CONFIG.rootClass} ._app,
      html.${CONFIG.rootClass} .app {
        background: transparent !important;
      }

      html.${CONFIG.rootClass} .sidebar {
        width: 320px !important;
        background: rgba(9, 9, 11, 0.78) !important;
        backdrop-filter: blur(22px) saturate(130%) !important;
        border-right: 1px solid var(--migos-border) !important;
        box-shadow: var(--migos-shadow) !important;
      }

      html.${CONFIG.rootClass} .sidebar,
      html.${CONFIG.rootClass} .sidebar * {
        font-family: var(--migos-font) !important;
      }

      html.${CONFIG.rootClass} .sidebar .list,
      html.${CONFIG.rootClass} .sidebar .entries,
      html.${CONFIG.rootClass} .sidebar .index {
        padding: 12px !important;
      }

      html.${CONFIG.rootClass} .sidebar a,
      html.${CONFIG.rootClass} .sidebar .entry,
      html.${CONFIG.rootClass} .sidebar .link,
      html.${CONFIG.rootClass} .sidebar li {
        border-radius: 10px !important;
      }

      html.${CONFIG.rootClass} .sidebar a {
        color: var(--migos-muted) !important;
        text-decoration: none !important;
        transition:
          background 160ms ease,
          color 160ms ease,
          transform 160ms ease !important;
      }

      html.${CONFIG.rootClass} .sidebar a:hover {
        background: rgba(255, 255, 255, 0.07) !important;
        color: var(--migos-text) !important;
        transform: translateX(2px) !important;
      }

      html.${CONFIG.rootClass} .sidebar a.active,
      html.${CONFIG.rootClass} .sidebar .active > a,
      html.${CONFIG.rootClass} .sidebar .selected,
      html.${CONFIG.rootClass} .sidebar .current {
        background: rgba(255, 255, 255, 0.10) !important;
        color: #fff !important;
        box-shadow: inset 0 0 0 1px var(--migos-border) !important;
      }

      html.${CONFIG.rootClass} .search,
      html.${CONFIG.rootClass} .search-form,
      html.${CONFIG.rootClass} .search-container {
        padding: 14px !important;
        background: rgba(9, 9, 11, 0.84) !important;
        backdrop-filter: blur(18px) !important;
        border-bottom: 1px solid var(--migos-border) !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 50 !important;
      }

      html.${CONFIG.rootClass} input[type="search"],
      html.${CONFIG.rootClass} .search input,
      html.${CONFIG.rootClass} input[name="q"] {
        width: 100% !important;
        min-height: 42px !important;
        border-radius: 12px !important;
        border: 1px solid var(--migos-border-strong) !important;
        background: rgba(255, 255, 255, 0.06) !important;
        color: var(--migos-text) !important;
        outline: none !important;
        padding: 0 14px !important;
        font-family: var(--migos-font) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
      }

      html.${CONFIG.rootClass} input[type="search"]:focus,
      html.${CONFIG.rootClass} .search input:focus {
        border-color: rgba(255, 255, 255, 0.28) !important;
        background: rgba(255, 255, 255, 0.09) !important;
        box-shadow:
          0 0 0 4px rgba(255, 255, 255, 0.06),
          inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
      }

      html.${CONFIG.rootClass} .content,
      html.${CONFIG.rootClass} .main,
      html.${CONFIG.rootClass} main,
      html.${CONFIG.rootClass} .document {
        background: transparent !important;
        color: var(--migos-text) !important;
      }

      html.${CONFIG.rootClass} .content {
        padding: 28px clamp(18px, 4vw, 56px) !important;
      }

      html.${CONFIG.rootClass} .content > article,
      html.${CONFIG.rootClass} article,
      html.${CONFIG.rootClass} ._content {
        max-width: 980px !important;
        margin: 0 auto !important;
        padding: 34px !important;
        border-radius: 22px !important;
        border: 1px solid var(--migos-border) !important;
        background: rgba(18, 18, 21, 0.76) !important;
        box-shadow: var(--migos-shadow) !important;
        backdrop-filter: blur(18px) !important;
      }

      html.${CONFIG.rootClass} h1,
      html.${CONFIG.rootClass} h2,
      html.${CONFIG.rootClass} h3,
      html.${CONFIG.rootClass} h4 {
        color: #fff !important;
        letter-spacing: -0.035em !important;
        font-weight: 720 !important;
      }

      html.${CONFIG.rootClass} h1 {
        font-size: clamp(2rem, 4vw, 3.6rem) !important;
        line-height: 0.98 !important;
        margin-bottom: 22px !important;
      }

      html.${CONFIG.rootClass} h2 {
        margin-top: 42px !important;
        padding-top: 28px !important;
        border-top: 1px solid var(--migos-border) !important;
      }

      html.${CONFIG.rootClass} p,
      html.${CONFIG.rootClass} li,
      html.${CONFIG.rootClass} dd,
      html.${CONFIG.rootClass} td {
        color: var(--migos-muted) !important;
        font-size: 15.5px !important;
        line-height: 1.78 !important;
      }

      html.${CONFIG.rootClass} a {
        color: #e4e4e7 !important;
        text-underline-offset: 4px !important;
      }

      html.${CONFIG.rootClass} a:hover {
        color: #fff !important;
      }

      html.${CONFIG.rootClass} pre,
      html.${CONFIG.rootClass} code,
      html.${CONFIG.rootClass} kbd,
      html.${CONFIG.rootClass} samp {
        font-family: var(--migos-mono) !important;
      }

      html.${CONFIG.rootClass} pre {
        border-radius: 16px !important;
        border: 1px solid var(--migos-border) !important;
        background: #0c0c0f !important;
        color: var(--migos-code) !important;
        padding: 18px !important;
        overflow: auto !important;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.04),
          0 18px 60px rgba(0, 0, 0, 0.24) !important;
      }

      html.${CONFIG.rootClass} code {
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        background: rgba(255, 255, 255, 0.07) !important;
        color: #f4f4f5 !important;
        border-radius: 7px !important;
        padding: 0.14em 0.38em !important;
      }

      html.${CONFIG.rootClass} pre code {
        border: 0 !important;
        background: transparent !important;
        padding: 0 !important;
      }

      html.${CONFIG.rootClass} table {
        width: 100% !important;
        border-collapse: separate !important;
        border-spacing: 0 !important;
        overflow: hidden !important;
        border-radius: 14px !important;
        border: 1px solid var(--migos-border) !important;
        background: rgba(255, 255, 255, 0.03) !important;
      }

      html.${CONFIG.rootClass} th {
        background: rgba(255, 255, 255, 0.06) !important;
        color: #fff !important;
      }

      html.${CONFIG.rootClass} th,
      html.${CONFIG.rootClass} td {
        border-bottom: 1px solid var(--migos-border) !important;
        padding: 10px 12px !important;
      }

      html.${CONFIG.rootClass} blockquote {
        border-left: 3px solid rgba(255, 255, 255, 0.28) !important;
        background: rgba(255, 255, 255, 0.05) !important;
        color: var(--migos-muted) !important;
        border-radius: 12px !important;
        padding: 12px 16px !important;
      }

      html.${CONFIG.rootClass} .migos-topbar {
        position: fixed;
        left: 340px;
        right: 20px;
        top: 14px;
        z-index: 9999;
        height: 46px;
        border: 1px solid var(--migos-border);
        border-radius: 999px;
        background: rgba(12, 12, 15, 0.72);
        backdrop-filter: blur(20px) saturate(130%);
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 14px 0 18px;
        color: var(--migos-muted);
        font: 13px/1 var(--migos-font);
        pointer-events: none;
      }

      html.${CONFIG.rootClass} .migos-topbar strong {
        color: #fff;
        font-weight: 680;
      }

      html.${CONFIG.rootClass} .migos-pill {
        border: 1px solid var(--migos-border);
        border-radius: 999px;
        padding: 7px 10px;
        background: rgba(255, 255, 255, 0.05);
        color: var(--migos-muted);
      }

      html.${CONFIG.rootClass} .content,
      html.${CONFIG.rootClass} main {
        padding-top: 78px !important;
      }

      @media (max-width: 900px) {
        html.${CONFIG.rootClass} .sidebar {
          width: 100% !important;
          max-height: 42vh !important;
          position: relative !important;
          border-right: 0 !important;
          border-bottom: 1px solid var(--migos-border) !important;
        }

        html.${CONFIG.rootClass} .migos-topbar {
          display: none !important;
        }

        html.${CONFIG.rootClass} .content,
        html.${CONFIG.rootClass} main {
          padding: 16px !important;
        }

        html.${CONFIG.rootClass} .content > article,
        html.${CONFIG.rootClass} article,
        html.${CONFIG.rootClass} ._content {
          padding: 22px !important;
          border-radius: 18px !important;
        }
      }
    `;

    document.documentElement.appendChild(style);
  }

  /**
   * Adds a floating topbar with context actions.
   *
   * @returns {void}
   */
  function injectTopbar() {
    if (document.querySelector(".migos-topbar")) return;

    const topbar = document.createElement("div");
    topbar.className = "migos-topbar";
    topbar.innerHTML = `
      <div><strong>Go Docs</strong> · DevDocs modernized</div>
      <div class="migos-pill">⌘/Ctrl + K search</div>
    `;

    document.body.appendChild(topbar);
  }

  /**
   * Focuses the DevDocs search input.
   *
   * @returns {void}
   */
  function focusSearch() {
    const input =
      document.querySelector('input[type="search"]') ||
      document.querySelector(".search input") ||
      document.querySelector('input[name="q"]');

    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }

  /**
   * Installs keyboard shortcuts.
   *
   * @returns {void}
   */
  function installShortcuts() {
    window.addEventListener(
      "keydown",
      (event) => {
        const isSearchShortcut =
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "k";

        if (!isSearchShortcut) return;

        event.preventDefault();
        focusSearch();
      },
      true,
    );
  }

  /**
   * Applies semantic classes and small accessibility polish.
   *
   * @returns {void}
   */
  function polishDom() {
    document.documentElement.classList.add(CONFIG.rootClass);

    const searchInput =
      document.querySelector('input[type="search"]') ||
      document.querySelector(".search input") ||
      document.querySelector('input[name="q"]');

    if (searchInput instanceof HTMLInputElement) {
      searchInput.placeholder = "Search Go docs, packages, symbols…";
      searchInput.setAttribute("autocomplete", "off");
      searchInput.setAttribute("spellcheck", "false");
    }

    document.querySelectorAll("pre").forEach((pre) => {
      pre.setAttribute("tabindex", "0");
    });
  }

  /**
   * Waits until DevDocs has rendered enough DOM to enhance safely.
   *
   * @returns {void}
   */
  function waitForReady() {
    let tries = 0;

    const timer = window.setInterval(() => {
      tries += 1;

      const hasBody = Boolean(document.body);
      const hasContent =
        Boolean(document.querySelector(".content")) ||
        Boolean(document.querySelector("main")) ||
        Boolean(document.querySelector("article"));
      const hasSearch =
        Boolean(document.querySelector('input[type="search"]')) ||
        Boolean(document.querySelector(".search input"));

      if ((hasBody && hasContent) || tries >= CONFIG.maxReadyTries) {
        window.clearInterval(timer);

        debugLog("Enhancing DevDocs", { tries, hasContent, hasSearch });

        polishDom();
        injectTopbar();
        installShortcuts();

        const observer = new MutationObserver(() => polishDom());
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    }, CONFIG.readyIntervalMs);
  }

  injectStyles();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForReady, { once: true });
  } else {
    waitForReady();
  }
})();