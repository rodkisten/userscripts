// ==UserScript==
// @name         000 / Ultra Virtual Pretty Viewer
// @namespace    https://rod.dev/userscripts
// @version      2.3.0
// @description  Mobile-safe soft-wrap virtualized source viewer with HLJS-first highlighting, auto-pretty, MiniPrettier fallback, and uncopyable line numbers.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @noframes
// @weight       999
// ==/UserScript==

(async function UltraPrettyViewer() {
  "use strict";

  /***************************************************************************************************
   * Constants
   **************************************************************************************************/

  const APP_ID = "__ROD_ULTRA_PRETTY_VIEWER__";
  const META_ID = "__ROD_ULTRA_PRETTY_META__";
  const DEBUG = true;

  const BLOCK_SIZE = 40;
  const BLOCK_OVERSCAN = 4;
  const DEFAULT_BLOCK_HEIGHT = 960;

  const AUTO_PRETTY_MAX_BYTES = 120 * 1024;
  const AUTO_PRETTY_MAX_LINES = 1800;
  const PRETTIER_TIMEOUT_MS = 3500;

  const CDN = {
    prettier: "https://esm.sh/prettier@3.3.3/standalone?bundle&target=es2022",
    prettierBabel: "https://esm.sh/prettier@3.3.3/plugins/babel?bundle&target=es2022",
    prettierEstree: "https://esm.sh/prettier@3.3.3/plugins/estree?bundle&target=es2022",
    prettierHtml: "https://esm.sh/prettier@3.3.3/plugins/html?bundle&target=es2022",
    prettierCss: "https://esm.sh/prettier@3.3.3/plugins/postcss?bundle&target=es2022",

    hljs: "https://esm.sh/highlight.js@11.11.1/lib/core?bundle&target=es2022",
    hljsJs: "https://esm.sh/highlight.js@11.11.1/lib/languages/javascript?bundle&target=es2022",
    hljsTs: "https://esm.sh/highlight.js@11.11.1/lib/languages/typescript?bundle&target=es2022",
    hljsJson: "https://esm.sh/highlight.js@11.11.1/lib/languages/json?bundle&target=es2022",
    hljsCss: "https://esm.sh/highlight.js@11.11.1/lib/languages/css?bundle&target=es2022",
    hljsXml: "https://esm.sh/highlight.js@11.11.1/lib/languages/xml?bundle&target=es2022",
  };

  /***************************************************************************************************
   * State
   **************************************************************************************************/

  const state = {
    rawSource: "",
    currentSource: "",
    lines: [],
    blocks: [],
    blockHeights: [],
    blockOffsets: [],
    totalHeight: 1,
    visibleStartBlock: -1,
    visibleEndBlock: -1,
    highlightedCache: new Map(),
    renderQueued: false,

    hljs: null,
    highlighterSource: "mini",

    prettier: null,
    prettierPlugins: [],
    prettierSource: "mini",

    language: "javascript",
    parser: "babel",
    mode: "raw",
    softWrap: true,
  };

  /***************************************************************************************************
   * Helpers
   **************************************************************************************************/

  /**
   * Prints debug logs only when DEBUG is enabled.
   *
   * @param {...unknown} args Debug payload.
   * @returns {void}
   */
  function debug(...args) {
    if (!DEBUG) return;
    console.log("[UltraPrettyViewer]", ...args);
  }

  /**
   * Escapes HTML safely before rendering source text.
   *
   * @param {string} value Raw text.
   * @returns {string} HTML-safe text.
   */
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  /**
   * Waits for document.body without blocking the userscript.
   *
   * @returns {Promise<void>}
   */
  async function waitForBody() {
    while (!document.body) {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    }
  }

  /**
   * Runs non-critical work in an idle slot.
   *
   * @param {() => void} callback Work callback.
   * @returns {void}
   */
  function idle(callback) {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(callback, { timeout: 220 });
      return;
    }

    window.setTimeout(callback, 16);
  }

  /**
   * Imports an ESM module safely.
   *
   * @template T
   * @param {string} url Module URL.
   * @returns {Promise<T | null>} Imported module.
   */
  async function importSafe(url) {
    try {
      return await import(url);
    } catch (error) {
      debug("Import failed:", url, error);
      return null;
    }
  }

  /**
   * Adds a mobile viewport meta tag for raw-code pages.
   *
   * @returns {void}
   */
  function ensureViewportMeta() {
    if (document.getElementById(META_ID)) return;

    const meta = document.createElement("meta");
    meta.id = META_ID;
    meta.name = "viewport";
    meta.content =
      "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover";

    document.documentElement.appendChild(meta);
  }

  /**
   * Detects source language from URL and content shape.
   *
   * @param {string} source Source text.
   * @returns {{ language: string, parser: string, hljsLanguage: string }}
   */
  function detectLanguage(source) {
    const path = location.pathname.toLowerCase();

    if (path.endsWith(".json") || /^[\s\n\r]*[{[]/.test(source)) {
      return { language: "json", parser: "json", hljsLanguage: "json" };
    }

    if (path.endsWith(".css")) {
      return { language: "css", parser: "css", hljsLanguage: "css" };
    }

    if (path.endsWith(".html") || path.endsWith(".xml") || /^\s*</.test(source)) {
      return { language: "html", parser: "html", hljsLanguage: "xml" };
    }

    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      return { language: "typescript", parser: "typescript", hljsLanguage: "typescript" };
    }

    return { language: "javascript", parser: "babel", hljsLanguage: "javascript" };
  }

  /**
   * Formats byte-ish text size.
   *
   * @param {number} value Text length.
   * @returns {string} Pretty size.
   */
  function formatBytes(value) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Copies text with a Safari-friendly fallback.
   *
   * @param {string} value Text to copy.
   * @returns {Promise<boolean>} Whether copy worked.
   */
  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.inset = "0";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      const ok = document.execCommand("copy");
      textarea.remove();

      return ok;
    }
  }

  /**
   * Adds a timeout so Prettier cannot freeze Safari forever.
   *
   * @template T
   * @param {Promise<T>} promise Promise to guard.
   * @param {number} timeout Timeout in milliseconds.
   * @returns {Promise<T>} Resolved value.
   */
  function withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("Prettier timed out")), timeout);
      }),
    ]);
  }

  /**
   * Checks whether auto-formatting is safe for mobile Safari.
   *
   * @returns {boolean} Whether auto pretty should run.
   */
  function shouldAutoPretty() {
    return (
      state.rawSource.length <= AUTO_PRETTY_MAX_BYTES &&
      state.rawSource.split("\n").length <= AUTO_PRETTY_MAX_LINES
    );
  }

  /***************************************************************************************************
   * MiniPrettier Fallback
   **************************************************************************************************/

  /**
   * Formats JSON safely.
   *
   * @param {string} source JSON text.
   * @returns {string} Formatted JSON.
   */
  function formatJson(source) {
    try {
      return JSON.stringify(JSON.parse(source), null, 2);
    } catch {
      return source;
    }
  }

  /**
   * Cheap brace-based formatter for JavaScript and TypeScript fallback.
   *
   * @param {string} source Source text.
   * @returns {string} Formatted source.
   */
  function formatBraceLanguage(source) {
    let output = "";
    let indent = 0;
    let quote = "";
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];

      if (quote) {
        output += char;

        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = "";
        }

        continue;
      }

      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        output += char;
        continue;
      }

      if (char === "{" || char === "[" || char === "(") {
        output += `${char}\n${"  ".repeat(indent + 1)}`;
        indent += 1;
        continue;
      }

      if (char === "}" || char === "]" || char === ")") {
        indent = Math.max(0, indent - 1);
        output = output.trimEnd();
        output += `\n${"  ".repeat(indent)}${char}`;
        continue;
      }

      if (char === ";" || char === ",") {
        output += `${char}\n${"  ".repeat(indent)}`;
        continue;
      }

      if (/\s/.test(char)) {
        if (!/\s/.test(output.at(-1) || "")) output += " ";
        continue;
      }

      output += char;
    }

    return output.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  /**
   * Cheap CSS formatter.
   *
   * @param {string} source CSS text.
   * @returns {string} Formatted CSS.
   */
  function formatCss(source) {
    return source
      .replace(/\s*{\s*/g, " {\n  ")
      .replace(/;\s*/g, ";\n  ")
      .replace(/\s*}\s*/g, "\n}\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Cheap HTML formatter.
   *
   * @param {string} source HTML text.
   * @returns {string} Formatted HTML.
   */
  function formatHtml(source) {
    const voidTags = new Set(["br", "hr", "img", "input", "meta", "link", "source", "area", "base"]);
    const tokens = source.replace(/>\s+</g, "><").split(/(<[^>]+>)/g).filter(Boolean);
    const lines = [];
    let indent = 0;

    for (const token of tokens) {
      const value = token.trim();
      if (!value) continue;

      const close = /^<\//.test(value);
      const open = /^<[a-zA-Z]/.test(value);
      const tag = value.match(/^<\/?([a-zA-Z0-9:-]+)/)?.[1]?.toLowerCase() || "";
      const selfClosing = /\/>$/.test(value) || voidTags.has(tag) || /^<!/.test(value);

      if (close) indent = Math.max(0, indent - 1);

      lines.push(`${"  ".repeat(indent)}${value}`);

      if (open && !close && !selfClosing) indent += 1;
    }

    return lines.join("\n");
  }

  /**
   * Formats source using local fallback logic.
   *
   * @param {string} source Source text.
   * @param {string} language Language.
   * @returns {string} Formatted text.
   */
  function miniPrettier(source, language) {
    if (language === "json") return formatJson(source);
    if (language === "css") return formatCss(source);
    if (language === "html") return formatHtml(source);
    return formatBraceLanguage(source);
  }

  /***************************************************************************************************
   * MiniHLJS Fallback
   **************************************************************************************************/

  /**
   * Tiny fallback highlighter used only if HLJS is unavailable.
   *
   * @param {string} line Source line.
   * @param {string} language Language.
   * @returns {string} Highlighted HTML.
   */
  function miniHljs(line, language) {
    const source = String(line);

    if (language === "html") {
      return escapeHtml(source)
        .replace(/(&lt;!--.*?--&gt;)/g, '<span class="tok-comment">$1</span>')
        .replace(/(&lt;\/?[\w:-]+)/g, '<span class="tok-tag">$1</span>')
        .replace(/([\w:-]+)(=)/g, '<span class="tok-attr">$1</span>$2')
        .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="tok-string">$1</span>');
    }

    if (language === "css") {
      return escapeHtml(source)
        .replace(/(\/\*.*?\*\/)/g, '<span class="tok-comment">$1</span>')
        .replace(/^(\s*[.#]?[\w-]+)(?=\s*\{)/g, '<span class="tok-selector">$1</span>')
        .replace(/([\w-]+)(\s*:)/g, '<span class="tok-attr">$1</span>$2')
        .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="tok-string">$1</span>')
        .replace(/\b(\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|dvh|dvw|s|ms)?)\b/g, '<span class="tok-number">$1</span>');
    }

    const escaped = escapeHtml(source);
    const parts = escaped.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$)/g);

    return parts
      .map((part) => {
        if (!part) return "";
        if (/^\/\//.test(part)) return `<span class="tok-comment">${part}</span>`;
        if (/^["'`]/.test(part)) return `<span class="tok-string">${part}</span>`;

        return part
          .replace(
            /\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|interface|let|new|null|return|switch|this|throw|true|try|type|typeof|undefined|var|void|while|yield)\b/g,
            '<span class="tok-keyword">$1</span>',
          )
          .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>')
          .replace(/\b([A-Z][A-Za-z0-9_$]*)\b/g, '<span class="tok-type">$1</span>')
          .replace(/\b([a-zA-Z_$][\w$]*)(?=\()/g, '<span class="tok-title">$1</span>');
      })
      .join("");
  }

  /**
   * Highlights one source line, preferring real HLJS before the mini fallback.
   *
   * @param {string} line Source line.
   * @param {number} index Line index.
   * @returns {string} Highlighted HTML.
   */
  function highlightLine(line, index) {
    const cached = state.highlightedCache.get(index);
    if (cached) return cached;

    let output = "";

    try {
      if (state.hljs?.highlight) {
        output = state.hljs.highlight(line, {
          language: state.language === "html" ? "xml" : state.language,
          ignoreIllegals: true,
        }).value;
      } else {
        output = miniHljs(line, state.language);
      }
    } catch {
      output = miniHljs(line, state.language);
    }

    const finalOutput = output || "&nbsp;";
    state.highlightedCache.set(index, finalOutput);

    return finalOutput;
  }

  /***************************************************************************************************
   * Boot
   **************************************************************************************************/

  ensureViewportMeta();
  await waitForBody();

  const rawPre = document.querySelector("body > pre");

  if (!rawPre || document.body.firstElementChild !== rawPre) return;

  const loading = document.createElement("div");
  loading.innerHTML = `
    <style>
      html,
      body {
        margin: 0 !important;
        background: #070b14 !important;
      }

      .rod-loading {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        background: #070b14;
        color: #dce6ff;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }

      .rod-loading-card {
        display: grid;
        gap: 12px;
        justify-items: center;
      }

      .rod-spinner {
        width: 38px;
        height: 38px;
        border: 3px solid rgb(255 255 255 / 0.12);
        border-top-color: #82aaff;
        border-radius: 999px;
        animation: rod-spin 0.8s linear infinite;
      }

      @keyframes rod-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .rod-loading-title {
        font-size: 13px;
        font-weight: 800;
      }
    </style>

    <div class="rod-loading">
      <div class="rod-loading-card">
        <div class="rod-spinner"></div>
        <div class="rod-loading-title">Loading HLJS first...</div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(loading);

  state.rawSource = rawPre.textContent || "";
  state.currentSource = state.rawSource;

  const detected = detectLanguage(state.rawSource);

  state.language = detected.language;
  state.parser = detected.parser;

  rawPre.remove();

  /***************************************************************************************************
   * External Engines, HLJS First
   **************************************************************************************************/

  const [hljsMod, jsLang, tsLang, jsonLang, cssLang, xmlLang] = await Promise.all([
    importSafe(CDN.hljs),
    importSafe(CDN.hljsJs),
    importSafe(CDN.hljsTs),
    importSafe(CDN.hljsJson),
    importSafe(CDN.hljsCss),
    importSafe(CDN.hljsXml),
  ]);

  const hljs = hljsMod?.default || hljsMod;

  if (hljs?.registerLanguage) {
    const languages = [
      ["javascript", jsLang],
      ["typescript", tsLang],
      ["json", jsonLang],
      ["css", cssLang],
      ["xml", xmlLang],
    ];

    for (const [name, mod] of languages) {
      const factory = mod?.default || mod;
      if (factory) hljs.registerLanguage(name, factory);
    }

    state.hljs = hljs;
    state.highlighterSource = "hljs";
  }

  mountViewer();

  idle(async () => {
    const [prettierMod, babel, estree, html, css] = await Promise.all([
      importSafe(CDN.prettier),
      importSafe(CDN.prettierBabel),
      importSafe(CDN.prettierEstree),
      importSafe(CDN.prettierHtml),
      importSafe(CDN.prettierCss),
    ]);

    const prettier = prettierMod?.default || prettierMod;

    if (prettier?.format) {
      state.prettier = prettier;
      state.prettierSource = "prettier";
      state.prettierPlugins = [
        babel?.default || babel,
        estree?.default || estree,
        html?.default || html,
        css?.default || css,
      ].filter(Boolean);
    }

    if (shouldAutoPretty()) {
      const prettyButton = document.querySelector(`#${APP_ID} [data-action="pretty"]`);
      if (prettyButton) prettyButton.click();
    }
  });

  /***************************************************************************************************
   * Viewer
   **************************************************************************************************/

  /**
   * Mounts the virtualized viewer.
   *
   * @returns {void}
   */
  function mountViewer() {
    const root = document.createElement("main");

    root.id = APP_ID;
    root.innerHTML = `
      <style>
        #${APP_ID} {
          position: fixed;
          inset: 0;
          z-index: 999;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          overflow: hidden;
          background:
            radial-gradient(circle at top left, rgb(130 170 255 / 0.10), transparent 36%),
            #070b14;
          color: #dce6ff;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          max-width: 100vw;
          user-select: text;
          -webkit-user-select: text;
        }

        .rod-toolbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
          padding: calc(env(safe-area-inset-top) + 9px) 10px 9px;
          border-bottom: 1px solid rgb(124 140 180 / 0.16);
          background: rgb(7 11 20 / 0.94);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .rod-title {
          min-width: 0;
        }

        .rod-title strong {
          display: block;
          overflow: hidden;
          color: #eef4ff;
          font-size: 13px;
          font-weight: 850;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rod-title span {
          display: block;
          overflow: hidden;
          color: rgb(220 230 255 / 0.55);
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rod-actions {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .rod-btn {
          appearance: none;
          min-width: 48px;
          border: 1px solid rgb(124 140 180 / 0.26);
          border-radius: 999px;
          padding: 7px 10px;
          background: linear-gradient(180deg, rgb(255 255 255 / 0.10), rgb(255 255 255 / 0.04));
          color: #eef4ff;
          font: inherit;
          font-size: 12px;
          font-weight: 760;
          box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06);
        }

        .rod-btn:active {
          transform: scale(0.96);
        }

        .rod-btn-primary {
          border-color: rgb(130 170 255 / 0.48);
          background:
            linear-gradient(135deg, rgb(130 170 255 / 0.22), rgb(199 146 234 / 0.16)),
            rgb(255 255 255 / 0.05);
        }

        .rod-scroll {
          position: relative;
          min-height: 0;
          height: 100%;
          overflow: auto;
          background: #070b14;
          -webkit-overflow-scrolling: touch;
        }

        .rod-spacer {
          width: 1px;
          min-width: 1px;
        }

        .rod-blocks {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          will-change: transform;
        }

        .rod-line {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          align-items: start;
          padding-inline: 6px 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12px;
          line-height: 1.62;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .rod-line-number {
          padding-right: 8px;
          color: rgb(220 230 255 / 0.24);
          text-align: right;
          user-select: none !important;
          -webkit-user-select: none !important;
          pointer-events: none;
        }

        .rod-line-code {
          min-width: 0;
          color: rgb(220 230 255 / 0.92);
          user-select: text;
          -webkit-user-select: text;
        }

        .hljs-comment,
        .tok-comment {
          color: #63718f;
          font-style: italic;
        }

        .hljs-keyword,
        .hljs-selector-tag,
        .tok-keyword,
        .tok-tag {
          color: #c792ea;
        }

        .hljs-string,
        .hljs-regexp,
        .tok-string {
          color: #c3e88d;
        }

        .hljs-number,
        .hljs-literal,
        .tok-number {
          color: #ffcb6b;
        }

        .hljs-title,
        .hljs-function,
        .tok-title {
          color: #82aaff;
        }

        .hljs-attr,
        .hljs-attribute,
        .hljs-name,
        .tok-attr {
          color: #89ddff;
        }

        .hljs-built_in,
        .hljs-type,
        .tok-type {
          color: #ffcb6b;
        }

        .hljs-variable,
        .hljs-template-variable {
          color: #f78c6c;
        }

        .tok-selector {
          color: #f07178;
        }
      </style>

      <header class="rod-toolbar">
        <div class="rod-title">
          <strong>Ultra Virtual Viewer</strong>
          <span data-meta></span>
        </div>

        <div class="rod-actions">
          <button class="rod-btn" data-action="raw">Raw</button>
          <button class="rod-btn" data-action="pretty">Pretty</button>
          <button class="rod-btn rod-btn-primary" data-action="copy">Copy</button>
        </div>
      </header>

      <div class="rod-scroll">
        <div class="rod-spacer"></div>
        <div class="rod-blocks"></div>
      </div>
    `;

    document.body.innerHTML = "";
    document.body.appendChild(root);

    const scroll = root.querySelector(".rod-scroll");
    const spacer = root.querySelector(".rod-spacer");
    const blocksEl = root.querySelector(".rod-blocks");
    const meta = root.querySelector("[data-meta]");
    const rawButton = root.querySelector('[data-action="raw"]');
    const prettyButton = root.querySelector('[data-action="pretty"]');
    const copyButton = root.querySelector('[data-action="copy"]');

    /**
     * Updates metadata.
     *
     * @returns {void}
     */
    function updateMeta() {
      meta.textContent = `${state.language} · ${state.lines.length} lines · ${formatBytes(
        state.currentSource.length,
      )} · ${state.mode} · highlight: ${state.highlighterSource} · formatter: ${state.prettierSource}`;
    }

    /**
     * Recomputes block offsets.
     *
     * @returns {void}
     */
    function rebuildBlockOffsets() {
      state.blockOffsets = [];
      let offset = 0;

      for (let index = 0; index < state.blocks.length; index += 1) {
        state.blockOffsets[index] = offset;
        offset += state.blockHeights[index] || DEFAULT_BLOCK_HEIGHT;
      }

      state.totalHeight = Math.max(1, offset);
      spacer.style.height = `${state.totalHeight}px`;
    }

    /**
     * Rebuilds line and virtual block state.
     *
     * @returns {void}
     */
    function rebuildLines() {
      state.lines = state.currentSource.split("\n");
      state.blocks = [];

      for (let index = 0; index < state.lines.length; index += BLOCK_SIZE) {
        state.blocks.push(state.lines.slice(index, index + BLOCK_SIZE));
      }

      state.blockHeights = state.blocks.map(() => DEFAULT_BLOCK_HEIGHT);
      state.visibleStartBlock = -1;
      state.visibleEndBlock = -1;
      state.highlightedCache.clear();

      rebuildBlockOffsets();
      updateMeta();

      requestAnimationFrame(() => {
        scroll.scrollTop = 0;
        renderViewport();
      });
    }

    /**
     * Finds the virtual block that contains a scroll offset.
     *
     * @param {number} scrollTop Scroll offset.
     * @returns {number} Block index.
     */
    function findBlockIndex(scrollTop) {
      let low = 0;
      let high = state.blockOffsets.length - 1;
      let answer = 0;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);

        if (state.blockOffsets[mid] <= scrollTop) {
          answer = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      return answer;
    }

    /**
     * Measures rendered block heights after paint.
     *
     * @returns {void}
     */
    function measureRenderedBlocks() {
      let changed = false;
      const renderedBlocks = blocksEl.querySelectorAll("[data-block-index]");

      for (const block of renderedBlocks) {
        const index = Number(block.getAttribute("data-block-index"));
        const measured = Math.ceil(block.getBoundingClientRect().height);

        if (measured > 0 && Math.abs((state.blockHeights[index] || 0) - measured) > 2) {
          state.blockHeights[index] = measured;
          changed = true;
        }
      }

      if (changed) {
        rebuildBlockOffsets();
      }
    }

    /**
     * Renders visible virtual blocks.
     *
     * @returns {void}
     */
    function renderViewport() {
      state.renderQueued = false;

      const scrollTop = scroll.scrollTop;
      const viewportHeight = scroll.clientHeight || window.innerHeight;

      const first = Math.max(0, findBlockIndex(scrollTop) - BLOCK_OVERSCAN);
      const last = Math.min(
        state.blocks.length,
        findBlockIndex(scrollTop + viewportHeight) + BLOCK_OVERSCAN + 1,
      );

      if (first === state.visibleStartBlock && last === state.visibleEndBlock) return;

      state.visibleStartBlock = first;
      state.visibleEndBlock = last;

      const html = [];

      for (let blockIndex = first; blockIndex < last; blockIndex += 1) {
        const blockLines = state.blocks[blockIndex];
        const lineStart = blockIndex * BLOCK_SIZE;

        html.push(`<div class="rod-block" data-block-index="${blockIndex}">`);

        for (let localIndex = 0; localIndex < blockLines.length; localIndex += 1) {
          const lineIndex = lineStart + localIndex;

          html.push(
            `<div class="rod-line"><div class="rod-line-number" aria-hidden="true">${lineIndex + 1}</div><div class="rod-line-code">${highlightLine(
              blockLines[localIndex],
              lineIndex,
            )}</div></div>`,
          );
        }

        html.push("</div>");
      }

      blocksEl.style.transform = `translate3d(0, ${state.blockOffsets[first] || 0}px, 0)`;
      blocksEl.innerHTML = html.join("");

      requestAnimationFrame(measureRenderedBlocks);
    }

    /**
     * Queues viewport rendering.
     *
     * @returns {void}
     */
    function queueRender() {
      if (state.renderQueued) return;
      state.renderQueued = true;
      requestAnimationFrame(renderViewport);
    }

    /**
     * Pretty-prints source using Prettier first and MiniPrettier as fallback.
     *
     * @param {boolean} manual Whether the user clicked.
     * @returns {Promise<void>}
     */
    async function prettyPrint(manual) {
      prettyButton.textContent = "Wait";

      try {
        if (state.prettier?.format) {
          state.currentSource = String(
            await withTimeout(
              state.prettier.format(state.rawSource, {
                parser: state.parser,
                plugins: state.prettierPlugins,
                semi: true,
                tabWidth: 2,
                printWidth: 88,
                trailingComma: "all",
              }),
              manual ? PRETTIER_TIMEOUT_MS * 2 : PRETTIER_TIMEOUT_MS,
            ),
          );
        } else {
          state.currentSource = miniPrettier(state.rawSource, state.language);
          state.prettierSource = "mini";
        }
      } catch {
        state.currentSource = miniPrettier(state.rawSource, state.language);
        state.prettierSource = "mini";
      }

      state.mode = "pretty";
      prettyButton.textContent = "Pretty";
      rebuildLines();
    }

    rawButton.addEventListener("click", () => {
      state.currentSource = state.rawSource;
      state.mode = "raw";
      rebuildLines();
    });

    prettyButton.addEventListener("click", () => {
      void prettyPrint(true);
    });

    copyButton.addEventListener("click", async () => {
      const ok = await copyText(state.currentSource);

      copyButton.textContent = ok ? "Copied" : "Failed";

      window.setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 900);
    });

    scroll.addEventListener("scroll", queueRender, { passive: true });
    window.addEventListener("resize", queueRender, { passive: true });

    rebuildLines();
    loading.remove();
  }
})();