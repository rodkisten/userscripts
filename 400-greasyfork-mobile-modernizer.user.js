// ==UserScript==
// @name         Rod / Sites / Greasy Fork Modernizer
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Modern Greasy Fork mobile UI with fixed search, dark theme, and script browsing polish.
// @author       Rod
// @match        https://greasyfork.org/*
// @match        https://www.greasyfork.org/*
// @run-at       document-idle
// @weight       390
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  /********************************************************************************************************
   * Constants
   ********************************************************************************************************/

  const APP_ID = "rod-gf-modernizer";
  const STYLE_ID = "rod-gf-modernizer-style";
  const STORAGE_KEY = "rod.gf.modernizer.theme.v2";
  const SEARCH_PATH = "/scripts";
  const SEARCH_PARAM = "q";

  const THEMES = {
    graphite: "Graphite",
    slate: "Slate",
    violet: "Violet",
    emerald: "Emerald",
    amber: "Amber",
  };

  const DEFAULT_THEME = "graphite";

  const SELECTORS = {
    searchInput: 'input[type="search"], input[name="q"], #q',
    searchForm: 'form[action*="/scripts"], form:has(input[name="q"])',
    sidebar: "#script-list-option-groups, .script-list-option-groups, aside, .sidebar",
    scriptList: "ol.script-list, ul.script-list",
    scriptItem: "ol.script-list > li, ul.script-list > li",
    installLink: 'a.install-link, a[href$=".user.js"]',
    codeBlock: "pre, #script-content, .code-container",
    adNoise: [
      ".ad",
      ".ads",
      ".advertisement",
      "[class*='advertisement']",
      "[id*='advertisement']",
      "iframe",
    ],
  };

  let searchTimer = 0;

  /********************************************************************************************************
   * Boot
   ********************************************************************************************************/

  boot();

  /**
   * Starts the userscript.
   *
   * @returns {void}
   */
  function boot() {
    document.documentElement.dataset.rodGfTheme = getSavedTheme();
    document.documentElement.classList.add("rod-gf-ready");

    installStyles();
    removeNoise();
    createTopbar();
    createThemeMenu();
    createFilterSheet();
    enhanceExistingSearch();
    enhanceScriptList();
    enhanceScriptPage();
    enhanceCodeBlocks();

    new MutationObserver(() => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        removeNoise();
        enhanceExistingSearch();
        enhanceScriptList();
        enhanceScriptPage();
        enhanceCodeBlocks();
      }, 180);
    }).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /********************************************************************************************************
   * UI
   ********************************************************************************************************/

  /**
   * Creates the fixed top search bar.
   *
   * @returns {void}
   */
  function createTopbar() {
    if (document.getElementById(APP_ID)) return;

    const root = document.createElement("div");
    root.id = APP_ID;
    root.innerHTML = `
      <div class="rgf-topbar">
        <a class="rgf-logo" href="/en/scripts" aria-label="Greasy Fork scripts">GF</a>

        <form class="rgf-search" role="search">
          <span class="rgf-search-icon">⌕</span>
          <input class="rgf-search-input" type="search" placeholder="Search scripts..." autocomplete="off" spellcheck="false" />
          <button class="rgf-clear" type="button" aria-label="Clear search">×</button>
        </form>

        <button class="rgf-icon-button" type="button" data-rgf-action="filters" aria-label="Open filters">☰</button>
        <button class="rgf-icon-button" type="button" data-rgf-action="themes" aria-label="Theme options">◐</button>
      </div>
    `;

    document.body.prepend(root);

    const input = root.querySelector(".rgf-search-input");
    const clear = root.querySelector(".rgf-clear");
    const form = root.querySelector(".rgf-search");

    if (input instanceof HTMLInputElement) {
      input.value = new URL(location.href).searchParams.get(SEARCH_PARAM) || "";
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch(input.value);
    });

    input.addEventListener("input", () => {
      filterVisibleScripts(input.value);
    });

    clear.addEventListener("click", () => {
      input.value = "";
      filterVisibleScripts("");
      input.focus();
    });

    root.querySelector('[data-rgf-action="filters"]').addEventListener("click", () => {
      document.documentElement.classList.toggle("rod-gf-filters-open");
    });

    root.querySelector('[data-rgf-action="themes"]').addEventListener("click", () => {
      document.documentElement.classList.toggle("rod-gf-themes-open");
    });
  }

  /**
   * Creates the theme picker.
   *
   * @returns {void}
   */
  function createThemeMenu() {
    if (document.querySelector(".rgf-theme-menu")) return;

    const menu = document.createElement("div");
    menu.className = "rgf-theme-menu";
    menu.innerHTML = `
      <div class="rgf-pop-title">Theme</div>
      ${Object.entries(THEMES)
        .map(
          ([key, label]) => `
            <button class="rgf-theme-option" type="button" data-theme="${key}">
              <span></span>
              ${label}
            </button>
          `,
        )
        .join("")}
    `;

    document.body.append(menu);

    menu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-theme]");
      if (!(button instanceof HTMLElement)) return;

      const theme = button.dataset.theme || DEFAULT_THEME;
      document.documentElement.dataset.rodGfTheme = theme;
      localStorage.setItem(STORAGE_KEY, theme);
      document.documentElement.classList.remove("rod-gf-themes-open");
    });
  }

  /**
   * Creates a safe filter sheet without forcing the native sidebar into the viewport.
   *
   * @returns {void}
   */
  function createFilterSheet() {
    if (document.querySelector(".rgf-filter-sheet")) return;

    const sheet = document.createElement("div");
    sheet.className = "rgf-filter-sheet";
    sheet.innerHTML = `
      <div class="rgf-sheet-head">
        <strong>Search options</strong>
        <button type="button" data-rgf-close>×</button>
      </div>
      <div class="rgf-sheet-body"></div>
    `;

    document.body.append(sheet);

    sheet.querySelector("[data-rgf-close]").addEventListener("click", () => {
      document.documentElement.classList.remove("rod-gf-filters-open");
    });

    moveSidebarIntoSheet();
  }

  /**
   * Moves Greasy Fork search filters into the controlled mobile sheet.
   *
   * @returns {void}
   */
  function moveSidebarIntoSheet() {
    const body = document.querySelector(".rgf-sheet-body");
    const sidebar = document.querySelector(SELECTORS.sidebar);

    if (!body || !sidebar || sidebar.dataset.rgfMoved === "true") return;

    sidebar.dataset.rgfMoved = "true";
    sidebar.classList.add("rgf-native-filters");
    body.append(sidebar);
  }

  /********************************************************************************************************
   * Enhancers
   ********************************************************************************************************/

  /**
   * Hides noisy elements.
   *
   * @returns {void}
   */
  function removeNoise() {
    for (const selector of SELECTORS.adNoise) {
      document.querySelectorAll(selector).forEach((node) => {
        node.remove();
      });
    }
  }

  /**
   * Keeps native search in sync but visually quiet.
   *
   * @returns {void}
   */
  function enhanceExistingSearch() {
    document.querySelectorAll(SELECTORS.searchInput).forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      if (input.classList.contains("rgf-search-input")) return;

      input.dataset.rgfNativeSearch = "true";
    });
  }

  /**
   * Improves script list items without rebuilding their DOM.
   *
   * @returns {void}
   */
  function enhanceScriptList() {
    document.querySelectorAll(SELECTORS.scriptList).forEach((list) => {
      list.classList.add("rgf-script-list");
    });

    document.querySelectorAll(SELECTORS.scriptItem).forEach((item) => {
      if (!(item instanceof HTMLElement)) return;
      item.classList.add("rgf-script-card");
    });
  }

  /**
   * Improves script detail pages.
   *
   * @returns {void}
   */
  function enhanceScriptPage() {
    const install = document.querySelector(SELECTORS.installLink);

    if (install instanceof HTMLAnchorElement) {
      install.classList.add("rgf-install-link");
      createInstallDock(install);
    }

    document.querySelectorAll("h1").forEach((title) => {
      title.classList.add("rgf-title");
    });
  }

  /**
   * Adds a fixed install dock on script pages.
   *
   * @param {HTMLAnchorElement} install Install link.
   * @returns {void}
   */
  function createInstallDock(install) {
    if (document.querySelector(".rgf-install-dock")) return;

    const dock = document.createElement("div");
    dock.className = "rgf-install-dock";

    const installClone = install.cloneNode(true);
    installClone.textContent = "Install";
    installClone.className = "rgf-install-main";

    const raw = document.createElement("a");
    raw.className = "rgf-install-raw";
    raw.href = install.href;
    raw.textContent = "Raw";

    dock.append(installClone, raw);
    document.body.append(dock);
  }

  /**
   * Improves code blocks.
   *
   * @returns {void}
   */
  function enhanceCodeBlocks() {
    document.querySelectorAll(SELECTORS.codeBlock).forEach((block) => {
      if (!(block instanceof HTMLElement)) return;
      if (block.dataset.rgfCode === "true") return;

      block.dataset.rgfCode = "true";
      block.classList.add("rgf-code-block");

      const parent = block.parentElement;
      if (!parent) return;

      const shell = document.createElement("div");
      shell.className = "rgf-code-shell";
      shell.innerHTML = `
        <div class="rgf-code-toolbar">
          <span>Source</span>
          <button type="button" data-copy>Copy</button>
          <button type="button" data-wrap>Wrap</button>
        </div>
      `;

      parent.insertBefore(shell, block);
      shell.append(block);

      shell.querySelector("[data-copy]").addEventListener("click", () => {
        copyText(block.innerText || block.textContent || "");
      });

      shell.querySelector("[data-wrap]").addEventListener("click", () => {
        block.classList.toggle("rgf-wrap");
      });
    });
  }

  /********************************************************************************************************
   * Search
   ********************************************************************************************************/

  /**
   * Runs a Greasy Fork search.
   *
   * @param {string} query Search query.
   * @returns {void}
   */
  function runSearch(query) {
    const url = new URL(location.origin + getLocalizedPath(SEARCH_PATH));
    const value = query.trim();

    if (value) {
      url.searchParams.set(SEARCH_PARAM, value);
    }

    location.href = url.href;
  }

  /**
   * Filters visible script cards locally.
   *
   * @param {string} query Search query.
   * @returns {void}
   */
  function filterVisibleScripts(query) {
    const value = query.trim().toLowerCase();
    const cards = document.querySelectorAll(".rgf-script-card");

    cards.forEach((card) => {
      const text = card.textContent.toLowerCase();
      card.hidden = value.length > 1 && !text.includes(value);
    });
  }

  /**
   * Returns the localized path using the current Greasy Fork language segment.
   *
   * @param {string} path Path.
   * @returns {string}
   */
  function getLocalizedPath(path) {
    const match = location.pathname.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)\b/);
    return match ? `/${match[1]}${path}` : `/en${path}`;
  }

  /********************************************************************************************************
   * Utilities
   ********************************************************************************************************/

  /**
   * Gets the saved theme.
   *
   * @returns {string}
   */
  function getSavedTheme() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  }

  /**
   * Copies text.
   *
   * @param {string} text Text.
   * @returns {Promise<void>}
   */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
      return;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      toast("Copied");
    }
  }

  /**
   * Shows a small toast.
   *
   * @param {string} message Message.
   * @returns {void}
   */
  function toast(message) {
    let node = document.querySelector(".rgf-toast");

    if (!node) {
      node = document.createElement("div");
      node.className = "rgf-toast";
      document.body.append(node);
    }

    node.textContent = message;
    node.classList.add("is-visible");

    window.setTimeout(() => {
      node.classList.remove("is-visible");
    }, 1100);
  }

  /********************************************************************************************************
   * Styles
   ********************************************************************************************************/

  /**
   * Installs stylesheet.
   *
   * @returns {void}
   */
  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html.rod-gf-ready {
        color-scheme: dark !important;
        --rgf-bg: #101114;
        --rgf-bg-2: #15161a;
        --rgf-bg-3: #1b1c21;
        --rgf-card: rgba(255, 255, 255, 0.045);
        --rgf-card-2: rgba(255, 255, 255, 0.07);
        --rgf-line: rgba(255, 255, 255, 0.11);
        --rgf-line-2: rgba(255, 255, 255, 0.18);
        --rgf-text: #f4f4f5;
        --rgf-muted: #a1a1aa;
        --rgf-faint: #71717a;
        --rgf-accent: #c4b5fd;
        --rgf-accent-rgb: 196, 181, 253;
        --rgf-good: #27d17f;
        --rgf-radius: 18px;
        --rgf-shadow: 0 20px 70px rgba(0, 0, 0, 0.42);
        --rgf-font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        --rgf-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background: var(--rgf-bg) !important;
        -webkit-text-size-adjust: 100% !important;
      }

      html[data-rod-gf-theme="slate"] {
        --rgf-accent: #93c5fd;
        --rgf-accent-rgb: 147, 197, 253;
      }

      html[data-rod-gf-theme="violet"] {
        --rgf-accent: #c4b5fd;
        --rgf-accent-rgb: 196, 181, 253;
      }

      html[data-rod-gf-theme="emerald"] {
        --rgf-accent: #86efac;
        --rgf-accent-rgb: 134, 239, 172;
      }

      html[data-rod-gf-theme="amber"] {
        --rgf-accent: #fcd34d;
        --rgf-accent-rgb: 252, 211, 77;
      }

      html.rod-gf-ready::before {
        content: "" !important;
        position: fixed !important;
        inset: 0 !important;
        z-index: -2 !important;
        pointer-events: none !important;
        background:
          radial-gradient(circle at 20% -10%, rgba(var(--rgf-accent-rgb), 0.16), transparent 34rem),
          radial-gradient(circle at 100% 20%, rgba(255, 255, 255, 0.055), transparent 28rem),
          linear-gradient(180deg, #111217, #0d0e11) !important;
      }

      html.rod-gf-ready::after {
        content: "" !important;
        position: fixed !important;
        inset: 0 !important;
        z-index: -1 !important;
        pointer-events: none !important;
        opacity: 0.22 !important;
        background-image:
          radial-gradient(circle at 1px 1px, rgba(255,255,255,0.38) 1px, transparent 0) !important;
        background-size: 14px 14px !important;
        mix-blend-mode: overlay !important;
      }

      html.rod-gf-ready body {
        margin: 0 !important;
        padding-top: 78px !important;
        padding-bottom: 106px !important;
        background: transparent !important;
        color: var(--rgf-text) !important;
        font-family: var(--rgf-font) !important;
      }

      html.rod-gf-ready * {
        box-sizing: border-box !important;
      }

      html.rod-gf-ready a {
        color: var(--rgf-accent) !important;
        text-decoration: none !important;
      }

      #rod-gf-modernizer {
        position: fixed !important;
        top: max(8px, env(safe-area-inset-top)) !important;
        left: 8px !important;
        right: 8px !important;
        z-index: 2147483647 !important;
      }

      .rgf-topbar {
        display: grid !important;
        grid-template-columns: 42px 1fr 42px 42px !important;
        gap: 8px !important;
        align-items: center !important;
        height: 58px !important;
        padding: 8px !important;
        border: 1px solid var(--rgf-line-2) !important;
        border-radius: 999px !important;
        background: rgba(21, 22, 26, 0.82) !important;
        backdrop-filter: blur(22px) saturate(160%) !important;
        -webkit-backdrop-filter: blur(22px) saturate(160%) !important;
        box-shadow: var(--rgf-shadow) !important;
      }

      .rgf-logo,
      .rgf-icon-button {
        display: grid !important;
        place-items: center !important;
        width: 42px !important;
        height: 42px !important;
        border: 1px solid var(--rgf-line) !important;
        border-radius: 999px !important;
        background: rgba(255, 255, 255, 0.055) !important;
        color: var(--rgf-text) !important;
        font: 700 13px var(--rgf-mono) !important;
      }

      .rgf-icon-button {
        appearance: none !important;
        font-size: 18px !important;
      }

      .rgf-search {
        display: grid !important;
        grid-template-columns: 24px 1fr 34px !important;
        align-items: center !important;
        min-width: 0 !important;
        height: 42px !important;
        padding: 0 6px 0 12px !important;
        border: 1px solid var(--rgf-line) !important;
        border-radius: 999px !important;
        background: rgba(255, 255, 255, 0.06) !important;
      }

      .rgf-search-icon {
        color: var(--rgf-muted) !important;
        font: 700 17px var(--rgf-mono) !important;
      }

      .rgf-search-input {
        min-width: 0 !important;
        width: 100% !important;
        height: 40px !important;
        border: 0 !important;
        outline: 0 !important;
        background: transparent !important;
        color: var(--rgf-text) !important;
        font: 500 16px var(--rgf-font) !important;
      }

      .rgf-search-input::placeholder {
        color: var(--rgf-faint) !important;
      }

      .rgf-clear {
        width: 32px !important;
        height: 32px !important;
        border: 0 !important;
        border-radius: 999px !important;
        background: rgba(255, 255, 255, 0.075) !important;
        color: var(--rgf-muted) !important;
        font-size: 22px !important;
      }

      input[data-rgf-native-search="true"] {
        display: none !important;
      }

      header,
      #site-nav,
      .site-nav,
      .width-constraint > nav {
        display: none !important;
      }

      main,
      #content,
      .content,
      .width-constraint {
        width: min(960px, calc(100vw - 18px)) !important;
        max-width: 960px !important;
        margin-inline: auto !important;
      }

      h1.rgf-title,
      h1 {
        color: var(--rgf-text) !important;
        letter-spacing: -0.04em !important;
        line-height: 1 !important;
      }

      .rgf-script-list {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 12px !important;
        padding: 0 !important;
        margin: 12px 0 !important;
        list-style: none !important;
      }

      .rgf-script-card {
        overflow: hidden !important;
        padding: 18px !important;
        border: 1px solid var(--rgf-line) !important;
        border-radius: 22px !important;
        background:
          linear-gradient(145deg, rgba(var(--rgf-accent-rgb), 0.07), transparent 42%),
          linear-gradient(180deg, var(--rgf-card-2), var(--rgf-card)) !important;
        box-shadow: 0 14px 44px rgba(0, 0, 0, 0.26) !important;
      }

      .rgf-script-card[hidden] {
        display: none !important;
      }

      .rgf-script-card h2,
      .rgf-script-card h3,
      .rgf-script-card .script-link {
        color: var(--rgf-accent) !important;
        font-size: 1.1rem !important;
        line-height: 1.2 !important;
      }

      .rgf-script-card p,
      .rgf-script-card .description {
        color: var(--rgf-muted) !important;
        font-size: 0.96rem !important;
      }

      .rgf-script-card dl,
      .rgf-script-card .script-list-ratings {
        border: 1px solid var(--rgf-line) !important;
        border-radius: 18px !important;
        background: rgba(255, 255, 255, 0.035) !important;
        padding: 12px !important;
      }

      .rgf-filter-sheet {
        position: fixed !important;
        top: calc(max(74px, env(safe-area-inset-top) + 70px)) !important;
        right: 8px !important;
        bottom: max(12px, env(safe-area-inset-bottom)) !important;
        z-index: 2147483646 !important;
        width: min(380px, calc(100vw - 16px)) !important;
        display: none !important;
        overflow: hidden !important;
        border: 1px solid var(--rgf-line-2) !important;
        border-radius: 24px !important;
        background: rgba(18, 19, 23, 0.94) !important;
        box-shadow: var(--rgf-shadow) !important;
        backdrop-filter: blur(22px) saturate(160%) !important;
        -webkit-backdrop-filter: blur(22px) saturate(160%) !important;
      }

      html.rod-gf-filters-open .rgf-filter-sheet {
        display: flex !important;
        flex-direction: column !important;
      }

      .rgf-sheet-head {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 14px 16px !important;
        border-bottom: 1px solid var(--rgf-line) !important;
      }

      .rgf-sheet-head strong {
        color: var(--rgf-text) !important;
        font-size: 16px !important;
      }

      .rgf-sheet-head button {
        width: 34px !important;
        height: 34px !important;
        border: 1px solid var(--rgf-line) !important;
        border-radius: 999px !important;
        background: rgba(255,255,255,0.06) !important;
        color: var(--rgf-text) !important;
        font-size: 22px !important;
      }

      .rgf-sheet-body {
        overflow: auto !important;
        padding: 14px !important;
        -webkit-overflow-scrolling: touch !important;
      }

      .rgf-native-filters {
        display: block !important;
        position: static !important;
        width: 100% !important;
        max-width: none !important;
        min-width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
      }

      .rgf-native-filters select,
      .rgf-native-filters input,
      .rgf-native-filters button {
        max-width: 100% !important;
        font-size: 16px !important;
      }

      .rgf-theme-menu {
        position: fixed !important;
        top: calc(max(74px, env(safe-area-inset-top) + 70px)) !important;
        right: 8px !important;
        z-index: 2147483646 !important;
        display: none !important;
        width: 220px !important;
        padding: 10px !important;
        border: 1px solid var(--rgf-line-2) !important;
        border-radius: 20px !important;
        background: rgba(18, 19, 23, 0.94) !important;
        box-shadow: var(--rgf-shadow) !important;
        backdrop-filter: blur(22px) saturate(160%) !important;
        -webkit-backdrop-filter: blur(22px) saturate(160%) !important;
      }

      html.rod-gf-themes-open .rgf-theme-menu {
        display: grid !important;
        gap: 6px !important;
      }

      .rgf-pop-title {
        padding: 8px 10px !important;
        color: var(--rgf-muted) !important;
        font-size: 12px !important;
        text-transform: uppercase !important;
        letter-spacing: 0.12em !important;
      }

      .rgf-theme-option {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        width: 100% !important;
        min-height: 40px !important;
        padding: 0 10px !important;
        border: 1px solid transparent !important;
        border-radius: 14px !important;
        background: transparent !important;
        color: var(--rgf-text) !important;
        text-align: left !important;
        font-size: 14px !important;
      }

      .rgf-theme-option:hover {
        border-color: var(--rgf-line) !important;
        background: rgba(255,255,255,0.06) !important;
      }

      .rgf-theme-option span {
        width: 14px !important;
        height: 14px !important;
        border-radius: 999px !important;
        background: var(--rgf-accent) !important;
      }

      .rgf-install-dock {
        position: fixed !important;
        left: 10px !important;
        right: 10px !important;
        bottom: max(12px, env(safe-area-inset-bottom)) !important;
        z-index: 2147483645 !important;
        display: flex !important;
        gap: 8px !important;
        padding: 8px !important;
        border: 1px solid var(--rgf-line-2) !important;
        border-radius: 999px !important;
        background: rgba(18, 19, 23, 0.86) !important;
        backdrop-filter: blur(22px) saturate(160%) !important;
        -webkit-backdrop-filter: blur(22px) saturate(160%) !important;
        box-shadow: var(--rgf-shadow) !important;
      }

      .rgf-install-main,
      .rgf-install-link {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-height: 42px !important;
        padding: 0 18px !important;
        border-radius: 999px !important;
        border: 0 !important;
        background: linear-gradient(135deg, #22c55e, #14b8a6) !important;
        color: #06130c !important;
        font-weight: 800 !important;
      }

      .rgf-install-main {
        flex: 1 !important;
      }

      .rgf-install-raw {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 68px !important;
        border: 1px solid var(--rgf-line) !important;
        border-radius: 999px !important;
        color: var(--rgf-text) !important;
        background: rgba(255,255,255,0.06) !important;
      }

      .rgf-code-shell {
        overflow: hidden !important;
        margin: 18px 0 !important;
        border: 1px solid var(--rgf-line) !important;
        border-radius: 20px !important;
        background: rgba(8, 9, 12, 0.78) !important;
      }

      .rgf-code-toolbar {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 10px !important;
        border-bottom: 1px solid var(--rgf-line) !important;
      }

      .rgf-code-toolbar span {
        flex: 1 !important;
        color: var(--rgf-muted) !important;
        font: 700 11px var(--rgf-mono) !important;
        letter-spacing: 0.14em !important;
        text-transform: uppercase !important;
      }

      .rgf-code-toolbar button {
        min-height: 34px !important;
        padding: 0 12px !important;
        border: 1px solid var(--rgf-line) !important;
        border-radius: 999px !important;
        background: rgba(255,255,255,0.06) !important;
        color: var(--rgf-text) !important;
      }

      .rgf-code-block {
        display: block !important;
        max-height: 72vh !important;
        overflow: auto !important;
        margin: 0 !important;
        padding: 14px !important;
        background: transparent !important;
        color: #e4e4e7 !important;
        font: 12px/1.65 var(--rgf-mono) !important;
        white-space: pre !important;
        tab-size: 2 !important;
        -webkit-overflow-scrolling: touch !important;
      }

      .rgf-code-block.rgf-wrap {
        white-space: pre-wrap !important;
        word-break: break-word !important;
      }

      .rgf-toast {
        position: fixed !important;
        left: 50% !important;
        bottom: calc(78px + env(safe-area-inset-bottom)) !important;
        z-index: 2147483647 !important;
        transform: translateX(-50%) translateY(8px) !important;
        opacity: 0 !important;
        padding: 10px 14px !important;
        border: 1px solid var(--rgf-line) !important;
        border-radius: 999px !important;
        background: rgba(18,19,23,0.92) !important;
        color: var(--rgf-text) !important;
        transition: opacity 140ms ease, transform 140ms ease !important;
      }

      .rgf-toast.is-visible {
        opacity: 1 !important;
        transform: translateX(-50%) translateY(0) !important;
      }

      @media (max-width: 640px) {
        html.rod-gf-ready body {
          padding-top: 76px !important;
        }

        .rgf-topbar {
          grid-template-columns: 38px 1fr 38px 38px !important;
          height: 56px !important;
          gap: 6px !important;
        }

        .rgf-logo,
        .rgf-icon-button {
          width: 38px !important;
          height: 38px !important;
        }

        .rgf-search {
          height: 38px !important;
          grid-template-columns: 20px 1fr 30px !important;
        }

        .rgf-search-input {
          height: 36px !important;
        }

        .rgf-script-card {
          padding: 15px !important;
          border-radius: 20px !important;
        }
      }
    `;

    document.head.append(style);
  }
})();