// ==UserScript==
// @name         021 / Mini VSCode Source IDE Ultra 11.1
// @namespace    https://rod.dev/userscripts
// @version      11.1.0
// @description  Ultra-performance mobile source viewer with CodeMirror, raw textarea mode, lazy navigation, pretty formatting, and persistent preferences.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// @noframes
// @require      https://code.migos.club/api/cdn?bundle=iife&global=RodCDN&preset=prettier&preset=codemirror&preset=acorn&preset=lucide
// @require      https://rodkisten.github.io/bundler/cipo.js
// ==/UserScript==

/* global prettier, prettierPlugins, CodeMirror, acorn, acornWalk, lucide */

(() => {
  "use strict";
  

  /* ==========================================================================
   * Constants
   * ========================================================================== */

  const ROOT_ID = "__rod_source_ide_ultra__";
  const STYLE_ID = "__rod_source_ide_ultra_style__";
  const STORAGE_KEY = "rod.sourceIdeUltra.v11.preferences";

  const TOAST_MS = 1050;
  const LONG_PRESS_MS = 480;
  const TOOLBAR_HIDE_MS = 1100;
  const HEADER_SCROLL_THRESHOLD = 10;

  const MAX_USAGE_ROWS = 80;
  const MAX_USAGE_MARKS = 120;
  const MAX_AST_SOURCE_LENGTH = 220_000;
  const MAX_TEXT_USAGE_SCAN_LENGTH = 350_000;
  const VIRTUAL_VIEWPORT_MARGIN = 18;

  const DEFAULT_PREFERENCES = {
    autoWrap: false,
    autoHighlight: false,
    codeNavigation: false,
    rawMode: true,
    avoidToolbarCover: true,
    prettyOnBoot: true,
  };

  const RESERVED_WORDS = new Set([
    "arguments", "await", "break", "case", "catch", "class", "const", "continue",
    "debugger", "default", "delete", "do", "else", "export", "extends", "false",
    "finally", "for", "from", "function", "if", "import", "in", "instanceof",
    "let", "new", "null", "return", "static", "super", "switch", "this", "throw",
    "true", "try", "typeof", "undefined", "var", "void", "while", "with", "yield",
  ]);

  /* ==========================================================================
   * Guards
   * ========================================================================== */

      const rawPre = document.querySelector("body > pre");

      if (!rawPre) return;
      if (document.body.firstElementChild !== rawPre) return;
  if (document.getElementById(ROOT_ID)) return;
  if (typeof CodeMirror === "undefined") return;

  const contentType = document.contentType || "";
  const pathname = location.pathname || "";

  if (/^application\/(xhtml\+xml|xml|rss\+xml)|text\/(html|xml)$/i.test(contentType)) {
    return;
  }

  /* ==========================================================================
   * Helpers
   * ========================================================================== */
     /* ==========================================================================
   * Template Helpers
   * ========================================================================== */

  function template(strings, ...values) {
    let output = "";

    for (let index = 0; index < strings.length; index += 1) {
      output += strings[index];

      if (index < values.length) {
        output += String(values[index]);
      }
    }

    return stripCodeComments(dedent(output)).trim();
  }

  function css(strings, ...values) {
    return formatCss(template(strings, ...values));
  }

  function html(strings, ...values) {
    return formatHtml(template(strings, ...values));
  }

  function dedent(value) {
    const lines = String(value).replace(/\r\n?/g, "\n").split("\n");

    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    const indent = lines.reduce((minimum, line) => {
      if (!line.trim()) return minimum;

      const size = line.match(/^\s*/)?.[0].length || 0;
      return minimum === null ? size : Math.min(minimum, size);
    }, null);

    if (!indent) return lines.join("\n");

    return lines.map((line) => line.slice(indent)).join("\n");
  }

  function stripCodeComments(value) {
    return String(value)
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/\n{3,}/g, "\n\n");
  }

  function formatHtml(value) {
    const source = stripCodeComments(String(value))
      .replace(/>\s+</g, "><")
      .replace(/</g, "\n<")
      .replace(/>/g, ">\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);


  /**
   * Checks whether a URL path looks like a file.
   *
   * @param {string | URL | Location} url URL-like value.
   * @returns {boolean} True when the last path segment has an extension.
   */
  function looksLikeFileUrl(url) {
    const pathnameValue = new URL(String(url), location.href).pathname;
    const lastSegment = pathnameValue.split("/").pop() || "";

    return /\.[a-z0-9]{1,12}$/i.test(lastSegment);
  }

  if (!looksLikeFileUrl(window.location.href)) {
    console.log("🍉 Mini VSCode skipped: URL does not look like a raw file.");
  }

  /**
   * Escapes HTML.
   *
   * @param {string} value Raw text.
   * @returns {string} Escaped text.
   */
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /**
   * Creates one element from HTML.
   *
   * @param {string} html Raw HTML.
   * @returns {HTMLElement} Created element.
   */
  function createElement(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();

    return /** @type {HTMLElement} */ (template.content.firstElementChild);
  }

  /**
   * Escapes text for RegExp usage.
   *
   * @param {string} value Raw string.
   * @returns {string} Escaped string.
   */
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Reads preferences from storage.
   *
   * @returns {typeof DEFAULT_PREFERENCES} Preferences.
   */
  function readPreferences() {
    try {
      return {
        ...DEFAULT_PREFERENCES,
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
      };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  /**
   * Saves preferences.
   *
   * @param {typeof DEFAULT_PREFERENCES} nextPreferences Preferences.
   * @returns {void}
   */
  function savePreferences(nextPreferences) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPreferences));
  }

  /**
   * Detects source kind.
   *
   * @returns {{ parser: string | undefined, mode: string | object, label: string, isJavaScriptLike: boolean }}
   */
  function detectSourceKind() {
    if (contentType === "text/css" || /\.(css|scss|less)$/i.test(pathname)) {
      return { parser: "css", mode: "css", label: "css", isJavaScriptLike: false };
    }

    if (contentType === "application/json" || /\.(json|map)$/i.test(pathname)) {
      return {
        parser: "json",
        mode: { name: "javascript", json: true },
        label: "json",
        isJavaScriptLike: false,
      };
    }

    if (/\.tsx?$/i.test(pathname)) {
      return {
        parser: "typescript",
        mode: "text/typescript",
        label: "typescript",
        isJavaScriptLike: true,
      };
    }

    if (/\.jsx?$/i.test(pathname) || /^application\/(x-javascript|javascript)$/i.test(contentType)) {
      return { parser: "babel", mode: "javascript", label: "javascript", isJavaScriptLike: true };
    }

    if (/\.(html?|xhtml|xml|vue)$/i.test(pathname)) {
      return { parser: "html", mode: "htmlmixed", label: "html", isJavaScriptLike: false };
    }

    if (/\.(md|markdown)$/i.test(pathname)) {
      return { parser: "markdown", mode: "markdown", label: "markdown", isJavaScriptLike: false };
    }

    if (/\.ya?ml$/i.test(pathname)) {
      return { parser: "yaml", mode: "yaml", label: "yaml", isJavaScriptLike: false };
    }

    return { parser: "babel", mode: "javascript", label: "javascript", isJavaScriptLike: true };
  }

  /**
   * Copies text.
   *
   * @param {string} text Text.
   * @returns {Promise<boolean>} Copy result.
   */
  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;font-size:16px;";

    document.body.appendChild(textarea);

    try {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }

  /**
   * Formats source.
   *
   * @param {string} source Source.
   * @param {string | undefined} parser Parser.
   * @returns {string} Formatted source.
   */
  function formatSource(source, parser) {
    if (!parser || typeof prettier === "undefined") return source;

    try {
      return prettier.format(source, {
        parser,
        plugins: prettierPlugins,
        printWidth: 100,
        tabWidth: 2,
        useTabs: false,
        semi: true,
        singleQuote: false,
        trailingComma: "all",
        bracketSpacing: true,
      });
    } catch (error) {
      console.warn("🍉 Mini VSCode: Prettier failed.", error);
      return source;
    }
  }

  /**
   * Saves text as file.
   *
   * @param {string} text Text.
   * @param {string} filename Filename.
   * @returns {void}
   */
  function saveTextFile(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename || "source.txt";
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      anchor.remove();
    }, 1000);
  }

  /**
   * Locks Safari zoom gestures.
   *
   * @returns {void}
   */
  function lockSafariZoom() {
    const viewport =
      document.querySelector('meta[name="viewport"]') ||
      document.head.appendChild(document.createElement("meta"));

    viewport.setAttribute("name", "viewport");
    viewport.setAttribute(
      "content",
      "width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover",
    );

    let lastTouchEnd = 0;

    document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
    document.addEventListener("gesturechange", (event) => event.preventDefault(), { passive: false });
    document.addEventListener("gestureend", (event) => event.preventDefault(), { passive: false });

    document.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches && event.touches.length > 1) event.preventDefault();
      },
      { passive: false },
    );

    document.addEventListener(
      "touchend",
      (event) => {
        const now = Date.now();

        if (now - lastTouchEnd <= 320) event.preventDefault();

        lastTouchEnd = now;
      },
      { passive: false },
    );
  }

  /* ==========================================================================
   * Source
   * ========================================================================== */

  const preferences = readPreferences();
  const detected = detectSourceKind();
  const initialSource = (rawPre.textContent || "").trimStart();
  const lineCount = Math.max(1, initialSource.split("\n").length);

  lockSafariZoom();

  /* ==========================================================================
   * Shell
   * ========================================================================== */

  const root = createElement(html`
    <main id="${ROOT_ID}">
      <section class="rod-editor-card">
        <div class="rod-editor-host"></div>
        <textarea class="rod-raw-textarea" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>
      </section>

      <header class="rod-topbar is-visible">
        <div class="rod-brand">
          <span class="rod-dot">🍉</span>
          <strong>
            VIEW SOURCE
            <small> · ${escapeHtml(window.location.pathname)}</small>
          </strong>
          <small>${escapeHtml(detected.label)} · ${lineCount}</small>
        </div>

        <div class="rod-actions">
          <button type="button" data-action="search" title="Search"><i data-lucide="search"></i></button>
          <button type="button" data-action="toggle-raw" title="Raw textarea">T<i data-lucide="text-cursor-input"></i></button>
          <button type="button" data-action="pretty" title="Pretty">P<i data-lucide="wand-sparkles"></i></button>
          <button type="button" data-action="toggle-wrap" title="Soft wrap">W<i data-lucide="wrap-text"></i></button>
          <button type="button" data-action="settings" title="Settings">S<i data-lucide="sliders-horizontal"></i></button>
          <button type="button" data-action="command" title="Commands"><i data-lucide="command"></i></button>
        </div>
      </header>

      <aside class="rod-panel rod-command-menu" hidden>
        <div class="rod-handle"></div>
        <strong class="rod-panel-title">Commands</strong>
        <div class="rod-command-grid"></div>
      </aside>

      <aside class="rod-panel rod-settings-panel" hidden>
        <div class="rod-handle"></div>
        <div class="rod-panel-head">
          <strong>Preferences</strong>
          <button type="button" data-action="close-settings"><i data-lucide="x"></i></button>
        </div>
        <div class="rod-settings-list"></div>
      </aside>

      <aside class="rod-panel rod-usages-sheet" hidden>
        <div class="rod-handle"></div>
        <div class="rod-panel-head">
          <strong></strong>
          <button type="button" data-action="close-usages"><i data-lucide="x"></i></button>
        </div>
        <div class="rod-usage-body"></div>
      </aside>

      <div class="rod-toast" hidden></div>
    </main>
  `);

  rawPre.replaceWith(root);

  const editorHost = /** @type {HTMLElement} */ (root.querySelector(".rod-editor-host"));
  const rawTextarea = /** @type {HTMLTextAreaElement} */ (root.querySelector(".rod-raw-textarea"));
  const topbar = /** @type {HTMLElement} */ (root.querySelector(".rod-topbar"));
  const commandMenu = /** @type {HTMLElement} */ (root.querySelector(".rod-command-menu"));
  const commandGrid = /** @type {HTMLElement} */ (root.querySelector(".rod-command-grid"));
  const settingsPanel = /** @type {HTMLElement} */ (root.querySelector(".rod-settings-panel"));
  const settingsList = /** @type {HTMLElement} */ (root.querySelector(".rod-settings-list"));
  const usagesSheet = /** @type {HTMLElement} */ (root.querySelector(".rod-usages-sheet"));
  const usageTitle = /** @type {HTMLElement} */ (root.querySelector(".rod-usages-sheet .rod-panel-head strong"));
  const usageBody = /** @type {HTMLElement} */ (root.querySelector(".rod-usage-body"));
  const toastBox = /** @type {HTMLElement} */ (root.querySelector(".rod-toast"));

  /* ==========================================================================
   * CSS
   * ========================================================================== */

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      background: #070b12 !important;
      color: #e9edf7 !important;
      -webkit-text-size-adjust: 100% !important;
      overscroll-behavior: none !important;
    }

    #${ROOT_ID} {
      --rod-toolbar-space: 0px;
      --rod-font-visible: 12px;
      --rod-font-input: 16px;

      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      padding: max(0.18rem, env(safe-area-inset-top)) max(0.16rem, env(safe-area-inset-right)) max(0.16rem, env(safe-area-inset-bottom)) max(0.16rem, env(safe-area-inset-left));
      background: #070b12;
      color: #e9edf7;
      overflow: hidden;
      box-sizing: border-box;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${ROOT_ID} * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent !important;
    }

    #${ROOT_ID} button {
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.075);
      color: #e9edf7;
      font: inherit;
      font-weight: 800;
      touch-action: manipulation;
    }

    #${ROOT_ID} button:active {
      transform: scale(0.985);
      background: rgba(255,255,255,0.13);
    }

    #${ROOT_ID} svg {
      width: 1rem;
      height: 1rem;
      stroke-width: 2.35;
      pointer-events: none;
    }

    #${ROOT_ID} .rod-editor-card {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 0.75rem;
      background: #070b12;
    }

    #${ROOT_ID} .rod-editor-host,
    #${ROOT_ID} .rod-raw-textarea {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
    }

    #${ROOT_ID} .rod-raw-textarea {
      display: none;
      resize: none;
      border: 0;
      outline: 0;
      padding: calc(0.64rem + var(--rod-toolbar-space)) 0.72rem 3.2rem;
      background: #070b12;
      color: #e9edf7;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: var(--rod-font-input);
      line-height: 1.35;
      white-space: pre;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
    }

    #${ROOT_ID}.is-soft-wrap .rod-raw-textarea {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    #${ROOT_ID}.is-raw-mode .rod-editor-host {
      display: none;
    }

    #${ROOT_ID}.is-raw-mode .rod-raw-textarea {
      display: block;
    }

    #${ROOT_ID} .rod-topbar {
      position: fixed;
      left: max(0.36rem, env(safe-area-inset-left));
      right: max(0.36rem, env(safe-area-inset-right));
      top: max(0.34rem, env(safe-area-inset-top));
      z-index: 40;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 2.48rem;
      gap: 0.4rem;
      padding: 0.26rem 0.3rem 0.26rem 0.44rem;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 0.72rem;
      background: rgba(9, 14, 24, 0.78);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-125%);
      transition: opacity 120ms ease, transform 120ms ease;
    }

    #${ROOT_ID} .rod-topbar.is-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    #${ROOT_ID} .rod-brand {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 0.32rem;
    }

    #${ROOT_ID} .rod-dot {
      display: grid;
      place-items: center;
      width: 1.66rem;
      height: 1.66rem;
      border-radius: 0.52rem;
      background: rgba(255,95,126,0.15);
    }

    #${ROOT_ID} .rod-brand strong {
      font-size: 0.78rem;
      letter-spacing: -0.03em;
    }

    #${ROOT_ID} .rod-brand small {
      max-width: 7.5rem;
      overflow: hidden;
      color: #aeb8d3;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.64rem;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    #${ROOT_ID} .rod-actions {
      display: flex;
      gap: 0.26rem;
    }

    #${ROOT_ID} .rod-actions button,
    #${ROOT_ID} .rod-panel-head button {
      display: grid;
      place-items: center;
      width: 1.88rem;
      height: 1.88rem;
      border-radius: 0.58rem;
      color: #78f0de;
    }

    #${ROOT_ID} .rod-actions button.is-active {
      color: #061012;
      background: #78f0de;
    }

    #${ROOT_ID} .CodeMirror {
      width: 100% !important;
      height: 100% !important;
      background: #070b12 !important;
      color: #e9edf7 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: var(--rod-font-visible) !important;
      line-height: 1 !important;
      text-rendering: optimizeSpeed;
    }

    #${ROOT_ID} .CodeMirror textarea {
      font-size: var(--rod-font-input) !important;
    }

    #${ROOT_ID} .CodeMirror-scroll {
      width: 100% !important;
      height: 100% !important;
      overflow: auto !important;
      -webkit-overflow-scrolling: touch;
    }

    #${ROOT_ID} .CodeMirror-lines {
      padding: var(--rod-toolbar-space) 0 3.2rem !important;
    }

    #${ROOT_ID} .CodeMirror-gutters {
      background: #070b12 !important;
      border-right: 1px solid rgba(255,255,255,0.075) !important;
    }

    #${ROOT_ID} .CodeMirror-linenumber {
      color: rgba(233,237,247,0.48) !important;
      padding-right: 0.5rem !important;
    }

    #${ROOT_ID} .CodeMirror pre.CodeMirror-line,
    #${ROOT_ID} .CodeMirror pre.CodeMirror-line-like {
      padding: 0 0.64rem !important;
      word-break: normal !important;
      overflow-wrap: normal !important;
      white-space: pre !important;
    }

    #${ROOT_ID}.is-soft-wrap .CodeMirror pre.CodeMirror-line,
    #${ROOT_ID}.is-soft-wrap .CodeMirror pre.CodeMirror-line-like {
      white-space: pre-wrap !important;
      word-break: break-word !important;
      overflow-wrap: anywhere !important;
    }

    #${ROOT_ID}.is-highlight-off .CodeMirror span[class*="cm-"] {
      color: #e9edf7 !important;
      font-style: normal !important;
      text-decoration: none !important;
    }

    #${ROOT_ID} .CodeMirror-cursor {
      border-left-color: #78f0de !important;
    }

    #${ROOT_ID} .CodeMirror-selected {
      background: rgba(120,240,222,0.24) !important;
    }

    #${ROOT_ID} .rod-panel {
      position: fixed;
      left: 0.28rem;
      right: 0.28rem;
      bottom: calc(max(0.28rem, env(safe-area-inset-bottom)) + 0.08rem);
      z-index: 2147483646;
      overflow: auto;
      padding: 0.46rem;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 0.82rem;
      background: rgba(8,12,20,0.97);
      color: #e9edf7;
      box-shadow: 0 1rem 3rem rgba(0,0,0,0.45);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    #${ROOT_ID} .rod-command-menu,
    #${ROOT_ID} .rod-settings-panel {
      max-height: 46vh;
    }

    #${ROOT_ID} .rod-usages-sheet {
      max-height: 36vh;
    }

    #${ROOT_ID} .rod-handle {
      width: 2.2rem;
      height: 0.2rem;
      margin: 0 auto 0.42rem;
      border-radius: 999px;
      background: rgba(255,255,255,0.22);
    }

    #${ROOT_ID} .rod-panel-title,
    #${ROOT_ID} .rod-panel-head {
      margin: 0 0 0.38rem;
      padding: 0 0.2rem;
      color: #78f0de;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.74rem;
      font-weight: 900;
    }

    #${ROOT_ID} .rod-panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    #${ROOT_ID} .rod-command-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.3rem;
    }

    #${ROOT_ID} .rod-command-button {
      display: grid;
      gap: 0.22rem;
      place-items: center;
      min-height: 3.2rem;
      border-radius: 0.62rem;
      font-size: 0.58rem;
      line-height: 1.05;
    }

    #${ROOT_ID} .rod-settings-list {
      display: grid;
      gap: 0.34rem;
    }

    #${ROOT_ID} .rod-setting-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.7rem;
      align-items: center;
      padding: 0.52rem;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 0.7rem;
      background: rgba(255,255,255,0.045);
    }

    #${ROOT_ID} .rod-setting-row strong {
      display: block;
      font-size: 0.78rem;
    }

    #${ROOT_ID} .rod-setting-row small {
      display: block;
      margin-top: 0.1rem;
      color: #aeb8d3;
      font-size: 0.66rem;
      line-height: 1.25;
    }

    #${ROOT_ID} .rod-setting-row button {
      width: 3.1rem;
      height: 1.7rem;
      border-radius: 999px;
      color: #aeb8d3;
    }

    #${ROOT_ID} .rod-setting-row button.is-active {
      background: #78f0de;
      color: #061012;
    }

    #${ROOT_ID} .rod-usage-body {
      display: grid;
      gap: 0.24rem;
    }

    #${ROOT_ID} .rod-usage-row {
      display: grid;
      grid-template-columns: 2.8rem minmax(0, 1fr);
      gap: 0.34rem;
      width: 100%;
      min-height: 0;
      padding: 0.34rem 0.42rem;
      border-radius: 0.58rem;
      text-align: left;
    }

    #${ROOT_ID} .rod-usage-line {
      color: #ff7894;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.66rem;
      font-weight: 900;
    }

    #${ROOT_ID} .rod-usage-code {
      min-width: 0;
      overflow: hidden;
      color: #e9edf7;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.66rem;
      line-height: 1.3;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    #${ROOT_ID} .rod-toast {
      position: fixed;
      left: 50%;
      bottom: calc(max(0.6rem, env(safe-area-inset-bottom)) + 0.2rem);
      z-index: 2147483647;
      transform: translateX(-50%);
      max-width: calc(100vw - 1.2rem);
      padding: 0.55rem 0.76rem;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 999px;
      background: rgba(11,16,26,0.97);
      color: #e9edf7;
      font-size: 0.82rem;
      font-weight: 900;
      white-space: nowrap;
    }

    #${ROOT_ID} .rod-symbol-mark {
      border-radius: 0.16rem;
      background: rgba(255,95,126,0.2);
      outline: 1px solid rgba(255,95,126,0.34);
    }

    #${ROOT_ID} .rod-symbol-focus {
      border-radius: 0.16rem;
      background: rgba(120,240,222,0.28);
      outline: 2px solid rgba(120,240,222,0.72);
    }

    #${ROOT_ID} .rod-userscript-meta-fold-widget {
      display: inline-flex;
      align-items: center;
      margin-left: 0.3rem;
      padding: 0.03rem 0.38rem;
      border: 1px solid rgba(120,240,222,0.26);
      border-radius: 999px;
      background: rgba(120,240,222,0.1);
      color: #78f0de;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.68rem;
      font-weight: 900;
    }

    #${ROOT_ID} .cm-s-rod-dark .cm-keyword { color: #c678dd; }
    #${ROOT_ID} .cm-s-rod-dark .cm-atom { color: #d19a66; }
    #${ROOT_ID} .cm-s-rod-dark .cm-number { color: #d19a66; }
    #${ROOT_ID} .cm-s-rod-dark .cm-def { color: #61afef; }
    #${ROOT_ID} .cm-s-rod-dark .cm-variable { color: #e9edf7; }
    #${ROOT_ID} .cm-s-rod-dark .cm-variable-2 { color: #56b6c2; }
    #${ROOT_ID} .cm-s-rod-dark .cm-variable-3 { color: #e5c07b; }
    #${ROOT_ID} .cm-s-rod-dark .cm-property { color: #98c379; }
    #${ROOT_ID} .cm-s-rod-dark .cm-operator { color: #ff7894; }
    #${ROOT_ID} .cm-s-rod-dark .cm-comment { color: #7f8ca8; font-style: italic; }
    #${ROOT_ID} .cm-s-rod-dark .cm-string { color: #98c379; }
    #${ROOT_ID} .cm-s-rod-dark .cm-string-2 { color: #e5c07b; }
    #${ROOT_ID} .cm-s-rod-dark .cm-meta { color: #e5c07b; }
    #${ROOT_ID} .cm-s-rod-dark .cm-tag { color: #e06c75; }
    #${ROOT_ID} .cm-s-rod-dark .cm-attribute { color: #d19a66; }
    #${ROOT_ID} .cm-s-rod-dark .cm-builtin { color: #56b6c2; }
    #${ROOT_ID} .cm-s-rod-dark .cm-bracket { color: #abb2bf; }
    #${ROOT_ID} .cm-s-rod-dark .cm-error { color: #ff7894; }
  `;
  document.head.appendChild(style);

  /* ==========================================================================
   * Editor
   * ========================================================================== */

  let isSoftWrap = Boolean(preferences.autoWrap);
  let astCache = null;
  let astSource = "";
  let symbolMarks = [];
  let usages = [];
  let usageIndex = -1;
  let toastTimer = 0;
  let toolbarHideTimer = 0;
  let lastScrollTop = 0;
  let rafPending = false;
  let navigationInstalled = false;

  rawTextarea.value = initialSource;

  const editor = CodeMirror(editorHost, {
    value: initialSource,
    mode: preferences.autoHighlight ? detected.mode : "text/plain",
    theme: "rod-dark",
    lineNumbers: true,
    editable: false,
    lineWrapping: isSoftWrap,
    fixedGutter: true,
    readOnly: true,
    viewportMargin: VIRTUAL_VIEWPORT_MARGIN,
    matchBrackets: true,
    foldGutter: true,
    foldOptions: { widget: " ⋯ " },
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    extraKeys: {
      "Cmd-F": "findPersistent",
      "Ctrl-F": "findPersistent",
      "Cmd-A": () => selectAllText(),
      "Ctrl-A": () => selectAllText(),
      "Cmd-Shift-C": () => copyAllText(),
      "Ctrl-Shift-C": () => copyAllText(),
      "Alt-U": () => findUsagesAtCursor(),
      "Alt-Left": () => previousUsage(),
      "Alt-Right": () => nextUsage(),
      "Alt-[": () => foldCurrentBlock(),
      "Alt-]": () => unfoldCurrentBlock(),
      Esc: () => closePanels(),
    },
  });

  root.classList.toggle("is-soft-wrap", isSoftWrap);
  root.classList.toggle("is-highlight-off", !preferences.autoHighlight);
  root.classList.toggle("is-raw-mode", preferences.rawMode);

  /* ==========================================================================
   * Layout
   * ========================================================================== */

  /**
   * Gets current source from the visible editor.
   *
   * @returns {string} Source.
   */
  function getCurrentSource() {
    return root.classList.contains("is-raw-mode") ? rawTextarea.value : editor.getValue();
  }

  /**
   * Sets both editor values.
   *
   * @param {string} value Source.
   * @returns {void}
   */
  function setCurrentSource(value) {
    rawTextarea.value = value;

    editor.operation(() => {
      editor.setValue(value);
      editor.refresh();
    });

    astCache = null;
    astSource = "";
  }

  /**
   * Refreshes editor safely.
   *
   * @returns {void}
   */
  function scheduleRefresh() {
    if (rafPending) return;

    rafPending = true;

    requestAnimationFrame(() => {
      rafPending = false;
      editor.setSize("100%", "100%");
      editor.refresh();
      updateToolbarSpace();
    });
  }

  /**
   * Updates top padding so toolbar does not cover source.
   *
   * @returns {void}
   */
  function updateToolbarSpace() {
    if (!preferences.avoidToolbarCover || !topbar.classList.contains("is-visible")) {
      root.style.setProperty("--rod-toolbar-space", "0px");
      return;
    }

    root.style.setProperty("--rod-toolbar-space", `${Math.ceil(topbar.offsetHeight + 12)}px`);
  }

  /**
   * Shows toolbar temporarily.
   *
   * @param {boolean} hold Keep it visible.
   * @returns {void}
   */
  function showToolbar(hold = false) {
    topbar.classList.add("is-visible");
    updateToolbarSpace();
    window.clearTimeout(toolbarHideTimer);

    if (!hold) {
      toolbarHideTimer = window.setTimeout(() => {
        topbar.classList.remove("is-visible");
        updateToolbarSpace();
      }, TOOLBAR_HIDE_MS);
    }
  }

  /* ==========================================================================
   * UI
   * ========================================================================== */

  /**
   * Shows a toast.
   *
   * @param {string} message Message.
   * @returns {void}
   */
  function showToast(message) {
    clearTimeout(toastTimer);

    toastBox.textContent = message;
    toastBox.hidden = false;

    toastTimer = window.setTimeout(() => {
      toastBox.hidden = true;
    }, TOAST_MS);
  }

  /**
   * Closes panels.
   *
   * @returns {void}
   */
  function closePanels() {
    commandMenu.hidden = true;
    settingsPanel.hidden = true;
    usagesSheet.hidden = true;
  }

  /**
   * Updates toolbar active states.
   *
   * @returns {void}
   */
  function updateToolbarButtons() {
    const rawButton = root.querySelector('[data-action="toggle-raw"]');
    const wrapButton = root.querySelector('[data-action="toggle-wrap"]');

    if (rawButton instanceof HTMLElement) {
      rawButton.classList.toggle("is-active", root.classList.contains("is-raw-mode"));
    }

    if (wrapButton instanceof HTMLElement) {
      wrapButton.classList.toggle("is-active", isSoftWrap);
    }
  }

  /* ==========================================================================
   * Commands
   * ========================================================================== */

  /**
   * Toggles soft wrap.
   *
   * @param {boolean} [force] Optional forced value.
   * @returns {void}
   */
  function toggleSoftWrap(force) {
    isSoftWrap = typeof force === "boolean" ? force : !isSoftWrap;
    preferences.autoWrap = isSoftWrap;
    savePreferences(preferences);

    editor.setOption("lineWrapping", isSoftWrap);
    root.classList.toggle("is-soft-wrap", isSoftWrap);

    updateToolbarButtons();
    scheduleRefresh();
    showToast(isSoftWrap ? "Wrap on" : "Wrap off");
  }

  /**
   * Toggles raw textarea mode.
   *
   * @param {boolean} [force] Optional forced value.
   * @returns {void}
   */
  function toggleRawMode(force) {
    const nextRawMode = typeof force === "boolean" ? force : !root.classList.contains("is-raw-mode");

    if (nextRawMode) {
      rawTextarea.value = editor.getValue();
      root.classList.add("is-raw-mode");
      rawTextarea.focus();
    } else {
      setCurrentSource(rawTextarea.value);
      root.classList.remove("is-raw-mode");
      editor.focus();
    }

    preferences.rawMode = nextRawMode;
    savePreferences(preferences);

    updateToolbarButtons();
    scheduleRefresh();
    showToast(nextRawMode ? "Raw textarea" : "Highlighted editor");
  }

  /**
   * Toggles syntax highlight.
   *
   * @returns {void}
   */
  function toggleAutoHighlight() {
    preferences.autoHighlight = !preferences.autoHighlight;
    savePreferences(preferences);

    editor.setOption("mode", preferences.autoHighlight ? detected.mode : "text/plain");
    root.classList.toggle("is-highlight-off", !preferences.autoHighlight);

    scheduleRefresh();
    renderSettings();
    showToast(preferences.autoHighlight ? "Highlight on" : "Highlight off");
  }

  /**
   * Toggles lazy navigation.
   *
   * @returns {void}
   */
  function toggleCodeNavigation() {
    preferences.codeNavigation = !preferences.codeNavigation;
    savePreferences(preferences);

    renderSettings();

    if (preferences.codeNavigation) {
      installLazyNavigation();
      showToast("Navigation on");
    } else {
      clearSymbolMarks();
      showToast("Navigation off");
    }
  }

  /**
   * Toggles toolbar spacing.
   *
   * @returns {void}
   */
  function toggleAvoidToolbarCover() {
    preferences.avoidToolbarCover = !preferences.avoidToolbarCover;
    savePreferences(preferences);
    updateToolbarSpace();
    renderSettings();
    showToast(preferences.avoidToolbarCover ? "Toolbar spacing on" : "Toolbar spacing off");
  }

  /**
   * Toggles pretty on boot.
   *
   * @returns {void}
   */
  function togglePrettyOnBoot() {
    preferences.prettyOnBoot = !preferences.prettyOnBoot;
    savePreferences(preferences);
    renderSettings();
    showToast(preferences.prettyOnBoot ? "Pretty on boot on" : "Pretty on boot off");
  }

  /**
   * Selects all text.
   *
   * @returns {void}
   */
  function selectAllText() {
    if (root.classList.contains("is-raw-mode")) {
      rawTextarea.focus();
      rawTextarea.select();
      showToast("Selected all");
      return;
    }

    const lastLine = editor.lastLine();
    editor.setSelection({ line: 0, ch: 0 }, { line: lastLine, ch: editor.getLine(lastLine).length });
    editor.focus();
    showToast("Selected all");
  }

  /**
   * Copies all text.
   *
   * @returns {void}
   */
  function copyAllText() {
    void copyText(getCurrentSource()).then((ok) => showToast(ok ? "Copied all" : "Copy failed"));
  }

  /**
   * Formats current source.
   *
   * @returns {void}
   */
  function formatEditor() {
    const value = getCurrentSource();

    if (value.length > MAX_AST_SOURCE_LENGTH) {
      showToast("Large file, formatting anyway");
    } else {
      showToast("Formatting");
    }

    const formatted = formatSource(value, detected.parser).trimStart();
    setCurrentSource(formatted);

    showToast("Formatted");
  }

  /**
   * Saves current file.
   *
   * @returns {void}
   */
  function saveCurrentFile() {
    const fallbackName = `source.${detected.label === "typescript" ? "ts" : detected.label || "txt"}`;
    const filename = pathname.split("/").filter(Boolean).pop() || fallbackName;

    saveTextFile(getCurrentSource(), filename);
    showToast("Saved");
  }

  /**
   * Folds current block.
   *
   * @returns {void}
   */
  function foldCurrentBlock() {
    editor.foldCode(editor.getCursor());
  }

  /**
   * Unfolds current block.
   *
   * @returns {void}
   */
  function unfoldCurrentBlock() {
    editor.foldCode(editor.getCursor(), null, "unfold");
  }

  /**
   * Scrolls to top.
   *
   * @returns {void}
   */
  function scrollEditorTop() {
    if (root.classList.contains("is-raw-mode")) {
      rawTextarea.scrollTop = 0;
      rawTextarea.selectionStart = 0;
      rawTextarea.selectionEnd = 0;
      return;
    }

    editor.setCursor({ line: 0, ch: 0 });
    editor.scrollTo(0, 0);
  }

  /* ==========================================================================
   * Userscript Meta Folding
   * ========================================================================== */

  /**
   * Folds userscript metadata.
   *
   * @param {CodeMirror.Editor} cm CodeMirror instance.
   * @returns {void}
   */
  function foldOnlyUserscriptMetaBlocks(cm) {
    const maxLine = Math.min(cm.lastLine(), 120);

    for (let line = cm.firstLine(); line <= maxLine; line += 1) {
      const text = cm.getLine(line) || "";

      if (!/^\s*\/\/\s*==UserScript==\s*$/.test(text)) continue;

      for (let endLine = line + 1; endLine <= Math.min(cm.lastLine(), line + 80); endLine += 1) {
        const endText = cm.getLine(endLine) || "";

        if (/^\s*\/\/\s*==\/UserScript==\s*$/.test(endText)) {
          const widget = document.createElement("span");
          widget.className = "rod-userscript-meta-fold-widget";
          widget.textContent = " ⋯ userscript meta ";

          cm.markText(CodeMirror.Pos(line, 0), CodeMirror.Pos(endLine + 1, 0), {
            replacedWith: widget,
            clearOnEnter: true,
          });

          line = endLine;
          break;
        }
      }
    }
  }

  /* ==========================================================================
   * Lazy Navigation
   * ========================================================================== */

  /**
   * Installs lazy navigation after initial paint.
   *
   * @returns {void}
   */
  function installLazyNavigation() {
    if (navigationInstalled || !preferences.codeNavigation) return;

    const run = () => {
      navigationInstalled = true;
      showToast("Navigation ready");
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 1800 });
      return;
    }

    setTimeout(run, 350);
  }

  /**
   * Gets AST lazily.
   *
   * @returns {any | null} AST.
   */
  function getAst() {
    const source = getCurrentSource();

    if (!preferences.codeNavigation) return null;
    if (!detected.isJavaScriptLike) return null;
    if (source.length > MAX_AST_SOURCE_LENGTH) return null;
    if (astCache && astSource === source) return astCache;

    try {
      astCache = acorn.parse(source, {
        ecmaVersion: "latest",
        sourceType: "module",
        allowHashBang: true,
        allowReturnOutsideFunction: true,
      });
      astSource = source;
      return astCache;
    } catch {
      try {
        astCache = acorn.parse(source, {
          ecmaVersion: "latest",
          sourceType: "script",
          allowHashBang: true,
          allowReturnOutsideFunction: true,
        });
        astSource = source;
        return astCache;
      } catch {
        astCache = null;
        astSource = source;
        return null;
      }
    }
  }

  /**
   * Converts index to position.
   *
   * @param {number} index Source index.
   * @returns {CodeMirror.Position} Editor position.
   */
  function indexToPos(index) {
    return editor.posFromIndex(index);
  }

  /**
   * Converts position to index.
   *
   * @param {CodeMirror.Position} position Editor position.
   * @returns {number} Source index.
   */
  function posToIndex(position) {
    return editor.indexFromPos(position);
  }

  /**
   * Finds deepest AST node at index.
   *
   * @param {number} index Source index.
   * @returns {any | null} Node.
   */
  function findNodeAtIndex(index) {
    const ast = getAst();
    let best = null;

    if (!ast || typeof acornWalk === "undefined") return null;

    acornWalk.full(ast, (node) => {
      if (typeof node.start !== "number" || typeof node.end !== "number") return;
      if (node.start > index || node.end < index) return;

      if (!best || node.end - node.start <= best.end - best.start) {
        best = node;
      }
    });

    return best;
  }

  /**
   * Gets symbol under cursor.
   *
   * @returns {{ name: string, from: number, to: number } | null} Symbol.
   */
  function getSymbolAtCursor() {
    const cursor = editor.getCursor();
    const index = posToIndex(cursor);
    const node = findNodeAtIndex(index);

    if (node?.type === "Identifier" && node.name && !RESERVED_WORDS.has(node.name)) {
      return { name: node.name, from: node.start, to: node.end };
    }

    const token = editor.getTokenAt(cursor);
    const value = String(token?.string || "");

    if (!/^[A-Za-z_$][\w$]*$/.test(value)) return null;
    if (RESERVED_WORDS.has(value)) return null;

    return {
      name: value,
      from: posToIndex({ line: cursor.line, ch: token.start }),
      to: posToIndex({ line: cursor.line, ch: token.end }),
    };
  }

  /**
   * Finds symbol usages.
   *
   * @param {string} symbol Symbol.
   * @returns {Array<{ from: number, to: number, kind: string }>} Usages.
   */
  function findSymbolUsages(symbol) {
    const ast = getAst();
    const ranges = [];

    if (ast && typeof acornWalk !== "undefined") {
      acornWalk.full(ast, (node) => {
        if (ranges.length > MAX_USAGE_ROWS) return;
        if (node.type !== "Identifier") return;
        if (node.name !== symbol) return;

        ranges.push({ from: node.start, to: node.end, kind: "identifier" });
      });

      return ranges;
    }

    const source = getCurrentSource();

    if (source.length > MAX_TEXT_USAGE_SCAN_LENGTH) {
      showToast("File too large for scan");
      return [];
    }

    const expression = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "g");
    let match;

    while ((match = expression.exec(source)) && ranges.length < MAX_USAGE_ROWS) {
      ranges.push({
        from: match.index,
        to: match.index + symbol.length,
        kind: "text",
      });
    }

    return ranges;
  }

  /**
   * Clears usage marks.
   *
   * @returns {void}
   */
  function clearSymbolMarks() {
    for (let index = 0; index < symbolMarks.length; index += 1) {
      symbolMarks[index].clear();
    }

    symbolMarks = [];
    usages = [];
    usageIndex = -1;
  }

  /**
   * Finds usages at cursor.
   *
   * @returns {void}
   */
  function findUsagesAtCursor() {
    if (root.classList.contains("is-raw-mode")) {
      showToast("Navigation uses highlighted mode");
      return;
    }

    if (!preferences.codeNavigation) {
      showToast("Navigation is off");
      return;
    }

    clearSymbolMarks();

    const symbol = getSymbolAtCursor();

    if (!symbol) {
      showToast("No symbol here");
      return;
    }

    usages = findSymbolUsages(symbol.name);

    if (!usages.length) {
      showToast("No usages");
      return;
    }

    const markCount = Math.min(usages.length, MAX_USAGE_MARKS);

    for (let index = 0; index < markCount; index += 1) {
      const usage = usages[index];

      symbolMarks.push(
        editor.markText(indexToPos(usage.from), indexToPos(usage.to), {
          className: "rod-symbol-mark",
        }),
      );
    }

    usageIndex = Math.max(0, usages.findIndex((usage) => usage.from === symbol.from));

    openUsageSheet(symbol.name);
    jumpToUsage(usageIndex);
  }

  /**
   * Renders highlighted line preview.
   *
   * @param {number} lineNumber Line number.
   * @returns {string} HTML.
   */
  function renderHighlightedLine(lineNumber) {
    const line = editor.getLine(lineNumber) || "";
    const tokens = editor.getLineTokens(lineNumber);

    if (!tokens.length || !preferences.autoHighlight) return escapeHtml(line.slice(0, 140));

    let html = "";
    let cursor = 0;

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];

      if (token.start > cursor) {
        html += escapeHtml(line.slice(cursor, token.start));
      }

      const text = escapeHtml(line.slice(token.start, token.end));
      const classes = token.type
        ? token.type.split(" ").map((name) => `cm-${name}`).join(" ")
        : "";

      html += classes ? `<span class="${classes}">${text}</span>` : text;
      cursor = token.end;

      if (html.length > 420) break;
    }

    return html;
  }

  /**
   * Opens usage sheet.
   *
   * @param {string} symbolName Symbol.
   * @returns {void}
   */
  function openUsageSheet(symbolName) {
    commandMenu.hidden = true;
    settingsPanel.hidden = true;
    usageTitle.textContent = `${symbolName} · ${usages.length}`;
    usageBody.textContent = "";

    const fragment = document.createDocumentFragment();
    const maxRows = Math.min(usages.length, MAX_USAGE_ROWS);

    for (let index = 0; index < maxRows; index += 1) {
      const usage = usages[index];
      const position = indexToPos(usage.from);
      const row = document.createElement("button");

      row.type = "button";
      row.className = "rod-usage-row";
      row.dataset.usageIndex = String(index);
      row.innerHTML = `
        <span class="rod-usage-line">L${position.line + 1}</span>
        <code class="rod-usage-code">${renderHighlightedLine(position.line)}</code>
      `;

      fragment.append(row);
    }

    usageBody.append(fragment);
    usagesSheet.hidden = false;
  }

  /**
   * Jumps to usage.
   *
   * @param {number} nextIndex Usage index.
   * @returns {void}
   */
  function jumpToUsage(nextIndex) {
    if (!usages.length) return;

    usageIndex = (nextIndex + usages.length) % usages.length;

    const usage = usages[usageIndex];
    const from = indexToPos(usage.from);
    const to = indexToPos(usage.to);

    editor.setSelection(from, to);
    editor.scrollIntoView(from, 90);
    editor.focus();
  }

  /**
   * Goes to next usage.
   *
   * @returns {void}
   */
  function nextUsage() {
    if (!usages.length) return;
    jumpToUsage(usageIndex + 1);
  }

  /**
   * Goes to previous usage.
   *
   * @returns {void}
   */
  function previousUsage() {
    if (!usages.length) return;
    jumpToUsage(usageIndex - 1);
  }

  /* ==========================================================================
   * Menus
   * ========================================================================== */

  const commands = [
    { icon: "search", label: "Search", run: () => editor.execCommand("findPersistent") },
    { icon: "text-cursor-input", label: "Raw", run: () => toggleRawMode() },
    { icon: "wand-sparkles", label: "Pretty", run: formatEditor },
    { icon: "scan-search", label: "Usages", run: findUsagesAtCursor },
    { icon: "wrap-text", label: "Wrap", run: () => toggleSoftWrap() },
    { icon: "copy", label: "Copy all", run: copyAllText },
    { icon: "text-select", label: "Select", run: selectAllText },
    { icon: "save", label: "Save", run: saveCurrentFile },
    { icon: "fold-horizontal", label: "Fold", run: foldCurrentBlock },
    { icon: "unfold-horizontal", label: "Unfold", run: unfoldCurrentBlock },
    { icon: "arrow-up-to-line", label: "Top", run: scrollEditorTop },
    { icon: "x", label: "Close", run: closePanels },
  ];

  const settingRows = [
    {
      key: "autoWrap",
      title: "Auto wrap",
      description: "Wrap long lines by default and keep the layout readable on mobile.",
      toggle: () => toggleSoftWrap(),
    },
    {
      key: "autoHighlight",
      title: "Auto highlight",
      description: "Use CodeMirror syntax coloring. Turn off for plain text speed.",
      toggle: toggleAutoHighlight,
    },
    {
      key: "codeNavigation",
      title: "Code navigation",
      description: "Lazy symbol navigation. It wakes up only after the editor renders.",
      toggle: toggleCodeNavigation,
    },
    {
      key: "rawMode",
      title: "Raw mode",
      description: "Open as a normal textarea without highlighted rendering.",
      toggle: () => toggleRawMode(),
    },
    {
      key: "avoidToolbarCover",
      title: "Avoid toolbar cover",
      description: "Adds smart top spacing while the toolbar is visible.",
      toggle: toggleAvoidToolbarCover,
    },
    {
      key: "prettyOnBoot",
      title: "Pretty on boot",
      description: "Format automatically when the file is small enough.",
      toggle: togglePrettyOnBoot,
    },
  ];

  /**
   * Renders command menu.
   *
   * @returns {void}
   */
  function renderCommandMenu() {
    const fragment = document.createDocumentFragment();

    commandGrid.textContent = "";

    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index];
      const button = document.createElement("button");

      button.type = "button";
      button.className = "rod-command-button";
      button.dataset.commandIndex = String(index);
      button.innerHTML = `<i data-lucide="${command.icon}"></i><span>${escapeHtml(command.label)}</span>`;

      fragment.append(button);
    }

    commandGrid.append(fragment);
  }

  /**
   * Renders settings panel.
   *
   * @returns {void}
   */
  function renderSettings() {
    const fragment = document.createDocumentFragment();

    settingsList.textContent = "";

    for (let index = 0; index < settingRows.length; index += 1) {
      const setting = settingRows[index];
      const row = document.createElement("div");
      const isActive = Boolean(preferences[setting.key]);

      row.className = "rod-setting-row";
      row.innerHTML = `
        <span>
          <strong>${escapeHtml(setting.title)}</strong>
          <small>${escapeHtml(setting.description)}</small>
        </span>
        <button type="button" class="${isActive ? "is-active" : ""}" data-setting-index="${index}">
          ${isActive ? "ON" : "OFF"}
        </button>
      `;

      fragment.append(row);
    }

    settingsList.append(fragment);
  }

  /**
   * Opens command menu.
   *
   * @returns {void}
   */
  function openCommandMenu() {
    usagesSheet.hidden = true;
    settingsPanel.hidden = true;
    commandMenu.hidden = false;
    showToolbar(true);
  }

  /**
   * Opens settings.
   *
   * @returns {void}
   */
  function openSettings() {
    commandMenu.hidden = true;
    usagesSheet.hidden = true;
    renderSettings();
    settingsPanel.hidden = false;
    showToolbar(true);
  }

  renderCommandMenu();
  renderSettings();

  /* ==========================================================================
   * Events
   * ========================================================================== */

  root.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) return;

    const commandTarget = target.closest("[data-command-index]");
    const settingTarget = target.closest("[data-setting-index]");
    const usageTarget = target.closest("[data-usage-index]");
    const actionTarget = target.closest("[data-action]");

    if (commandTarget instanceof HTMLElement) {
      const command = commands[Number(commandTarget.dataset.commandIndex || "-1")];

      if (command) command.run();

      return;
    }

    if (settingTarget instanceof HTMLElement) {
      const setting = settingRows[Number(settingTarget.dataset.settingIndex || "-1")];

      if (setting) setting.toggle();

      return;
    }

    if (usageTarget instanceof HTMLElement) {
      jumpToUsage(Number(usageTarget.dataset.usageIndex || "0"));
      return;
    }

    if (!(actionTarget instanceof HTMLElement)) return;

    const action = actionTarget.dataset.action;

    if (action === "search") editor.execCommand("findPersistent");
    if (action === "toggle-raw") toggleRawMode();
    if (action === "pretty") formatEditor();
    if (action === "toggle-wrap") toggleSoftWrap();
    if (action === "settings") openSettings();
    if (action === "command") openCommandMenu();
    if (action === "close-settings") settingsPanel.hidden = true;
    if (action === "close-usages") usagesSheet.hidden = true;
  });

  rawTextarea.addEventListener("input", () => {
    astCache = null;
    astSource = "";
  });

  editor.on("scroll", () => {
    const scrollInfo = editor.getScrollInfo();
    const delta = scrollInfo.top - lastScrollTop;

    if (delta > HEADER_SCROLL_THRESHOLD) showToolbar(false);
    if (delta < -HEADER_SCROLL_THRESHOLD) {
      topbar.classList.remove("is-visible");
      updateToolbarSpace();
    }

    lastScrollTop = scrollInfo.top;
  });

  rawTextarea.addEventListener("scroll", () => {
    showToolbar(false);
  });

  /* ==========================================================================
   * Touch
   * ========================================================================== */

  let touchStartX = 0;
  let touchStartY = 0;
  let longPressTimer = 0;

  const wrapper = editor.getWrapperElement();

  /**
   * Handles long press.
   *
   * @param {Touch} touch Touch point.
   * @returns {void}
   */
  function handleLongPress(touch) {
    const position = editor.coordsChar({
      left: touch.clientX,
      top: touch.clientY,
    });

    editor.setCursor(position);
    openCommandMenu();
  }

  wrapper.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];

      if (!touch) return;

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      clearTimeout(longPressTimer);

      longPressTimer = window.setTimeout(() => {
        handleLongPress(touch);
      }, LONG_PRESS_MS);
    },
    { passive: true },
  );

  wrapper.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.changedTouches[0];

      if (!touch) return;

      if (Math.abs(touch.clientX - touchStartX) > 12 || Math.abs(touch.clientY - touchStartY) > 12) {
        clearTimeout(longPressTimer);
      }
    },
    { passive: true },
  );

  wrapper.addEventListener(
    "touchend",
    (event) => {
      clearTimeout(longPressTimer);

      const touch = event.changedTouches[0];

      if (!touch) return;

      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;

      if (Math.abs(dx) > 74 && Math.abs(dy) < 56) {
        if (dx < 0) nextUsage();
        else previousUsage();
      }
    },
    { passive: true },
  );

  /**
   * Adds swipe-down close.
   *
   * @param {HTMLElement} panel Panel.
   * @returns {void}
   */
  function installSwipeDownClose(panel) {
    let startY = 0;

    panel.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;
        startY = touch.clientY;
      },
      { passive: true },
    );

    panel.addEventListener(
      "touchend",
      (event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;

        if (touch.clientY - startY > 72) {
          panel.hidden = true;
        }
      },
      { passive: true },
    );
  }

  installSwipeDownClose(commandMenu);
  installSwipeDownClose(settingsPanel);
  installSwipeDownClose(usagesSheet);

  /* ==========================================================================
   * Boot
   * ========================================================================== */

  requestAnimationFrame(() => {
    editor.setSize("100%", "100%");
    editor.refresh();

    foldOnlyUserscriptMetaBlocks(editor);

    if (preferences.rawMode) {
      toggleRawMode(true);
    }

    if (preferences.prettyOnBoot && initialSource.length < MAX_AST_SOURCE_LENGTH) {
      formatEditor();
    }

    showToolbar(true);
    updateToolbarButtons();
    updateToolbarSpace();

    if (typeof lucide !== "undefined") {
      lucide.createIcons({ attrs: { "aria-hidden": "true" } });
    }

    installLazyNavigation();

    console.log("🍉 Mini VSCode Source IDE loaded", {
      parser: detected.parser,
      mode: detected.mode,
      label: detected.label,
      lines: lineCount,
      preferences,
    });
  });

  window.addEventListener("resize", scheduleRefresh);
  window.addEventListener("orientationchange", () => setTimeout(scheduleRefresh, 220));
})();