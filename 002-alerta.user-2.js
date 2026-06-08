// ==UserScript==
// @name         XXX / Docked Inspector Logs
// @namespace    https://rod.dev/userscripts
// @version      3.5.0
// @description  DevTools-like single-panel inspector with %c console formatting, lazy object inspection, DOM inspection, deduped primitive logs, and mobile-safe UX.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       999
// @require      https://unpkg.com/lucide@0.468.0/dist/umd/lucide.js
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js
// @require      https://code.migos.club/api/cdn?preset=html&bundle=iife&global=RodCDN&preset=highlight&pkg=lucide
// @require      https://code.migos.club/api/cdn?pkgs=jquery@3.7.1,axios@latest
// @grant        none
// ==/UserScript==

(function InspectingTools() {
  "use strict";

  /* ==========================================================================
   * Constants
   * ========================================================================== */

  const STYLE_ID = "__rod_docked_inspector_style__";
  const ROOT_ID = "__rod_docked_inspector_root__";
  const STORAGE_KEY = "rod.docked.inspector.v3.5";

  const DISABLE_STACKTRACE = true;

  const MAX_LOGS = 800;
  const MAX_RENDERED_LOGS = 980;
  const MAX_TREE_ITEMS = 1200;
  const MAX_INLINE_TEXT = 2800;
  const LONG_PRESS_MS = 520;
  const DOCK_PULSE_MS = 2200;
  const SEARCH_DEBOUNCE_MS = 80;

  const nativeAlert = window.alert.bind(window);
  const nativeConsole = {
    log: window.console.log.bind(window.console),
    info: window.console.info.bind(window.console),
    warn: window.console.warn.bind(window.console),
    error: window.console.error.bind(window.console),
    debug: window.console.debug.bind(window.console),
  };

  let root = null;
  let nextLogId = 1;
  let selectedLogId = null;
  let renderFrame = 0;
  let searchTimer = 0;
  let dockPulseTimer = 0;
  let dockDragging = false;
  let visibleLimit = MAX_RENDERED_LOGS;
  let state = readState();

  const logs = [];

  const contextState = {
    userscript: "",
    functionName: "",
  };

  /* ==========================================================================
   * State
   * ========================================================================== */

  function readState() {
    const fallback = {
      open: false,
      docked: true,
      dockY: Math.round(window.innerHeight * 0.34),
      x: 16,
      y: 72,
      width: 480,
      height: Math.min(780, window.innerHeight - 28),
      query: "",
    };

    try {
      return {
        ...fallback,
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
        open: false,
        docked: true,
      };
    } catch {
      return fallback;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          open: false,
          docked: true,
          dockY: state.dockY,
          x: state.x,
          y: state.y,
          width: state.width,
          height: state.height,
          query: state.query,
        }),
      );
    } catch {
      /* Storage may be blocked. */
    }
  }

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

    let level = 0;
    const output = [];

    for (const line of source) {
      const isClosing = /^<\//.test(line);
      const isVoid = /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(line);
      const isSelfClosing = /\/>$/.test(line);
      const isOpening = /^<[^/!][^>]*>$/.test(line) && !isVoid && !isSelfClosing;

      if (isClosing) level = Math.max(0, level - 1);
      output.push(`${"  ".repeat(level)}${line}`);
      if (isOpening) level += 1;
    }

    return output.join("\n");
  }

  function formatCss(value) {
    return stripCodeComments(String(value))
      .replace(/\s*{\s*/g, " {\n  ")
      .replace(/;\s*/g, ";\n  ")
      .replace(/\s*}\s*/g, "\n}\n\n")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .split("\n")
      .map((line) => line.replace(/\s+$/g, ""))
      .join("\n")
      .trim();
  }

  /* ==========================================================================
   * Utilities
   * ========================================================================== */

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function trimText(value, max = MAX_INLINE_TEXT) {
    const text = String(value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  function safeCall(callback, fallback) {
    try {
      return callback();
    } catch {
      return fallback;
    }
  }

  function isObjectLike(value) {
    return (typeof value === "object" && value !== null) || typeof value === "function";
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object") return false;

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function isDomLike(value) {
    return value instanceof Window || value instanceof Document || value instanceof Node;
  }

  function isInspectableValue(value) {
    return isObjectLike(value);
  }

  function copyText(value) {
    const text = String(value);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
      return;
    }

    fallbackCopyText(text);
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
    document.documentElement.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function formatElement(element) {
    const tag = element.tagName ? element.tagName.toLowerCase() : "element";
    const id = element.id ? `#${element.id}` : "";
    const classes =
      typeof element.className === "string" && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).slice(0, 6).join(".")}`
        : "";

    return html`<${tag}${id}${classes}>`;
  }

  function getNodeLabel(value) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    const type = typeof value;

    if (type === "string") return `"${trimText(value)}"`;
    if (type === "number" || type === "boolean") return String(value);
    if (type === "bigint") return `${value}n`;
    if (type === "symbol") return value.toString();
    if (type === "function") return `ƒ ${value.name || "anonymous"}`;

    if (value instanceof Window) return "Window";
    if (value instanceof Document) return "Document";
    if (value instanceof HTMLScriptElement) return html`<script${value.src ? ` src="${value.src}"` : ""}>`;
    if (value instanceof HTMLStyleElement) return "<style>";
    if (value instanceof HTMLTemplateElement) return "<template>";
    if (value instanceof Element) return formatElement(value);
    if (value instanceof Text) return html`Text("${trimText(value.textContent || "")}")`;
    if (value instanceof Comment) return "Comment";
    if (value instanceof Node) return `Node ${value.nodeName}`;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : `Date("${value.toISOString()}")`;
    if (value instanceof RegExp) return value.toString();
    if (value instanceof Promise) return "Promise";
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value instanceof Map) return `Map(${value.size})`;
    if (value instanceof Set) return `Set(${value.size})`;
    if (ArrayBuffer.isView(value)) return `${value.constructor.name}(${value.length})`;
    if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`;
    if (isPlainObject(value)) return "Object";

    return value?.constructor?.name || "Object";
  }

  function getCodeLanguage(value) {
    if (value instanceof HTMLStyleElement) return "css";
    if (value instanceof HTMLScriptElement) return "javascript";
    if (value instanceof HTMLTemplateElement) return "xml";
    if (value instanceof Element) return "xml";
    if (typeof value === "function") return "javascript";
    return "javascript";
  }

  function getRichCode(value) {
    if (value instanceof HTMLStyleElement) return formatCss(value.textContent || "");
    if (value instanceof HTMLScriptElement) return stripCodeComments(dedent(value.textContent || "")).trim();
    if (value instanceof HTMLTemplateElement) return formatHtml(value.innerHTML || "");
    if (value instanceof Element) return formatHtml(value.outerHTML || "");
    if (value instanceof Text) return value.textContent || "";
    if (typeof value === "function") return stripCodeComments(dedent(Function.prototype.toString.call(value))).trim();

    return null;
  }

  function formatValue(value, depth = 0, seen = new WeakSet()) {
    if (!isObjectLike(value)) return getNodeLabel(value);
    if (seen.has(value)) return "[Circular]";

    seen.add(value);

    const richCode = getRichCode(value);
    if (richCode !== null) return richCode;

    if (value instanceof Window) return "Window";
    if (value instanceof Document) return formatHtml(value.documentElement?.outerHTML || "Document");
    if (value instanceof Node) return `Node ${value.nodeName}`;
    if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ""}`;

    if (Array.isArray(value)) {
      const body = value.map((item) => `${"  ".repeat(depth + 1)}${formatValue(item, depth + 1, seen)}`).join(",\n");
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

    const keys = Reflect.ownKeys(value);
    const body = keys
      .slice(0, MAX_TREE_ITEMS)
      .map((key) => {
        const propertyValue = safeCall(() => value[key], "[Throws]");
        return `${"  ".repeat(depth + 1)}${String(key)}: ${formatValue(propertyValue, depth + 1, seen)}`;
      })
      .join(",\n");

    return keys.length ? `{\n${body}\n${"  ".repeat(depth)}}` : "{}";
  }

  function highlightCode(value, language = "javascript") {
    const code = String(value);

    if (window.hljs?.highlight) {
      try {
        return window.hljs.highlight(code, { language }).value;
      } catch {
        /* Fallback below. */
      }
    }

    return escapeHtml(code)
      .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, '<span class="ra-string">$1</span>')
      .replace(/\b(true|false|null|undefined|NaN|Infinity)\b/g, '<span class="ra-bool">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?n?)\b/g, '<span class="ra-number">$1</span>')
      .replace(/^(\s*)([A-Za-z_$][\w$-]*)(:)/gm, '$1<span class="ra-key">$2</span>$3');
  }

  function getEntries(value, basePath = "$") {
    if (!isObjectLike(value)) return [];

    if (Array.isArray(value)) {
      return value.map((item, index) => ({ label: String(index), value: item, path: `${basePath}[${index}]` }));
    }

    if (value instanceof Map) {
      return Array.from(value.entries()).map(([key, item], index) => ({
        label: `entry ${index}`,
        value: { key, value: item },
        path: `${basePath}.<map>[${index}]`,
      }));
    }

    if (value instanceof Set) {
      return Array.from(value.values()).map((item, index) => ({ label: String(index), value: item, path: `${basePath}.<set>[${index}]` }));
    }

    if (value instanceof Window) {
      return Object.getOwnPropertyNames(value)
        .slice(0, MAX_TREE_ITEMS)
        .map((key) => ({ label: key, value: safeCall(() => value[key], "[Throws]"), path: `${basePath}.${key}` }));
    }

    if (value instanceof Document) {
      return [
        ["documentElement", value.documentElement],
        ["head", value.head],
        ["body", value.body],
        ["scripts", Array.from(value.scripts || [])],
        ["stylesheets", Array.from(value.styleSheets || [])],
        ["forms", Array.from(value.forms || [])],
        ["images", Array.from(value.images || [])],
        ["links", Array.from(value.links || [])],
      ].map(([label, entryValue]) => ({ label, value: entryValue, path: `${basePath}.${label}` }));
    }

    if (value instanceof Element) {
      const entries = [
        { label: "tagName", value: value.tagName, path: `${basePath}.tagName` },
        { label: "id", value: value.id, path: `${basePath}.id` },
        { label: "className", value: value.className, path: `${basePath}.className` },
        { label: "attributes", value: Array.from(value.attributes).map((attr) => ({ name: attr.name, value: attr.value })), path: `${basePath}.attributes` },
        { label: "dataset", value: { ...value.dataset }, path: `${basePath}.dataset` },
        { label: "style", value: value.getAttribute("style") || "", path: `${basePath}.style` },
        { label: "children", value: Array.from(value.children), path: `${basePath}.children` },
        { label: "childNodes", value: Array.from(value.childNodes), path: `${basePath}.childNodes` },
        { label: "innerHTML", value: formatHtml(value.innerHTML || ""), path: `${basePath}.innerHTML` },
        { label: "outerHTML", value: formatHtml(value.outerHTML || ""), path: `${basePath}.outerHTML` },
      ];

      if (value instanceof HTMLScriptElement) {
        entries.unshift({ label: "formattedScript", value: stripCodeComments(dedent(value.textContent || "")), path: `${basePath}.formattedScript` });
      }

      if (value instanceof HTMLStyleElement) {
        entries.unshift({ label: "formattedCss", value: formatCss(value.textContent || ""), path: `${basePath}.formattedCss` });
      }

      if (value instanceof HTMLTemplateElement) {
        entries.unshift({ label: "formattedTemplate", value: formatHtml(value.innerHTML || ""), path: `${basePath}.formattedTemplate` });
      }

      return entries;
    }

    if (value instanceof Node) {
      return [
        { label: "nodeType", value: value.nodeType, path: `${basePath}.nodeType` },
        { label: "nodeName", value: value.nodeName, path: `${basePath}.nodeName` },
        { label: "nodeValue", value: value.nodeValue, path: `${basePath}.nodeValue` },
        { label: "textContent", value: value.textContent, path: `${basePath}.textContent` },
        { label: "childNodes", value: Array.from(value.childNodes || []), path: `${basePath}.childNodes` },
        { label: "parentNode", value: value.parentNode, path: `${basePath}.parentNode` },
      ];
    }

    return Reflect.ownKeys(value).map((key) => ({
      label: String(key),
      value: safeCall(() => value[key], "[Throws]"),
      path: /^[A-Za-z_$][\w$]*$/.test(String(key)) ? `${basePath}.${String(key)}` : `${basePath}[${JSON.stringify(String(key))}]`,
    }));
  }

  function captureStackTrace() {
    if (DISABLE_STACKTRACE) {
      return { title: "", frames: [], raw: "" };
    }

    const error = new Error("alerta stacktrace");
    const raw = String(error.stack || "");
    const frames = raw
      .split("\n")
      .slice(2)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.includes("captureStackTrace"))
      .filter((line) => !line.includes("addInspectorLog"))
      .filter((line) => !line.includes("patchedAlert"))
      .filter((line) => !line.includes("alertedConsole"))
      .filter((line) => !line.includes("render"))
      .filter((line) => line !== "@")
      .filter((line) => line !== "anonymous@");

    const manual = [];

    if (contextState.userscript) manual.push(`uf: ${contextState.userscript}`);
    if (contextState.functionName) manual.push(`fn: ${contextState.functionName}`);

    const title = manual.length ? manual.join(" · ") : frames[0] || "";

    return {
      title,
      frames: [...manual, ...frames],
      raw: [...manual, ...frames].join("\n"),
    };
  }

  function createGroupKey(kind, stack) {
    return [contextState.userscript || "global", contextState.functionName || "", kind, stack.title].join("::");
  }

  function createGroupTitle(kind, stack) {
    return stack.title ? `${kind} · ${stack.title}` : kind;
  }

  /* ==========================================================================
   * DevTools-like Console Formatting
   * ========================================================================== */

  function sanitizeConsoleStyle(value) {
    const allowed = new Set([
      "color",
      "background",
      "background-color",
      "font-weight",
      "font-style",
      "font-size",
      "font-family",
      "line-height",
      "text-decoration",
      "text-transform",
      "letter-spacing",
      "border",
      "border-radius",
      "padding",
      "margin",
      "display",
    ]);

    return String(value)
      .split(";")
      .map((rule) => rule.trim())
      .filter(Boolean)
      .map((rule) => {
        const separator = rule.indexOf(":");
        if (separator < 0) return "";

        const property = rule.slice(0, separator).trim().toLowerCase();
        const raw = rule.slice(separator + 1).trim();

        if (!allowed.has(property)) return "";
        if (/url\s*\(|expression\s*\(|javascript:/i.test(raw)) return "";

        return `${property}:${raw}`;
      })
      .filter(Boolean)
      .join(";");
  }

  function parseConsoleValues(values) {
    const inspectValues = [];
    const parts = [];
    const rawParts = [];

    if (!values.length) {
      return { html: "", raw: "", rest: [] };
    }

    if (typeof values[0] !== "string") {
      for (const value of values) {
        parts.push(renderInlineValue(value));
        rawParts.push(stringifyPreview(value));

        if (isInspectableValue(value)) {
          inspectValues.push(value);
        }
      }

      return {
        html: parts.join(" "),
        raw: rawParts.join(" "),
        rest: inspectValues,
      };
    }

    const format = String(values[0]);
    const args = values.slice(1);
    let argIndex = 0;
    let activeStyle = "";
    let lastIndex = 0;
    let consumedAnyPlaceholder = false;

    const matcher = /%([%csdiffoO])/g;
    let match = matcher.exec(format);

    while (match) {
      const tokenStart = match.index;
      const tokenEnd = matcher.lastIndex;
      const token = match[1];

      if (tokenStart > lastIndex) {
        const text = format.slice(lastIndex, tokenStart);
        parts.push(wrapStyledText(text, activeStyle));
        rawParts.push(text);
      }

      if (token === "%") {
        parts.push(wrapStyledText("%", activeStyle));
        rawParts.push("%");
      } else {
        consumedAnyPlaceholder = true;

        const value = args[argIndex++];

        if (token === "c") {
          activeStyle = sanitizeConsoleStyle(value);
        } else if (token === "o" || token === "O") {
          const label = getNodeLabel(value);
          parts.push(`<span class="ra-inline-object">${escapeHtml(label)}</span>`);
          rawParts.push(label);

          if (isInspectableValue(value)) {
            inspectValues.push(value);
          }
        } else {
          const text = formatPlaceholderValue(token, value);
          parts.push(wrapStyledText(text, activeStyle));
          rawParts.push(text);
        }
      }

      lastIndex = tokenEnd;
      match = matcher.exec(format);
    }

    if (lastIndex < format.length) {
      const text = format.slice(lastIndex);
      parts.push(wrapStyledText(text, activeStyle));
      rawParts.push(text);
    }

    const tail = args.slice(argIndex);

    for (const value of tail) {
      parts.push(renderInlineValue(value));
      rawParts.push(stringifyPreview(value));

      if (isInspectableValue(value)) {
        inspectValues.push(value);
      }
    }

    if (!consumedAnyPlaceholder && !tail.length) {
      return {
        html: escapeHtml(format),
        raw: format,
        rest: [],
      };
    }

    return {
      html: parts.join(tail.length ? " " : ""),
      raw: rawParts.join(tail.length ? " " : ""),
      rest: inspectValues,
    };
  }

  function formatPlaceholderValue(token, value) {
    if (token === "d" || token === "i") {
      const parsed = Number.parseInt(String(value), 10);
      return Number.isNaN(parsed) ? "NaN" : String(parsed);
    }

    if (token === "f") {
      const parsed = Number.parseFloat(String(value));
      return Number.isNaN(parsed) ? "NaN" : String(parsed);
    }

    return String(value);
  }

  function wrapStyledText(text, style) {
    const escaped = escapeHtml(text);

    if (!style) return escaped;

    return html`<span style="${escapeHtml(style)}">${escaped}</span>`;
  }

  function renderInlineValue(value) {
    if (typeof value === "string") return escapeHtml(value);
    if (!isObjectLike(value)) return html`<span class="ra-primitive">${escapeHtml(getNodeLabel(value))}</span>`;

    return html`<span class="ra-inline-object">${escapeHtml(getNodeLabel(value))}</span>`;
  }

  function stringifyPreview(value) {
    if (typeof value === "string") return value;
    return getNodeLabel(value);
  }

  /* ==========================================================================
   * Icons
   * ========================================================================== */

  function icon(name) {
    return html`<i data-lucide="${escapeHtml(name)}" class="ra-icon" aria-hidden="true"></i>`;
  }

  function refreshIcons() {
    window.lucide?.createIcons?.({
      attrs: {
        "stroke-width": 2,
      },
    });
  }

  /* ==========================================================================
   * Styles
   * ========================================================================== */

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css`
      :root {
        --ra-bg: rgb(7 8 10 / 0.72);
        --ra-panel: rgb(12 13 15 / 0.88);
        --ra-panel-2: rgb(18 19 22 / 0.88);
        --ra-border: rgb(255 255 255 / 0.10);
        --ra-border-strong: rgb(255 255 255 / 0.18);
        --ra-text: #e5e7eb;
        --ra-strong: #ffffff;
        --ra-muted: #9ca3af;
        --ra-faint: #6b7280;
        --ra-cyan: #7dd3fc;
        --ra-string: #7ee787;
        --ra-number: #ffb86c;
        --ra-bool: #ff79c6;
        --ra-key: #8ab4ff;
        --ra-special: #c084fc;
        --ra-comment: #8b949e;
        --ra-warning-bg: rgb(251 191 36 / 0.16);
        --ra-warning-border: rgb(251 191 36 / 0.50);
        --ra-warning-text: #facc15;
        --ra-error-bg: rgb(248 81 73 / 0.20);
        --ra-error-border: rgb(248 81 73 / 0.62);
        --ra-error-text: #ff7b72;
        --ra-radius-sm: 10px;
        --ra-radius-md: 14px;
        --ra-radius-lg: 22px;
        --ra-radius-pill: 999px;
        --ra-font-ui: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --ra-font-mono: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
        --ra-z: 2147483600;
        --ra-shadow: 0 28px 90px rgb(0 0 0 / 0.72);
        --ra-blur: 22px;
      }

      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: var(--ra-z);
        pointer-events: none;
        font-family: var(--ra-font-ui);
        color: var(--ra-text);
        -webkit-font-smoothing: antialiased;
      }

      #${ROOT_ID} * {
        box-sizing: border-box;
      }

      .ra-icon {
        width: 15px;
        height: 15px;
        flex: 0 0 auto;
      }

      .ra-dock {
        position: fixed;
        right: 0;
        top: var(--ra-dock-y, 34vh);
        z-index: var(--ra-z);
        pointer-events: auto;
        display: grid;
        place-items: center;
        width: 42px;
        border: 1px solid var(--ra-border-strong);
        border-right: 0;
        border-radius: 14px 0 0 14px;
        background: linear-gradient(180deg, rgb(24 25 28 / 0.96), rgb(9 10 12 / 0.96));
        box-shadow: var(--ra-shadow);
        backdrop-filter: blur(var(--ra-blur));
        cursor: grab;
        user-select: none;
        touch-action: none;
      }

      .ra-dock.ra-has-new-log {
        animation: ra-dock-pulse 900ms ease-in-out infinite;
      }

      @keyframes ra-dock-pulse {
        0%, 100% {
          box-shadow: 0 0 0 0 rgb(255 255 255 / 0.34), var(--ra-shadow);
          transform: translateX(0) scale(1);
        }

        50% {
          box-shadow: 0 0 0 9px rgb(255 255 255 / 0.04), var(--ra-shadow);
          transform: translateX(-2px) scale(1.025);
        }
      }

      .ra-dock-inner {
        display: grid;
        gap: 8px;
        justify-items: center;
        padding: 5px 6px;
      }

      .ra-dock-count {
        min-width: 25px;
        height: 25px;
        display: grid;
        place-items: center;
        border: 1px solid var(--ra-border);
        border-radius: var(--ra-radius-pill);
        background: rgb(255 255 255 / 0.075);
        color: var(--ra-strong);
        font: 900 11px / 1 var(--ra-font-ui);
      }

      .ra-panel {
        position: fixed;
        top: max(12px, env(safe-area-inset-top));
        right: max(10px, env(safe-area-inset-right));
        width: min(var(--ra-w, 480px), calc(100vw - 18px));
        height: min(var(--ra-h, calc(100vh - 24px)), calc(100vh - 24px));
        z-index: calc(var(--ra-z) + 1);
        pointer-events: auto;
        display: none;
        grid-template-rows: auto auto 1fr;
        overflow: hidden;
        border: 1px solid var(--ra-border-strong);
        border-radius: var(--ra-radius-lg);
        background: linear-gradient(180deg, var(--ra-panel), rgb(6 7 9 / 0.98));
        box-shadow: var(--ra-shadow);
        backdrop-filter: blur(var(--ra-blur));
      }

      .ra-panel.ra-open {
        display: grid;
      }

      .ra-panel.ra-floating {
        right: auto;
        left: var(--ra-x, 18px);
        top: var(--ra-y, 72px);
      }

      .ra-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 44px;
        padding: 8px 9px 8px 12px;
        border-bottom: 1px solid var(--ra-border);
        background: rgb(255 255 255 / 0.035);
        touch-action: none;
        cursor: grab;
        user-select: none;
      }

      .ra-title {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 9px;
        color: var(--ra-strong);
        font-size: 12px;
        font-weight: 720;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .ra-title span:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .ra-actions,
      .ra-toolbar {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      .ra-button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px solid var(--ra-border);
        border-radius: var(--ra-radius-pill);
        min-height: 31px;
        padding: 7px 10px;
        background: rgb(255 255 255 / 0.055);
        color: var(--ra-text);
        font: 900 11px / 1 var(--ra-font-ui);
      }

      .ra-toolbar {
        padding: 8px;
        border-bottom: 1px solid var(--ra-border);
        background: rgb(0 0 0 / 0.14);
      }

      .ra-search {
        min-width: 0;
        flex: 1;
        height: 34px;
        border: 1px solid var(--ra-border);
        border-radius: var(--ra-radius-pill);
        padding: 0 13px;
        outline: none;
        background: rgb(0 0 0 / 0.25);
        color: var(--ra-text);
        font: 750 12px / 1 var(--ra-font-ui);
      }

      .ra-main {
        min-height: 0;
        overflow: auto;
        padding: 8px;
      }

      .ra-log-card {
        display: grid;
        gap: 8px;
        margin-bottom: 8px;
        overflow: hidden;
        border: 1px solid var(--ra-border);
        border-left: 3px solid transparent;
        border-radius: var(--ra-radius-md);
        background: rgb(255 255 255 / 0.028);
      }

      .ra-log-card.ra-kind-warn {
        border-left-color: var(--ra-warning-border);
        background:
          linear-gradient(90deg, var(--ra-warning-bg), transparent 42%),
          rgb(255 255 255 / 0.025);
      }

      .ra-log-card.ra-kind-error {
        border-left-color: var(--ra-error-border);
        background:
          linear-gradient(90deg, var(--ra-error-bg), transparent 42%),
          rgb(255 255 255 / 0.025);
      }

      .ra-log-head {
        display: grid;
        gap: 7px;
        padding: 10px 11px;
      }

      .ra-log-head.ra-has-body {
        padding-bottom: 0;
      }

      .ra-log-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: var(--ra-muted);
        font-size: 10px;
        font-weight: 850;
        min-width: 0;
      }

      .ra-log-kind {
        min-width: 0;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--ra-cyan);
        text-transform: uppercase;
        letter-spacing: 0.07em;
      }

      .ra-kind-warn .ra-log-kind {
        color: var(--ra-warning-text);
      }

      .ra-kind-error .ra-log-kind {
        color: var(--ra-error-text);
      }

      .ra-log-time {
        flex: 0 0 auto;
        color: var(--ra-faint);
      }

      .ra-log-message {
        color: var(--ra-strong);
        font: 430 12px / 1.45 var(--ra-font-mono);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .ra-inline-object {
        color: var(--ra-cyan);
        font-weight: 700;
      }

      .ra-primitive {
        color: var(--ra-text);
      }

      .ra-log-stack-mini {
        color: var(--ra-muted);
        font: 700 10px / 1.2 var(--ra-font-ui);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ra-log-body {
        display: grid;
        gap: 7px;
        padding: 0 11px 10px;
      }

      .ra-stack,
      .ra-code-block {
        overflow: hidden;
        border: 1px solid var(--ra-border);
        border-radius: var(--ra-radius-md);
        background: rgb(0 0 0 / 0.18);
      }

      .ra-stack.ra-kind-warn {
        border-color: var(--ra-warning-border);
        background: linear-gradient(180deg, var(--ra-warning-bg), rgb(0 0 0 / 0.16));
      }

      .ra-stack.ra-kind-error {
        border-color: var(--ra-error-border);
        background: linear-gradient(180deg, var(--ra-error-bg), rgb(0 0 0 / 0.16));
      }

      .ra-stack summary,
      .ra-code-block summary {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 9px 10px;
        cursor: pointer;
        color: var(--ra-strong);
        font: 850 11px / 1.25 var(--ra-font-ui);
        list-style: none;
      }

      .ra-stack summary::-webkit-details-marker,
      .ra-code-block summary::-webkit-details-marker {
        display: none;
      }

      .ra-stack pre,
      .ra-code-block pre {
        margin: 0;
        padding: 10px;
        border-top: 1px solid var(--ra-border);
        color: var(--ra-text);
        white-space: pre-wrap;
        word-break: break-word;
        overflow: auto;
      }

      .ra-tree {
        display: grid;
        gap: 4px;
      }

      .ra-node {
        margin-left: 5px;
        padding-left: 7px;
        border-left: 1px solid rgb(255 255 255 / 0.10);
      }

      .ra-details > summary {
        display: flex;
        align-items: center;
        gap: 5px;
        min-height: 24px;
        list-style: none;
        cursor: pointer;
        font: 300 12px / 1.45 var(--ra-font-mono);
        border-radius: var(--ra-radius-sm);
        padding: 3px 5px;
      }

      .ra-details > summary::-webkit-details-marker {
        display: none;
      }

      .ra-details > summary:hover,
      .ra-leaf:hover {
        background: rgb(255 255 255 / 0.055);
      }

      .ra-chevron {
        width: 12px;
        height: 12px;
        color: var(--ra-muted);
        transform: rotate(-90deg);
        transition: transform 140ms ease;
      }

      .ra-details[open] > summary .ra-chevron {
        transform: rotate(0deg);
      }

      .ra-leaf {
        display: flex;
        align-items: flex-start;
        gap: 7px;
        min-height: 24px;
        border-radius: var(--ra-radius-sm);
        padding: 4px 5px;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .ra-code {
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--ra-text);
      }

      .ra-key,
      .hljs-attr,
      .hljs-property,
      .hljs-title.function_ {
        color: var(--ra-key);
      }

      .ra-string,
      .hljs-string {
        color: var(--ra-string);
      }

      .ra-number,
      .hljs-number {
        color: var(--ra-number);
      }

      .ra-bool,
      .hljs-literal {
        color: var(--ra-bool);
      }

      .ra-special,
      .hljs-keyword,
      .hljs-built_in,
      .hljs-name,
      .hljs-selector-tag {
        color: var(--ra-special);
      }

      .ra-muted,
      .hljs-comment {
        color: var(--ra-comment);
      }

      .hljs-punctuation,
      .hljs-operator {
        color: #e5e7eb;
      }

      .ra-element {
        color: var(--ra-cyan);
        text-decoration: underline;
        text-decoration-color: rgb(255 255 255 / 0.35);
        text-underline-offset: 3px;
        cursor: crosshair;
      }

      .ra-menu {
        position: fixed;
        z-index: calc(var(--ra-z) + 3);
        min-width: 190px;
        overflow: hidden;
        border: 1px solid var(--ra-border-strong);
        border-radius: var(--ra-radius-md);
        background: var(--ra-panel-2);
        box-shadow: var(--ra-shadow);
        pointer-events: auto;
      }

      .ra-menu button {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        appearance: none;
        border: 0;
        padding: 12px;
        color: var(--ra-text);
        background: transparent;
        text-align: left;
        font: 900 12px / 1 var(--ra-font-ui);
      }

      .ra-menu button:hover {
        background: rgb(255 255 255 / 0.08);
      }

      .ra-load-more {
        width: 100%;
        min-height: 42px;
        border: 1px solid var(--ra-border);
        border-radius: var(--ra-radius-md);
        background: rgb(255 255 255 / 0.045);
        color: var(--ra-text);
        font: 800 12px / 1 var(--ra-font-ui);
      }

      .ra-empty {
        min-height: 140px;
        display: grid;
        place-items: center;
        color: var(--ra-muted);
        text-align: center;
        font: 800 13px / 1.4 var(--ra-font-ui);
      }

      .ra-resize {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 30px;
        height: 30px;
        cursor: nwse-resize;
        touch-action: none;
      }

      .ra-resize::after {
        content: "";
        position: absolute;
        right: 9px;
        bottom: 9px;
        width: 11px;
        height: 11px;
        border-right: 2px solid rgb(255 255 255 / 0.38);
        border-bottom: 2px solid rgb(255 255 255 / 0.38);
      }

      .ra-focus-ring {
        outline: 3px solid rgb(125 211 252 / 0.86) !important;
        outline-offset: 3px !important;
      }

      @media (max-width: 720px) {
        .ra-panel {
          inset:
            max(72px, env(safe-area-inset-top))
            max(8px, env(safe-area-inset-right))
            max(18px, env(safe-area-inset-bottom))
            max(8px, env(safe-area-inset-left));
          width: auto;
          height: auto;
          border-radius: 22px;
        }

        .ra-header {
          min-height: 42px;
          padding: 7px 8px 7px 11px;
        }

        .ra-title {
          font-size: 11px;
          letter-spacing: 0.07em;
        }

        .ra-button {
          width: 34px;
          min-height: 34px;
          padding: 0;
        }

        .ra-button span {
          display: none;
        }

        .ra-main {
          padding: 7px;
        }

        .ra-log-card {
          border-radius: 14px;
        }

        .ra-log-message {
          font-size: 12px;
        }

        .ra-stack pre,
        .ra-code-block pre {
          max-height: 220px;
        }

        .ra-resize {
          display: none;
        }
      }
    `;

    document.documentElement.appendChild(style);
  }

  /* ==========================================================================
   * DOM Root
   * ========================================================================== */

  function getRoot() {
    ensureStyles();

    if (root) return root;

    root = document.getElementById(ROOT_ID);

    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
    }

    root.innerHTML = `
      <button class="ra-dock" type="button" aria-label="Open inspector">
        <span class="ra-dock-inner">
          ${icon("panel-right-open")}
          <span class="ra-dock-count">0</span>
        </span>
      </button>

      <section class="ra-panel" role="dialog" aria-label="Rod docked inspector">
        <header class="ra-header">
          <div class="ra-title">
            ${icon("bug")}
            <span>Docked Inspector</span>
          </div>
          <div class="ra-actions">
            <button class="ra-button" type="button" data-action="dock">${icon("panel-right")}<span>Dock</span></button>
            <button class="ra-button" type="button" data-action="copy">${icon("copy")}<span>Copy</span></button>
            <button class="ra-button" type="button" data-action="clear">${icon("trash-2")}<span>Clear</span></button>
            <button class="ra-button" type="button" data-action="minimize">${icon("minus")}<span>Min</span></button>
          </div>
        </header>

        <div class="ra-toolbar">
          ${icon("search")}
          <input class="ra-search" type="search" placeholder="Filter logs..." autocomplete="off" />
        </div>

        <main class="ra-main"></main>
        <div class="ra-resize" aria-hidden="true"></div>
      </section>
    `;

    bindRootEvents(root);
    renderInspector();

    return root;
  }

  function bindRootEvents(host) {
    const dock = host.querySelector(".ra-dock");
    const panel = host.querySelector(".ra-panel");
    const header = host.querySelector(".ra-header");
    const resize = host.querySelector(".ra-resize");
    const search = host.querySelector(".ra-search");
    const main = host.querySelector(".ra-main");

    dock.addEventListener("click", (event) => {
      if (dockDragging) return;

      event.preventDefault();
      openInspector();
    });

    panel.addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.action;

      if (action === "dock") dockPanel();
      if (action === "copy") copySelectedOrAll();
      if (action === "clear") clearLogs();
      if (action === "minimize") minimizeInspector();

      if (action === "load-more") {
        visibleLimit += MAX_RENDERED_LOGS;
        scheduleRender();
      }
    });

    search.addEventListener("input", () => {
      window.clearTimeout(searchTimer);

      searchTimer = window.setTimeout(() => {
        state.query = search.value;
        visibleLimit = MAX_RENDERED_LOGS;
        saveState();
        scheduleRender();
      }, SEARCH_DEBOUNCE_MS);
    });

    main.addEventListener("click", (event) => {
      const card = event.target.closest("[data-log-id]");
      if (!card) return;
      selectedLogId = Number(card.dataset.logId);
    });

    bindDockDrag(dock);
    bindDrag(panel, header);
    bindResize(panel, resize);
  }

  /* ==========================================================================
   * UI Actions
   * ========================================================================== */

  function scheduleRender() {
    if (renderFrame) return;

    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      renderInspector();
    });
  }

  function pulseDock() {
    const dock = getRoot().querySelector(".ra-dock");

    dock.classList.add("ra-has-new-log");
    window.clearTimeout(dockPulseTimer);

    dockPulseTimer = window.setTimeout(() => {
      dock.classList.remove("ra-has-new-log");
    }, DOCK_PULSE_MS);
  }

  function openInspector() {
    state.open = true;
    saveState();

    const dock = getRoot().querySelector(".ra-dock");
    dock.classList.remove("ra-has-new-log");

    renderInspector();
  }

  function minimizeInspector() {
    state.open = false;
    state.docked = true;
    saveState();
    renderInspector();
  }

  function dockPanel() {
    state.docked = true;
    state.open = true;
    saveState();
    renderInspector();
  }

  function clearLogs() {
    logs.length = 0;
    selectedLogId = null;
    visibleLimit = MAX_RENDERED_LOGS;
    renderInspector();
  }

  function copySelectedOrAll() {
    const selected = logs.find((log) => log.id === selectedLogId);

    if (selected) {
      copyText(formatLogForCopy(selected));
      return;
    }

    copyText(logs.map(formatLogForCopy).join("\n\n"));
  }

  function formatLogForCopy(log) {
    return [
      `[${log.time}] ${log.kind}`,
      log.display.raw,
      log.stack.raw ? `Stack:\n${log.stack.raw}` : "",
      log.display.rest.length ? `Values:\n${log.display.rest.map((value) => formatValue(value)).join("\n\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /* ==========================================================================
   * Rendering
   * ========================================================================== */

  function getVisibleLogs() {
    const query = state.query.trim().toLowerCase();

    if (!query) return logs;

    return logs.filter((log) => {
      return (
        log.preview.toLowerCase().includes(query) ||
        log.kind.toLowerCase().includes(query) ||
        log.groupTitle.toLowerCase().includes(query) ||
        log.stack.raw.toLowerCase().includes(query)
      );
    });
  }

  function renderInspector() {
    const host = getRoot();
    const panel = host.querySelector(".ra-panel");
    const dock = host.querySelector(".ra-dock");
    const dockCount = host.querySelector(".ra-dock-count");
    const search = host.querySelector(".ra-search");

    dockCount.textContent = String(logs.length);
    dock.style.setProperty("--ra-dock-y", `${state.dockY}px`);

    panel.classList.toggle("ra-open", state.open);
    panel.classList.toggle("ra-floating", !state.docked);
    panel.style.setProperty("--ra-w", `${state.width}px`);
    panel.style.setProperty("--ra-h", `${state.height}px`);
    panel.style.setProperty("--ra-x", `${state.x}px`);
    panel.style.setProperty("--ra-y", `${state.y}px`);

    if (search.value !== state.query) {
      search.value = state.query;
    }

    renderLogStream(host.querySelector(".ra-main"));
    refreshIcons();
  }

  function renderLogStream(main) {
    const visibleLogs = getVisibleLogs();
    const renderedLogs = visibleLogs.slice(0, visibleLimit);

    main.innerHTML = "";

    if (!renderedLogs.length) {
      main.innerHTML = `<div class="ra-empty">${icon("moon")}<div>No logs yet.<br />Call <code>alerta(anything)</code>.</div></div>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const log of renderedLogs) {
      fragment.appendChild(createLogCard(log));
    }

    if (visibleLogs.length > renderedLogs.length) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ra-load-more";
      button.dataset.action = "load-more";
      button.textContent = `Load ${Math.min(MAX_RENDERED_LOGS, visibleLogs.length - renderedLogs.length)} more`;
      fragment.appendChild(button);
    }

    main.appendChild(fragment);
  }

  function createLogCard(log) {
    const card = document.createElement("article");
    card.className = `ra-log-card ra-kind-${log.kind}`;
    card.dataset.logId = String(log.id);

    const hasBody = log.display.rest.length || (!DISABLE_STACKTRACE && log.stack.raw);

    const head = document.createElement("div");
    head.className = `ra-log-head${hasBody ? " ra-has-body" : ""}`;
    head.innerHTML = `
      <span class="ra-log-meta">
        <span class="ra-log-kind">${icon(kindToIcon(log.kind))}<span>${escapeHtml(log.kind)}</span></span>
        <span class="ra-log-time">${escapeHtml(log.time)}</span>
      </span>
      <div class="ra-log-message">${log.display.html}</div>
    `;

    const body = document.createElement("div");
    body.className = "ra-log-body";

    for (let index = 0; index < log.display.rest.length; index += 1) {
      const value = log.display.rest[index];
      body.appendChild(createNodeView(value, `$[${index}]`, new WeakSet(), log.display.rest.length > 1 ? String(index) : "", false));
    }

    if (!DISABLE_STACKTRACE && log.stack.raw) {
      const stack = document.createElement("details");
      stack.className = `ra-stack ra-kind-${log.kind}`;
      stack.open = false;
      stack.innerHTML = `
        <summary>${icon("git-branch")}Stacktrace</summary>
        <pre>${escapeHtml(log.stack.raw)}</pre>
      `;
      body.appendChild(stack);
    }

    card.appendChild(head);

    if (hasBody) {
      card.appendChild(body);
    }

    return card;
  }

  function kindToIcon(kind) {
    if (kind === "error") return "circle-alert";
    if (kind === "warn") return "triangle-alert";
    if (kind === "alert" || kind === "alerta") return "message-square-warning";
    if (kind === "info") return "info";
    if (kind === "debug") return "bug";
    return "terminal";
  }

  function createCodeSpan(value, language = "javascript") {
    const span = document.createElement("span");
    span.className = "ra-code";
    span.innerHTML = highlightCode(value, language);
    return span;
  }

  function createCodeBlock(value, title, language) {
    const details = document.createElement("details");
    details.className = "ra-code-block";
    details.open = false;
    details.innerHTML = `
      <summary>${icon("code-2")}${escapeHtml(title)}</summary>
      <pre><code>${highlightCode(value, language)}</code></pre>
    `;
    return details;
  }

  function createNodeView(value, path = "$", seen = new WeakSet(), keyName = "", autoOpen = false) {
    const wrapper = document.createElement("div");
    wrapper.className = "ra-node";
    wrapper.dataset.path = path;

    const richCode = getRichCode(value);

    if (richCode !== null && isDomLike(value)) {
      const leaf = document.createElement("div");
      leaf.className = "ra-leaf";
      leaf.dataset.path = path;

      if (keyName) {
        const key = document.createElement("span");
        key.className = "ra-key";
        key.textContent = `${keyName}:`;
        leaf.appendChild(key);
      }

      const code = createCodeSpan(getNodeLabel(value), getCodeLanguage(value));

      if (value instanceof Element) {
        code.classList.add("ra-element");
      }

      leaf.appendChild(code);
      wrapper.appendChild(leaf);
      wrapper.appendChild(createCodeBlock(richCode, `${getNodeLabel(value)} formatted output`, getCodeLanguage(value)));
      bindInspectableNode(leaf, value, path);

      return wrapper;
    }

    if (!isObjectLike(value)) {
      const leaf = document.createElement("div");
      leaf.className = "ra-leaf";
      leaf.dataset.path = path;

      if (keyName) {
        const key = document.createElement("span");
        key.className = "ra-key";
        key.textContent = `${keyName}:`;
        leaf.appendChild(key);
      }

      leaf.appendChild(document.createTextNode(getNodeLabel(value)));
      wrapper.appendChild(leaf);
      bindInspectableNode(leaf, value, path);

      return wrapper;
    }

    if (seen.has(value)) {
      const leaf = document.createElement("div");
      leaf.className = "ra-leaf";
      leaf.textContent = `${keyName ? `${keyName}: ` : ""}[Circular]`;
      wrapper.appendChild(leaf);
      return wrapper;
    }

    seen.add(value);

    const details = document.createElement("details");
    details.className = "ra-details";
    details.open = autoOpen;

    const summary = document.createElement("summary");
    summary.dataset.path = path;
    summary.innerHTML = `
      ${icon("chevron-down").replace("ra-icon", "ra-icon ra-chevron")}
      <span>${keyName ? `<span class="ra-key">${escapeHtml(keyName)}</span>: ` : ""}<span class="ra-special">${escapeHtml(getNodeLabel(value))}</span></span>
    `;

    details.appendChild(summary);
    bindInspectableNode(summary, value, path);

    let loaded = false;

    function loadChildren() {
      if (loaded) return;
      loaded = true;

      const entries = getEntries(value, path);

      for (let index = 0; index < entries.length && index < MAX_TREE_ITEMS; index += 1) {
        const entry = entries[index];
        details.appendChild(createNodeView(entry.value, entry.path, seen, entry.label, false));
      }

      if (entries.length > MAX_TREE_ITEMS) {
        const more = document.createElement("div");
        more.className = "ra-leaf ra-muted";
        more.textContent = `… ${entries.length - MAX_TREE_ITEMS} more`;
        details.appendChild(more);
      }

      refreshIcons();
    }

    if (details.open) loadChildren();

    details.addEventListener("toggle", () => {
      if (details.open) loadChildren();
    });

    wrapper.appendChild(details);
    return wrapper;
  }

  /* ==========================================================================
   * Interaction
   * ========================================================================== */

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

      value.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      value.classList.add("ra-focus-ring");

      setTimeout(() => {
        value.classList.remove("ra-focus-ring");
      }, 1400);

      minimizeInspector();
    });
  }

  function openMenu(event, value, path) {
    removeMenu();

    const menu = document.createElement("div");
    menu.className = "ra-menu";
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 210)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 190)}px`;

    menu.innerHTML = `
      <button type="button" data-action="copy-path">${icon("route")}Copy path</button>
      <button type="button" data-action="copy-value">${icon("copy")}Copy value</button>
      <button type="button" data-action="copy-json">${icon("braces")}Copy JSON</button>
      <button type="button" data-action="inspect">${icon("search-code")}Inspect again</button>
    `;

    menu.addEventListener("click", (menuEvent) => {
      const action = menuEvent.target.closest("button")?.dataset.action;

      if (action === "copy-path") copyText(path);
      if (action === "copy-value") copyText(formatValue(value));
      if (action === "copy-json") copyText(safeCall(() => JSON.stringify(value, null, 2), formatValue(value)));
      if (action === "inspect") alerta(value);

      removeMenu();
    });

    document.documentElement.appendChild(menu);
    refreshIcons();

    setTimeout(() => {
      window.addEventListener("pointerdown", removeMenu, { once: true, capture: true });
    }, 0);
  }

  function removeMenu() {
    document.querySelectorAll(".ra-menu").forEach((menu) => menu.remove());
  }

  function bindDockDrag(dock) {
    let startY = 0;
    let initialY = 0;
    let moved = false;

    dock.addEventListener("pointerdown", (event) => {
      moved = false;
      dockDragging = false;
      startY = event.clientY;
      initialY = state.dockY;
      dock.setPointerCapture(event.pointerId);
    });

    dock.addEventListener("pointermove", (event) => {
      const deltaY = event.clientY - startY;

      if (Math.abs(deltaY) > 4) {
        moved = true;
        dockDragging = true;
      }

      if (!moved) return;

      state.dockY = Math.max(18, Math.min(window.innerHeight - 88, initialY + deltaY));
      dock.style.setProperty("--ra-dock-y", `${state.dockY}px`);
      event.preventDefault();
    });

    dock.addEventListener("pointerup", (event) => {
      saveState();
      dock.releasePointerCapture(event.pointerId);

      setTimeout(() => {
        dockDragging = false;
      }, 0);
    });
  }

  function bindDrag(panel, header) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;

      dragging = true;
      state.docked = false;

      const rect = panel.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      initialX = rect.left;
      initialY = rect.top;

      header.setPointerCapture(event.pointerId);
      renderInspector();
    });

    header.addEventListener("pointermove", (event) => {
      if (!dragging) return;

      state.x = Math.max(6, Math.min(window.innerWidth - 90, initialX + event.clientX - startX));
      state.y = Math.max(6, Math.min(window.innerHeight - 64, initialY + event.clientY - startY));

      panel.style.setProperty("--ra-x", `${state.x}px`);
      panel.style.setProperty("--ra-y", `${state.y}px`);
    });

    header.addEventListener("pointerup", (event) => {
      if (!dragging) return;

      dragging = false;
      saveState();
      header.releasePointerCapture(event.pointerId);
    });
  }

  function bindResize(panel, handle) {
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let initialWidth = 0;
    let initialHeight = 0;

    handle.addEventListener("pointerdown", (event) => {
      resizing = true;
      state.docked = false;
      startX = event.clientX;
      startY = event.clientY;
      initialWidth = panel.offsetWidth;
      initialHeight = panel.offsetHeight;

      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!resizing) return;

      state.width = Math.max(320, Math.min(window.innerWidth - 16, initialWidth + event.clientX - startX));
      state.height = Math.max(260, Math.min(window.innerHeight - 16, initialHeight + event.clientY - startY));

      panel.style.setProperty("--ra-w", `${state.width}px`);
      panel.style.setProperty("--ra-h", `${state.height}px`);
    });

    handle.addEventListener("pointerup", (event) => {
      resizing = false;
      saveState();
      handle.releasePointerCapture(event.pointerId);
      renderInspector();
    });
  }

  /* ==========================================================================
   * Public API
   * ========================================================================== */

  function addInspectorLog(kind, ...values) {
    getRoot();

    const stack = captureStackTrace();
    const groupKey = createGroupKey(kind, stack);
    const groupTitle = createGroupTitle(kind, stack);
    const display = parseConsoleValues(values);

    const log = {
      id: nextLogId++,
      kind,
      values,
      display,
      time: new Date().toLocaleTimeString(),
      preview: display.raw || values.map((value) => stringifyPreview(value)).join(" "),
      stack,
      groupKey,
      groupTitle,
    };

    logs.unshift(log);

    if (logs.length > MAX_LOGS) {
      logs.length = MAX_LOGS;
    }

    selectedLogId = log.id;

    if (!state.open) {
      pulseDock();
    }

    scheduleRender();

    return values.length === 1 ? values[0] : values;
  }

  function alerta(...values) {
    return addInspectorLog("alerta", ...values);
  }

  alerta.setUserscript = function setUserscript(name) {
    contextState.userscript = String(name || "");
    return alerta;
  };

  alerta.setFunction = function setFunction(name) {
    contextState.functionName = String(name || "");
    return alerta;
  };

  alerta.clearContext = function clearContext() {
    contextState.userscript = "";
    contextState.functionName = "";
    return alerta;
  };

  alerta.open = function openAlertaInspector() {
    openInspector();
    return alerta;
  };

  alerta.clear = function clearAlertaLogs() {
    clearLogs();
    return alerta;
  };

  alerta.reset = function resetAlertaContext() {
    contextState.userscript = "";
    contextState.functionName = "";
    return alerta;
  };

  window.alerta = alerta;
  window.addInspectorLog = addInspectorLog;
  window.formatAlertaValue = formatValue;
  window.nativeAlert = nativeAlert;
  window.inspectorHtml = html;
  window.inspectorCss = css;

  window.alert = alerta /**function patchedAlert(value) {
    addInspectorLog("alert", value);
  };**/

  window.console.log = function alertedConsoleLog(...values) {
    nativeConsole.log(...values);
    addInspectorLog("log", ...values);
  };

  window.console.info = function alertedConsoleInfo(...values) {
    nativeConsole.info(...values);
    addInspectorLog("info", ...values);
  };

  window.console.warn = function alertedConsoleWarn(...values) {
    nativeConsole.warn(...values);
    addInspectorLog("warn", ...values);
  };

  window.console.error = function alertedConsoleError(...values) {
    nativeConsole.error(...values);
    addInspectorLog("error", ...values);
  };

  window.console.debug = function alertedConsoleDebug(...values) {
    nativeConsole.debug(...values);
    addInspectorLog("debug", ...values);
  };
  
  const dataStore = {
    logs: [],
    errors: [],
    events: [],
    requests: [],
    listeners: new WeakMap(),
  };

  function interceptConsole() {
    if (!globalWindow.console || globalWindow.console[PATCHED_SYMBOL]) return;

    Object.defineProperty(globalWindow.console, PATCHED_SYMBOL, {
      value: true,
      configurable: false,
    });

    for (const level of ["log", "info", "warn", "error", "debug", "trace", "group", "groupCollapsed", "table", "trace"]) {
      const original = globalWindow.console[level];

      if (typeof original !== "function") continue;

      globalWindow.console[level] = function interceptedConsoleMethod(...args) {
        alerta(
          dataStore.logs,
          {
            level,
            args: args.map(previewValue),
            time: new Date().toISOString(),
          },
          LOG_LIMIT,
        );

        scheduleStatsSync();
        return original.apply(this, args);
      };
    }
  }
  
  

  function interceptErrors() {
    globalWindow.addEventListener(
      "error",
      (event) => {
        alerta(
          dataStore.errors,
          {
            type: "error",
            message: event.message,
            source: event.filename,
            line: event.lineno,
            column: event.colno,
            time: new Date().toISOString(),
          },
          ERROR_LIMIT,
        );

        scheduleStatsSync();
      },
      true,
    );

    globalWindow.addEventListener(
      "unhandledrejection",
      (event) => {
        alerta(
          dataStore.errors,
          {
            type: "unhandledrejection",
            reason: previewValue(event.reason),
            time: new Date().toISOString(),
          },
          ERROR_LIMIT,
        );

        scheduleStatsSync();
      },
      true,
    );
  }
  

  function interceptNetwork() {
    if (!globalWindow.fetch?.[PATCHED_SYMBOL]) {
      const originalFetch = globalWindow.fetch;

      if (typeof originalFetch === "function") {
        const wrappedFetch = async function interceptedFetch(input, init) {
          const startedAt = performance.now();
          const url = typeof input === "string" ? input : input?.url;
          const method = init?.method || input?.method || "GET";

          try {
            const response = await originalFetch.apply(this, arguments);

            alerta({
              kind: "fetch",
              url,
              method,
              status: response.status,
              ok: response.ok,
              duration: Math.round(performance.now() - startedAt),
              time: new Date().toISOString(),
            });

            return response;
          } catch (error) {
            alerta({
              kind: "fetch",
              url,
              method,
              error: previewValue(error),
              duration: Math.round(performance.now() - startedAt),
              time: new Date().toISOString(),
            });

            throw error;
          }
        };

        Object.defineProperty(wrappedFetch, PATCHED_SYMBOL, { value: true });
        globalWindow.fetch = wrappedFetch;
      }
    }

    patchXhr();
  }

  function patchXhr() {
    const proto = globalWindow.XMLHttpRequest?.prototype;

    if (!proto || proto[PATCHED_SYMBOL]) return;

    Object.defineProperty(proto, PATCHED_SYMBOL, {
      value: true,
      configurable: false,
    });

    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function interceptedXhrOpen(method, url) {
      this.__rodErudaRequest = {
        kind: "xhr",
        method,
        url,
        startedAt: 0,
      };

      return originalOpen.apply(this, arguments);
    };

    proto.send = function interceptedXhrSend() {
      const request = this.__rodErudaRequest;

      if (request) {
        request.startedAt = performance.now();

        this.addEventListener("loadend", () => {
          alerta({
            kind: "xhr",
            method: request.method,
            url: request.url,
            status: this.status,
            duration: Math.round(performance.now() - request.startedAt),
            time: new Date().toISOString(),
          });
        });
      }

      return originalSend.apply(this, arguments);
    };
  }


  function interceptEventListeners() {
    const proto = globalWindow.EventTarget?.prototype;

    if (!proto || proto[PATCHED_SYMBOL]) return;

    Object.defineProperty(proto, PATCHED_SYMBOL, {
      value: true,
      configurable: false,
    });

    const originalAdd = proto.addEventListener;
    const originalRemove = proto.removeEventListener;

    proto.addEventListener = function interceptedAddEventListener(type, listener, options) {
      if (listener) {
        let records = dataStore.listeners.get(this);

        if (!records) {
          records = [];
          dataStore.listeners.set(this, records);
        }

        records.push({
          type,
          listener,
          options,
          time: new Date().toISOString(),
        });

        alerta(
          dataStore.events,
          {
            action: "addEventListener",
            target: describeTarget(this),
            type,
            time: new Date().toISOString(),
          },
          EVENT_LIMIT,
        );

        //scheduleStatsSync();
      }

      return originalAdd.apply(this, arguments);
    };

    proto.removeEventListener = function interceptedRemoveEventListener(type, listener, options) {
      alerta(
        dataStore.events,
        {
          action: "removeEventListener",
          target: describeTarget(this),
          type,
          time: new Date().toISOString(),
        },
        EVENT_LIMIT,
      );

      //scheduleStatsSync();
      return originalRemove.apply(this, arguments);
    };
  }
  
  
  
  /**
  function installEditorPatcher() {
    patchAllEditors(globalDocument);

    if (!globalWindow.MutationObserver) return;

    editorObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          alerta(node);
        }
      }
    });

    editorObserver.observe(globalDocument, {
      childList: true,
      subtree: true,
    });
  }
  **/ 
  
  
  if (document.documentElement) {
    getRoot();
  } else {
    window.addEventListener("DOMContentLoaded", getRoot, { once: true });
  }
})();