// ==UserScript==
// @name         Rod / Docs / OpenBSD Man Pages
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Readable OpenBSD man pages with search, syntax accents, and clickable arguments.
// @author       Rod
// @match        https://man.openbsd.org/*
// @run-at       document-idle
// @weight       480
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const ROOT_ID = "obm-beautifier";
  const STORAGE_KEY = "obm-beautifier-theme";
  const READER_KEY = "obm-beautifier-reader";
  const SAFARI_BG_FIX_ID = "safari-ios-bg-fix";

  if (document.getElementById(ROOT_ID)) return;

  document.documentElement.dataset.obmEnhanced = "true";

  const style = document.createElement("style");
  style.id = ROOT_ID;
  style.textContent = `
    html,
    body {
      background-color: #0b0d12 !important;
      overscroll-behavior-y: none;
    }

    html {
      min-height: 100%;
      height: 100%;
    }

    body {
      min-height: 100dvh;
    }

    html::before,
    html::after,
    body::before,
    body::after {
      content: none !important;
      display: none !important;
      background: transparent !important;
      opacity: 0 !important;
      mask-image: none !important;
      -webkit-mask-image: none !important;
    }

    #safari-ios-bg-fix {
      position: fixed;
      inset: 0;
      z-index: -999999;
      background: #0b0d12;
      pointer-events: none;
    }

    :root {
      --obm-bg: #f7f3ea;
      --obm-panel: rgba(255, 252, 244, .78);
      --obm-panel-solid: #fffaf0;
      --obm-text: #211a13;
      --obm-muted: #766957;
      --obm-border: rgba(82, 63, 36, .18);
      --obm-accent: #b45309;
      --obm-accent-2: #0f766e;
      --obm-code-bg: #15110d;
      --obm-code-top: #211910;
      --obm-code-text: #ffe8ba;
      --obm-code-muted: #a89982;
      --obm-token-comment: #8fa37a;
      --obm-token-string: #f6c177;
      --obm-token-keyword: #fb923c;
      --obm-token-function: #5eead4;
      --obm-token-variable: #93c5fd;
      --obm-token-number: #c4b5fd;
      --obm-token-operator: #fda4af;
      --obm-token-flag: #fbbf24;
      --obm-token-command: #2dd4bf;
      --obm-shadow: 0 24px 80px rgba(73, 49, 20, .16);
      --obm-radius: 24px;
      --obm-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif;
      --obm-mono: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace;
    }

    html[data-obm-theme="dark"] {
      --obm-bg: #0f1115;
      --obm-panel: rgba(22, 24, 31, .92);
      --obm-panel-solid: #171922;
      --obm-text: #f4ead8;
      --obm-muted: #b6aa99;
      --obm-border: rgba(255, 232, 194, .13);
      --obm-accent: #f59e0b;
      --obm-accent-2: #2dd4bf;
      --obm-code-bg: #07080b;
      --obm-code-top: #11131a;
      --obm-code-text: #ffe8ba;
      --obm-code-muted: #8f8677;
      --obm-shadow: 0 28px 90px rgba(0, 0, 0, .46);
    }

    html[data-obm-enhanced="true"] {
      background: var(--obm-bg) !important;
      color: var(--obm-text);
      scroll-behavior: smooth;
    }

    html[data-obm-enhanced="true"] body {
      margin: 0;
      padding: 0;
      background: transparent !important;
      color: var(--obm-text) !important;
      font-family: var(--obm-font);
      font-size: 17px;
      line-height: 1.72;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    .page-top,
    body > form,
    body > hr:first-of-type {
      display: none !important;
    }

    .obm-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      gap: 28px;
      width: min(1440px, calc(100vw - 32px));
      margin: 26px auto 80px;
    }

    .obm-shell[data-reader="compact"] {
      width: min(980px, calc(100vw - 32px));
      grid-template-columns: minmax(0, 1fr);
    }

    .obm-shell[data-reader="compact"] .obm-sidebar {
      display: none;
    }

    .obm-main,
    .obm-sidebar {
      background: var(--obm-panel);
      border: 1px solid var(--obm-border);
      border-radius: var(--obm-radius);
      box-shadow: var(--obm-shadow);
    }

    .obm-main {
      min-width: 0;
      overflow: hidden;
    }

    .obm-hero {
      padding: 34px 38px 28px;
      border-bottom: 1px solid var(--obm-border);
      background: rgba(20, 20, 24, .15);
    }

    .obm-kicker {
      color: var(--obm-accent);
      font-weight: 850;
      letter-spacing: .16em;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    .obm-title {
      margin: 0;
      font-size: clamp(34px, 5vw, 64px);
      line-height: .96;
      letter-spacing: -.055em;
      font-weight: 950;
    }

    .obm-subtitle {
      margin: 14px 0 0;
      max-width: 760px;
      color: var(--obm-muted);
      font-size: 18px;
    }

    .obm-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 22px;
    }

    .obm-button,
    .obm-search {
      border: 1px solid var(--obm-border);
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      color: var(--obm-text);
      font: 750 13px var(--obm-font);
      padding: 10px 14px;
      outline: none;
    }

    .obm-button {
      cursor: pointer;
      transition: transform .16s ease, border-color .16s ease, background .16s ease;
    }

    .obm-button:hover {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--obm-accent) 60%, var(--obm-border));
      background: rgba(245, 158, 11, .13);
    }

    .obm-search {
      min-width: min(360px, 100%);
      font-weight: 650;
    }

    .obm-content {
      padding: 30px 38px 46px;
    }

    .obm-content h1,
    .obm-content h2,
    .obm-content h3 {
      scroll-margin-top: 24px;
      letter-spacing: -.035em;
      line-height: 1.08;
    }

    .obm-content h1,
    .obm-content h2 {
      margin: 42px 0 16px;
      padding-top: 18px;
      border-top: 1px solid var(--obm-border);
      font-size: clamp(26px, 3vw, 38px);
    }

    .obm-content h3 {
      margin: 34px 0 12px;
      color: var(--obm-accent);
      font-size: 22px;
    }

    .obm-content a {
      color: var(--obm-accent-2) !important;
      text-decoration: none;
      font-weight: 800;
      border-bottom: 1px solid color-mix(in srgb, var(--obm-accent-2) 35%, transparent);
    }

    .obm-content a:hover {
      border-bottom-color: var(--obm-accent-2);
    }

    .obm-content code,
    .obm-content tt {
      padding: .13em .38em;
      border-radius: 8px;
      background: color-mix(in srgb, var(--obm-accent) 13%, transparent);
      color: color-mix(in srgb, var(--obm-accent) 84%, var(--obm-text));
      font-family: var(--obm-mono) !important;
      font-size: .92em;
      font-weight: 750;
    }

    .obm-arg-chip {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      margin: 0 .08em;
      padding: .13em .45em .16em;
      border: 1px solid color-mix(in srgb, var(--obm-accent) 35%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--obm-accent) 15%, transparent);
      color: var(--obm-token-flag);
      font-family: var(--obm-mono);
      font-size: .92em;
      font-weight: 900;
      line-height: 1.22;
      cursor: pointer;
      text-decoration: none;
      vertical-align: baseline;
      box-shadow: inset 0 -1px 0 rgba(45, 212, 191, .22);
      transition: transform .14s ease, border-color .14s ease, background .14s ease;
    }

    .obm-arg-chip:hover,
    .obm-arg-chip:focus {
      transform: translateY(-1px);
      border-color: var(--obm-accent);
      background: color-mix(in srgb, var(--obm-accent) 24%, transparent);
      outline: none;
    }

    .obm-arg-chip[data-obm-found="false"] {
      opacity: .72;
      border-style: dashed;
    }

    .obm-arg-target {
      animation: obmPulse 1.6s ease 1;
      background: color-mix(in srgb, var(--obm-accent) 18%, transparent) !important;
      border-radius: 12px;
      box-shadow: 0 0 0 10px color-mix(in srgb, var(--obm-accent) 11%, transparent);
    }

    .obm-terminal {
      margin: 20px 0 26px;
      overflow: hidden;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,.1);
      background: var(--obm-code-bg);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,.05),
        0 18px 50px rgba(0,0,0,.18);
    }

    .obm-terminal-header {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 14px;
      background: var(--obm-code-top);
      border-bottom: 1px solid rgba(255,255,255,.08);
      color: var(--obm-code-muted);
      font: 800 11px var(--obm-font);
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .obm-terminal-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #ef4444;
      box-shadow: 16px 0 #f59e0b, 32px 0 #22c55e;
      margin-right: 38px;
    }

    .obm-terminal pre,
    .obm-content pre {
      margin: 0;
      padding: 18px 20px;
      overflow: auto;
      background: var(--obm-code-bg) !important;
      color: var(--obm-code-text) !important;
      font-family: var(--obm-mono) !important;
      font-size: 14px;
      line-height: 1.62;
      tab-size: 4;
      white-space: pre;
    }

    .obm-content > pre {
      margin: 18px 0 24px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,.08);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
    }

    .obm-line {
      display: block;
      min-height: 1.62em;
    }

    .obm-token-comment { color: var(--obm-token-comment); font-style: italic; }
    .obm-token-string { color: var(--obm-token-string); }
    .obm-token-keyword { color: var(--obm-token-keyword); font-weight: 850; }
    .obm-token-function { color: var(--obm-token-function); font-weight: 800; }
    .obm-token-variable { color: var(--obm-token-variable); }
    .obm-token-number { color: var(--obm-token-number); }
    .obm-token-operator { color: var(--obm-token-operator); }
    .obm-token-flag { color: var(--obm-token-flag); font-weight: 850; }
    .obm-token-command { color: var(--obm-token-command); font-weight: 900; }
    .obm-token-punctuation { color: var(--obm-code-muted); }
    .obm-token-prompt { color: var(--obm-accent-2); font-weight: 950; user-select: none; }

    .obm-content dl {
      display: grid;
      grid-template-columns: minmax(120px, 220px) minmax(0, 1fr);
      gap: 8px 22px;
    }

    .obm-content dt {
      font-family: var(--obm-mono);
      color: var(--obm-accent);
      font-weight: 950;
    }

    .obm-content dd {
      margin: 0 0 10px;
    }

    .obm-content mark.obm-mark {
      background: rgba(245, 158, 11, .28);
      color: inherit;
      border-radius: 6px;
      padding: 0 .16em;
    }

    .obm-sidebar {
      position: sticky;
      top: 18px;
      align-self: start;
      max-height: calc(100dvh - 36px);
      overflow: auto;
      padding: 18px;
    }

    .obm-sidebar-title {
      font-weight: 950;
      font-size: 13px;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: var(--obm-muted);
      margin: 0 0 12px;
    }

    .obm-toc {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .obm-toc a {
      display: block;
      border-radius: 13px;
      padding: 9px 11px;
      color: var(--obm-text);
      text-decoration: none;
      font-size: 14px;
      font-weight: 750;
      line-height: 1.25;
    }

    .obm-toc a:hover,
    .obm-toc a.obm-active {
      background: color-mix(in srgb, var(--obm-accent) 15%, transparent);
      color: var(--obm-accent);
    }

    .obm-top-fab {
      position: fixed;
      right: max(18px, env(safe-area-inset-right));
      bottom: max(18px, env(safe-area-inset-bottom));
      z-index: 99999;
      width: 54px;
      height: 54px;
      display: grid;
      place-items: center;
      border: 1px solid var(--obm-border);
      border-radius: 999px;
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--obm-accent) 25%, var(--obm-panel-solid)), var(--obm-panel-solid));
      color: var(--obm-text);
      box-shadow: var(--obm-shadow);
      cursor: pointer;
      opacity: 0;
      transform: translateY(14px) scale(.92);
      pointer-events: none;
      transition: opacity .18s ease, transform .18s ease, border-color .18s ease;
    }

    .obm-top-fab[data-visible="true"] {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    .obm-top-fab:hover {
      border-color: var(--obm-accent);
      transform: translateY(-2px) scale(1.03);
    }

    .obm-top-fab svg {
      width: 22px;
      height: 22px;
    }

    .obm-anchor-highlight {
      animation: obmPulse 1.6s ease 1;
      background: color-mix(in srgb, var(--obm-accent) 17%, transparent);
      border-radius: 16px;
      box-shadow: 0 0 0 12px color-mix(in srgb, var(--obm-accent) 12%, transparent);
    }

    @keyframes obmPulse {
      0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--obm-accent) 35%, transparent); }
      100% { box-shadow: 0 0 0 18px transparent; }
    }

    @media (max-width: 1080px) {
      .obm-shell {
        display: block;
      }

      .obm-sidebar {
        position: relative;
        top: auto;
        margin-top: 18px;
        max-height: none;
      }
    }

    @media (max-width: 680px) {
      html[data-obm-enhanced="true"] body {
        font-size: 16px;
      }

      .obm-shell {
        width: min(100vw - 18px, 100%);
        margin-top: 9px;
      }

      .obm-hero,
      .obm-content {
        padding-left: 20px;
        padding-right: 20px;
      }

      .obm-terminal pre,
      .obm-content pre {
        font-size: 13px;
      }

      .obm-content dl {
        display: block;
      }

      .obm-content dt {
        margin-top: 14px;
      }
    }
  `;

  document.head.appendChild(style);

  if (!document.getElementById(SAFARI_BG_FIX_ID)) {
    const backgroundLayer = document.createElement("div");

    backgroundLayer.id = SAFARI_BG_FIX_ID;
    document.documentElement.appendChild(backgroundLayer);
  }

  const preferredTheme =
    localStorage.getItem(STORAGE_KEY) ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  document.documentElement.dataset.obmTheme = preferredTheme;

  const titleText = document.title.replace(" - OpenBSD manual pages", "").trim();
  const pageText = document.body.innerText || "";

  const originalNodes = [...document.body.childNodes].filter((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = /** @type {HTMLElement} */ (node);

      return element.id !== ROOT_ID && element.tagName !== "SCRIPT" && element.tagName !== "STYLE";
    }

    return Boolean(node.textContent?.trim());
  });

  const shell = document.createElement("main");
  shell.className = "obm-shell";
  shell.dataset.reader = localStorage.getItem(READER_KEY) || "wide";

  const main = document.createElement("article");
  main.className = "obm-main";

  const hero = document.createElement("header");
  hero.className = "obm-hero";

  const nameMatch = titleText.match(/^([^(]+)\(([^)]+)\)/);
  const commandName = nameMatch?.[1]?.trim() || titleText || "Manual";
  const sectionName = nameMatch?.[2]?.trim() || "OpenBSD";

  hero.innerHTML = `
    <div class="obm-kicker">OpenBSD Manual · Section ${escapeHtml(sectionName)}</div>
    <h1 class="obm-title">${escapeHtml(commandName)}</h1>
    <p class="obm-subtitle">${escapeHtml(extractSubtitle(pageText))}</p>
    <div class="obm-toolbar">
      <input class="obm-search" type="search" placeholder="Search inside this manual..." aria-label="Search manual">
      <button class="obm-button" type="button" data-obm-theme-toggle>Toggle theme</button>
      <button class="obm-button" type="button" data-obm-reader>Reader width</button>
    </div>
  `;

  const content = document.createElement("section");
  content.className = "obm-content";

  for (const node of originalNodes) {
    content.appendChild(node);
  }

  addHeadingIds(content);
  enhanceExamples(content);
  highlightRemainingPreBlocks(content);
  makeArgumentsClickable(content);

  main.append(hero, content);

  const sidebar = buildSidebar(content);
  const topButton = createTopButton();

  shell.append(main, sidebar);
  document.body.replaceChildren(shell, topButton);

  bindToolbar(shell, content);
  bindArgumentClicks(content);
  bindDynamicTopButton(topButton);
  scrollToHashTarget();

  function extractSubtitle(text) {
    const match = text.match(/\n\s*([a-z0-9_.-]+)\s+[---]\s+(.+)\n/i);

    return match?.[2]?.trim() || "A cleaner, calmer reading experience for classic manual pages.";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[character];
    });
  }

  function addHeadingIds(root) {
    const seen = new Map();

    for (const heading of root.querySelectorAll("h1, h2, h3")) {
      if (heading.id) continue;

      const base =
        heading.textContent
          ?.trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "section";

      const count = seen.get(base) || 0;
      seen.set(base, count + 1);

      heading.id = count === 0 ? base : `${base}-${count + 1}`;
    }
  }

  function enhanceExamples(root) {
    for (const pre of [...root.querySelectorAll("pre")]) {
      const text = pre.textContent || "";

      if (looksLikeTerminal(text)) {
        pre.replaceWith(createTerminalBlock(text));
        continue;
      }

      pre.dataset.obmEnhancedPre = "true";
    }

    convertLooseDollarExamples(root);
  }

  function convertLooseDollarExamples(root) {
    const elements = [...root.querySelectorAll("p, div, section, td, dd, li")];

    for (const element of elements) {
      if (element.closest(".obm-terminal")) continue;
      if (element.children.length > 0) continue;

      const text = element.textContent || "";

      if (!looksLikeTerminal(text)) continue;

      const parts = splitTerminalText(text);

      if (!parts) continue;

      const fragment = document.createDocumentFragment();

      if (parts.before.trim()) {
        const before = document.createElement(element.tagName.toLowerCase());

        before.textContent = parts.before.trim();
        fragment.appendChild(before);
      }

      fragment.appendChild(createTerminalBlock(parts.terminal.trim()));

      if (parts.after.trim()) {
        const after = document.createElement(element.tagName.toLowerCase());

        after.textContent = parts.after.trim();
        fragment.appendChild(after);
      }

      element.replaceWith(fragment);
    }
  }

  function splitTerminalText(text) {
    const lines = text.split(/\r?\n/);
    const firstTerminalIndex = lines.findIndex((line) => /^\s*[$#]\s+\S/.test(line));

    if (firstTerminalIndex < 0) return null;

    let lastTerminalIndex = firstTerminalIndex;

    for (let index = firstTerminalIndex + 1; index < lines.length; index++) {
      const line = lines[index];

      if (/^\s*[$#]\s+\S/.test(line) || /^\s{2,}\S/.test(line) || line.trim() === "") {
        lastTerminalIndex = index;
        continue;
      }

      break;
    }

    return {
      before: lines.slice(0, firstTerminalIndex).join("\n"),
      terminal: lines.slice(firstTerminalIndex, lastTerminalIndex + 1).join("\n"),
      after: lines.slice(lastTerminalIndex + 1).join("\n"),
    };
  }

  function looksLikeTerminal(text) {
    return /^\s*[$#]\s+\S/m.test(text);
  }

  function createTerminalBlock(code) {
    const wrapper = document.createElement("figure");

    wrapper.className = "obm-terminal";
    wrapper.innerHTML = `
      <figcaption class="obm-terminal-header">
        <span class="obm-terminal-dot"></span>
        terminal
      </figcaption>
      <pre tabindex="0" aria-label="Terminal example">${highlightTerminal(code)}</pre>
    `;

    return wrapper;
  }

  function highlightRemainingPreBlocks(root) {
    for (const pre of root.querySelectorAll("pre[data-obm-enhanced-pre='true']")) {
      const code = pre.textContent || "";
      const lang = detectLanguage(code);

      pre.innerHTML = highlightCode(code, lang);
    }
  }

  function detectLanguage(code) {
    if (/awk|BEGIN\s*\{|printf|getline|gsub|atan2|length\(|substr\(/.test(code)) return "awk";
    if (/^\s*(\$|#)\s+/m.test(code)) return "shell";
    if (/\b(if|then|fi|for|do|done|case|esac|while|function)\b/.test(code)) return "shell";

    return "manual";
  }

  function highlightCode(code, lang) {
    if (lang === "awk") return highlightAwk(code);
    if (lang === "shell") return highlightTerminal(code);

    return highlightManual(code);
  }

  function highlightTerminal(code) {
    return code
      .split(/\r?\n/)
      .map((line) => `<span class="obm-line">${highlightTerminalLine(line)}</span>`)
      .join("\n");
  }

  function highlightTerminalLine(line) {
    const promptMatch = line.match(/^(\s*[$#])(\s+)(.*)$/);

    if (!promptMatch) {
      return escapeHtml(line);
    }

    const [, prompt, spacing, command] = promptMatch;

    return `<span class="obm-token-prompt">${escapeHtml(prompt)}</span>${spacing}${highlightShellCommand(command)}`;
  }

  function highlightShellCommand(command) {
    const tokens = tokenizeShell(command);

    return tokens
      .map((token, index) => {
        const escaped = escapeHtml(token.value);

        if (token.type === "space") return escaped;
        if (token.type === "comment") return `<span class="obm-token-comment">${escaped}</span>`;
        if (token.type === "string") return `<span class="obm-token-string">${escaped}</span>`;
        if (token.type === "variable") return `<span class="obm-token-variable">${escaped}</span>`;
        if (token.type === "flag") return `<span class="obm-token-flag">${escaped}</span>`;
        if (token.type === "number") return `<span class="obm-token-number">${escaped}</span>`;
        if (token.type === "operator") return `<span class="obm-token-operator">${escaped}</span>`;

        if (token.type === "word" && isCommandPosition(tokens, index)) {
          return `<span class="obm-token-command">${escaped}</span>`;
        }

        if (token.type === "word" && isShellKeyword(token.value)) {
          return `<span class="obm-token-keyword">${escaped}</span>`;
        }

        return escaped;
      })
      .join("");
  }

  function tokenizeShell(input) {
    const tokens = [];
    let index = 0;

    while (index < input.length) {
      const char = input[index];

      if (/\s/.test(char)) {
        const start = index;

        while (index < input.length && /\s/.test(input[index])) index++;

        tokens.push({ type: "space", value: input.slice(start, index) });
        continue;
      }

      if (char === "#") {
        tokens.push({ type: "comment", value: input.slice(index) });
        break;
      }

      if (char === "'" || char === '"') {
        const quote = char;
        const start = index;

        index++;

        while (index < input.length) {
          if (input[index] === "\\" && quote === '"') {
            index += 2;
            continue;
          }

          if (input[index] === quote) {
            index++;
            break;
          }

          index++;
        }

        tokens.push({ type: "string", value: input.slice(start, index) });
        continue;
      }

      if (char === "$") {
        const start = index;

        if (input[index + 1] === "{") {
          index += 2;

          while (index < input.length && input[index] !== "}") index++;

          if (input[index] === "}") index++;
        } else {
          index++;

          while (index < input.length && /[A-Za-z0-9_?*!@$#-]/.test(input[index])) index++;
        }

        tokens.push({ type: "variable", value: input.slice(start, index) });
        continue;
      }

      const two = input.slice(index, index + 2);

      if (["&&", "||", ">>", "<<", "2>", "1>", "<>", "==", "!="].includes(two)) {
        tokens.push({ type: "operator", value: two });
        index += 2;
        continue;
      }

      if (/[|&;<>]/.test(char)) {
        tokens.push({ type: "operator", value: char });
        index++;
        continue;
      }

      const start = index;

      while (index < input.length && !/\s/.test(input[index]) && !/[|&;<>]/.test(input[index])) {
        index++;
      }

      const value = input.slice(start, index);

      if (/^--?[A-Za-z0-9][A-Za-z0-9-]*(?:=.*)?$/.test(value)) {
        tokens.push({ type: "flag", value });
      } else if (/^\d+(?:\.\d+)?$/.test(value)) {
        tokens.push({ type: "number", value });
      } else {
        tokens.push({ type: "word", value });
      }
    }

    return tokens;
  }

  function isCommandPosition(tokens, index) {
    const previousMeaningful = findPreviousMeaningfulToken(tokens, index);

    if (!previousMeaningful) return true;

    return previousMeaningful.type === "operator" && ["|", "||", "&&", ";"].includes(previousMeaningful.value);
  }

  function findPreviousMeaningfulToken(tokens, index) {
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      if (tokens[cursor].type !== "space") return tokens[cursor];
    }

    return null;
  }

  function isShellKeyword(value) {
    return /^(if|then|else|elif|fi|for|select|in|do|done|case|esac|while|until|function|return|exit|export|local|readonly|declare|typeset)$/.test(value);
  }

  function highlightAwk(code) {
    const escaped = escapeHtml(code);

    return escaped
      .replace(/(#.*)$/gm, '<span class="obm-token-comment">$1</span>')
      .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, '<span class="obm-token-string">$1</span>')
      .replace(/\b(BEGIN|END|if|else|while|do|for|break|continue|delete|exit|function|in|next|nextfile|print|printf|return)\b/g, '<span class="obm-token-keyword">$1</span>')
      .replace(/\b(atan2|cos|sin|exp|log|sqrt|int|rand|srand|gsub|sub|match|split|sprintf|substr|index|length|tolower|toupper|getline|close|system|fflush)\b(?=\s*\()/g, '<span class="obm-token-function">$1</span>')
      .replace(/\b(ARGC|ARGV|CONVFMT|ENVIRON|FILENAME|FNR|FS|NF|NR|OFMT|OFS|ORS|RLENGTH|RS|RSTART|SUBSEP)\b/g, '<span class="obm-token-variable">$1</span>')
      .replace(/\$[0-9]+|\$[A-Za-z_][A-Za-z0-9_]*/g, '<span class="obm-token-variable">$&</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="obm-token-number">$1</span>')
      .replace(/(\+\+|--|==|!=|<=|>=|\|\||&&|[~!%^*/+=<>?:-])/g, '<span class="obm-token-operator">$1</span>')
      .replace(/([{}()[\],;])/g, '<span class="obm-token-punctuation">$1</span>');
  }

  function highlightManual(code) {
    const escaped = escapeHtml(code);

    return escaped
      .replace(/^(\s*[A-Z][A-Z0-9_ -]{2,})(?=\s{2,}|$)/gm, '<span class="obm-token-keyword">$1</span>')
      .replace(/\b(-{1,2}[A-Za-z0-9][A-Za-z0-9-]*)\b/g, '<span class="obm-token-flag">$1</span>')
      .replace(/\b([A-Z_]{2,})\b/g, '<span class="obm-token-variable">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="obm-token-number">$1</span>');
  }

  function makeArgumentsClickable(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;

        if (!parent) return NodeFilter.FILTER_REJECT;

        if (
          parent.closest("a, button, pre, code, tt, .obm-terminal, .obm-arg-chip") ||
          ["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(parent.tagName)
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return /--?[A-Za-z0-9][A-Za-z0-9-]*(?:\[[^\]]+\])?(?:=[A-Za-z0-9_-]+)?/.test(node.nodeValue || "")
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });

    const nodes = [];

    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const text = node.nodeValue || "";
      const fragment = document.createDocumentFragment();
      const matcher = /--?[A-Za-z0-9][A-Za-z0-9-]*(?:\[[^\]]+\])?(?:=[A-Za-z0-9_-]+)?/g;
      let lastIndex = 0;
      let match;

      while ((match = matcher.exec(text))) {
        const raw = match[0];

        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        fragment.appendChild(createArgumentChip(raw));

        lastIndex = match.index + raw.length;
      }

      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      node.parentNode?.replaceChild(fragment, node);
    }
  }

  function createArgumentChip(rawValue) {
    const button = document.createElement("button");
    const normalized = normalizeArgument(rawValue);

    button.type = "button";
    button.className = "obm-arg-chip";
    button.dataset.obmArg = normalized;
    button.textContent = rawValue;
    button.title = `Jump to ${normalized}`;

    return button;
  }

  function normalizeArgument(value) {
    return String(value)
      .replace(/\[[^\]]+\]/g, "")
      .replace(/=.*/, "")
      .trim();
  }

  function bindArgumentClicks(root) {
    root.addEventListener("click", (event) => {
      const chip = event.target instanceof Element ? event.target.closest(".obm-arg-chip") : null;

      if (!chip) return;

      const arg = chip.getAttribute("data-obm-arg") || chip.textContent || "";
      const target = findArgumentTarget(root, arg, chip);

      if (!target) {
        chip.setAttribute("data-obm-found", "false");
        return;
      }

      chip.setAttribute("data-obm-found", "true");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("obm-arg-target");

      setTimeout(() => {
        target.classList.remove("obm-arg-target");
      }, 1800);
    });
  }

  function findArgumentTarget(root, arg, source) {
    const candidates = [
      ...root.querySelectorAll("dt, dd, p, li, td, th, code, tt, b, strong, span, a"),
    ].filter((element) => element !== source && !element.closest(".obm-terminal, .obm-arg-chip"));

    const exact = candidates.find((element) => textHasExactArgument(element.textContent || "", arg));

    if (exact) return exact.closest("dt, dd, li, p, tr") || exact;

    const base = arg.replace(/^-+/, "");
    const idTarget = document.getElementById(base) || document.getElementById(arg);

    if (idTarget) return idTarget;

    return null;
  }

  function textHasExactArgument(text, arg) {
    const escaped = arg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matcher = new RegExp(`(^|[^A-Za-z0-9_-])${escaped}(?=$|[^A-Za-z0-9_-])`);

    return matcher.test(text);
  }

  function buildSidebar(root) {
    const aside = document.createElement("aside");
    aside.className = "obm-sidebar";

    const headings = [...root.querySelectorAll("h2, h3")].filter((heading) => heading.textContent?.trim());

    aside.innerHTML = `<p class="obm-sidebar-title">Contents</p>`;

    const list = document.createElement("ol");
    list.className = "obm-toc";

    for (const heading of headings) {
      const item = document.createElement("li");
      const link = document.createElement("a");

      link.href = `#${heading.id}`;
      link.textContent = heading.textContent?.trim() || "";
      link.style.paddingLeft = heading.tagName === "H3" ? "24px" : "11px";

      item.appendChild(link);
      list.appendChild(item);
    }

    aside.appendChild(list);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;

        for (const link of aside.querySelectorAll("a")) {
          link.classList.toggle("obm-active", link.getAttribute("href") === `#${visible.target.id}`);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: [0, 1] },
    );

    for (const heading of headings) observer.observe(heading);

    return aside;
  }

  function createTopButton() {
    const button = document.createElement("button");

    button.className = "obm-top-fab";
    button.type = "button";
    button.setAttribute("aria-label", "Back to top");
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
        <path d="M12 19V5m0 0 7 7M12 5l-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    button.addEventListener("click", () => {
      scrollTo({ top: 0, behavior: "smooth" });
    });

    return button;
  }

  function bindDynamicTopButton(button) {
    let ticking = false;

    const update = () => {
      button.dataset.visible = String(scrollY > 520);
      ticking = false;
    };

    addEventListener(
      "scroll",
      () => {
        if (ticking) return;

        ticking = true;
        requestAnimationFrame(update);
      },
      { passive: true },
    );

    update();
  }

  function bindToolbar(shellElement, contentElement) {
    const themeButton = shellElement.querySelector("[data-obm-theme-toggle]");
    const readerButton = shellElement.querySelector("[data-obm-reader]");
    const searchInput = shellElement.querySelector(".obm-search");

    themeButton?.addEventListener("click", () => {
      const nextTheme = document.documentElement.dataset.obmTheme === "dark" ? "light" : "dark";

      document.documentElement.dataset.obmTheme = nextTheme;
      localStorage.setItem(STORAGE_KEY, nextTheme);
    });

    readerButton?.addEventListener("click", () => {
      const nextMode = shellElement.dataset.reader === "compact" ? "wide" : "compact";

      shellElement.dataset.reader = nextMode;
      localStorage.setItem(READER_KEY, nextMode);
    });

    searchInput?.addEventListener("input", () => {
      clearMarks(contentElement);

      const query = searchInput.value.trim();

      if (query.length < 2) return;

      highlightText(contentElement, query);
    });
  }

  function clearMarks(root) {
    for (const mark of root.querySelectorAll("mark.obm-mark")) {
      mark.replaceWith(document.createTextNode(mark.textContent || ""));
    }

    root.normalize();
  }

  function highlightText(root, query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matcher = new RegExp(escaped, "gi");

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;

        if (!parent || ["SCRIPT", "STYLE", "MARK"].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        matcher.lastIndex = 0;

        return matcher.test(node.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });

    const nodes = [];

    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      const text = node.nodeValue || "";
      let lastIndex = 0;

      matcher.lastIndex = 0;

      text.replace(matcher, (match, offset) => {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));

        const mark = document.createElement("mark");
        mark.className = "obm-mark";
        mark.textContent = match;
        fragment.appendChild(mark);

        lastIndex = offset + match.length;

        return match;
      });

      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      node.parentNode?.replaceChild(fragment, node);
    }

    root.querySelector("mark.obm-mark")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function scrollToHashTarget() {
    const hash = decodeURIComponent(location.hash.slice(1));

    if (!hash) return;

    const target =
      document.getElementById(hash) ||
      [...document.querySelectorAll("a, h1, h2, h3, dt, code, b")].find((element) => {
        return element.textContent?.trim().replace(/\(\)$/, "") === hash;
      });

    if (!target) return;

    setTimeout(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("obm-anchor-highlight");

      setTimeout(() => {
        target.classList.remove("obm-anchor-highlight");
      }, 1800);
    }, 80);
  }
})();