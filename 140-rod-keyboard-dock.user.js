// ==UserScript==
// @name         Rod / DevTools / Keyboard Dock
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Keyboard-aware shortcut dock for mobile editing with copy, paste, select all, undo, and run actions.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @weight       840
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// ==/UserScript==

(() => {
  "use strict";

  /********************************************************************************************************
   * Constants
   ********************************************************************************************************/

  const APP_ID = "rod-keyboard-dock-shortcut-bar";
  const STORAGE_KEY = "rod.keyboard.dock.shortcut.bar.v1";
  const KEYBOARD_GAP_PX = 10;
  const SAFE_MARGIN_PX = 10;
  const COLLAPSED_WIDTH_PX = 96;
  const DEFAULT_BAR_HEIGHT_PX = 24; //64

  const IS_APPLE = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

  const DEFAULT_STATE = Object.freeze({
    x: 10,
    y: 120,
    dockToKeyboard: true,
    pinned: false,
    collapsed: true,
    useMetaOnApple: true,
  });

  const SHORTCUTS = Object.freeze([
    { icon: "⟐", label: "All", key: "a", code: "KeyA", ctrl: true, command: true, action: selectAll },
    { icon: "⧉", label: "Copy", key: "c", code: "KeyC", ctrl: true, command: true },
    { icon: "▣", label: "Paste", key: "v", code: "KeyV", ctrl: true, command: true, paste: true },
    { icon: "✂", label: "Cut", key: "x", code: "KeyX", ctrl: true, command: true },
    { icon: "↶", label: "Undo", key: "z", code: "KeyZ", ctrl: true, command: true },
    { icon: "↷", label: "Redo", key: "y", code: "KeyY", ctrl: true, command: true },
    { icon: "⏎", label: "Enter", key: "Enter", code: "Enter" },
    { icon: "⎋", label: "Esc", key: "Escape", code: "Escape" },
    { icon: "←", label: "Left", key: "ArrowLeft", code: "ArrowLeft" },
    { icon: "→", label: "Right", key: "ArrowRight", code: "ArrowRight" },
  ]);

  /********************************************************************************************************
   * State
   ********************************************************************************************************/

  let state = loadState();
  let host = null;
  let root = null;
  let bar = null;
  let lastTarget = null;
  let dragging = false;
  let pointerMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragBarX = 0;
  let dragBarY = 0;

  /********************************************************************************************************
   * Storage
   ********************************************************************************************************/

  /**
   * Loads persisted state.
   *
   * @returns {typeof DEFAULT_STATE} Current toolbar state.
   *
   * @example
   * const state = loadState();
   * console.log(state.dockToKeyboard);
   */
  function loadState() {
    try {
      const raw = typeof GM_getValue === "function"
        ? GM_getValue(STORAGE_KEY)
        : localStorage.getItem(STORAGE_KEY);

      return Object.assign({}, DEFAULT_STATE, raw ? JSON.parse(raw) : {});
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  /**
   * Saves current state.
   *
   * @returns {void}
   *
   * @example
   * saveState();
   */
  function saveState() {
    try {
      const raw = JSON.stringify(state);

      if (typeof GM_setValue === "function") {
        GM_setValue(STORAGE_KEY, raw);
        return;
      }

      localStorage.setItem(STORAGE_KEY, raw);
    } catch {
      // Some pages block storage. No drama, the toolbar still runs.
    }
  }

  /********************************************************************************************************
   * DOM helpers
   ********************************************************************************************************/

  /**
   * Creates an element with props and children.
   *
   * @param {string} tag Element tag.
   * @param {Record<string, unknown>} props Element props.
   * @param {...Node|string} children Element children.
   * @returns {HTMLElement} Created element.
   *
   * @example
   * const button = el("button", { type: "button" }, "Run");
   */
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(props)) {
      if (key === "style" && value && typeof value === "object") {
        Object.assign(node.style, value);
        continue;
      }

      if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
        continue;
      }

      if (value === false || value == null) continue;

      if (value === true) {
        node.setAttribute(key, "");
        continue;
      }

      node.setAttribute(key, String(value));
    }

    for (const child of children) {
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }

    return node;
  }

  /**
   * Finds the best event target.
   *
   * @returns {Element|Document} Focused element, remembered element, or document.
   *
   * @example
   * const target = getKeyboardTarget();
   */
  function getKeyboardTarget() {
    const active = document.activeElement;

    if (active && active !== document.body && active !== document.documentElement) {
      lastTarget = active;
      return active;
    }

    return lastTarget || document;
  }

  /**
   * Checks whether an element is text-editable.
   *
   * @param {unknown} value Candidate value.
   * @returns {value is HTMLInputElement|HTMLTextAreaElement|HTMLElement} Whether it is editable.
   *
   * @example
   * isEditable(document.activeElement);
   */
  function isEditable(value) {
    if (!(value instanceof HTMLElement)) return false;

    const tag = value.tagName.toLowerCase();

    return tag === "textarea"
      || tag === "input"
      || value.isContentEditable;
  }

  /********************************************************************************************************
   * Actions
   ********************************************************************************************************/

  /**
   * Dispatches a shortcut and optionally runs a native fallback action.
   *
   * @param {{
   *   key: string;
   *   code: string;
   *   ctrl?: boolean;
   *   command?: boolean;
   *   shift?: boolean;
   *   alt?: boolean;
   *   paste?: boolean;
   *   action?: () => void;
   * }} shortcut Shortcut config.
   * @returns {void}
   *
   * @example
   * dispatchShortcut({ key: "a", code: "KeyA", ctrl: true, command: true });
   */
  function dispatchShortcut(shortcut) {
    const target = getKeyboardTarget();
    const metaKey = Boolean(shortcut.command && state.useMetaOnApple && IS_APPLE);
    const ctrlKey = Boolean(shortcut.ctrl && !metaKey);

    target.dispatchEvent(createKeyboardEvent("keydown", shortcut, ctrlKey, metaKey));
    target.dispatchEvent(createKeyboardEvent("keypress", shortcut, ctrlKey, metaKey));

    if (typeof shortcut.action === "function") {
      shortcut.action();
    }

    if (shortcut.paste) {
      dispatchPasteEvent(target);
    }

    target.dispatchEvent(createKeyboardEvent("keyup", shortcut, ctrlKey, metaKey));
  }

  /**
   * Selects all text in the active editable element, with a document fallback.
   *
   * @returns {void}
   *
   * @example
   * selectAll();
   */
  function selectAll() {
    const target = getKeyboardTarget();

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.focus();
      target.select();
      return;
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      target.focus();

      const range = document.createRange();
      range.selectNodeContents(target);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }

    try {
      document.execCommand("selectAll");
    } catch {
      // execCommand can be blocked, but the synthetic key event already fired.
    }
  }

  /**
   * Creates a synthetic keyboard event.
   *
   * @param {"keydown"|"keypress"|"keyup"} type Event type.
   * @param {{ key: string; code: string; shift?: boolean; alt?: boolean }} shortcut Shortcut data.
   * @param {boolean} ctrlKey Whether Ctrl is active.
   * @param {boolean} metaKey Whether Meta is active.
   * @returns {KeyboardEvent} Synthetic keyboard event.
   *
   * @example
   * createKeyboardEvent("keydown", { key: "Enter", code: "Enter" }, false, false);
   */
  function createKeyboardEvent(type, shortcut, ctrlKey, metaKey) {
    return new KeyboardEvent(type, {
      key: shortcut.key,
      code: shortcut.code,
      bubbles: true,
      cancelable: true,
      composed: true,
      ctrlKey,
      metaKey,
      shiftKey: Boolean(shortcut.shift),
      altKey: Boolean(shortcut.alt),
    });
  }

  /**
   * Dispatches a synthetic paste event.
   *
   * @param {EventTarget} target Event target.
   * @returns {void}
   *
   * @example
   * dispatchPasteEvent(document.activeElement);
   */
  function dispatchPasteEvent(target) {
    try {
      target.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
      }));
    } catch {
      target.dispatchEvent(new Event("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
      }));
    }
  }

  /********************************************************************************************************
   * UI
   ********************************************************************************************************/

  /**
   * Boots the toolbar.
   *
   * @returns {void}
   *
   * @example
   * boot();
   */
  function boot() {
    if (document.getElementById(APP_ID)) return;

    host = el("div", { id: APP_ID });
    root = host.attachShadow({ mode: "open" });

    root.append(el("style", {}, getCss()), buildBar());
    document.documentElement.append(host);

    watchFocus();
    watchViewport();
    renderState();
  }

  /**
   * Builds the bar.
   *
   * @returns {HTMLElement} Toolbar element.
   *
   * @example
   * const bar = buildBar();
   */
  function buildBar() {
    const shortcutButtons = SHORTCUTS.map((shortcut) =>
      el(
        "button",
        {
          type: "button",
          class: "key",
          title: shortcut.label,
          onclick: () => dispatchShortcut(shortcut),
        },
        el("span", { class: "key-icon" }, shortcut.icon),
        el("span", { class: "key-label" }, shortcut.label),
      ),
    );

    bar = el(
      "section",
      { class: "bar", role: "toolbar", "aria-label": "Keyboard shortcut dock" },
      el("button", { type: "button", class: "orb drag", title: "Drag", onpointerdown: startDrag }, "✥"),
      el("div", { class: "keys" }, ...shortcutButtons),
      el(
        "div",
        { class: "tools" },
        el("button", {
          type: "button",
          class: "orb dock",
          title: "Dock above keyboard",
          onclick: () => {
            state.dockToKeyboard = !state.dockToKeyboard;
            saveState();
            renderState();
          },
        }, "▤"),
        el("button", {
          type: "button",
          class: "orb pin",
          title: "Pin",
          onclick: () => {
            state.pinned = !state.pinned;
            saveState();
            renderState();
          },
        }, "⌖"),
        el("button", {
          type: "button",
          class: "orb collapse",
          title: "Collapse",
          onclick: () => {
            if (pointerMoved) return;
            state.collapsed = !state.collapsed;
            saveState();
            renderState();
          },
        }, "◐"),
      ),
    );

    return bar;
  }

  /**
   * Applies state and viewport docking.
   *
   * @returns {void}
   *
   * @example
   * renderState();
   */
  function renderState() {
    if (!bar) return;

    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportOffsetTop = viewport?.offsetTop ?? 0;
    const viewportOffsetLeft = viewport?.offsetLeft ?? 0;
    const keyboardLikelyOpen = viewport ? viewport.height < window.innerHeight * 0.82 : isEditable(document.activeElement);

    const barWidth = state.collapsed ? COLLAPSED_WIDTH_PX : Math.min(viewportWidth - SAFE_MARGIN_PX * 2, 520);
    const barHeight = DEFAULT_BAR_HEIGHT_PX;

    if (state.dockToKeyboard && keyboardLikelyOpen && !state.pinned && !dragging) {
      state.x = Math.round(viewportOffsetLeft + SAFE_MARGIN_PX);
      state.y = Math.round(viewportOffsetTop + viewportHeight - barHeight - KEYBOARD_GAP_PX);
    }

    state.x = clamp(state.x, viewportOffsetLeft + SAFE_MARGIN_PX, viewportOffsetLeft + viewportWidth - barWidth - SAFE_MARGIN_PX);
    state.y = clamp(state.y, viewportOffsetTop + SAFE_MARGIN_PX, viewportOffsetTop + viewportHeight - barHeight - SAFE_MARGIN_PX);

    bar.style.left = `${state.x}px`;
    bar.style.top = `${state.y}px`;
    bar.style.width = state.collapsed ? `${COLLAPSED_WIDTH_PX}px` : `min(520px, calc(100vw - ${SAFE_MARGIN_PX * 2}px))`;
    bar.dataset.collapsed = String(state.collapsed);
    bar.dataset.pinned = String(state.pinned);
    bar.dataset.docked = String(state.dockToKeyboard);
  }

  /**
   * Tracks useful focus targets.
   *
   * @returns {void}
   *
   * @example
   * watchFocus();
   */
  function watchFocus() {
    document.addEventListener("focusin", (event) => {
      if (event.target instanceof Element && host && !host.contains(event.target)) {
        lastTarget = event.target;
        window.setTimeout(renderState, 80);
        window.setTimeout(renderState, 280);
      }
    }, true);

    document.addEventListener("pointerdown", (event) => {
      if (!host || event.composedPath().includes(host)) return;

      if (event.target instanceof Element) {
        lastTarget = event.target;
      }
    }, true);
  }

  /**
   * Watches viewport changes caused by mobile keyboards.
   *
   * @returns {void}
   *
   * @example
   * watchViewport();
   */
  function watchViewport() {
    window.visualViewport?.addEventListener("resize", renderState, { passive: true });
    window.visualViewport?.addEventListener("scroll", renderState, { passive: true });
    window.addEventListener("resize", renderState, { passive: true });
    window.addEventListener("orientationchange", () => window.setTimeout(renderState, 250), { passive: true });
  }

  /**
   * Starts dragging.
   *
   * @param {PointerEvent} event Pointer event.
   * @returns {void}
   *
   * @example
   * button.addEventListener("pointerdown", startDrag);
   */
  function startDrag(event) {
    if (state.pinned) return;

    dragging = true;
    pointerMoved = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragBarX = state.x;
    dragBarY = state.y;

    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", moveDrag, true);
    window.addEventListener("pointerup", stopDrag, true);
  }

  /**
   * Moves while dragging.
   *
   * @param {PointerEvent} event Pointer event.
   * @returns {void}
   *
   * @example
   * window.addEventListener("pointermove", moveDrag, true);
   */
  function moveDrag(event) {
    if (!dragging) return;

    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportOffsetTop = viewport?.offsetTop ?? 0;
    const viewportOffsetLeft = viewport?.offsetLeft ?? 0;
    const width = state.collapsed ? COLLAPSED_WIDTH_PX : Math.min(viewportWidth - SAFE_MARGIN_PX * 2, 520);

    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      pointerMoved = true;
    }

    state.x = clamp(dragBarX + dx, viewportOffsetLeft + SAFE_MARGIN_PX, viewportOffsetLeft + viewportWidth - width - SAFE_MARGIN_PX);
    state.y = clamp(dragBarY + dy, viewportOffsetTop + SAFE_MARGIN_PX, viewportOffsetTop + viewportHeight - DEFAULT_BAR_HEIGHT_PX - SAFE_MARGIN_PX);

    renderState();
  }

  /**
   * Stops dragging.
   *
   * @returns {void}
   *
   * @example
   * window.addEventListener("pointerup", stopDrag, true);
   */
  function stopDrag() {
    dragging = false;
    saveState();

    window.removeEventListener("pointermove", moveDrag, true);
    window.removeEventListener("pointerup", stopDrag, true);

    window.setTimeout(() => {
      pointerMoved = false;
    }, 0);
  }

  /**
   * Clamps a number.
   *
   * @param {number} value Value.
   * @param {number} min Minimum.
   * @param {number} max Maximum.
   * @returns {number} Clamped value.
   *
   * @example
   * clamp(12, 0, 10);
   * // 10
   */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * Returns CSS.
   *
   * @returns {string} CSS text.
   *
   * @example
   * const css = getCss();
   */
  function getCss() {
    return `
      :host {
        all: initial;
        position: fixed;
        inset: 0 auto auto 0;
        z-index: 2147483647;
        pointer-events: none;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      * {
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
      }

      .bar {
        position: fixed;
        display: flex;
        align-items: center;
        gap: 7px;
        height: ${DEFAULT_BAR_HEIGHT_PX}px;
        max-width: calc(100vw - 20px);
        padding: 7px;
        pointer-events: auto;
        border-radius: 999px;
        color: #ffffff;
        background:
          linear-gradient(135deg, rgba(6, 6, 10, 0.98), rgba(17, 17, 25, 0.97));
        border: 1px solid rgba(255, 255, 255, 0.28);
        box-shadow:
          0 18px 60px rgba(0, 0, 0, 0.62),
          inset 0 1px 0 rgba(255, 255, 255, 0.20);
        backdrop-filter: blur(22px) saturate(1.55);
        -webkit-backdrop-filter: blur(22px) saturate(1.55);
        overflow: hidden;
        user-select: none;
        touch-action: none;
      }

      .keys {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        scroll-snap-type: x proximity;
        touch-action: pan-x;
      }

      .keys::-webkit-scrollbar {
        display: none;
      }

      .tools {
        display: flex;
        align-items: center;
        gap: 5px;
        flex: 0 0 auto;
      }

      button {
        appearance: none;
        -webkit-appearance: none;
        border: 0;
        margin: 0;
        padding: 0;
        color: inherit;
        font: inherit;
        background: transparent;
      }

      .orb,
      .key {
        flex: 0 0 auto;
        height: 40px;
        border-radius: 999px;
        color: #ffffff;
        background: rgba(255, 255, 255, 0.13);
        border: 1px solid rgba(255, 255, 255, 0.22);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.14),
          0 8px 18px rgba(0, 0, 0, 0.28);
      }

      .orb {
        width: 40px;
        font-size: 16px;
      }

      .key {
        display: grid;
        grid-template-columns: 18px auto;
        align-items: center;
        gap: 6px;
        min-width: 76px;
        padding: 0 11px;
        scroll-snap-align: start;
      }

      .key-icon {
        font-size: 16px;
        line-height: 1;
        text-align: center;
      }

      .key-label {
        font-size: 11px;
        line-height: 1;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: rgba(255, 255, 255, 0.92);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
      }

      .drag {
        cursor: grab;
      }

      .drag:active {
        cursor: grabbing;
      }

      .bar[data-docked="true"] .dock,
      .bar[data-pinned="true"] .pin {
        background: rgba(95, 120, 255, 0.42);
        border-color: rgba(170, 185, 255, 0.55);
      }

      .bar[data-pinned="true"] .drag {
        opacity: 0.42;
        cursor: not-allowed;
      }

      .bar[data-collapsed="true"] {
        gap: 5px;
        padding: 6px;
      }

      .bar[data-collapsed="true"] .keys,
      .bar[data-collapsed="true"] .dock,
      .bar[data-collapsed="true"] .pin {
        display: none;
      }

      .bar[data-collapsed="true"] .orb {
        width: 38px;
        height: 38px;
      }

      .orb:active,
      .key:active {
        transform: translateY(1px) scale(0.96);
        background: rgba(255, 255, 255, 0.24);
      }

      @media (max-width: 480px) {
        .key {
          min-width: 70px;
          padding: 0 10px;
        }

        .key-label {
          font-size: 10px;
        }

        .orb {
          width: 38px;
        }
      }
    `;
  }

  /********************************************************************************************************
   * Boot
   ********************************************************************************************************/

  if (document.documentElement) {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();