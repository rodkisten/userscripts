// ==UserScript==
// @name         XXX2 / Alerta / Docked Inspector Logs
// @namespace    https://rod.dev/userscripts
// @version      3.6.0
// @description  Mobile DevTools-like docked inspector with virtualized logs/events, console %c formatting, lazy object trees, listener tracking, and pretty DOM source modal.
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

(function DockedInspectorLogs() {
  "use strict";

  /* ==========================================================================
   * Constants
   * ========================================================================== */



  const STYLE_ID = "__rod_docked_inspector_style__";
  const ROOT_ID = "__rod_docked_inspector_root__";
  const STORAGE_KEY = "rod.docked.inspector.v3.6";

  const MAX_RECORDS = 80;
  const MAX_VISIBLE_ROWS = 80;
  const MAX_TREE_ITEMS = 600;
  const MAX_INLINE_TEXT = 1800;
  const LONG_PRESS_MS = 480;
  const DOCK_PULSE_MS = 1800;
  const SEARCH_DEBOUNCE_MS = 90;

  const PATCHED = Symbol.for("rod.docked.inspector.patched");
  const EVENT_META = Symbol.for("rod.docked.inspector.event.meta");

  const nativeAlert = window.alert.bind(window);
  const nativeConsole = {
    log: window.console.log.bind(window.console),
    info: window.console.info.bind(window.console),
    warn: window.console.warn.bind(window.console),
    error: window.console.error.bind(window.console),
    debug: window.console.debug.bind(window.console),
    trace: window.console.trace?.bind(window.console),
  };

  let root = null;
  let nextId = 1;
  let renderFrame = 0;
  let searchTimer = 0;
  let dockPulseTimer = 0;
  let dockDragging = false;
  let state = readState();
  let unlockZoom = null;

  const logs = [];
  const events = [];
  const listenerStore = new WeakMap();

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
      width: 500,
      height: Math.min(780, window.innerHeight - 28),
      query: "",
      tab: "logs",
      logKind: "all",
      eventKind: "all",
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
          tab: state.tab,
          logKind: state.logKind,
          eventKind: state.eventKind,
        }),
      );
    } catch {
      /* Some pages block storage. */
    }
  }

  /* ==========================================================================
   * Tiny Utilities
   * ========================================================================== */

  function raw(strings, ...values) {
    let output = "";

    for (let index = 0; index < strings.length; index += 1) {
      output += strings[index];

      if (index < values.length) {
        output += String(values[index]);
      }
    }

    return output;
  }
  
  const css = raw;
  const html = raw;

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

  /* ==========================================================================
   * Formatting
   * ========================================================================== */

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
    const source = String(value)
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
    return String(value)
      .replace(/\s*{\s*/g, " {\n  ")
      .replace(/;\s*/g, ";\n  ")
      .replace(/\s*}\s*/g, "\n}\n\n")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .split("\n")
      .map((line) => line.replace(/\s+$/g, ""))
      .join("\n")
      .trim();
  }

  function formatElement(element) {
    const tag = element.tagName ? element.tagName.toLowerCase() : "element";
    const id = element.id ? `#${element.id}` : "";
    const classes =
      typeof element.className === "string" && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).slice(0, 6).join(".")}`
        : "";
        return renderHTMLTag(tag, element)

    //return `<${tag}${id}${classes}>`;
  }
  
/**
 * Render a single HTML attribute.
 *
 * @param {string} attributeName
 * @param {unknown} attributeValue
 *
 * @returns {string}
 *
 * @example
 * renderAttribute("src", "/cat.png")
 * // => ' src="/cat.png"'
 */
function renderAttribute(attributeName, attributeValue) {
  if (
    attributeValue === undefined ||
    attributeValue === null ||
    attributeValue === false
  ) {
    return "";
  }

  return ` ${attributeName}="${String(attributeValue)}"`;
}

/**
 * Render HTML attributes from an object.
 *
 * @param {{
 *   src?: string
 *   class?: string
 *   dataset?: Record<string, string | number | boolean>
 * }} attributes
 *
 * @param {boolean} includeDataset
 *
 * @returns {string}
 *
 * @example
 * renderAttributes({
 *   src: "/image.png",
 *   class: "card",
 *   dataset: {
 *     id: 10,
 *     active: true,
 *   },
 * }, true)
 *
 * // => ' src="/image.png" class="card" data-id="10" data-active="true"'
 */
function renderAttributes(attributes, includeDataset = false) {
  const ATTRIBUTES_TO_RENDER = [
    "src",
    "class",
    "id",
    "name",
    "className"
  ];

  const output = [];

  for (let index = 0; index < ATTRIBUTES_TO_RENDER.length; index += 1) {
    const attributeName = ATTRIBUTES_TO_RENDER[index];
    const attributeValue = attributes[attributeName];

    if (!attributeValue) {
      continue;
    }

    output.push(
      renderAttribute(attributeName, attributeValue),
    );
  }

  if (includeDataset && attributes.dataset) {
    const datasetEntries = Object.entries(attributes.dataset);

    for (let index = 0; index < datasetEntries.length; index += 1) {
      const [datasetKey, datasetValue] = datasetEntries[index];

      output.push(
        renderAttribute(
          `data-${datasetKey}`,
          datasetValue,
        ),
      );
    }
  }

  return output.join("");
}


function renderHTMLTag(tag, attributes) {
   return `<${tag}${renderAttributes(attributes)}>`;
}

  function getNodeLabel(value) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    const type = typeof value;

    if (type === "string") return `"${trimText(value)}"`;
    if (type === "number" || type === "boolean") return String(value);
    if (type === "bigint") return `${value}n`;
    if (type === "symbol") return value.toString();
    if (type === "function") return `ƒ ${value.name || "anonymous"}()`;

    if (value instanceof Window) return "Window";
    if (value instanceof Document) return "Document";
    if (value instanceof HTMLScriptElement) return renderHTMLTag("script", value);
    if (value instanceof HTMLStyleElement) return renderHTMLTag("style", value)
    if (value instanceof HTMLTemplateElement) return renderHTMLTag("template", value)
    if (value instanceof Element) return formatElement(value);
    if (value instanceof Text) return `Text("${trimText(value.textContent || "")}")`;
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

  function getObjectPreview(value) {
    if (!isObjectLike(value)) return escapeHtml(getNodeLabel(value));

    if (value instanceof Error) {
      return `<span class="ra-object-type">${escapeHtml(value.name)}</span> <span class="ra-muted">${escapeHtml(value.message)}</span>`;
    }

    if (value instanceof Element) {
      return `<span class="ra-object-type">${escapeHtml(formatElement(value))}</span>`;
    }

    if (value instanceof Window || value instanceof Document || value instanceof Node) {
      return `<span class="ra-object-type">${escapeHtml(getNodeLabel(value))}</span>`;
    }

    if (Array.isArray(value)) {
      const preview = value.slice(0, 5).map((item) => renderInlineValue(item)).join(", ");
      return `<span class="ra-object-type">Array(${value.length})</span> [${preview}${value.length > 5 ? ", …" : ""}]`;
    }

    if (value instanceof Map) return `<span class="ra-object-type">Map(${value.size})</span>`;
    if (value instanceof Set) return `<span class="ra-object-type">Set(${value.size})</span>`;
    if (typeof value === "function") return `<span class="ra-object-type">${escapeHtml(getNodeLabel(value))}</span>`;

    const keys = Reflect.ownKeys(value).slice(0, 4);
    const body = keys
      .map((key) => {
        const item = safeCall(() => value[key], "[Throws]");
        return `<span class="ra-key">${escapeHtml(String(key))}</span>: ${renderInlineValue(item)}`;
      })
      .join(", ");

    return `<span class="ra-object-type">${escapeHtml(getNodeLabel(value))}</span> {${body}${Reflect.ownKeys(value).length > 4 ? ", …" : ""}}`;
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

  function getCodeLanguage(value) {
    if (value instanceof HTMLStyleElement) return "css";
    if (value instanceof HTMLScriptElement) return "javascript";
    if (value instanceof HTMLTemplateElement) return "xml";
    if (value instanceof Element) return "xml";
    if (typeof value === "function") return "javascript";
    return "javascript";
  }

  function highlightCode(value, language = "javascript") {
    const code = String(value);

    if (window.hljs?.highlight) {
      try {
        return window.hljs.highlight(code, { language }).value;
      } catch (e) {
      console.error("Failed to highlight code", e)
        /* Use fallback below. */
      }
    }

    return escapeHtml(code)
      .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, '<span class="ra-string">$1</span>')
      .replace(/\b(true|false|null|undefined|NaN|Infinity)\b/g, '<span class="ra-bool">$1</span>')
      .replace(/\b(-?\d+(?:\.\d+)?n?)\b/g, '<span class="ra-number">$1</span>')
      .replace(/^(\s*)([A-Za-z_$][\w$-]*)(:)/gm, '$1<span class="ra-key">$2</span>$3');
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
      return Array.from(value.values()).map((item, index) => ({
        label: String(index),
        value: item,
        path: `${basePath}.<set>[${index}]`,
      }));
    }

    if (value instanceof Window) {
      return Object.getOwnPropertyNames(value)
        .slice(0, MAX_TREE_ITEMS)
        .map((key) => ({
          label: key,
          value: safeCall(() => value[key], "[Throws]"),
          path: `${basePath}.${key}`,
        }));
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

    return Reflect.ownKeys(value).slice(0, MAX_TREE_ITEMS).map((key) => ({
      label: String(key),
      value: safeCall(() => value[key], "[Throws]"),
      path: /^[A-Za-z_$][\w$]*$/.test(String(key)) ? `${basePath}.${String(key)}` : `${basePath}[${JSON.stringify(String(key))}]`,
    }));
  }

  /* ==========================================================================
   * Console Parser
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
        const rawValue = rule.slice(separator + 1).trim();

        if (!allowed.has(property)) return "";
        if (/url\s*\(|expression\s*\(|javascript:/i.test(rawValue)) return "";

        return `${property}:${rawValue}`;
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

        if (isObjectLike(value)) {
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
    const matcher = /%([%csdiffoO])/g;

    let argIndex = 0;
    let activeStyle = "";
    let lastIndex = 0;
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
        const value = args[argIndex++];

        if (token === "c") {
          activeStyle = sanitizeConsoleStyle(value);
        } else if (token === "o" || token === "O") {
          parts.push(renderInlineValue(value));
          rawParts.push(stringifyPreview(value));

          if (isObjectLike(value)) {
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

      if (isObjectLike(value)) {
        inspectValues.push(value);
      }
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
    return style ? `<span style="${escapeHtml(style)}">${escaped}</span>` : escaped;
  }

  function renderInlineValue(value) {
    if (typeof value === "string") return escapeHtml(value);

    if (!isObjectLike(value)) {
      return `<span class="ra-primitive">${escapeHtml(getNodeLabel(value))}</span>`;
    }

    return `<span class="ra-inline-object">${getObjectPreview(value)}</span>`;
  }

  function stringifyPreview(value) {
    if (typeof value === "string") return value;
    return getNodeLabel(value);
  }

  /* ==========================================================================
   * Grouping
   * ========================================================================== */

  function makeStableKey(value) {
    if (!isObjectLike(value)) return `${typeof value}:${String(value)}`;

    if (value instanceof EventTarget) return getNodeLabel(value);

    return safeCall(() => {
      const keys = Reflect.ownKeys(value).slice(0, 8).join(",");
      return `${getNodeLabel(value)}:${keys}`;
    }, getNodeLabel(value));
  }

  function makeLogKey(kind, display) {
    return `${kind}:${display.raw}:${display.rest.map(makeStableKey).join("|")}`;
  }

  function pushGroupedRecord(collection, record) {
    const previous = collection[0];

    if (previous && previous.groupKey === record.groupKey) {
      previous.count += 1;
      previous.time = record.time;
      previous.values = record.values;
      previous.display = record.display || previous.display;
      previous.preview = record.preview || previous.preview;
      scheduleRender();
      return previous;
    }

    collection.unshift(record);

    if (collection.length > MAX_RECORDS) {
      collection.length = MAX_RECORDS;
    }

    scheduleRender();
    return record;
  }

  /* ==========================================================================
   * Icons
   * ========================================================================== */

  function icon(name) {
    return `<i data-lucide="${escapeHtml(name)}" class="ra-icon" aria-hidden="true"></i>`;
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
        --ra-bg: rgb(7 8 10 / 0.76);
        --ra-panel: rgb(12 13 15 / 0.90);
        --ra-panel-2: rgb(18 19 22 / 0.92);
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
        width: min(var(--ra-w, 500px), calc(100vw - 18px));
        height: min(var(--ra-h, calc(100vh - 24px)), calc(100vh - 24px));
        z-index: calc(var(--ra-z) + 1);
        pointer-events: auto;
        display: none;
        grid-template-rows: auto auto auto 1fr;
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

      .ra-actions,
      .ra-toolbar,
      .ra-tabs,
      .ra-filters {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      .ra-button,
      .ra-tab {
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
        font: 800 11px / 1 var(--ra-font-ui);
      }

      .ra-tab.ra-active {
        background: rgb(255 255 255 / 0.14);
        color: var(--ra-strong);
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

      .ra-tabs {
        justify-content: space-between;
        padding: 7px 8px;
        border-bottom: 1px solid var(--ra-border);
        background: rgb(255 255 255 / 0.018);
      }

      .ra-filters {
        min-width: 0;
      }

      .ra-select {
        width: 116px;
        height: 31px;
        border: 1px solid var(--ra-border);
        border-radius: var(--ra-radius-pill);
        padding: 0 10px;
        background: rgb(0 0 0 / 0.32);
        color: var(--ra-text);
        font: 750 11px / 1 var(--ra-font-ui);
      }

      .ra-main {
        min-height: 0;
        overflow: auto;
        padding: 8px;
        contain: content;
      }

      .ra-card {
        display: grid;
        gap: 8px;
        margin-bottom: 8px;
        overflow: hidden;
        border: 1px solid var(--ra-border);
        border-left: 3px solid transparent;
        border-radius: var(--ra-radius-md);
        background: rgb(255 255 255 / 0.028);
      }

      .ra-kind-warn {
        border-left-color: var(--ra-warning-border);
        background:
          linear-gradient(90deg, var(--ra-warning-bg), transparent 42%),
          rgb(255 255 255 / 0.025);
      }

      .ra-kind-error {
        border-left-color: var(--ra-error-border);
        background:
          linear-gradient(90deg, var(--ra-error-bg), transparent 42%),
          rgb(255 255 255 / 0.025);
      }

      .ra-card-head {
        display: grid;
        gap: 7px;
        padding: 10px 11px;
      }

      .ra-card-head.ra-has-body {
        padding-bottom: 0;
      }

      .ra-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: var(--ra-muted);
        font-size: 10px;
        font-weight: 850;
        min-width: 0;
      }

      .ra-kind {
        min-width: 0;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--ra-cyan);
        text-transform: uppercase;
        letter-spacing: 0.07em;
      }

      .ra-kind-warn .ra-kind {
        color: var(--ra-warning-text);
      }

      .ra-kind-error .ra-kind {
        color: var(--ra-error-text);
      }

      .ra-count {
        min-width: 22px;
        height: 20px;
        display: inline-grid;
        place-items: center;
        border-radius: 999px;
        background: rgb(255 255 255 / 0.11);
        color: var(--ra-strong);
        font: 900 10px / 1 var(--ra-font-ui);
      }

      .ra-time {
        flex: 0 0 auto;
        color: var(--ra-faint);
      }

      .ra-message {
        color: var(--ra-strong);
        font: 430 12px / 1.45 var(--ra-font-mono);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .ra-inline-object {
        color: var(--ra-cyan);
        font-weight: 700;
      }

      .ra-object-type {
        color: var(--ra-muted);
      }

      .ra-primitive {
        color: var(--ra-text);
      }

      .ra-card-body {
        display: grid;
        gap: 7px;
        padding: 0 11px 10px;
      }

      .ra-source-button {
        width: max-content;
        min-height: 28px;
        border: 1px solid var(--ra-border);
        border-radius: 999px;
        padding: 0 10px;
        background: rgb(255 255 255 / 0.055);
        color: var(--ra-text);
        font: 800 11px / 1 var(--ra-font-ui);
      }

      .ra-code-block {
        overflow: hidden;
        border: 1px solid var(--ra-border);
        border-radius: var(--ra-radius-md);
        background: rgb(0 0 0 / 0.18);
      }

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

      .ra-code-block summary::-webkit-details-marker {
        display: none;
      }

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
        font: 300 12px / 1.45 var(--ra-font-mono);
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

      .ra-element {
        color: var(--ra-cyan);
        text-decoration: underline;
        text-decoration-color: rgb(255 255 255 / 0.35);
        text-underline-offset: 3px;
        cursor: pointer;
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

      .ra-modal-root {
        position: fixed;
        inset: 0;
        z-index: calc(var(--ra-z) + 20);
        display: grid;
        place-items: end center;
        pointer-events: auto;
        background: rgb(0 0 0 / 0.48);
        backdrop-filter: blur(10px);
      }

      .ra-modal {
        width: min(960px, calc(100vw - 14px));
        height: min(78vh, 760px);
        display: grid;
        grid-template-rows: auto 1fr;
        overflow: hidden;
        border: 1px solid var(--ra-border-strong);
        border-radius: 22px 22px 0 0;
        background: rgb(8 9 11 / 0.96);
        box-shadow: var(--ra-shadow);
      }

      .ra-modal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px;
        border-bottom: 1px solid var(--ra-border);
      }

      .ra-modal-title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--ra-strong);
        font: 850 12px / 1.2 var(--ra-font-ui);
      }

      .ra-modal-code {
        min-height: 0;
        overflow: auto;
        margin: 0;
        padding: 12px;
        font: 12px / 1.45 var(--ra-font-mono);
        white-space: pre;
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

        .ra-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        .ra-filters {
          grid-column: 1 / -1;
        }

        .ra-select {
          width: 100%;
        }

        .ra-main {
          padding: 7px;
        }

        .ra-card {
          border-radius: 14px;
        }

        .ra-message {
          font-size: 12px;
        }

        .ra-resize {
          display: none;
        }
      }
    `;

    document.documentElement.appendChild(style);
  }

  /* ==========================================================================
   * Root
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

    root.innerHTML = raw`
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
          <input class="ra-search" type="search" placeholder="Filter..." autocomplete="off" />
        </div>

        <div class="ra-tabs">
          <button class="ra-tab" type="button" data-tab="logs">${icon("terminal")}Logs</button>
          <button class="ra-tab" type="button" data-tab="events">${icon("radio")}Eventos</button>
          <div class="ra-filters">
            <select class="ra-select" data-filter="logs">
              <option value="all">All logs</option>
              <option value="log">Log</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
              <option value="debug">Debug</option>
              <option value="alerta">Alerta</option>
              <option value="alert">Alert</option>
            </select>
            <select class="ra-select" data-filter="events">
              <option value="all">All events</option>
              <option value="add">Add listener</option>
              <option value="remove">Remove listener</option>
              <option value="fire">Fired</option>
              <option value="error">Errors</option>
              <option value="network">Network</option>
            </select>
          </div>
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

    dock.addEventListener("click", (event) => {
      if (dockDragging) return;
      event.preventDefault();
      openInspector();
    });

    panel.addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.action;
      const tab = event.target.closest("[data-tab]")?.dataset.tab;
      const sourceButton = event.target.closest("[data-source-id]");

      if (tab) {
        state.tab = tab;
        saveState();
        scheduleRender();
      }

      if (sourceButton) {
        const id = Number(sourceButton.dataset.sourceId);
        const record = logs.find((item) => item.id === id);
        const value = record?.display.rest[Number(sourceButton.dataset.sourceIndex || 0)];

        if (value) openSourceModal(value);
      }

      if (action === "dock") dockPanel();
      if (action === "copy") copyVisible();
      if (action === "clear") clearCurrent();
      if (action === "minimize") minimizeInspector();

      if (action === "load-more") {
        state.visibleLimit = (state.visibleLimit || MAX_VISIBLE_ROWS) + MAX_VISIBLE_ROWS;
        scheduleRender();
      }
    });

    panel.addEventListener("change", (event) => {
      const filter = event.target.closest("[data-filter]");

      if (!filter) return;

      if (filter.dataset.filter === "logs") {
        state.logKind = filter.value;
      }

      if (filter.dataset.filter === "events") {
        state.eventKind = filter.value;
      }

      saveState();
      scheduleRender();
    });

    search.addEventListener("input", () => {
      window.clearTimeout(searchTimer);

      searchTimer = window.setTimeout(() => {
        state.query = search.value;
        saveState();
        scheduleRender();
      }, SEARCH_DEBOUNCE_MS);
    });

    bindDockDrag(dock);
    bindDrag(panel, header);
    bindResize(panel, resize);
  }

  /* ==========================================================================
   * UI
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

    getRoot().querySelector(".ra-dock").classList.remove("ra-has-new-log");
    renderInspector();
    unlockZoom = lockZoom()
  }

  function minimizeInspector() {
    state.open = false;
    state.docked = true;
    saveState();
    renderInspector();
    unlockZoom();
    unlockZoom = null;
  }

  function dockPanel() {
    state.docked = true;
    state.open = true;
    saveState();
    renderInspector();
  }

  function clearCurrent() {
    if (state.tab === "events") events.length = 0;
    else logs.length = 0;

    scheduleRender();
  }

  function copyVisible() {
    const records = state.tab === "events" ? getVisibleEvents() : getVisibleLogs();
    copyText(records.map((record) => `[${record.time}] ${record.kind || record.type}: ${record.preview || record.message}`).join("\n"));
  }

  function renderInspector() {
    const host = getRoot();
    const panel = host.querySelector(".ra-panel");
    const dock = host.querySelector(".ra-dock");
    const dockCount = host.querySelector(".ra-dock-count");
    const search = host.querySelector(".ra-search");
    const logFilter = host.querySelector('[data-filter="logs"]');
    const eventFilter = host.querySelector('[data-filter="events"]');

    dockCount.textContent = String(logs.length + events.length);
    dock.style.setProperty("--ra-dock-y", `${state.dockY}px`);

    panel.classList.toggle("ra-open", state.open);
    panel.classList.toggle("ra-floating", !state.docked);
    panel.style.setProperty("--ra-w", `${state.width}px`);
    panel.style.setProperty("--ra-h", `${state.height}px`);
    panel.style.setProperty("--ra-x", `${state.x}px`);
    panel.style.setProperty("--ra-y", `${state.y}px`);

    search.value = state.query || "";
    logFilter.value = state.logKind || "all";
    eventFilter.value = state.eventKind || "all";

    host.querySelectorAll(".ra-tab").forEach((button) => {
      button.classList.toggle("ra-active", button.dataset.tab === state.tab);
    });

    renderMain(host.querySelector(".ra-main"));
    refreshIcons();
  }

  function renderMain(main) {
    const records = state.tab === "events" ? getVisibleEvents() : getVisibleLogs();
    const visibleLimit = state.visibleLimit || MAX_VISIBLE_ROWS;
    const visible = records.slice(0, visibleLimit);

    main.innerHTML = "";

    if (!visible.length) {
      main.innerHTML = `<div class="ra-empty">${icon("moon")}<div>No ${state.tab} yet.</div></div>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const record of visible) {
      fragment.appendChild(state.tab === "events" ? createEventCard(record) : createLogCard(record));
    }

    if (records.length > visible.length) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ra-load-more";
      button.dataset.action = "load-more";
      button.textContent = `Load ${Math.min(MAX_VISIBLE_ROWS, records.length - visible.length)} more`;
      fragment.appendChild(button);
    }

    main.appendChild(fragment);
  }

  function getVisibleLogs() {
    const query = String(state.query || "").trim().toLowerCase();
    const kind = state.logKind || "all";

    return logs.filter((record) => {
      if (kind !== "all" && record.kind !== kind) return false;
      if (!query) return true;

      return (
        record.preview.toLowerCase().includes(query) ||
        record.kind.toLowerCase().includes(query) ||
        record.display.raw.toLowerCase().includes(query)
      );
    });
  }

  function getVisibleEvents() {
    const query = String(state.query || "").trim().toLowerCase();
    const kind = state.eventKind || "all";

    return events.filter((record) => {
      if (kind !== "all" && record.kind !== kind) return false;
      if (!query) return true;

      return (
        record.preview.toLowerCase().includes(query) ||
        record.kind.toLowerCase().includes(query) ||
        record.type.toLowerCase().includes(query) ||
        record.target.toLowerCase().includes(query)
      );
    });
  }

  function createLogCard(record) {
    const card = document.createElement("article");
    card.className = `ra-card ra-kind-${record.kind}`;

    const body = document.createElement("div");
    body.className = "ra-card-body";

    for (let index = 0; index < record.display.rest.length; index += 1) {
      const value = record.display.rest[index];
      body.appendChild(createNodeView(value, `$[${index}]`, new WeakSet(), record.display.rest.length > 1 ? String(index) : "", false));

      if (isDomLike(value) || typeof value === "function") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ra-source-button";
        button.dataset.sourceId = String(record.id);
        button.dataset.sourceIndex = String(index);
        button.innerHTML = `${icon("code-2")} Open pretty source`;
        body.appendChild(button);
      }
    }

    card.innerHTML = raw`
      <div class="ra-card-head ${record.display.rest.length ? "ra-has-body" : ""}">
        <span class="ra-meta">
          <span class="ra-kind">${icon(kindToIcon(record.kind))}<span>${escapeHtml(record.kind)}</span>${record.count > 1 ? `<span class="ra-count">${record.count}</span>` : ""}</span>
          <span class="ra-time">${escapeHtml(record.time)}</span>
        </span>
        <div class="ra-message">${record.display.html}</div>
      </div>
    `;

    if (record.display.rest.length) card.appendChild(body);
    return card;
  }

  function createEventCard(record) {
    const card = document.createElement("article");
    card.className = `ra-card ${record.kind === "error" ? "ra-kind-error" : ""}`;

    card.innerHTML = raw`
      <div class="ra-card-head">
        <span class="ra-meta">
          <span class="ra-kind">${icon(eventKindToIcon(record.kind))}<span>${escapeHtml(record.type)}</span>${record.count > 1 ? `<span class="ra-count">${record.count}</span>` : ""}</span>
          <span class="ra-time">${escapeHtml(record.time)}</span>
        </span>
        <div class="ra-message">
          <span class="ra-key">${escapeHtml(record.action)}</span>
          <span class="ra-muted"> ${escapeHtml(record.target)}</span>
          ${record.detail ? `<br><span class="ra-muted">${escapeHtml(record.detail)}</span>` : ""}
        </div>
      </div>
    `;

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

  function eventKindToIcon(kind) {
    if (kind === "remove") return "unlink";
    if (kind === "fire") return "zap";
    if (kind === "network") return "wifi";
    if (kind === "error") return "circle-alert";
    return "radio";
  }

  function createNodeView(value, path = "$", seen = new WeakSet(), keyName = "", autoOpen = false) {
    const wrapper = document.createElement("div");
    wrapper.className = "ra-node";
    wrapper.dataset.path = path;

    if (!isObjectLike(value)) {
      const leaf = document.createElement("div");
      leaf.className = "ra-leaf";
      leaf.textContent = `${keyName ? `${keyName}: ` : ""}${getNodeLabel(value)}`;
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
    summary.innerHTML = raw`
      ${icon("chevron-down").replace("ra-icon", "ra-icon ra-chevron")}
      <span>${keyName ? `<span class="ra-key">${escapeHtml(keyName)}</span>: ` : ""}${getObjectPreview(value)}</span>
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
   * Modal
   * ========================================================================== */

  function openSourceModal(value) {
    closeSourceModal();

    const source = getRichCode(value) || formatValue(value);
    const language = getCodeLanguage(value);
    const modalRoot = document.createElement("div");
    modalRoot.className = "ra-modal-root";

    modalRoot.innerHTML = raw`
      <section class="ra-modal" role="dialog" aria-label="Source viewer">
        <header class="ra-modal-head">
          <div class="ra-modal-title">${icon("code-2")} ${escapeHtml(getNodeLabel(value))}</div>
          <div class="ra-actions">
            <button class="ra-button" type="button" data-modal-action="copy">${icon("copy")}<span>Copy</span></button>
            <button class="ra-button" type="button" data-modal-action="close">${icon("x")}<span>Close</span></button>
          </div>
        </header>
        <pre class="ra-modal-code"><code>${highlightCode(source, language)}</code></pre>
      </section>
    `;

    modalRoot.addEventListener("click", (event) => {
      const action = event.target.closest("[data-modal-action]")?.dataset.modalAction;

      if (event.target === modalRoot || action === "close") closeSourceModal();
      if (action === "copy") copyText(source);
    });

    getRoot().appendChild(modalRoot);
    tryMountCodeMirror(modalRoot, source, language);
    refreshIcons();
  }

  function closeSourceModal() {
    getRoot()?.querySelectorAll(".ra-modal-root").forEach((node) => node.remove());
  }

  function tryMountCodeMirror(modalRoot, source) {
    const container = modalRoot.querySelector(".ra-modal-code");

    const maybeEditorView =
      window.EditorView ||
      window.CodeMirror?.EditorView ||
      window.RodCDN?.EditorView ||
      window.RodCDN?.CodeMirror?.EditorView;

    if (!maybeEditorView) return;

    try {
      container.textContent = "";

      new maybeEditorView({
        doc: source,
        parent: container,
      });
    } catch (e) {
     console.error("[tryMountCodeMirror] Codemirror not found", e)
      container.innerHTML = `<code>${highlightCode(source)}</code>`;
    }
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
    });
  }

  function openMenu(event, value, path) {
    removeMenu();

    const menu = document.createElement("div");
    menu.className = "ra-menu";
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 210)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 190)}px`;

    menu.innerHTML = html`
      <button type="button" data-action="copy-path">${icon("route")}Copy path</button>
      <button type="button" data-action="copy-value">${icon("copy")}Copy value</button>
      <button type="button" data-action="copy-json">${icon("braces")}Copy JSON</button>
      <button type="button" data-action="source">${icon("code-2")}Open source</button>
      <button type="button" data-action="inspect">${icon("search-code")}Inspect again</button>
    `;

    menu.addEventListener("click", (menuEvent) => {
      const action = menuEvent.target.closest("button")?.dataset.action;

      if (action === "copy-path") copyText(path);
      if (action === "copy-value") copyText(formatValue(value));
      if (action === "copy-json") copyText(safeCall(() => JSON.stringify(value, null, 2), formatValue(value)));
      if (action === "source") openSourceModal(value);
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
   * Event Interceptors
   * ========================================================================== */

  function describeTarget(target) {
    if (target === window) return "window";
    if (target === document) return "document";
    if (target instanceof Element) return formatElement(target);
    if (target instanceof Node) return `Node ${target.nodeName}`;
    return getNodeLabel(target);
  }

  function pushEventRecord(record) {
    const finalRecord = {
      id: nextId++,
      time: new Date().toLocaleTimeString(),
      count: 1,
      preview: `${record.action} ${record.type} ${record.target}`,
      groupKey: `${record.kind}:${record.action}:${record.type}:${record.target}`,
      ...record,
    };

    pushGroupedRecord(events, finalRecord);

    if (!state.open) pulseDock();
  }

  function interceptEventListeners() {
    const proto = window.EventTarget?.prototype;

    if (!proto || proto[PATCHED]) return;

    Object.defineProperty(proto, PATCHED, {
      value: true,
      configurable: false,
    });

    const originalAdd = proto.addEventListener;
    const originalRemove = proto.removeEventListener;

    proto.addEventListener = function interceptedAddEventListener(type, listener, options) {
      if (listener && !String(type).startsWith("ra-")) {
        let records = listenerStore.get(this);

        if (!records) {
          records = [];
          listenerStore.set(this, records);
        }

        const meta = {
          type,
          listener,
          options,
          target: describeTarget(this),
          addedAt: Date.now(),
        };

        records.push(meta);

        if (typeof listener === "function" && !listener[EVENT_META]) {
          try {
            Object.defineProperty(listener, EVENT_META, {
              value: meta,
              configurable: true,
            });
          } catch {
            /* Some functions are not extensible. */
          }
        }

        pushEventRecord({
          kind: "add",
          action: "addEventListener",
          type: String(type),
          target: meta.target,
          detail: formatListenerOptions(options),
          meta: meta
        });
      }

      return originalAdd.apply(this, arguments);
    };

    proto.removeEventListener = function interceptedRemoveEventListener(type, listener, options) {
      pushEventRecord({
        kind: "remove",
        action: "removeEventListener",
        type: String(type),
        target: describeTarget(this),
        detail: formatListenerOptions(options),
      });

      return originalRemove.apply(this, arguments);
    };
  }

  function formatListenerOptions(options) {
    if (options === undefined) return "";
    if (typeof options === "boolean") return `capture: ${options}`;
    return safeCall(() => JSON.stringify(options), String(options));
  }

  function interceptErrors() {
    window.addEventListener(
      "error",
      (event) => {
        pushEventRecord({
          kind: "error",
          action: "error",
          type: "error",
          target: event.filename || "window",
          detail: `${event.message || ""}:${event.lineno || 0}:${event.colno || 0}`,
        });
      },
      true,
    );

    window.addEventListener(
      "unhandledrejection",
      (event) => {
        pushEventRecord({
          kind: "error",
          action: "unhandledrejection",
          type: "promise",
          target: "window",
          detail: stringifyPreview(event.reason),
        });
      },
      true,
    );
  }

  function interceptNetwork() {
    if (window.fetch && !window.fetch[PATCHED]) {
      const originalFetch = window.fetch;

      const wrappedFetch = async function interceptedFetch(input, init) {
        const startedAt = performance.now();
        const url = typeof input === "string" ? input : input?.url;
        const method = init?.method || input?.method || "GET";

        try {
          const response = await originalFetch.apply(this, arguments);

          pushEventRecord({
            kind: "network",
            action: "fetch",
            type: method,
            target: String(url || ""),
            detail: `${response.status} ${Math.round(performance.now() - startedAt)}ms`,
          });

          return response;
        } catch (error) {
          pushEventRecord({
            kind: "error",
            action: "fetch",
            type: method,
            target: String(url || ""),
            detail: stringifyPreview(error),
          });

          throw error;
        }
      };

      Object.defineProperty(wrappedFetch, PATCHED, { value: true });
      window.fetch = wrappedFetch;
    }

    patchXhr();
  }

  function patchXhr() {
    const proto = window.XMLHttpRequest?.prototype;

    if (!proto || proto[PATCHED]) return;

    Object.defineProperty(proto, PATCHED, {
      value: true,
      configurable: false,
    });

    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function interceptedXhrOpen(method, url) {
      this.__rodInspectorRequest = {
        method,
        url,
        startedAt: 0,
      };

      return originalOpen.apply(this, arguments);
    };

    proto.send = function interceptedXhrSend() {
      const request = this.__rodInspectorRequest;

      if (request) {
        request.startedAt = performance.now();

        this.addEventListener("loadend", () => {
          pushEventRecord({
            kind: "network",
            action: "xhr",
            type: String(request.method || "GET"),
            target: String(request.url || ""),
            detail: `${this.status} ${Math.round(performance.now() - request.startedAt)}ms`,
          });
        });
      }

      return originalSend.apply(this, arguments);
    };
  }
  
  
    function lockZoom() {
    let cleanup = () => {};

    whenHeadReady(() => {
      let lastTouchEnd = 0;

      const viewport = getOrCreateViewportMeta();
      const previousViewportContent = viewport.element.getAttribute("content");

      const style = getOrCreateZoomStyle();
      const previousStyleText = style.textContent;

      viewport.element.setAttribute("content", VIEWPORT_CONTENT);

      style.textContent = `
        html,
        body,
        input,
        textarea,
        select,
        button {
          -webkit-text-size-adjust: 100% !important;
          text-size-adjust: 100% !important;
          touch-action: manipulation !important;
        }

        input,
        textarea,
        select {
          font-size: max(16px, 1em) !important;
        }

        * {
          -webkit-tap-highlight-color: transparent !important;
        }
      `;

      /**
       * Blocks an event aggressively.
       *
       * @param {Event} event Event to block.
       * @returns {void}
       */
      function block(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      /**
       * Blocks multi-touch gestures.
       *
       * @param {TouchEvent} event Touch event.
       * @returns {void}
       */
      function blockMultiTouch(event) {
        if (event.touches && event.touches.length > 1) {
          block(event);
        }
      }

      /**
       * Blocks double-tap zoom.
       *
       * @param {TouchEvent} event Touch event.
       * @returns {void}
       */
      function blockDoubleTap(event) {
        const now = Date.now();

        if (now - lastTouchEnd <= 350) {
          block(event);
        }

        lastTouchEnd = now;
      }

      /**
       * Blocks keyboard, wheel, or trackpad zoom shortcuts where available.
       *
       * @param {KeyboardEvent | WheelEvent} event Event.
       * @returns {void}
       */
      function blockShortcutZoom(event) {
        const isKeyboardEvent = "key" in event;
        const isZoomKey =
          isKeyboardEvent &&
          (event.key === "+" ||
            event.key === "-" ||
            event.key === "=" ||
            event.key === "0");

        if ((event.ctrlKey || event.metaKey) && isZoomKey) {
          block(event);
        }
      }

      const blockingOptions = {
        passive: false,
        capture: true,
      };

      document.addEventListener("gesturestart", block, blockingOptions);
      document.addEventListener("gesturechange", block, blockingOptions);
      document.addEventListener("gestureend", block, blockingOptions);
      document.addEventListener("touchstart", blockMultiTouch, blockingOptions);
      document.addEventListener("touchmove", blockMultiTouch, blockingOptions);
      document.addEventListener("touchend", blockDoubleTap, blockingOptions);
      document.addEventListener("wheel", blockShortcutZoom, blockingOptions);
      document.addEventListener("keydown", blockShortcutZoom, blockingOptions);

      cleanup = function unlockSafariZoom() {
        document.removeEventListener("gesturestart", block, blockingOptions);
        document.removeEventListener("gesturechange", block, blockingOptions);
        document.removeEventListener("gestureend", block, blockingOptions);
        document.removeEventListener("touchstart", blockMultiTouch, blockingOptions);
        document.removeEventListener("touchmove", blockMultiTouch, blockingOptions);
        document.removeEventListener("touchend", blockDoubleTap, blockingOptions);
        document.removeEventListener("wheel", blockShortcutZoom, blockingOptions);
        document.removeEventListener("keydown", blockShortcutZoom, blockingOptions);

        if (viewport.created) {
          viewport.element.remove();
        } else if (previousViewportContent == null) {
          viewport.element.removeAttribute("content");
        } else {
          viewport.element.setAttribute("content", previousViewportContent);
        }

        style.textContent = previousStyleText || "";
      };
    });

    return function unlockZoomWhenReady() {
      cleanup();
    };
  }

  /* ==========================================================================
   * Public API
   * ========================================================================== */

  function addInspectorLog(kind, ...values) {
    getRoot();

    const display = parseConsoleValues(values);
    const record = {
      id: nextId++,
      kind,
      values,
      display,
      time: new Date().toLocaleTimeString(),
      preview: display.raw || values.map((value) => stringifyPreview(value)).join(" "),
      groupTitle: kind,
      groupKey: makeLogKey(kind, display),
      count: 1,
    };

    pushGroupedRecord(logs, record);

    if (!state.open) pulseDock();

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
    logs.length = 0;
    events.length = 0;
    scheduleRender();
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
  window.inspectorHtml = formatHtml;
  window.inspectorCss = formatCss;

  window.alert = function patchedAlert(value) {
    addInspectorLog("alert", value);
  };

  window.console.log = function patchedConsoleLog(...values) {
    nativeConsole.log(...values);
    addInspectorLog("log", ...values);
  };

  window.console.info = function patchedConsoleInfo(...values) {
    nativeConsole.info(...values);
    addInspectorLog("info", ...values);
  };

  window.console.warn = function patchedConsoleWarn(...values) {
    nativeConsole.warn(...values);
    addInspectorLog("warn", ...values);
  };

  window.console.error = function patchedConsoleError(...values) {
    nativeConsole.error(...values);
    addInspectorLog("error", ...values);
  };

  window.console.debug = function patchedConsoleDebug(...values) {
    nativeConsole.debug(...values);
    addInspectorLog("debug", ...values);
  };

  window.console.trace = function patchedConsoleTrace(...values) {
    nativeConsole.trace?.(...values);
    addInspectorLog("debug", "trace", ...values);
  };

  //interceptEventListeners();
  interceptErrors();
  interceptNetwork();

  if (document.documentElement) {
    getRoot();
  } else {
    window.addEventListener("DOMContentLoaded", getRoot, { once: true });
  }
})();