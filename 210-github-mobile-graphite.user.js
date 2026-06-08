// ==UserScript==
// @name         Rod / GitHub / Mobile Graphite
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Polishes GitHub mobile repo pages, file navigation, and editor ergonomics.
// @author       Rod
// @match        https://github.com/*
// @match        https://www.github.com/*
// @run-at       document-idle
// @weight       690
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const STYLE_ID = "mgh-graphite-v23-style";
  const PANEL_ID = "mgh-graphite-v23-panel";
  const TOGGLE_ID = "mgh-graphite-v23-toggle";
  const STORE_KEY = "mgh-graphite-v23-settings";

  const DEFAULTS = {
    fontScale: 1,
    compactFiles: true,
    noise: true,
  };

  const settings = readSettings();

  function readSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  }

  function setSetting(key, value) {
    settings[key] = value;
    saveSettings();
    injectStyle();
    enhance();
  }

  function lockZoom() {
    let viewport = document.querySelector('meta[name="viewport"]');

    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.name = "viewport";
      document.documentElement.appendChild(viewport);
    }

    viewport.content =
      "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover";

    document.addEventListener("gesturestart", event => event.preventDefault(), { passive: false });
    document.addEventListener("gesturechange", event => event.preventDefault(), { passive: false });

    let lastTouch = 0;

    document.addEventListener(
      "touchend",
      event => {
        const now = Date.now();

        if (now - lastTouch < 360) {
          event.preventDefault();
        }

        lastTouch = now;
      },
      { passive: false },
    );
  }

  function injectStyle() {
    const filePadding = settings.compactFiles ? "8px 9px" : "11px 10px";

    const css = `
      :root {
        --mgh-bg: #050607;
        --mgh-surface: #0d1117;
        --mgh-surface-2: #11161d;
        --mgh-surface-3: #171c24;
        --mgh-border: rgba(220, 225, 232, .14);
        --mgh-border-strong: rgba(220, 225, 232, .24);
        --mgh-text: #e5e7eb;
        --mgh-muted: #9ca3af;
        --mgh-radius: 16px;
        --mgh-font-scale: ${settings.fontScale};
        --mgh-file-padding: ${filePadding};
      }

      html,
      body {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
        background:
          radial-gradient(circle at 20% -10%, rgba(148,163,184,.10), transparent 22rem),
          linear-gradient(180deg, #07090c, #050607 56%, #030405) !important;
        color: var(--mgh-text) !important;
        -webkit-text-size-adjust: 100% !important;
        text-size-adjust: 100% !important;
        touch-action: manipulation !important;
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: ${settings.noise ? ".08" : "0"};
        background-image: radial-gradient(rgba(255,255,255,.24) .5px, transparent .5px);
        background-size: 5px 5px;
        z-index: 0;
      }

      body > * {
        position: relative;
      }

      input,
      textarea,
      select,
      button {
        font-size: max(16px, calc(1rem * var(--mgh-font-scale))) !important;
      }

      .application-main,
      main,
      .Layout,
      .Layout-main,
      .repository-content,
      .container-xl,
      .container-lg,
      .container-md,
      .container,
      .px-3,
      .px-md-4,
      .px-lg-5 {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        overflow-x: hidden !important;
      }

      .Layout {
        display: block !important;
      }

      .Layout-main,
      .Layout-sidebar {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }

      .AppHeader,
      .AppHeader-globalBar,
      .AppHeader-localBar,
      .Header,
      .UnderlineNav,
      .js-sticky,
      .position-sticky {
        background: rgba(8, 10, 13, .9) !important;
        border-color: var(--mgh-border) !important;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .Box,
      .BorderGrid,
      .file,
      .blob-wrapper,
      .js-details-container,
      .react-directory,
      [data-testid="tree-browser"],
      [aria-labelledby="folders-and-files"] {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        border: 1px solid var(--mgh-border) !important;
        border-radius: 16px !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.025), transparent 42%),
          rgba(13, 17, 23, .94) !important;
        box-shadow: 0 14px 38px rgba(0,0,0,.28) !important;
        overflow: hidden !important;
      }

      .Box-header,
      .Box-row,
      .BorderGrid-row,
      .file-header {
        border-color: var(--mgh-border) !important;
      }

      .UnderlineNav {
        overflow-x: auto !important;
        scrollbar-width: none !important;
      }

      .UnderlineNav::-webkit-scrollbar {
        display: none !important;
      }

      .UnderlineNav-body {
        display: flex !important;
        flex-wrap: nowrap !important;
        gap: 4px !important;
        min-width: max-content !important;
      }

      .UnderlineNav-item {
        flex: 0 0 auto !important;
        border-radius: 999px !important;
        margin: 6px 2px !important;
        padding: 8px 11px !important;
        color: var(--mgh-muted) !important;
      }

      .UnderlineNav-item.selected,
      .UnderlineNav-item[aria-current="page"] {
        background: rgba(255,255,255,.07) !important;
        color: #f3f4f6 !important;
        border-bottom-color: transparent !important;
      }

      /**
       * File list fix:
       * Do not force GitHub's React rows into table/grid ghosts.
       * Keep native flow, only style the visible row/container.
       */
      [role="row"],
      .react-directory-row,
      .Box-row {
        min-width: 0 !important;
      }

      .react-directory-row,
      [data-testid="tree-browser"] li,
      [aria-labelledby="folders-and-files"] li,
      .Box-row {
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
        width: calc(100% - 8px) !important;
        max-width: calc(100% - 8px) !important;
        min-width: 0 !important;
        margin: 4px !important;
        padding: var(--mgh-file-padding) !important;
        border: 1px solid var(--mgh-border) !important;
        border-radius: 12px !important;
        background: rgba(17, 22, 29, .82) !important;
        overflow: hidden !important;
      }

      .react-directory-row > *,
      [data-testid="tree-browser"] li > *,
      [aria-labelledby="folders-and-files"] li > *,
      .Box-row > * {
        min-width: 0 !important;
      }

      .react-directory-filename-column,
      .react-directory-filename-cell,
      [data-testid="tree-browser"] li a[href*="/blob/"],
      [data-testid="tree-browser"] li a[href*="/tree/"],
      [aria-labelledby="folders-and-files"] li a[href*="/blob/"],
      [aria-labelledby="folders-and-files"] li a[href*="/tree/"] {
        min-width: 0 !important;
        overflow: visible !important;
      }

      .react-directory-commit-age,
      .react-directory-commit-message,
      [data-testid="tree-browser"] [class*="commit"],
      [aria-labelledby="folders-and-files"] [class*="commit"] {
        display: none !important;
      }

      table.files {
        width: 100% !important;
        table-layout: fixed !important;
        border-collapse: separate !important;
        border-spacing: 0 5px !important;
      }

      table.files td.message {
        display: none !important;
      }

      table.files td.age {
        width: 72px !important;
        max-width: 72px !important;
        color: var(--mgh-muted) !important;
        font-size: 11px !important;
        white-space: nowrap !important;
        text-align: right !important;
      }

      table.files td.content {
        min-width: 0 !important;
        overflow: hidden !important;
      }

      .mgh-file-link {
        display: inline-flex !important;
        align-items: center !important;
        gap: 7px !important;
        flex: 1 1 auto !important;
        min-width: 0 !important;
        max-width: calc(100% - 104px) !important;
        color: var(--mgh-text) !important;
        font-size: calc(.9rem * var(--mgh-font-scale)) !important;
        font-weight: 650 !important;
        text-decoration: none !important;
        overflow: hidden !important;
      }

      .mgh-file-icon {
        flex: 0 0 auto;
        width: 22px;
        height: 22px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 7px;
        background: rgba(255,255,255,.075);
        color: #d1d5db;
        font-size: 11px;
        font-weight: 800;
      }

      .mgh-filename-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mgh-key-file {
        background:
          linear-gradient(90deg, rgba(229,231,235,.11), transparent 58%),
          rgba(23, 28, 36, .94) !important;
      }

      .mgh-file-actions {
        display: inline-flex !important;
        flex: 0 0 auto !important;
        align-items: center !important;
        justify-content: flex-end !important;
        gap: 4px !important;
        margin-left: auto !important;
      }

      .mgh-action-button {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 27px !important;
        height: 27px !important;
        padding: 0 6px !important;
        border: 1px solid rgba(220,225,232,.16) !important;
        border-radius: 9px !important;
        background: rgba(255,255,255,.055) !important;
        color: #d8dee9 !important;
        font-size: 9px !important;
        font-weight: 850 !important;
        line-height: 1 !important;
        text-decoration: none !important;
      }

      .mgh-action-button:active {
        transform: scale(.96);
        background: rgba(255,255,255,.11) !important;
      }

      .repository-content > div,
      .repository-content .Box,
      .repository-content .markdown-body,
      .markdown-body,
      article.markdown-body {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        box-sizing: border-box !important;
      }

      .markdown-body {
        padding: 16px 12px !important;
        border-radius: 16px !important;
        color: #d7dce3 !important;
        background:
          linear-gradient(180deg, rgba(255,255,255,.035), transparent 34%),
          rgba(13, 17, 23, .94) !important;
        border: 1px solid var(--mgh-border) !important;
        font-size: calc(.98rem * var(--mgh-font-scale)) !important;
        line-height: 1.66 !important;
        overflow-x: hidden !important;
      }

      .markdown-body * {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      .markdown-body p,
      .markdown-body li,
      .markdown-body blockquote,
      .markdown-body h1,
      .markdown-body h2,
      .markdown-body h3 {
        overflow-wrap: anywhere !important;
      }

      .markdown-body pre,
      .markdown-body .highlight,
      .markdown-body .highlight pre {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        border-radius: 14px !important;
        background: #080a0d !important;
        border: 1px solid var(--mgh-border) !important;
        -webkit-overflow-scrolling: touch !important;
      }

      .markdown-body pre code {
        white-space: pre !important;
      }

      .btn,
      .Button,
      summary,
      details,
      .BtnGroup {
        border-radius: 13px !important;
        border-color: var(--mgh-border) !important;
      }

      .btn,
      .Button {
        background: rgba(18,22,29,.96) !important;
        color: var(--mgh-text) !important;
      }

      .btn-primary,
      .Button--primary {
        background: linear-gradient(180deg, #3c434d, #242a32) !important;
        color: #f9fafb !important;
      }

      [data-testid*="open-app"],
      [class*="open-in-app"],
      [aria-label*="Open in app"],
      [href*="github.com/mobile"],
      .mgh-hidden-app-bar {
        display: none !important;
      }

      #${TOGGLE_ID} {
        position: fixed;
        right: max(12px, env(safe-area-inset-right));
        bottom: max(16px, env(safe-area-inset-bottom));
        z-index: 2147483647;
        width: 44px;
        height: 44px;
        border: 1px solid var(--mgh-border-strong);
        border-radius: 999px;
        color: #f3f4f6;
        background:
          linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.035)),
          rgba(12,15,19,.94);
        box-shadow: 0 18px 44px rgba(0,0,0,.42);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        font-size: 18px;
        font-weight: 900;
      }

      #${PANEL_ID} {
        position: fixed;
        right: max(12px, env(safe-area-inset-right));
        bottom: calc(max(16px, env(safe-area-inset-bottom)) + 54px);
        z-index: 2147483647;
        display: none;
        width: min(300px, calc(100vw - 24px));
        padding: 12px;
        border: 1px solid var(--mgh-border-strong);
        border-radius: 20px;
        background: rgba(10,12,16,.96);
        color: var(--mgh-text);
        box-shadow: 0 24px 70px rgba(0,0,0,.5);
        backdrop-filter: blur(22px);
        -webkit-backdrop-filter: blur(22px);
      }

      #${PANEL_ID}[data-open="true"] {
        display: block;
      }

      .mgh-panel-title {
        margin-bottom: 10px;
        font-size: 13px;
        font-weight: 850;
      }

      .mgh-panel-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .mgh-panel-button {
        min-height: 38px;
        border: 1px solid var(--mgh-border);
        border-radius: 13px;
        color: var(--mgh-text);
        background: rgba(255,255,255,.06);
        font-weight: 760;
      }
    `;

    let style = document.getElementById(STYLE_ID);

    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.documentElement.appendChild(style);
    }

    style.textContent = css;
  }

  function parseGitHubPath(href) {
    const url = new URL(href, location.origin);
    const parts = url.pathname.split("/").filter(Boolean);
    const owner = parts[0];
    const repo = parts[1];
    const markerIndex = parts.findIndex(part => part === "blob" || part === "tree");

    if (!owner || !repo || markerIndex < 0) return null;

    const kind = parts[markerIndex];
    const branch = parts[markerIndex + 1];
    const path = parts.slice(markerIndex + 2).join("/");

    if (!branch) return null;

    return {
      owner,
      repo,
      kind,
      branch,
      path,
      rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
      fileDownloadUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}?download=1`,
      folderZipUrl: `https://download-directory.github.io/?url=${encodeURIComponent(
        `https://github.com/${owner}/${repo}/tree/${branch}/${path}`,
      )}`,
    };
  }

  function buildRepomixCommand(meta) {
    if (meta.kind === "tree") {
      return `npx repomix@latest --remote ${meta.owner}/${meta.repo} --remote-branch ${meta.branch} --include "${meta.path}/**"`;
    }

    return `npx repomix@latest --remote ${meta.owner}/${meta.repo} --remote-branch ${meta.branch} --include "${meta.path}"`;
  }

  function openRepomix(meta) {
    const command = buildRepomixCommand(meta);

    navigator.clipboard?.writeText(command).catch(() => undefined);

    window.open(
      `https://repomix.com/?remote=${encodeURIComponent(`${meta.owner}/${meta.repo}`)}&branch=${encodeURIComponent(meta.branch)}&include=${encodeURIComponent(meta.path)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function iconForFile(name, href) {
    const lower = name.toLowerCase();

    if (href.includes("/tree/")) return "▰";
    if (lower === "package.json") return "pkg";
    if (lower.includes("lock")) return "🔒";
    if (lower.includes("readme")) return "md";
    if (lower.includes("license")) return "lic";
    if (lower.includes("config") || lower.startsWith(".env")) return "⚙";
    if (lower.startsWith("index.")) return "★";
    if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "ts";
    if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "js";
    if (lower.endsWith(".json")) return "{}";
    if (lower.endsWith(".md")) return "md";
    if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yml";
    if (lower.endsWith(".sh") || lower.endsWith(".zsh")) return "$";
    return "•";
  }

  function isKeyFile(name) {
    return /(^|\/)(index|package|readme|license|changelog|tsconfig|vite|vitest|eslint|prettier|turbo|dockerfile|pnpm-workspace|tailwind|next\.config|nest-cli|\.env)/i.test(
      name,
    );
  }

  function makeAction(label, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mgh-action-button";
    button.textContent = label;
    button.title = title;

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });

    return button;
  }

  function findFileRow(link) {
    return (
      link.closest(".react-directory-row") ||
      link.closest("[data-testid='tree-browser'] li") ||
      link.closest("[aria-labelledby='folders-and-files'] li") ||
      link.closest(".Box-row") ||
      link.closest("tr") ||
      link.parentElement
    );
  }

  function decorateFiles() {
    const links = Array.from(
      document.querySelectorAll(
        'a[href*="/blob/"], a[href*="/tree/"]',
      ),
    );

    for (const link of links) {
      const href = link.getAttribute("href") || "";
      const meta = parseGitHubPath(href);

      if (!meta) continue;

      const row = findFileRow(link);
      if (!row || row.dataset.mghRowDecorated === "true") continue;

      const originalName = (link.textContent || "").trim();
      const name = originalName || meta.path.split("/").pop() || "";

      if (!name || name.length > 140) continue;

      row.dataset.mghRowDecorated = "true";

      if (isKeyFile(name)) {
        row.classList.add("mgh-key-file");
      }

      link.classList.add("mgh-file-link");
      link.textContent = "";

      const icon = document.createElement("span");
      icon.className = "mgh-file-icon";
      icon.textContent = iconForFile(name, href);

      const label = document.createElement("span");
      label.className = "mgh-filename-text";
      label.textContent = name;

      link.append(icon, label);

      const actions = document.createElement("span");
      actions.className = "mgh-file-actions";

      if (meta.kind === "tree") {
        actions.append(
          makeAction("ZIP", "Baixar pasta como ZIP", () => {
            window.open(meta.folderZipUrl, "_blank", "noopener,noreferrer");
          }),
          makeAction("RPM", "Enviar para Repomix", () => openRepomix(meta)),
        );
      } else {
        actions.append(
          makeAction("RAW", "Abrir raw", () => {
            window.open(meta.rawUrl, "_blank", "noopener,noreferrer");
          }),
          makeAction("DL", "Baixar arquivo", () => {
            window.open(meta.fileDownloadUrl, "_blank", "noopener,noreferrer");
          }),
          makeAction("RPM", "Enviar para Repomix", () => openRepomix(meta)),
        );
      }

      row.appendChild(actions);
    }
  }

  function removeOpenInApp() {
    const nodes = Array.from(
      document.querySelectorAll("a, button, div, aside, header, section"),
    );

    for (const node of nodes) {
      const text = (node.textContent || "").toLowerCase();
      const href = node.getAttribute?.("href") || "";

      if (
        text.includes("open in app") ||
        text.includes("open with github") ||
        href.includes("github.com/mobile")
      ) {
        const container = node.closest("aside, header, section, div") || node;
        container.classList.add("mgh-hidden-app-bar");
      }
    }
  }

  function openViewAllFiles() {
    const nodes = Array.from(document.querySelectorAll("button, summary, a"));

    for (const node of nodes) {
      const text = (node.textContent || "").trim().toLowerCase();

      if (
        text.includes("view all files") ||
        text.includes("show all files") ||
        text.includes("view files")
      ) {
        const details = node.closest("details");

        if (details && !details.open) {
          details.open = true;
          continue;
        }

        if (node.getAttribute("aria-expanded") === "false") {
          node.click();
        }
      }
    }
  }

  function createControls() {
    if (!document.getElementById(TOGGLE_ID)) {
      const toggle = document.createElement("button");
      toggle.id = TOGGLE_ID;
      toggle.type = "button";
      toggle.textContent = "☷";
      toggle.setAttribute("aria-label", "Open layout controls");

      toggle.addEventListener("click", () => {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panel.dataset.open = String(panel.dataset.open !== "true");
      });

      document.documentElement.appendChild(toggle);
    }

    if (!document.getElementById(PANEL_ID)) {
      const panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.dataset.open = "false";

      panel.innerHTML = `
        <div class="mgh-panel-title">Graphite layout</div>
        <div class="mgh-panel-grid">
          <button class="mgh-panel-button" data-action="font-down">A−</button>
          <button class="mgh-panel-button" data-action="font-up">A+</button>
          <button class="mgh-panel-button" data-action="files">Files density</button>
          <button class="mgh-panel-button" data-action="noise">Noise</button>
          <button class="mgh-panel-button" data-action="close">Close</button>
        </div>
      `;

      panel.addEventListener("click", event => {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        const action = button.dataset.action;

        if (action === "font-down") {
          setSetting("fontScale", Math.max(0.86, Number((settings.fontScale - 0.08).toFixed(2))));
        }

        if (action === "font-up") {
          setSetting("fontScale", Math.min(1.24, Number((settings.fontScale + 0.08).toFixed(2))));
        }

        if (action === "files") {
          setSetting("compactFiles", !settings.compactFiles);
        }

        if (action === "noise") {
          setSetting("noise", !settings.noise);
        }

        if (action === "close") {
          panel.dataset.open = "false";
        }
      });

      document.documentElement.appendChild(panel);
    }
  }

  function enhance() {
    removeOpenInApp();
    openViewAllFiles();
    decorateFiles();
    createControls();
  }

  function boot() {
    lockZoom();
    injectStyle();
    enhance();

    const observer = new MutationObserver(() => {
      requestAnimationFrame(enhance);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  lockZoom();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();