// ==UserScript==
// @name         xx Inspecting strings, alert and dialog
// @namespace    https://rod.dev/userscripts
// @version      2.1.0
// @description  Pretty alert(), alerta(), collapsed inspector, hljs highlighting, stacked modals, drag, resize, swipe dismiss and long-press actions.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       999
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js
// @reauire      https://code.migos.club/api/cdn?preset=highlight&css=highlight.js@11.11.1/styles/base16/material-darker.min.css&bundle=iife&global=RodCDN&cache=immutable
// @grant        none
// ==/UserScript==

(function InspectingTools() {
  "use strict";

  const STYLE_ID = "__rod_alerta_style__";
  const ROOT_ID = "__rod_alerta_root__";
  const PATCH_FLAG = Symbol.for("rod.toStringPatched");
  const ORIGINALS_KEY = Symbol.for("rod.originalToString");

  const MAX_INLINE_TEXT = 180;
  const MAX_TREE_ITEMS = 80;
  const LONG_PRESS_MS = 520;
  const SWIPE_DISMISS_PX = 110;

  let nextId = 1;
  let topZIndex = 2147483000;

  const nativeAlert = window.alert.bind(window);
  
  /**
   * Trims long text previews to keep the inspector fast and readable.
   *
   * @param {unknown} value Value to stringify.
   * @param {number} max Maximum text length.
   * @returns {string} Trimmed text.
   */
  function trimText(value, max = MAX_INLINE_TEXT) {
    const text = String(value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  /**
   * Escapes HTML before injecting highlighted content.
   *
   * @param {unknown} value Raw value.
   * @returns {string} HTML-safe text.
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
   * Safely calls fragile browser APIs without breaking the inspector.
   *
   * @param {() => unknown} callback Risky callback.
   * @param {unknown} fallback Fallback value.
   * @returns {unknown} Result or fallback.
   */
  function safeCall(callback, fallback) {
    try {
      return callback();
    } catch {
      return fallback;
    }
  }

  /**
   * Checks whether a value can contain nested properties.
   *
   * @param {unknown} value Unknown value.
   * @returns {boolean} True for objects and functions.
   */
  function isObjectLike(value) {
    return (typeof value === "object" && value !== null) || typeof value === "function";
  }

  /**
   * Checks whether a value is a plain object.
   *
   * @param {unknown} value Unknown value.
   * @returns {boolean} True for plain objects.
   */
  function isPlainObject(value) {
    if (!value || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  /**
   * Copies text using the Clipboard API with a textarea fallback.
   *
   * @param {unknown} value Value to copy.
   * @returns {void}
   */
  function copyText(value) {
    const text = String(value);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
      return;
    }

    fallbackCopyText(text);
  }

  /**
   * Copies text using document.execCommand for older userscript environments.
   *
   * @param {string} text Text to copy.
   * @returns {void}
   */
  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
    document.documentElement.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  /**
   * Formats an element as a compact CSS-like selector.
   *
   * @param {Element} element DOM element.
   * @returns {string} Element preview.
   */
  function formatElement(element) {
    const tag = element.tagName ? element.tagName.toLowerCase() : "element";
    const id = element.id ? `#${element.id}` : "";
    const classes =
      typeof element.className === "string" && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).join(".")}`
        : "";

    return `<${tag}${id}${classes}>`;
  }

  /**
   * Creates a short label for a value.
   *
   * @param {unknown} value Value to label.
   * @returns {string} Compact label.
   */
  function getNodeLabel(value) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    const type = typeof value;

    if (type === "string") return `"${trimText(value)}"`;
    if (type === "number" || type === "boolean") return String(value);
    if (type === "bigint") return `${value}n`;
    if (type === "symbol") return value.toString();
    if (type === "function") return `[fn ${value.name || "anonymous"}]`;

    if (value instanceof Window) return "[Window]";
    if (value instanceof Document) return "[Document]";
    if (value instanceof Element) return formatElement(value);
    if (value instanceof Node) return `[Node ${value.nodeName}]`;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : `Date("${value.toISOString()}")`;
    if (value instanceof RegExp) return value.toString();
    if (value instanceof Promise) return "Promise { <pending> }";
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value instanceof Map) return `Map(${value.size})`;
    if (value instanceof Set) return `Set(${value.size})`;
    if (ArrayBuffer.isView(value)) return `${value.constructor.name}(${value.length})`;
    if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`;
    if (isPlainObject(value)) return "Object";

    return value.constructor?.name || "Object";
  }

  /**
   * Formats any value into a readable circular-safe string.
   *
   * @param {unknown} value Value to format.
   * @param {number} depth Current depth.
   * @param {WeakSet<object>} seen Circular guard.
   * @returns {string} Formatted text.
   */
  function formatValue(value, depth = 0, seen = new WeakSet()) {
    if (!isObjectLike(value)) return getNodeLabel(value);
    if (seen.has(value)) return "[Circular]";

    seen.add(value);

    if (value instanceof Window) return "[Window]";
    if (value instanceof Document) return "[Document]";
    if (value instanceof Element) return formatElement(value);
    if (value instanceof Node) return `[Node ${value.nodeName}]`;

    if (Array.isArray(value)) {
      const body = value.map((item) => `${"  ".repeat(depth + 1)}${formatValue(item, depth + 2, seen)}`).join(",\n");
      return value.length ? `[\n${body}\n${"  ".repeat(depth)}]` : "[]";
    }

    if (value instanceof Map) {
      const body = Array.from(value.entries())
        .map(([key, item]) => `${"  ".repeat(depth + 1)}${formatValue(key, depth + 1, seen)} => ${formatValue(item, depth + 1, seen)}`)
        .join(",\n");

      return value.size ? `Map(${value.size}) {\n${body}\n${"  ".repeat(depth)}}` : "Map(0) {}";
    }

    if (value instanceof Set) {
      const body = Array.from(value.values())
        .map((item) => `${"  ".repeat(depth + 1)}${formatValue(item, depth + 1, seen)}`)
        .join(",\n");

      return value.size ? `Set(${value.size}) {\n${body}\n${"  ".repeat(depth)}}` : "Set(0) {}";
    }

    const keys = Object.keys(value);
    const body = keys
      .map((key) => {
        let propertyValue;

        try {
          propertyValue = value[key];
        } catch (error) {
          propertyValue = `[Throws: ${error?.message || error}]`;
        }

        return `${"  ".repeat(depth + 1)}${key}: ${formatValue(propertyValue, depth + 1, seen)}`;
      })
      .join(",\n");

    return keys.length ? `{\n${body}\n${"  ".repeat(depth)}}` : "{}";
  }

  /**
   * Highlights code with hljs when available, otherwise uses a tiny fallback.
   *
   * @param {unknown} value Code-like text.
   * @returns {string} Highlighted HTML.
   */
  function highlightCode(value) {
    const code = String(value);

    if (window.hljs?.highlight) {
      try {
        return window.hljs.highlight(code, { language: "javascript" }).value;
      } catch {
        return escapeHtml(code);
      }
    }

    return escapeHtml(code)
      .replace(/("(?:\\.|[^"\\])*")/g, '<span class="ra-string">$1</span>')
      .replace(/\b(true|false|null|undefined)\b/g, '<span class="ra-bool">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?n?)\b/g, '<span class="ra-number">$1</span>')
      .replace(/^(\s*)([A-Za-z_$][\w$-]*)(:)/gm, '$1<span class="ra-key">$2</span>$3');
  }

  /**
   * Patches prototype toString safely and keeps the original for restore.
   *
   * @param {object} prototype Target prototype.
   * @param {(value: unknown) => string} formatter Formatter.
   * @param {string} label Fallback label.
   * @returns {void}
   */
  function patchToString(prototype, formatter, label) {
    if (!prototype || prototype[PATCH_FLAG]) return;

    const original = prototype.toString;

    Object.defineProperty(prototype, ORIGINALS_KEY, {
      value: original,
      configurable: true,
    });

    Object.defineProperty(prototype, "toString", {
      configurable: true,
      writable: true,
      value: function patchedToString() {
        return safeCall(() => formatter(this), safeCall(() => original.call(this), `[${label}]`));
      },
    });

    Object.defineProperty(prototype, PATCH_FLAG, {
      value: true,
      configurable: true,
    });
  }

  patchToString(Array.prototype, function () {
    return getNodeLabel(this);
  }, "Array");

  patchToString(Object.prototype, function () {
    return isPlainObject(this) ? formatValue(this) : getNodeLabel(this);
  }, "Object");

  patchToString(Map.prototype, function () {
    return getNodeLabel(this);
  }, "Map");

  patchToString(Set.prototype, function () {
    return getNodeLabel(this);
  }, "Set");

  patchToString(Element.prototype, function () {
    return formatElement(this);
  }, "Element");

  patchToString(Node.prototype, function () {
    return `[Node ${this.nodeName}]`;
  }, "Node");

  /**
   * Injects the inspector design system and component styles.
   *
   * @returns {void}
   */
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --alerta-accent: rgb(168 85 247);
        --alerta-accent-2: rgb(34 211 238);

        --alerta-bg: rgb(2 6 17 / 0.93);
        --alerta-bg-elevated: rgb(15 23 42 / 0.96);
        --alerta-header-bg: rgb(255 255 255 / 0.045);
        --alerta-button-bg: rgb(255 255 255 / 0.07);
        --alerta-button-bg-hover: rgb(255 255 255 / 0.12);
        --alerta-row-bg-hover: rgb(255 255 255 / 0.055);
        --alerta-menu-bg: rgb(15 23 42 / 0.98);

        --alerta-border: rgb(255 255 255 / 0.14);
        --alerta-tree-border: rgb(148 163 184 / 0.16);
        --alerta-resize-border: rgb(226 232 240 / 0.55);
        --alerta-element-underline: rgb(103 232 249 / 0.45);

        --alerta-text: #e5e7eb;
        --alerta-text-muted: #94a3b8;
        --alerta-text-strong: #f8fafc;

        --alerta-color-key: #93c5fd;
        --alerta-color-string: #86efac;
        --alerta-color-number: #fbbf24;
        --alerta-color-boolean: #f472b6;
        --alerta-color-special: #c4b5fd;
        --alerta-color-element: #67e8f9;

        --alerta-width: 760px;
        --alerta-height: 280px;
        --alerta-min-width: 270px;
        --alerta-min-height: 80px;
        --alerta-root-inset: 0;
        --alerta-card-edge-gap: 22px;
        --alerta-card-start-x: 18px;
        --alerta-card-start-y: 74px;
        --alerta-card-stack-step: 18px;
        --alerta-card-stack-max: 88px;
        --alerta-card-stack-x: 14px;
        --alerta-card-stack-y: 14px;
        --alerta-card-inactive-scale: 0.97;
        --alerta-card-minimized-width: 360px;
        --alerta-card-minimized-height: 48px;
        --alerta-card-dismiss-x: 130vw;
        --alerta-card-dismiss-rotate: 4deg;

        --alerta-menu-width: 170px;
        --alerta-resize-size: 24px;
        --alerta-resize-mark-size: 9px;
        --alerta-resize-mark-offset: 7px;
        --alerta-focus-outline-width: 3px;
        --alerta-focus-outline-offset: 3px;

        --alerta-z-index: 2147483647;
        --alerta-root-z-index: calc(var(--alerta-z-index) - 48);

        --alerta-radius-xs: 8px;
        --alerta-radius-sm: 10px;
        --alerta-radius-md: 14px;
        --alerta-radius-lg: 22px;
        --alerta-radius-pill: 999px;

        --alerta-space-1: 4px;
        --alerta-space-2: 8px;
        --alerta-space-3: 12px;
        --alerta-space-4: 16px;
        --alerta-space-5: 20px;
        --alerta-space-6: 24px;

        --alerta-header-padding-y: 5px;
        --alerta-header-padding-x: 6px;
        --alerta-body-padding: 5px;
        --alerta-node-margin-left: 3.5px;
        --alerta-node-padding-left: 4px;
        --alerta-summary-min-height: 18px;
        --alerta-summary-padding-y: 1.5px;
        --alerta-summary-padding-x: 2.5px;
        --alerta-leaf-min-height: 14px;
        --alerta-leaf-padding-y: 4px;
        --alerta-leaf-padding-x: 5px;
        --alerta-button-padding-y: 6px;
        --alerta-button-padding-x: 9px;
        --alerta-menu-button-padding-y: 11px;
        --alerta-menu-button-padding-x: 12px;

        --alerta-font-size-xs: 11px;
        --alerta-font-size-sm: 12px;
        --alerta-font-size-md: 13px;
        --alerta-line-height-tight: 1;
        --alerta-line-height-code: 1;

        --alerta-font-ui:
          Inter,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;

        --alerta-font-mono:
          ui-monospace,
          SFMono-Regular,
          Menlo,
          Monaco,
          Consolas,
          monospace;

        --alerta-font-weight-bold: 700;
        --alerta-font-weight-heavy: 800;
        --alerta-title-letter-spacing: 0.035em;

        --alerta-blur: 18px;
        --alerta-menu-blur: 14px;
        --alerta-saturate: 145%;
        --alerta-inactive-saturate: 72%;
        --alerta-inactive-brightness: 82%;

        --alerta-shadow: 0 28px 88px rgb(0 0 0 / 0.55);
        --alerta-menu-shadow: 0 18px 54px rgb(0 0 0 / 0.5);
        --alerta-outline: 0 0 0 var(--alerta-focus-outline-width) rgb(103 232 249 / 0.85);

        --alerta-duration-fast: 120ms;
        --alerta-duration-normal: 180ms;
        --alerta-duration-slow: 300ms;
        --alerta-easing: cubic-bezier(0.2, 0.8, 0.2, 1);

        --alerta-chevron-closed-rotate: -90deg;
        --alerta-chevron-open-rotate: 0deg;
        --alerta-active-press-y: 1px;

        --alerta-backdrop:
          radial-gradient(
            circle at 20% 0%,
            rgb(168 85 247 / 0.22),
            transparent 34%
          ),
          radial-gradient(
            circle at 100% 100%,
            rgb(34 211 238 / 0.16),
            transparent 36%
          ),
          linear-gradient(
            135deg,
            var(--alerta-bg-elevated),
            var(--alerta-bg)
          );
      }

      #${ROOT_ID} {
        position: fixed;
        inset: var(--alerta-root-inset);
        z-index: var(--alerta-root-z-index);
        pointer-events: none;
        font-family: var(--alerta-font-ui);
      }

      .ra-card {
        position: fixed;
        left: var(--ra-x, var(--alerta-card-start-x));
/**        top: var(--ra-y, var(--alerta-card-start-y));**/
        
       top: var(--ra-y,env(safe-area-inset-bottom, 0.5vh));

        width: min(var(--ra-w, var(--alerta-width)), calc(100vw - var(--alerta-card-edge-gap)));
        height: min(var(--ra-h, var(--alerta-height)), calc(100vh - var(--alerta-card-edge-gap)));

        min-width: var(--alerta-min-width);
      /**  min-height: var(--alerta-min-height);**/

        display: grid;
        grid-template-rows: auto 1fr;

        overflow: hidden;

        pointer-events: auto;

        border: 1px solid var(--alerta-border);
        border-radius: var(--alerta-radius-lg);

        background: var(--alerta-backdrop);
        color: var(--alerta-text);

        box-shadow: var(--alerta-shadow);

        backdrop-filter:
          blur(var(--alerta-blur))
          saturate(var(--alerta-saturate));

        transform: translate3d(0, 0, 0);

        transition:
          transform var(--alerta-duration-normal) var(--alerta-easing),
          opacity var(--alerta-duration-normal) var(--alerta-easing),
          filter var(--alerta-duration-normal) var(--alerta-easing);
      }

      .ra-card.ra-inactive {
        filter:
          saturate(var(--alerta-inactive-saturate))
          brightness(var(--alerta-inactive-brightness));

        transform:
          translate3d(
            var(--ra-stack-x, var(--alerta-card-stack-x)),
            var(--ra-stack-y, var(--alerta-card-stack-y)),
            0
          )
          scale(var(--alerta-card-inactive-scale));
      }

      .ra-card.ra-minimized {
        width: min(var(--alerta-card-minimized-width), calc(100vw - var(--alerta-card-edge-gap)));
        height: var(--alerta-card-minimized-height);
        grid-template-rows: var(--alerta-card-minimized-height);
      }

      .ra-card.ra-minimized .ra-body,
      .ra-card.ra-minimized .ra-resize {
        display: none;
      }

      .ra-card.ra-dismissing {
        transform:
          translate3d(var(--alerta-card-dismiss-x), 0, 0)
          rotate(var(--alerta-card-dismiss-rotate));

        opacity: 0;
      }

      .ra-header {
        display: flex;
        align-items: center;
        justify-content: space-between;

        gap: var(--alerta-space-3);

        padding:
          var(--alerta-header-padding-y)
          var(--alerta-header-padding-x);

        user-select: none;
        touch-action: none;

        border-bottom: 1px solid var(--alerta-border);
        background: var(--alerta-header-bg);

        cursor: grab;
      }

      .ra-title {
        min-width: 0;

        display: flex;
        align-items: center;

        gap: var(--alerta-space-2);

        color: var(--alerta-text-strong);

        font-size: var(--alerta-font-size-sm);
        font-weight: var(--alerta-font-weight-heavy);

        letter-spacing: var(--alerta-title-letter-spacing);
        text-transform: uppercase;
      }

      .ra-title-text {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .ra-actions {
        display: flex;
        align-items: center;
        gap: var(--alerta-space-2);
      }

      .ra-button {
        appearance: none;

        border: 1px solid var(--alerta-border);
        border-radius: var(--alerta-radius-pill);

        padding:
          var(--alerta-button-padding-y)
          var(--alerta-button-padding-x);

        color: var(--alerta-text);
        background: var(--alerta-button-bg);

        font:
          var(--alerta-font-weight-heavy)
          var(--alerta-font-size-xs)
          / var(--alerta-line-height-tight)
          var(--alerta-font-ui);

        transition:
          background var(--alerta-duration-fast) var(--alerta-easing),
          transform var(--alerta-duration-fast) var(--alerta-easing);
      }

      .ra-button:hover {
        background: var(--alerta-button-bg-hover);
      }

      .ra-button:active {
        transform: translateY(var(--alerta-active-press-y));
      }

      .ra-body {
        overflow: auto;

        padding: var(--alerta-body-padding);

        font-family: var(--alerta-font-mono);
        font-size: var(--alerta-font-size-sm);
        line-height: var(--alerta-line-height-code);
      }

      .ra-tree {
        display: grid;
        gap: var(--alerta-space-1);
      }

      .ra-node {
        margin-left: var(--alerta-node-margin-left);
        padding-left: var(--alerta-node-padding-left);

        border-left: 1px solid var(--alerta-tree-border);
      }

      .ra-details > summary {
        display: flex;
        align-items: center;

        gap: var(--alerta-space-1);

        min-height: 10px; /**var(--alerta-summary-min-height);**/

        list-style: none;
        cursor: pointer;

        border-radius: var(--alerta-radius-sm);

        padding:
          var(--alerta-summary-padding-y)
          var(--alerta-summary-padding-x);
      }

      .ra-details > summary::-webkit-details-marker {
        display: none;
      }

      .ra-details > summary:hover,
      .ra-leaf:hover {
        background: var(--alerta-row-bg-hover);
      }

      .ra-chevron {
        color: var(--alerta-text-muted);
        transform: rotate(var(--alerta-chevron-closed-rotate));

        transition:
          transform var(--alerta-duration-fast)
          var(--alerta-easing);
      }

      .ra-details[open] > summary .ra-chevron {
        transform: rotate(var(--alerta-chevron-open-rotate));
      }

      .ra-key {
        color: var(--alerta-color-key);
      }

      .ra-string {
        color: var(--alerta-color-string);
      }

      .ra-number {
        color: var(--alerta-color-number);
      }

      .ra-bool {
        color: var(--alerta-color-boolean);
      }

      .ra-muted {
        color: var(--alerta-text-muted);
      }

      .ra-special {
        color: var(--alerta-color-special);
      }

      .ra-element {
        color: var(--alerta-color-element);

        text-decoration: underline;
        text-decoration-color: var(--alerta-element-underline);
        text-underline-offset: var(--alerta-focus-outline-offset);

        cursor: crosshair;
      }

      .ra-leaf {
        display: flex;
        align-items: flex-start;

        gap: var(--alerta-space-2);

        min-height: var(--alerta-leaf-min-height);

        padding:
          var(--alerta-leaf-padding-y)
          var(--alerta-leaf-padding-x);

        border-radius: var(--alerta-radius-sm);

        white-space: pre-wrap;
        word-break: break-word;
      }

      .ra-code {
        white-space: pre-wrap;
        word-break: break-word;
      }

      .ra-menu {
        position: fixed;
        z-index: var(--alerta-z-index);

        min-width: var(--alerta-menu-width);

        overflow: hidden;

        border: 1px solid var(--alerta-border);
        border-radius: var(--alerta-radius-md);

        background: var(--alerta-menu-bg);

        box-shadow: var(--alerta-menu-shadow);

        backdrop-filter: blur(var(--alerta-menu-blur));

        pointer-events: auto;
      }

      .ra-menu button {
        width: 100%;

        display: block;

        appearance: none;
        border: 0;

        padding:
          var(--alerta-menu-button-padding-y)
          var(--alerta-menu-button-padding-x);

        color: var(--alerta-text);
        background: transparent;

        text-align: left;

        font:
          var(--alerta-font-weight-bold)
          var(--alerta-font-size-sm)
          / var(--alerta-line-height-tight)
          var(--alerta-font-ui);
      }

      .ra-menu button:hover {
        background: var(--alerta-row-bg-hover);
      }

      .ra-resize {
        position: absolute;

        right: 0;
        bottom: 0;

        width: var(--alerta-resize-size);
        height: var(--alerta-resize-size);

        cursor: nwse-resize;
        touch-action: none;
      }

      .ra-resize::after {
        content: "";

        position: absolute;

        right: var(--alerta-resize-mark-offset);
        bottom: var(--alerta-resize-mark-offset);

        width: var(--alerta-resize-mark-size);
        height: var(--alerta-resize-mark-size);

        border-right: 2px solid var(--alerta-resize-border);
        border-bottom: 2px solid var(--alerta-resize-border);
      }

      .ra-focus-ring {
        outline: var(--alerta-outline) !important;
        outline-offset: var(--alerta-focus-outline-offset) !important;
      }
    `;

    document.documentElement.appendChild(style);
  }

  /**
   * Gets or creates the global overlay root.
   *
   * @returns {HTMLDivElement} Root element.
   */
  function getRoot() {
    ensureStyles();

    let root = document.getElementById(ROOT_ID);

    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
    }

    return root;
  }

  /**
   * Creates a highlighted code span.
   *
   * @param {unknown} value Value to highlight.
   * @returns {HTMLSpanElement} Code span.
   */
  function createCodeSpan(value) {
    const span = document.createElement("span");
    span.className = "ra-code";
    span.innerHTML = highlightCode(value);
    return span;
  }

  /**
   * Reads enumerable entries from arrays, maps, sets and objects.
   *
   * @param {unknown} value Source value.
   * @param {string} basePath Parent path.
   * @returns {{ label: string, value: unknown, path: string }[]} Tree entries.
   */
  function getEntries(value, basePath = "$") {
    if (Array.isArray(value)) {
      return value.map((item, index) => ({
        label: String(index),
        value: item,
        path: `${basePath}[${index}]`,
      }));
    }

    if (value instanceof Map) {
      return Array.from(value.entries()).map(([key, item], index) => ({
        label: `entry ${index}`,
        value: { key, value: item },
        path: `${basePath}.<map>[${index}]`,
      }));
    }

    if (value instanceof Set) {
      return Array.from(value.values()).map((item, index) => ({
        label: String(index),
        value: item,
        path: `${basePath}.<set>[${index}]`,
      }));
    }

    return Object.keys(value).map((key) => {
      let propertyValue;

      try {
        propertyValue = value[key];
      } catch (error) {
        propertyValue = `[Throws: ${error?.message || error}]`;
      }

      return {
        label: key,
        value: propertyValue,
        path: /^[A-Za-z_$][\w$]*$/.test(key) ? `${basePath}.${key}` : `${basePath}[${JSON.stringify(key)}]`,
      };
    });
  }

  /**
   * Creates a collapsed tree view for any value.
   *
   * @param {unknown} value Value to render.
   * @param {string} path Current value path.
   * @param {WeakSet<object>} seen Circular guard.
   * @param {string} keyName Optional property name.
   * @returns {HTMLDivElement} Tree node.
   */
  function createNodeView(value, path = "$", seen = new WeakSet(), keyName = "") {
    const wrapper = document.createElement("div");
    wrapper.className = "ra-node";
    wrapper.dataset.path = path;

    if (!isObjectLike(value) || value instanceof Element || value instanceof Node || value instanceof Window || value instanceof Document) {
      const leaf = document.createElement("div");
      leaf.className = "ra-leaf";
      leaf.dataset.path = path;
      leaf.__rodValue = value;

      if (keyName) {
        const key = document.createElement("span");
        key.className = "ra-key";
        key.textContent = `${keyName}:`;
        leaf.appendChild(key);
      }

      const code = createCodeSpan(getNodeLabel(value));
      if (value instanceof Element) code.classList.add("ra-element");

      leaf.appendChild(code);
      wrapper.appendChild(leaf);
      bindInspectableNode(leaf, value, path);

      return wrapper;
    }

    if (seen.has(value)) {
      const leaf = document.createElement("div");
      leaf.className = "ra-leaf";
      leaf.dataset.path = path;
      leaf.__rodValue = "[Cir]";
      leaf.appendChild(createCodeSpan(`${keyName ? `${keyName}: ` : ""}[Cir]`));
      wrapper.appendChild(leaf);
      bindInspectableNode(leaf, "[Cir]", path);
      return wrapper;
    }

    seen.add(value);

    const details = document.createElement("details");
    details.className = "ra-details";

    const summary = document.createElement("summary");
    summary.dataset.path = path;
    summary.__rodValue = value;

    const chevron = document.createElement("span");
    chevron.className = "ra-chevron";
    chevron.textContent = "⌄";

    const title = document.createElement("span");
    title.innerHTML = `${keyName ? `<span class="ra-key">${escapeHtml(keyName)}</span>: ` : ""}<span class="ra-special">${escapeHtml(getNodeLabel(value))}</span>`;

    summary.appendChild(chevron);
    summary.appendChild(title);
    details.appendChild(summary);
    bindInspectableNode(summary, value, path);

    const entries = getEntries(value, path);

    for (let index = 0; index < entries.length && index < MAX_TREE_ITEMS; index += 1) {
      const entry = entries[index];
      details.appendChild(createNodeView(entry.value, entry.path, seen, entry.label));
    }

    if (entries.length > MAX_TREE_ITEMS) {
      const more = document.createElement("div");
      more.className = "ra-leaf ra-muted";
      more.textContent = `… ${entries.length - MAX_TREE_ITEMS} more`;
      details.appendChild(more);
    }

    wrapper.appendChild(details);
    return wrapper;
  }

  /**
   * Removes any open contextual menu.
   *
   * @returns {void}
   */
  function removeMenu() {
    document.querySelectorAll(".ra-menu").forEach((menu) => menu.remove());
  }

  /**
   * Opens the long-press menu.
   *
   * @param {PointerEvent} event Pointer event.
   * @param {unknown} value Target value.
   * @param {string} path Value path.
   * @returns {void}
   */
  function openMenu(event, value, path) {
    removeMenu();

    const menu = document.createElement("div");
    menu.className = "ra-menu";
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 150)}px`;

    menu.innerHTML = `
      <button type="button" data-action="copy-path">Copiar path</button>
      <button type="button" data-action="copy-value">Copiar value</button>
      <button type="button" data-action="copy-element">Copy element</button>
    `;

    menu.addEventListener("click", (menuEvent) => {
      const action = menuEvent.target.closest("button")?.dataset.action;

      if (action === "copy-path") copyText(path);
      if (action === "copy-value") copyText(formatValue(value));
      if (action === "copy-element") copyText(value instanceof Element ? value.outerHTML : formatValue(value));

      removeMenu();
    });

    document.documentElement.appendChild(menu);

    setTimeout(() => {
      window.addEventListener("pointerdown", removeMenu, { once: true, capture: true });
    }, 0);
  }

  /**
   * Focuses a real DOM element and minimizes the inspector.
   *
   * @param {Element} element DOM element.
   * @param {Element} card Current inspector card.
   * @returns {void}
   */
  function focusElement(element, card) {
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    element.classList.add("ra-focus-ring");

    setTimeout(() => {
      element.classList.remove("ra-focus-ring");
    }, 1400);

    card.classList.add("ra-minimized");
  }

  /**
   * Binds click and long-press behavior to a rendered node.
   *
   * @param {HTMLElement} node Rendered node.
   * @param {unknown} value Node value.
   * @param {string} path Node path.
   * @returns {void}
   */
  function bindInspectableNode(node, value, path) {
    let timer = 0;
    let startX = 0;
    let startY = 0;

    node.addEventListener("pointerdown", (event) => {
      startX = event.clientX;
      startY = event.clientY;

      timer = window.setTimeout(() => {
        openMenu(event, value, path);
      }, LONG_PRESS_MS);
    });

    node.addEventListener("pointermove", (event) => {
      if (Math.abs(event.clientX - startX) > 8 || Math.abs(event.clientY - startY) > 8) {
        clearTimeout(timer);
      }
    });

    node.addEventListener("pointerup", () => clearTimeout(timer));
    node.addEventListener("pointercancel", () => clearTimeout(timer));

    node.addEventListener("click", (event) => {
      if (!(value instanceof Element)) return;

      event.preventDefault();
      event.stopPropagation();

      const card = node.closest(".ra-card");
      focusElement(value, card);
    });
  }

  /**
   * Brings a card to the front and visually stacks the others.
   *
   * @param {HTMLElement} card Card to activate.
   * @returns {void}
   */
  function activateCard(card) {
    document.querySelectorAll(".ra-card").forEach((item) => item.classList.add("ra-inactive"));
    card.classList.remove("ra-inactive");
    card.style.zIndex = String(++topZIndex);
  }

  /**
   * Dismisses a card with animation.
   *
   * @param {HTMLElement} card Card to remove.
   * @returns {void}
   */
  function dismissCard(card) {
    card.classList.add("ra-dismissing");

    setTimeout(() => {
      card.remove();
    }, 190);
  }

  /**
   * Adds draggable behavior and fast swipe-to-dismiss.
   *
   * @param {HTMLElement} card Card element.
   * @param {HTMLElement} header Header handle.
   * @returns {void}
   */
  function bindDrag(card, header) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;

      activateCard(card);

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      initialX = parseFloat(card.dataset.x || "18");
      initialY = parseFloat(card.dataset.y || "74");

      header.setPointerCapture(event.pointerId);
    });

    header.addEventListener("pointermove", (event) => {
      if (!dragging) return;

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      card.dataset.x = String(Math.max(6, initialX + deltaX));
      card.dataset.y = String(Math.max(6, initialY + deltaY));

      card.style.setProperty("--ra-x", `${card.dataset.x}px`);
      card.style.setProperty("--ra-y", `${card.dataset.y}px`);
    });

    header.addEventListener("pointerup", (event) => {
      if (!dragging) return;

      dragging = false;
      header.releasePointerCapture(event.pointerId);

      if (event.clientX - startX > SWIPE_DISMISS_PX && Math.abs(event.clientY - startY) < 80) {
        dismissCard(card);
      }
    });
  }

  /**
   * Adds resize behavior to the corner handle.
   *
   * @param {HTMLElement} card Card element.
   * @param {HTMLElement} handle Resize handle.
   * @returns {void}
   */
  function bindResize(card, handle) {
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let initialWidth = 0;
    let initialHeight = 0;

    handle.addEventListener("pointerdown", (event) => {
      activateCard(card);

      resizing = true;
      startX = event.clientX;
      startY = event.clientY;
      initialWidth = card.offsetWidth;
      initialHeight = card.offsetHeight;

      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!resizing) return;

      const width = Math.max(270, initialWidth + event.clientX - startX);
      const height = Math.max(180, initialHeight + event.clientY - startY);

      card.style.setProperty("--ra-w", `${width}px`);
      card.style.setProperty("--ra-h", `${height}px`);
    });

    handle.addEventListener("pointerup", (event) => {
      resizing = false;
      handle.releasePointerCapture(event.pointerId);
    });
  }

  /**
   * Opens an interactive inspector modal for any value.
   *
   * @param {unknown} value Value to inspect.
   * @returns {unknown} The same value, so calls stay chainable.
   */
  function alerta(value) {
    const root = getRoot();
    const id = nextId++;
    const offset = Math.min((id - 1) * 18, 88);

    const card = document.createElement("section");
    card.className = "ra-card";
    card.dataset.x = String(18 + offset);
    card.dataset.y = String(74 + offset);
    card.style.setProperty("--ra-x", `${18 + offset}px`);
    card.style.setProperty("--ra-y", `${74 + offset}px`);
    card.style.zIndex = String(++topZIndex);

    card.innerHTML = `
      <header class="ra-header">
        <div class="ra-title">
          <span>🧪</span>
          <span class="ra-title-text">${escapeHtml(getNodeLabel(value))}</span>
        </div>
        <div class="ra-actions">
          <button class="ra-button" type="button" data-action="copy">Copy</button>
          <button class="ra-button" type="button" data-action="minimize">Min</button>
          <button class="ra-button" type="button" data-action="close">Close</button>
        </div>
      </header>
      <main class="ra-body">
        <div class="ra-tree"></div>
      </main>
      <div class="ra-resize" aria-hidden="true"></div>
    `;

    const tree = card.querySelector(".ra-tree");
    const header = card.querySelector(".ra-header");
    const resize = card.querySelector(".ra-resize");

    tree.appendChild(createNodeView(value));

    card.addEventListener("pointerdown", () => activateCard(card));

    card.addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.action;

      if (action === "copy") copyText(formatValue(value));
      if (action === "minimize") card.classList.toggle("ra-minimized");
      if (action === "close") dismissCard(card);
    });

    bindDrag(card, header);
    bindResize(card, resize);

    root.appendChild(card);
    activateCard(card);

    return value;
  }

  window.alerta = alerta;
  window.formatAlertaValue = formatValue;

  window.alert = function patchedAlert(value) {
    if (isObjectLike(value)) {
      nativeAlert(formatValue(value));
      return;
    }

    nativeAlert(String(value));
  };

  window.restoreRodToStringPatches = function restoreRodToStringPatches() {
    const prototypes = [
      Array.prototype,
      Object.prototype,
      Map.prototype,
      Set.prototype,
      Element.prototype,
      Node.prototype,
    ];

    for (const prototype of prototypes) {
      if (!prototype || !prototype[PATCH_FLAG]) continue;

      Object.defineProperty(prototype, "toString", {
        configurable: true,
        writable: true,
        value: prototype[ORIGINALS_KEY],
      });

      delete prototype[PATCH_FLAG];
      delete prototype[ORIGINALS_KEY];
    }
  };
})();