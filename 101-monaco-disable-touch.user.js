// ==UserScript==
// @name         Rod / Monaco Mobile Selection Surgeon
// @namespace    https://rod.dev/userscripts
// @version      2026.06.02.3
// @description  Mobile Safari selection helper for Monaco: preserves native gestures, patches Monaco options, and adds copy/paste/select-all utilities.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function MonacoMobileSelectionSurgeon() {
  "use strict";

  /* ==========================================================================
   * Constants
   * ========================================================================== */

  const SCRIPT_NAME = "RodMonacoMobileSelectionSurgeon";
  const DEBUG = true;

  const LONG_PRESS_MS = 520;
  const SCAN_INTERVAL_MS = 750;
  const SCAN_TIMEOUT_MS = 30000;

  const MONACO_ROOT_SELECTOR = ".monaco-editor";

  const MONACO_SELECTORS = [
    ".monaco-editor",
    ".monaco-editor *",
    ".monaco-scrollable-element",
    ".monaco-scrollable-element *",
    ".overflow-guard",
    ".overflow-guard *",
    ".view-lines",
    ".view-lines *",
    ".view-line",
    ".view-line *",
    "textarea.inputarea",
  ].join(",");

  const SAFE_MONACO_OPTIONS = {
    readOnly: false,
    contextmenu: false,
    dragAndDrop: false,
    mouseWheelZoom: false,
    selectionClipboard: false,
    links: false,
    hover: {
      enabled: false,
      delay: 999999,
      sticky: false,
    },
    scrollbar: {
      handleMouseWheel: false,
      alwaysConsumeMouseWheel: false,
    },
  };

  const NATIVE_EVENTS_TO_PROTECT = new Set([
    "touchstart",
    "touchmove",
    "touchend",
    "pointerdown",
    "pointermove",
    "pointerup",
    "mousedown",
    "mousemove",
    "mouseup",
    "click",
    "dblclick",
    "contextmenu",
    "selectstart",
    "selectionchange",
    "beforeinput",
    "input",
    "keydown",
    "keyup",
    "compositionstart",
    "compositionupdate",
    "compositionend",
  ]);

  const original = {
    addEventListener: EventTarget.prototype.addEventListener,
    preventDefault: Event.prototype.preventDefault,
  };

  const seenRoots = new WeakSet();
  const seenEditors = new WeakSet();
  const rootEditorMap = new WeakMap();

  let storedMonaco = window.monaco;
  let longPressTimer = 0;
  let lastTouchPoint = null;
  let menuElement = null;

  /* ==========================================================================
   * Logging
   * ========================================================================== */

  /**
   * Logs a debug message.
   *
   * @param {...unknown} values Values to log.
   * @returns {void}
   *
   * @example
   * log("ready");
   */
  function log(...values) {
    if (DEBUG) {
      console.log(`[${SCRIPT_NAME}]`, ...values);
    }
  }

  /**
   * Logs a safe warning.
   *
   * @param {...unknown} values Values to warn about.
   * @returns {void}
   *
   * @example
   * warn("Failed", error);
   */
  function warn(...values) {
    console.warn(`[${SCRIPT_NAME}]`, ...values);
  }

  /* ==========================================================================
   * DOM Helpers
   * ========================================================================== */

  /**
   * Checks whether a target belongs to Monaco.
   *
   * @param {unknown} value Value to inspect.
   * @returns {boolean} True when Monaco-related.
   *
   * @example
   * isMonacoElement(document.activeElement);
   */
  function isMonacoElement(value) {
    if (!(value instanceof Element)) {
      return false;
    }

    return Boolean(
      value.matches(
        ".monaco-editor, .monaco-scrollable-element, .overflow-guard, .view-lines, .view-line, textarea.inputarea",
      ) || value.closest(MONACO_ROOT_SELECTOR),
    );
  }

  /**
   * Checks whether an event is from Monaco.
   *
   * @param {Event} event Browser event.
   * @returns {boolean} True when event target is inside Monaco.
   *
   * @example
   * isMonacoEvent(event);
   */
  function isMonacoEvent(event) {
    const target = event.target;

    if (target instanceof Element) {
      return isMonacoElement(target);
    }

    if (target instanceof Node && target.parentElement) {
      return isMonacoElement(target.parentElement);
    }

    return false;
  }

  /**
   * Finds the nearest Monaco root.
   *
   * @param {unknown} value Value to inspect.
   * @returns {HTMLElement | null} Monaco root.
   *
   * @example
   * findRootFromTarget(event.target);
   */
  function findRootFromTarget(value) {
    if (!(value instanceof Element)) {
      return null;
    }

    const root = value.matches(MONACO_ROOT_SELECTOR)
      ? value
      : value.closest(MONACO_ROOT_SELECTOR);

    return root instanceof HTMLElement ? root : null;
  }

  /**
   * Returns all Monaco roots.
   *
   * @returns {HTMLElement[]} Monaco roots.
   *
   * @example
   * findRoots();
   */
  function findRoots() {
    return Array.from(document.querySelectorAll(MONACO_ROOT_SELECTOR)).filter(
      (element) => element instanceof HTMLElement,
    );
  }

  /* ==========================================================================
   * Monaco Instance Helpers
   * ========================================================================== */

  /**
   * Safely updates a Monaco editor instance.
   *
   * @param {unknown} editor Possible editor instance.
   * @returns {boolean} True when patched.
   *
   * @example
   * patchEditorInstance(editor);
   */
  function patchEditorInstance(editor) {
    if (!editor || typeof editor !== "object" || seenEditors.has(editor)) {
      return false;
    }

    const candidate = /** @type {{ updateOptions?: Function; getDomNode?: Function }} */ (editor);

    if (typeof candidate.updateOptions !== "function") {
      return false;
    }

    try {
      candidate.updateOptions(SAFE_MONACO_OPTIONS);
      seenEditors.add(editor);

      const domNode = typeof candidate.getDomNode === "function"
        ? candidate.getDomNode()
        : null;

      if (domNode instanceof HTMLElement) {
        rootEditorMap.set(domNode, editor);
        patchRoot(domNode);
      }

      log("Patched editor instance", editor);

      return true;
    } catch (error) {
      warn("Could not patch editor", error);

      return false;
    }
  }

  /**
   * Finds a Monaco editor instance for a root.
   *
   * @param {HTMLElement} root Monaco root.
   * @returns {unknown | null} Editor instance.
   *
   * @example
   * const editor = findEditorForRoot(root);
   */
  function findEditorForRoot(root) {
    const cached = rootEditorMap.get(root);

    if (cached) {
      return cached;
    }

    const monaco = window.monaco;

    if (!monaco || !monaco.editor || typeof monaco.editor.getEditors !== "function") {
      return null;
    }

    try {
      const editors = monaco.editor.getEditors();

      for (let index = 0; index < editors.length; index += 1) {
        const editor = editors[index];
        const domNode = typeof editor.getDomNode === "function" ? editor.getDomNode() : null;

        if (domNode instanceof HTMLElement && (domNode === root || domNode.contains(root) || root.contains(domNode))) {
          rootEditorMap.set(root, editor);

          return editor;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Patches Monaco global APIs.
   *
   * @param {unknown} monacoValue Possible Monaco global.
   * @returns {void}
   *
   * @example
   * patchMonacoGlobal(window.monaco);
   */
  function patchMonacoGlobal(monacoValue) {
    if (!monacoValue || typeof monacoValue !== "object") {
      return;
    }

    const monaco = /** @type {{ editor?: Record<string, unknown> }} */ (monacoValue);

    if (!monaco.editor || typeof monaco.editor !== "object") {
      return;
    }

    const editorApi = monaco.editor;
    const create = editorApi.create;
    const createDiffEditor = editorApi.createDiffEditor;

    if (typeof editorApi.getEditors === "function") {
      try {
        const editors = editorApi.getEditors();

        for (let index = 0; index < editors.length; index += 1) {
          patchEditorInstance(editors[index]);
        }
      } catch (error) {
        warn("Could not inspect existing editors", error);
      }
    }

    if (typeof create === "function" && !create.__rodSelectionPatched) {
      const patchedCreate = function patchedCreate(...args) {
        if (args[1] && typeof args[1] === "object") {
          Object.assign(args[1], SAFE_MONACO_OPTIONS);
        }

        const editor = create.apply(this, args);

        patchEditorInstance(editor);
        scan();

        return editor;
      };

      patchedCreate.__rodSelectionPatched = true;
      editorApi.create = patchedCreate;
    }

    if (typeof createDiffEditor === "function" && !createDiffEditor.__rodSelectionPatched) {
      const patchedCreateDiffEditor = function patchedCreateDiffEditor(...args) {
        if (args[1] && typeof args[1] === "object") {
          Object.assign(args[1], SAFE_MONACO_OPTIONS);
        }

        const editor = createDiffEditor.apply(this, args);

        patchEditorInstance(editor);
        scan();

        return editor;
      };

      patchedCreateDiffEditor.__rodSelectionPatched = true;
      editorApi.createDiffEditor = patchedCreateDiffEditor;
    }
  }

  /**
   * Traps late window.monaco assignment.
   *
   * @returns {void}
   *
   * @example
   * trapMonaco();
   */
  function trapMonaco() {
    try {
      Object.defineProperty(window, "monaco", {
        configurable: true,
        enumerable: true,
        get() {
          return storedMonaco;
        },
        set(value) {
          storedMonaco = value;
          patchMonacoGlobal(value);
        },
      });

      if (storedMonaco) {
        patchMonacoGlobal(storedMonaco);
      }
    } catch (error) {
      warn("Could not trap window.monaco", error);
    }
  }

  /* ==========================================================================
   * Selection Actions
   * ========================================================================== */

  /**
   * Gets selected text from Monaco.
   *
   * @param {unknown} editor Monaco editor.
   * @returns {string} Selected text.
   *
   * @example
   * getSelectedText(editor);
   */
  function getSelectedText(editor) {
    const candidate = /** @type {{ getModel?: Function; getSelection?: Function }} */ (editor);
    const model = typeof candidate.getModel === "function" ? candidate.getModel() : null;
    const selection = typeof candidate.getSelection === "function" ? candidate.getSelection() : null;

    if (!model || !selection || typeof model.getValueInRange !== "function") {
      return "";
    }

    return model.getValueInRange(selection);
  }

  /**
   * Selects all editor content.
   *
   * @param {unknown} editor Monaco editor.
   * @returns {void}
   *
   * @example
   * selectAll(editor);
   */
  function selectAll(editor) {
    const candidate = /** @type {{ getModel?: Function; setSelection?: Function; focus?: Function }} */ (editor);
    const model = typeof candidate.getModel === "function" ? candidate.getModel() : null;

    if (!model || typeof model.getFullModelRange !== "function" || typeof candidate.setSelection !== "function") {
      document.execCommand("selectAll");

      return;
    }

    candidate.focus?.();
    candidate.setSelection(model.getFullModelRange());
  }

  /**
   * Copies selected Monaco text.
   *
   * @param {unknown} editor Monaco editor.
   * @returns {Promise<void>} Copy completion.
   *
   * @example
   * await copySelection(editor);
   */
  async function copySelection(editor) {
    const text = getSelectedText(editor);

    if (!text) {
      return;
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);

      return;
    }

    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";

    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  /**
   * Pastes clipboard text into Monaco.
   *
   * @param {unknown} editor Monaco editor.
   * @returns {Promise<void>} Paste completion.
   *
   * @example
   * await pasteIntoEditor(editor);
   */
  async function pasteIntoEditor(editor) {
    const candidate = /** @type {{ executeEdits?: Function; getSelection?: Function; focus?: Function }} */ (editor);

    let text = "";

    if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = window.prompt("Paste text here:") || "";
      }
    } else {
      text = window.prompt("Paste text here:") || "";
    }

    if (!text) {
      return;
    }

    const selection = typeof candidate.getSelection === "function" ? candidate.getSelection() : null;

    if (typeof candidate.executeEdits === "function" && selection) {
      candidate.focus?.();
      candidate.executeEdits("rod-mobile-paste", [
        {
          range: selection,
          text,
          forceMoveMarkers: true,
        },
      ]);

      return;
    }

    document.execCommand("insertText", false, text);
  }

  /* ==========================================================================
   * Custom Menu
   * ========================================================================== */

  /**
   * Hides the utility menu.
   *
   * @returns {void}
   *
   * @example
   * hideMenu();
   */
  function hideMenu() {
    if (menuElement) {
      menuElement.remove();
      menuElement = null;
    }
  }

  /**
   * Creates a menu button.
   *
   * @param {string} label Button label.
   * @param {() => void | Promise<void>} action Button action.
   * @returns {HTMLButtonElement} Button.
   *
   * @example
   * createButton("Copy", () => {});
   */
  function createButton(label, action) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        await action();
      } finally {
        hideMenu();
      }
    });

    return button;
  }

  /**
   * Shows Monaco utility menu.
   *
   * @param {HTMLElement} root Monaco root.
   * @param {number} x Client X.
   * @param {number} y Client Y.
   * @returns {void}
   *
   * @example
   * showMenu(root, 100, 200);
   */
  function showMenu(root, x, y) {
    const editor = findEditorForRoot(root);

    if (!editor) {
      return;
    }

    hideMenu();

    const menu = document.createElement("div");

    menu.className = "rod-monaco-selection-menu";
    menu.style.left = `${Math.min(x, window.innerWidth - 260)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 72)}px`;

    menu.append(
      createButton("Select all", () => selectAll(editor)),
      createButton("Copy", () => copySelection(editor)),
      createButton("Paste", () => pasteIntoEditor(editor)),
      createButton("Close", () => hideMenu()),
    );

    document.documentElement.appendChild(menu);
    menuElement = menu;
  }

  /**
   * Installs root events that open the helper menu without killing native gestures.
   *
   * @param {HTMLElement} root Monaco root.
   * @returns {void}
   *
   * @example
   * installMenuEvents(root);
   */
  function installMenuEvents(root) {
    original.addEventListener.call(root, "contextmenu", (event) => {
      if (!isMonacoEvent(event)) {
        return;
      }

      showMenu(root, event.clientX || 24, event.clientY || 120);
    }, true);

    original.addEventListener.call(root, "touchstart", (event) => {
      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      lastTouchPoint = {
        x: touch.clientX,
        y: touch.clientY,
      };

      window.clearTimeout(longPressTimer);

      longPressTimer = window.setTimeout(() => {
        showMenu(root, lastTouchPoint ? lastTouchPoint.x : 24, lastTouchPoint ? lastTouchPoint.y : 120);
      }, LONG_PRESS_MS);
    }, true);

    original.addEventListener.call(root, "touchmove", () => {
      window.clearTimeout(longPressTimer);
    }, true);

    original.addEventListener.call(root, "touchend", () => {
      window.clearTimeout(longPressTimer);
    }, true);

    original.addEventListener.call(root, "dblclick", (event) => {
      if (!isMonacoEvent(event)) {
        return;
      }

      window.setTimeout(() => {
        showMenu(root, event.clientX || 24, event.clientY || 120);
      }, 80);
    }, true);
  }

  /* ==========================================================================
   * Patches
   * ========================================================================== */

  /**
   * Prevents Monaco from suppressing Safari native selection events.
   *
   * @returns {void}
   *
   * @example
   * patchPreventDefault();
   */
  function patchPreventDefault() {
    Event.prototype.preventDefault = function patchedPreventDefault() {
      if (NATIVE_EVENTS_TO_PROTECT.has(this.type) && isMonacoEvent(this)) {
        log("Ignored Monaco preventDefault for native event:", this.type);

        return undefined;
      }

      return original.preventDefault.call(this);
    };
  }

  /**
   * Soft-patches addEventListener by forcing passive touch listeners where safe.
   *
   * @returns {void}
   *
   * @example
   * patchAddEventListener();
   */
  function patchAddEventListener() {
    EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
      const eventName = String(type);

      if (
        NATIVE_EVENTS_TO_PROTECT.has(eventName) &&
        (this === window || this === document || this === document.body || isMonacoElement(this))
      ) {
        return original.addEventListener.call(this, type, listener, options);
      }

      return original.addEventListener.call(this, type, listener, options);
    };
  }

  /**
   * Injects CSS that allows Safari callout and custom menu.
   *
   * @returns {void}
   *
   * @example
   * injectCss();
   */
  function injectCss() {
    const css = `
      ${MONACO_SELECTORS} {
        -webkit-user-select: text !important;
        user-select: text !important;
        -webkit-touch-callout: default !important;
        touch-action: manipulation !important;
      }

      textarea.inputarea {
        pointer-events: auto !important;
        -webkit-user-select: text !important;
        user-select: text !important;
        -webkit-touch-callout: default !important;
        caret-color: auto !important;
      }

      .rod-monaco-selection-menu {
        position: fixed !important;
        z-index: 2147483647 !important;
        display: flex !important;
        gap: 6px !important;
        align-items: center !important;
        padding: 8px !important;
        border: 1px solid rgb(255 255 255 / 0.18) !important;
        border-radius: 14px !important;
        background: rgb(15 23 42 / 0.96) !important;
        color: #f8fafc !important;
        box-shadow: 0 20px 60px rgb(0 0 0 / 0.35) !important;
        backdrop-filter: blur(18px) !important;
        -webkit-backdrop-filter: blur(18px) !important;
        font: 600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      .rod-monaco-selection-menu button {
        appearance: none !important;
        border: 0 !important;
        border-radius: 10px !important;
        padding: 9px 11px !important;
        background: rgb(255 255 255 / 0.11) !important;
        color: #f8fafc !important;
        font: inherit !important;
      }

      .rod-monaco-selection-menu button:active {
        transform: scale(0.96) !important;
        background: rgb(255 255 255 / 0.2) !important;
      }
    `;

    const style = document.createElement("style");

    style.id = "rod-monaco-mobile-selection-surgeon-style";
    style.textContent = css;

    const append = () => {
      if (!document.getElementById(style.id)) {
        document.documentElement.appendChild(style);
      }
    };

    if (document.documentElement) {
      append();
    } else {
      original.addEventListener.call(document, "DOMContentLoaded", append, { once: true });
    }
  }

  /**
   * Patches a Monaco root.
   *
   * @param {HTMLElement} root Monaco root.
   * @returns {void}
   *
   * @example
   * patchRoot(root);
   */
  function patchRoot(root) {
    if (seenRoots.has(root)) {
      return;
    }

    seenRoots.add(root);

    root.dataset.rodMonacoMobileSelectionSurgeon = "true";
    root.style.setProperty("-webkit-user-select", "text", "important");
    root.style.setProperty("user-select", "text", "important");
    root.style.setProperty("-webkit-touch-callout", "default", "important");
    root.style.setProperty("touch-action", "manipulation", "important");

    installMenuEvents(root);

    log("Patched root", root);
  }

  /**
   * Scans current page.
   *
   * @returns {void}
   *
   * @example
   * scan();
   */
  function scan() {
    patchMonacoGlobal(window.monaco);

    const roots = findRoots();

    for (let index = 0; index < roots.length; index += 1) {
      patchRoot(roots[index]);
      findEditorForRoot(roots[index]);
    }
  }

  /**
   * Watches late Monaco mounts.
   *
   * @returns {void}
   *
   * @example
   * observe();
   */
  function observe() {
    const observer = new MutationObserver(() => {
      scan();
    });

    const start = () => {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    };

    if (document.documentElement) {
      start();
    } else {
      original.addEventListener.call(document, "DOMContentLoaded", start, { once: true });
    }
  }

  /**
   * Boots the userscript.
   *
   * @returns {void}
   *
   * @example
   * boot();
   */
  function boot() {
    log("preboot");

    patchPreventDefault();
    patchAddEventListener();
    trapMonaco();
    injectCss();
    observe();
    scan();

    const interval = window.setInterval(scan, SCAN_INTERVAL_MS);

    window.setTimeout(() => {
      window.clearInterval(interval);
      log("stopped aggressive scan");
    }, SCAN_TIMEOUT_MS);

    window.__rodMonacoMobileSelectionSurgeon = {
      scan,
      roots: findRoots,
      options: SAFE_MONACO_OPTIONS,
      showMenuForFirstRoot() {
        const root = findRoots()[0];

        if (root) {
          showMenu(root, 24, 120);
        }
      },
    };

    log("ready");
  }

  boot();
})();