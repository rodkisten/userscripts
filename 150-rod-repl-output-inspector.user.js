// ==UserScript==
// @name         Rod / DevTools / REPL Output Inspector
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Expandable DevTools-like object inspector for REPL outputs and DOM nodes.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @weight       830
// @grant        none
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// ==/UserScript==

(() => {
  "use strict";

  const STYLE_ID = "rod-repl-devtools-output-style";
  const PANEL_ID = "rod-repl-devtools-output-demo";
  const LONG_PRESS_MS = 520;
  const MAX_PREVIEW_LENGTH = 90;
  const MAX_CHILDREN = 300;

  const objectIds = new WeakMap();
  let nextObjectId = 1;
  let activeMenu = null;
  let highlightBox = null;

  /**
   * Gets a stable display id for objects.
   *
   * @param {object} value
   * @returns {number}
   */
  function getObjectId(value) {
    if (!objectIds.has(value)) {
      objectIds.set(value, nextObjectId);
      nextObjectId += 1;
    }

    return objectIds.get(value);
  }

  /**
   * Checks whether a value can be expanded.
   *
   * @param {unknown} value
   * @returns {boolean}
   */
  function isExpandable(value) {
    if (value === null) return false;

    const type = typeof value;

    return type === "object" || type === "function";
  }

  /**
   * Escapes text for safe HTML display.
   *
   * @param {unknown} value
   * @returns {string}
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
   * Creates an element with optional class and text.
   *
   * @param {string} tag
   * @param {string} className
   * @param {string} text
   * @returns {HTMLElement}
   */
  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text) node.textContent = text;

    return node;
  }

  /**
   * Injects the inspector styles once.
   *
   * @returns {void}
   */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");

    style.id = STYLE_ID;
    style.textContent = `
      .rod-output {
        color: #d4d4d8 !important;
        background: #09090b !important;
        font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
        padding: 8px !important;
        overflow: auto !important;
        -webkit-overflow-scrolling: touch !important;
        user-select: text !important;
      }

      .rod-row {
        display: block !important;
        min-height: 18px !important;
        white-space: nowrap !important;
      }

      .rod-line {
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
        min-height: 18px !important;
        max-width: 100% !important;
      }

      .rod-toggle {
        width: 12px !important;
        min-width: 12px !important;
        opacity: 0.8 !important;
        cursor: pointer !important;
        color: #a1a1aa !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }

      .rod-toggle-empty {
        opacity: 0.25 !important;
      }

      .rod-key {
        color: #9cdcfe !important;
      }

      .rod-string {
        color: #ce9178 !important;
      }

      .rod-number {
        color: #b5cea8 !important;
      }

      .rod-boolean {
        color: #569cd6 !important;
      }

      .rod-null,
      .rod-undefined {
        color: #808080 !important;
      }

      .rod-symbol {
        color: #c586c0 !important;
      }

      .rod-function {
        color: #dcdcaa !important;
      }

      .rod-dom {
        color: #4ec9b0 !important;
        cursor: pointer !important;
      }

      .rod-muted {
        color: #71717a !important;
      }

      .rod-error {
        color: #f87171 !important;
      }

      .rod-children {
        display: none !important;
        margin-left: 16px !important;
        border-left: 1px solid rgba(255,255,255,0.08) !important;
        padding-left: 6px !important;
      }

      .rod-expanded > .rod-children {
        display: block !important;
      }

      .rod-menu {
        position: fixed !important;
        z-index: 2147483647 !important;
        min-width: 190px !important;
        padding: 6px !important;
        border: 1px solid rgba(255,255,255,0.12) !important;
        border-radius: 12px !important;
        background: rgba(24,24,27,0.96) !important;
        color: #fafafa !important;
        font: 12px/1.3 -apple-system, BlinkMacSystemFont, system-ui, sans-serif !important;
        box-shadow: 0 18px 60px rgba(0,0,0,0.45) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
      }

      .rod-menu button {
        display: block !important;
        width: 100% !important;
        border: 0 !important;
        border-radius: 8px !important;
        background: transparent !important;
        color: inherit !important;
        padding: 9px 10px !important;
        text-align: left !important;
        font: inherit !important;
      }

      .rod-menu button:active {
        background: rgba(255,255,255,0.12) !important;
      }

      .rod-highlight {
        position: fixed !important;
        z-index: 2147483646 !important;
        pointer-events: none !important;
        border: 2px solid #38bdf8 !important;
        background: rgba(56,189,248,0.16) !important;
        border-radius: 6px !important;
        box-shadow: 0 0 0 99999px rgba(0,0,0,0.12) !important;
      }

      #${PANEL_ID} {
        position: fixed !important;
        left: 8px !important;
        right: 8px !important;
        bottom: 8px !important;
        height: 38vh !important;
        z-index: 2147483645 !important;
        border: 1px solid rgba(255,255,255,0.14) !important;
        border-radius: 16px !important;
        overflow: hidden !important;
        box-shadow: 0 20px 80px rgba(0,0,0,0.5) !important;
      }
    `;

    document.documentElement.appendChild(style);
  }

  /**
   * Creates a compact preview for any value.
   *
   * @param {unknown} value
   * @returns {HTMLElement}
   */
  function createPreview(value) {
    if (value instanceof Element) return createDomPreview(value);
    if (value instanceof Text) return span("rod-dom", `#text "${trim(value.textContent || "")}"`);
    if (value instanceof Comment) return span("rod-dom", `<!--${trim(value.textContent || "")}-->`);
    if (value instanceof Error) return span("rod-error", `${value.name}: ${value.message}`);
    if (typeof value === "string") return span("rod-string", `"${trim(value)}"`);
    if (typeof value === "number" || typeof value === "bigint") return span("rod-number", String(value));
    if (typeof value === "boolean") return span("rod-boolean", String(value));
    if (typeof value === "undefined") return span("rod-undefined", "undefined");
    if (value === null) return span("rod-null", "null");
    if (typeof value === "symbol") return span("rod-symbol", String(value));
    if (typeof value === "function") return span("rod-function", `ƒ ${value.name || "anonymous"}()`);

    if (Array.isArray(value)) {
      return span("rod-muted", `Array(${value.length})`);
    }

    if (value instanceof Map) {
      return span("rod-muted", `Map(${value.size})`);
    }

    if (value instanceof Set) {
      return span("rod-muted", `Set(${value.size})`);
    }

    if (value instanceof Date) {
      return span("rod-muted", value.toString());
    }

    if (value instanceof RegExp) {
      return span("rod-symbol", String(value));
    }

    if (value && typeof value === "object") {
      const ctor = value.constructor?.name || "Object";

      return span("rod-muted", `${ctor} #${getObjectId(value)}`);
    }

    return span("rod-muted", String(value));
  }

  /**
   * Creates a span element.
   *
   * @param {string} className
   * @param {string} text
   * @returns {HTMLSpanElement}
   */
  function span(className, text) {
    const node = document.createElement("span");

    node.className = className;
    node.textContent = text;

    return node;
  }

  /**
   * Trims long preview strings.
   *
   * @param {string} value
   * @returns {string}
   */
  function trim(value) {
    if (value.length <= MAX_PREVIEW_LENGTH) return value;

    return `${value.slice(0, MAX_PREVIEW_LENGTH)}…`;
  }

  /**
   * Creates a Chrome-like DOM element preview.
   *
   * @param {Element} element
   * @returns {HTMLElement}
   */
  function createDomPreview(element) {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const classes = Array.from(element.classList)
      .slice(0, 4)
      .map((className) => `.${className}`)
      .join("");

    const node = span("rod-dom", `<${tag}${id}${classes}>`);

    node.addEventListener("click", (event) => {
      event.stopPropagation();
      focusElement(element);
    });

    attachLongPress(node, element);

    return node;
  }

  /**
   * Builds one expandable row.
   *
   * @param {string} key
   * @param {unknown} value
   * @param {WeakSet<object>} seen
   * @returns {HTMLElement}
   */
  function createRow(key, value, seen) {
    const row = el("div", "rod-row");
    const line = el("div", "rod-line");
    const toggle = el("span", "rod-toggle", isExpandable(value) ? "▸" : "");
    const keyNode = key ? span("rod-key", `${key}:`) : null;
    const preview = createPreview(value);

    if (!isExpandable(value)) {
      toggle.classList.add("rod-toggle-empty");
    }

    line.append(toggle);

    if (keyNode) line.append(keyNode);

    line.append(preview);
    row.append(line);

    if (isExpandable(value)) {
      const children = el("div", "rod-children");
      let loaded = false;

      const expand = () => {
        if (!loaded) {
          renderChildren(children, value, seen);
          loaded = true;
        }

        row.classList.toggle("rod-expanded");
        toggle.textContent = row.classList.contains("rod-expanded") ? "▾" : "▸";
      };

      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        expand();
      });

      line.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        expand();
      });

      attachLongPress(line, value);

      row.append(children);
    } else {
      attachLongPress(line, value);
    }

    return row;
  }

  /**
   * Renders child properties for expandable values.
   *
   * @param {HTMLElement} container
   * @param {unknown} value
   * @param {WeakSet<object>} seen
   * @returns {void}
   */
  function renderChildren(container, value, seen) {
    container.textContent = "";

    if (!value || typeof value !== "object" && typeof value !== "function") return;

    if (seen.has(value)) {
      container.append(createRow("[[Circular]]", "[Circular]", seen));
      return;
    }

    seen.add(value);

    if (value instanceof Element) {
      renderElementChildren(container, value, seen);
      return;
    }

    if (value instanceof Map) {
      let index = 0;

      for (const [mapKey, mapValue] of value.entries()) {
        if (index >= MAX_CHILDREN) break;

        container.append(createRow(`Map(${previewText(mapKey)})`, mapValue, new WeakSet(seen)));
        index += 1;
      }

      return;
    }

    if (value instanceof Set) {
      let index = 0;

      for (const item of value.values()) {
        if (index >= MAX_CHILDREN) break;

        container.append(createRow(String(index), item, new WeakSet(seen)));
        index += 1;
      }

      return;
    }

    if (value instanceof Error) {
      container.append(createRow("name", value.name, new WeakSet(seen)));
      container.append(createRow("message", value.message, new WeakSet(seen)));
      container.append(createRow("stack", value.stack || "", new WeakSet(seen)));
    }

    const names = [
      ...Object.getOwnPropertyNames(value),
      ...Object.getOwnPropertySymbols(value).map(String),
    ];

    for (const name of names.slice(0, MAX_CHILDREN)) {
      try {
        container.append(createRow(name, value[name], new WeakSet(seen)));
      } catch (error) {
        container.append(createRow(name, error, new WeakSet(seen)));
      }
    }

    const proto = Object.getPrototypeOf(value);

    if (proto) {
      container.append(createRow("[[Prototype]]", proto, new WeakSet(seen)));
    }
  }

  /**
   * Renders DOM element details and child nodes.
   *
   * @param {HTMLElement} container
   * @param {Element} element
   * @param {WeakSet<object>} seen
   * @returns {void}
   */
  function renderElementChildren(container, element, seen) {
    container.append(createRow("$el", element, new WeakSet(seen)));
    container.append(createRow("tagName", element.tagName.toLowerCase(), new WeakSet(seen)));

    for (const attr of Array.from(element.attributes)) {
      container.append(createRow(`@${attr.name}`, attr.value, new WeakSet(seen)));
    }

    const children = Array.from(element.childNodes).slice(0, MAX_CHILDREN);

    for (let index = 0; index < children.length; index += 1) {
      container.append(createRow(`childNodes[${index}]`, children[index], new WeakSet(seen)));
    }
  }

  /**
   * Creates a tiny string preview for keys.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function previewText(value) {
    if (typeof value === "string") return `"${trim(value)}"`;
    if (value instanceof Element) return value.tagName.toLowerCase();

    return trim(String(value));
  }

  /**
   * Focuses, scrolls and highlights a DOM element.
   *
   * @param {Element} element
   * @returns {void}
   */
  function focusElement(element) {
    try {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    } catch {
      element.scrollIntoView();
    }

    if (typeof element.focus === "function") {
      try {
        element.focus({ preventScroll: true });
      } catch {
        element.focus();
      }
    }

    showHighlight(element);
  }

  /**
   * Shows a temporary DevTools-like overlay around an element.
   *
   * @param {Element} element
   * @returns {void}
   */
  function showHighlight(element) {
    if (!highlightBox) {
      highlightBox = el("div", "rod-highlight");
      document.documentElement.append(highlightBox);
    }

    const rect = element.getBoundingClientRect();

    highlightBox.style.top = `${rect.top}px`;
    highlightBox.style.left = `${rect.left}px`;
    highlightBox.style.width = `${rect.width}px`;
    highlightBox.style.height = `${rect.height}px`;
    highlightBox.style.display = "block";

    window.setTimeout(() => {
      if (highlightBox) highlightBox.style.display = "none";
    }, 1400);
  }

  /**
   * Adds long-press support to any node.
   *
   * @param {HTMLElement} target
   * @param {unknown} value
   * @returns {void}
   */
  function attachLongPress(target, value) {
    let timer = 0;

    const start = (event) => {
      clearTimeout(timer);

      timer = window.setTimeout(() => {
        event.preventDefault();
        event.stopPropagation();

        const point = getEventPoint(event);

        openMenu(point.x, point.y, value);
      }, LONG_PRESS_MS);
    };

    const cancel = () => {
      clearTimeout(timer);
    };

    target.addEventListener("touchstart", start, { passive: false });
    target.addEventListener("mousedown", start);
    target.addEventListener("touchend", cancel);
    target.addEventListener("touchmove", cancel);
    target.addEventListener("mouseup", cancel);
    target.addEventListener("mouseleave", cancel);
    target.addEventListener("contextmenu", (event) => {
      event.preventDefault();

      openMenu(event.clientX, event.clientY, value);
    });
  }

  /**
   * Gets pointer coordinates from mouse or touch events.
   *
   * @param {MouseEvent | TouchEvent} event
   * @returns {{ x: number; y: number }}
   */
  function getEventPoint(event) {
    if ("touches" in event && event.touches[0]) {
      return {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    }

    return {
      x: event.clientX || 20,
      y: event.clientY || 20,
    };
  }

  /**
   * Opens the contextual action menu.
   *
   * @param {number} x
   * @param {number} y
   * @param {unknown} value
   * @returns {void}
   */
  function openMenu(x, y, value) {
    closeMenu();

    activeMenu = el("div", "rod-menu");

    addMenuButton(activeMenu, "Copy preview", () => copyToClipboard(previewText(value)));
    addMenuButton(activeMenu, "Copy JSON", () => copyToClipboard(safeJson(value)));
    addMenuButton(activeMenu, "Copy as text", () => copyToClipboard(String(value)));

    if (value instanceof Element) {
      addMenuButton(activeMenu, "Focus element", () => focusElement(value));
      addMenuButton(activeMenu, "Copy outerHTML", () => copyToClipboard(value.outerHTML));
      addMenuButton(activeMenu, "Copy innerHTML", () => copyToClipboard(value.innerHTML));
      addMenuButton(activeMenu, "Edit textContent", () => editTextContent(value));
      addMenuButton(activeMenu, "Edit outerHTML", () => editOuterHtml(value));
      addMenuButton(activeMenu, "Remove element", () => value.remove());
    }

    document.documentElement.append(activeMenu);

    const rect = activeMenu.getBoundingClientRect();

    activeMenu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
    activeMenu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;

    window.setTimeout(() => {
      document.addEventListener("click", closeMenu, { once: true });
      document.addEventListener("touchstart", closeMenu, { once: true });
    }, 0);
  }

  /**
   * Adds one button to the contextual menu.
   *
   * @param {HTMLElement} menu
   * @param {string} label
   * @param {() => void} action
   * @returns {void}
   */
  function addMenuButton(menu, label, action) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      action();
    });

    menu.append(button);
  }

  /**
   * Closes the active contextual menu.
   *
   * @returns {void}
   */
  function closeMenu() {
    if (!activeMenu) return;

    activeMenu.remove();
    activeMenu = null;
  }

  /**
   * Copies text with Safari-friendly fallbacks.
   *
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Safari may reject this, so we use the textarea fallback below.
    }

    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "0";
    textarea.style.top = "0";
    textarea.style.opacity = "0";

    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = document.execCommand("copy");

    textarea.remove();

    return copied;
  }

  /**
   * Safely serializes values for copying.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function safeJson(value) {
    const seen = new WeakSet();

    try {
      return JSON.stringify(
        value,
        (key, item) => {
          if (item instanceof Element) return item.outerHTML;
          if (typeof item === "function") return `[Function ${item.name || "anonymous"}]`;
          if (typeof item === "symbol") return String(item);

          if (item && typeof item === "object") {
            if (seen.has(item)) return "[Circular]";
            seen.add(item);
          }

          return item;
        },
        2,
      );
    } catch (error) {
      return String(error);
    }
  }

  /**
   * Edits an element textContent with a simple prompt.
   *
   * @param {Element} element
   * @returns {void}
   */
  function editTextContent(element) {
    const next = window.prompt("Edit textContent", element.textContent || "");

    if (next === null) return;

    element.textContent = next;
    focusElement(element);
  }

  /**
   * Edits an element outerHTML with a simple prompt.
   *
   * @param {Element} element
   * @returns {void}
   */
  function editOuterHtml(element) {
    const next = window.prompt("Edit outerHTML", element.outerHTML);

    if (next === null) return;

    element.outerHTML = next;
  }

  /**
   * Renders one REPL output value into a container.
   *
   * @param {HTMLElement} container
   * @param {unknown} value
   * @returns {void}
   */
  function renderReplOutput(container, value) {
    container.classList.add("rod-output");
    container.append(createRow("", value, new WeakSet()));
  }

  /**
   * Creates a demo panel so you can test the inspector immediately.
   *
   * @returns {void}
   */
  function createDemoPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = el("div", "rod-output");
    panel.id = PANEL_ID;

    renderReplOutput(panel, {
      message: "Rod DevTools output inspector",
      location: window.location.href,
      body: document.body.innerHTML,
      currentScript: document.currentScript,
      sampleArray: [1, "two", true, document.documentElement],
      sampleMap: new Map([
        ["body", document.body],
        ["url", location.href],
      ]),
      sampleSet: new Set([document.body, window.location, 123]),
      error: new Error("Example error"),
    });

    document.body.append(panel);
  }

  injectStyles();

  window.RodReplInspector = {
    render: renderReplOutput,
    focusElement,
    copyToClipboard,
  };

  createDemoPanel();
})();