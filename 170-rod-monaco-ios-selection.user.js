// ==UserScript==
// @name         Rod / DevTools / Monaco iOS Selection
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Restores native iOS selection behavior over Monaco-like editors.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       810
// @grant        none
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = {
    debug: true,
    tapWindowMs: 430,
    tapDistancePx: 24,
    longPressMs: 520,
    mirrorLifetimeMs: 8_000,
    scanIntervalMs: 500,
    editorSelector: ".monaco-editor, .monaco-diff-editor",
    monacoTextSelector: ".view-lines, .view-line, .mtk1, .mtk2, .mtk3, .mtk4, .mtk5, span",
    nativeEvents: new Set([
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "mousedown",
      "mousemove",
      "mouseup",
      "click",
      "dblclick",
      "contextmenu",
      "selectstart",
      "selectionchange",
      "dragstart",
    ]),
  };

  const state = {
    editors: [],
    knownEditors: new WeakSet(),
    tapCount: 0,
    lastTapAt: 0,
    lastX: 0,
    lastY: 0,
    tapTimer: 0,
    longPressTimer: 0,
    mirror: null,
    mirrorCleanupTimer: 0,
    lastTouch: null,
  };

  /**
   * Prints debug information when enabled.
   *
   * @param {string} message - Message to print.
   * @param {...unknown} args - Extra debug payload.
   * @returns {void}
   */
  function debug(message, ...args) {
    if (!CONFIG.debug) return;

    try {
      console.debug("[Monaco iOS Native]", message, ...args);
    } catch {
      // Keep page scripts safe.
    }
  }

  /**
   * Checks whether a value behaves like a Monaco editor instance.
   *
   * @param {unknown} value - Candidate value.
   * @returns {boolean}
   */
  function isEditorLike(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.getDomNode === "function" &&
        typeof value.getModel === "function" &&
        typeof value.setSelection === "function",
    );
  }

  /**
   * Finds Monaco editors exposed through window.monaco.
   *
   * @returns {unknown[]} Monaco editor candidates.
   */
  function getMonacoEditors() {
    try {
      const monacoEditor = window.monaco?.editor;

      if (!monacoEditor) return [];

      if (typeof monacoEditor.getEditors === "function") {
        return monacoEditor.getEditors();
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Scans and registers Monaco editors.
   *
   * @returns {void}
   */
  function scanEditors() {
    for (const editor of getMonacoEditors()) {
      if (!isEditorLike(editor)) continue;
      if (state.knownEditors.has(editor)) continue;

      state.knownEditors.add(editor);
      state.editors.push(editor);

      const node = editor.getDomNode();

      if (node instanceof HTMLElement) {
        node.dataset.migosIosNativeMonaco = "true";
      }

      patchEditorOptions(editor);
      debug("Registered editor", editor);
    }
  }

  /**
   * Soft-patches Monaco options that usually fight native touch behavior.
   *
   * @param {any} editor - Monaco editor.
   * @returns {void}
   */
  function patchEditorOptions(editor) {
    try {
      editor.updateOptions?.({
        contextmenu: false,
        dragAndDrop: false,
        mouseWheelZoom: false,
        links: false,
        quickSuggestions: false,
        hover: { enabled: false },
        fixedOverflowWidgets: true,
      });
    } catch {
      // Some embedded Monaco builds reject partial options.
    }
  }

  /**
   * Finds the editor that contains an event target.
   *
   * @param {EventTarget | null} target - Event target.
   * @returns {any | null}
   */
  function findEditorFromTarget(target) {
    if (!(target instanceof Element)) return null;

    scanEditors();

    for (const editor of state.editors) {
      if (!isEditorLike(editor)) continue;

      const node = editor.getDomNode();

      if (node instanceof HTMLElement && node.contains(target)) {
        return editor;
      }
    }

    return null;
  }

  /**
   * Checks whether an event target belongs to Monaco.
   *
   * @param {EventTarget | null} target - Event target.
   * @returns {boolean}
   */
  function isInsideMonaco(target) {
    return target instanceof Element && Boolean(target.closest(CONFIG.editorSelector));
  }

  /**
   * Installs CSS that keeps Monaco text selectable from Safari's point of view.
   *
   * @returns {void}
   */
  function injectCss() {
    const style = document.createElement("style");

    style.textContent = `
      ${CONFIG.editorSelector},
      ${CONFIG.editorSelector} *,
      ${CONFIG.monacoTextSelector} {
        -webkit-touch-callout: default !important;
        -webkit-user-select: text !important;
        user-select: text !important;
        touch-action: auto !important;
        -webkit-tap-highlight-color: rgba(255, 255, 255, 0.22) !important;
      }

      ${CONFIG.editorSelector} textarea,
      ${CONFIG.editorSelector} .inputarea,
      ${CONFIG.editorSelector} .inputarea.ime-input {
        -webkit-user-select: text !important;
        user-select: text !important;
        -webkit-touch-callout: default !important;
        pointer-events: auto !important;
        touch-action: auto !important;
        caret-color: auto !important;
      }

      .migos-monaco-ios-native-mirror {
        position: fixed !important;
        z-index: 2147483647 !important;
        inset: auto !important;
        box-sizing: border-box !important;
        overflow: auto !important;
        white-space: pre !important;
        user-select: text !important;
        -webkit-user-select: text !important;
        -webkit-touch-callout: default !important;
        touch-action: auto !important;
        pointer-events: auto !important;
        background: transparent !important;
        color: transparent !important;
        caret-color: transparent !important;
        text-shadow: none !important;
        font: 13px/19px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
      }

      .migos-monaco-ios-native-mirror::selection {
        background: rgba(0, 122, 255, 0.35) !important;
        color: transparent !important;
      }
    `;

    document.documentElement.appendChild(style);
  }

  /**
   * Blocks Monaco from registering the most hostile mobile event listeners.
   *
   * @returns {void}
   */
  function patchAddEventListener() {
    const original = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
      const eventType = String(type);

      if (
        CONFIG.nativeEvents.has(eventType) &&
        this instanceof Element &&
        this.closest?.(CONFIG.editorSelector)
      ) {
        const wrapped = function wrappedMonacoNativeEvent(event) {
          if (isInsideMonaco(event.target) && isNativeGestureActive(event)) {
            debug("Blocked Monaco listener during native gesture", event.type);
            return;
          }

          return typeof listener === "function"
            ? listener.call(this, event)
            : listener?.handleEvent?.(event);
        };

        return original.call(this, eventType, wrapped, normalizeListenerOptions(options));
      }

      return original.call(this, type, listener, options);
    };

    debug("Patched addEventListener");
  }

  /**
   * Normalizes listener options and makes Monaco mobile listeners easier to interrupt.
   *
   * @param {boolean | AddEventListenerOptions | undefined} options - Listener options.
   * @returns {boolean | AddEventListenerOptions | undefined}
   */
  function normalizeListenerOptions(options) {
    if (typeof options === "boolean") return options;

    return {
      ...options,
      passive: false,
    };
  }

  /**
   * Patches preventDefault and propagation during native mode.
   *
   * @returns {void}
   */
  function patchEventMethods() {
    const originalPreventDefault = Event.prototype.preventDefault;
    const originalStopPropagation = Event.prototype.stopPropagation;
    const originalStopImmediatePropagation = Event.prototype.stopImmediatePropagation;

    Event.prototype.preventDefault = function patchedPreventDefault() {
      if (shouldProtectNativeGesture(this)) {
        debug("preventDefault blocked", this.type);
        return;
      }

      return originalPreventDefault.call(this);
    };

    Event.prototype.stopPropagation = function patchedStopPropagation() {
      if (shouldProtectNativeGesture(this)) {
        debug("stopPropagation blocked", this.type);
        return;
      }

      return originalStopPropagation.call(this);
    };

    Event.prototype.stopImmediatePropagation = function patchedStopImmediatePropagation() {
      if (shouldProtectNativeGesture(this)) {
        debug("stopImmediatePropagation blocked", this.type);
        return;
      }

      return originalStopImmediatePropagation.call(this);
    };

    debug("Patched Event methods");
  }

  /**
   * Checks whether native gesture protection should override Monaco.
   *
   * @param {Event} event - Event.
   * @returns {boolean}
   */
  function shouldProtectNativeGesture(event) {
    if (!CONFIG.nativeEvents.has(event.type)) return false;
    if (!isInsideMonaco(event.target)) return false;

    return isNativeGestureActive(event);
  }

  /**
   * Checks if the current event should belong to the native selection path.
   *
   * @param {Event} event - Event.
   * @returns {boolean}
   */
  function isNativeGestureActive(event) {
    if (state.mirror) return true;
    if (event.type === "contextmenu") return true;
    if (event.type === "selectstart") return true;

    return false;
  }

  /**
   * Gets the Monaco position at client coordinates.
   *
   * @param {any} editor - Monaco editor.
   * @param {number} clientX - X coordinate.
   * @param {number} clientY - Y coordinate.
   * @returns {{ lineNumber: number, column: number } | null}
   */
  function getPositionAtPoint(editor, clientX, clientY) {
    try {
      const target = editor.getTargetAtClientPoint?.(clientX, clientY);

      if (target?.position) return target.position;
    } catch {
      // Fallback below.
    }

    try {
      const node = editor.getDomNode();
      const model = editor.getModel();

      if (!(node instanceof HTMLElement) || !model) return null;

      const rect = node.getBoundingClientRect();
      const lineHeight = 19;
      const lineNumber = Math.max(
        1,
        Math.min(model.getLineCount(), Math.floor((clientY - rect.top) / lineHeight) + 1),
      );

      return { lineNumber, column: 1 };
    } catch {
      return null;
    }
  }

  /**
   * Selects a full line inside Monaco.
   *
   * @param {any} editor - Monaco editor.
   * @param {number} lineNumber - Line number.
   * @returns {void}
   */
  function selectLine(editor, lineNumber) {
    const model = editor.getModel();
    const line = clampLine(model, lineNumber);

    editor.setSelection({
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: model.getLineMaxColumn(line),
    });

    editor.revealLineInCenter?.(line);
    editor.focus?.();
  }

  /**
   * Selects the whole Monaco model.
   *
   * @param {any} editor - Monaco editor.
   * @returns {void}
   */
  function selectWholeFile(editor) {
    const model = editor.getModel();
    const lastLine = model.getLineCount();

    editor.setSelection({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: lastLine,
      endColumn: model.getLineMaxColumn(lastLine),
    });

    editor.focus?.();
  }

  /**
   * Selects a rough code block using braces first and indentation second.
   *
   * @param {any} editor - Monaco editor.
   * @param {number} lineNumber - Anchor line.
   * @returns {void}
   */
  function selectBlock(editor, lineNumber) {
    const model = editor.getModel();
    const range = findBraceBlockRange(model, lineNumber) ?? findIndentBlockRange(model, lineNumber);

    editor.setSelection({
      startLineNumber: range.startLine,
      startColumn: 1,
      endLineNumber: range.endLine,
      endColumn: model.getLineMaxColumn(range.endLine),
    });

    editor.revealLineInCenter?.(range.startLine);
    editor.focus?.();
  }

  /**
   * Finds a surrounding brace block.
   *
   * @param {any} model - Monaco model.
   * @param {number} lineNumber - Anchor line.
   * @returns {{ startLine: number, endLine: number } | null}
   */
  function findBraceBlockRange(model, lineNumber) {
    const total = model.getLineCount();
    let startLine = null;
    let depth = 0;

    for (let line = lineNumber; line >= 1; line--) {
      const text = stripStringsAndComments(model.getLineContent(line));

      for (let index = text.length - 1; index >= 0; index--) {
        const char = text[index];

        if (char === "}") depth++;

        if (char === "{") {
          if (depth === 0) {
            startLine = line;
            break;
          }

          depth--;
        }
      }

      if (startLine !== null) break;
    }

    if (startLine === null) return null;

    depth = 0;

    for (let line = startLine; line <= total; line++) {
      const text = stripStringsAndComments(model.getLineContent(line));

      for (let index = 0; index < text.length; index++) {
        const char = text[index];

        if (char === "{") depth++;

        if (char === "}") {
          depth--;

          if (depth === 0) {
            return { startLine, endLine: line };
          }
        }
      }
    }

    return null;
  }

  /**
   * Finds an indentation block when brace matching fails.
   *
   * @param {any} model - Monaco model.
   * @param {number} lineNumber - Anchor line.
   * @returns {{ startLine: number, endLine: number }}
   */
  function findIndentBlockRange(model, lineNumber) {
    const total = model.getLineCount();
    const anchor = clampLine(model, lineNumber);
    const baseIndent = getIndentSize(model.getLineContent(anchor));

    let startLine = anchor;
    let endLine = anchor;

    while (startLine > 1) {
      const previous = model.getLineContent(startLine - 1);

      if (!previous.trim()) break;
      if (getIndentSize(previous) < baseIndent) break;

      startLine--;
    }

    while (endLine < total) {
      const next = model.getLineContent(endLine + 1);

      if (!next.trim()) break;
      if (getIndentSize(next) < baseIndent) break;

      endLine++;
    }

    return { startLine, endLine };
  }

  /**
   * Clamps line number to model bounds.
   *
   * @param {any} model - Monaco model.
   * @param {number} lineNumber - Candidate line.
   * @returns {number}
   */
  function clampLine(model, lineNumber) {
    return Math.max(1, Math.min(model.getLineCount(), lineNumber));
  }

  /**
   * Calculates indentation size.
   *
   * @param {string} text - Source line.
   * @returns {number}
   */
  function getIndentSize(text) {
    return (text.match(/^\s*/)?.[0] ?? "").replace(/\t/g, "  ").length;
  }

  /**
   * Removes simple comments and strings for brace scanning.
   *
   * @param {string} text - Source text.
   * @returns {string}
   */
  function stripStringsAndComments(text) {
    return text.replace(/\/\/.*$/g, "").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "");
  }

  /**
   * Handles tap sequences for double/triple/quad tap.
   *
   * @param {Event} event - Input event.
   * @param {number} clientX - X coordinate.
   * @param {number} clientY - Y coordinate.
   * @returns {void}
   */
  function handleTap(event, clientX, clientY) {
    const editor = findEditorFromTarget(event.target);

    if (!editor) return;

    const now = Date.now();
    const elapsed = now - state.lastTapAt;
    const distance = Math.hypot(clientX - state.lastX, clientY - state.lastY);
    const sameSequence = elapsed <= CONFIG.tapWindowMs && distance <= CONFIG.tapDistancePx;

    state.tapCount = sameSequence ? state.tapCount + 1 : 1;
    state.lastTapAt = now;
    state.lastX = clientX;
    state.lastY = clientY;

    window.clearTimeout(state.tapTimer);
    state.tapTimer = window.setTimeout(resetTap, CONFIG.tapWindowMs + 80);

    const position = getPositionAtPoint(editor, clientX, clientY);

    if (!position) return;

    if (state.tapCount === 2) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectLine(editor, position.lineNumber);
      return;
    }

    if (state.tapCount === 3) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectBlock(editor, position.lineNumber);
      return;
    }

    if (state.tapCount >= 4) {
      event.preventDefault();
      event.stopImmediatePropagation();
      selectWholeFile(editor);
      resetTap();
    }
  }

  /**
   * Resets tap recognition.
   *
   * @returns {void}
   */
  function resetTap() {
    state.tapCount = 0;
    state.lastTapAt = 0;
    state.lastX = 0;
    state.lastY = 0;
    window.clearTimeout(state.tapTimer);
  }

  /**
   * Starts long press detection.
   *
   * @param {TouchEvent | PointerEvent} event - Touch or pointer event.
   * @param {number} clientX - X coordinate.
   * @param {number} clientY - Y coordinate.
   * @returns {void}
   */
  function startLongPress(event, clientX, clientY) {
    const editor = findEditorFromTarget(event.target);

    if (!editor) return;

    state.lastTouch = { clientX, clientY };

    window.clearTimeout(state.longPressTimer);
    state.longPressTimer = window.setTimeout(() => {
      openNativeMirror(editor, clientX, clientY);
    }, CONFIG.longPressMs);
  }

  /**
   * Cancels long press detection when movement is too large.
   *
   * @param {number} clientX - X coordinate.
   * @param {number} clientY - Y coordinate.
   * @returns {void}
   */
  function maybeCancelLongPress(clientX, clientY) {
    if (!state.lastTouch) return;

    const distance = Math.hypot(clientX - state.lastTouch.clientX, clientY - state.lastTouch.clientY);

    if (distance > CONFIG.tapDistancePx) {
      window.clearTimeout(state.longPressTimer);
    }
  }

  /**
   * Creates a transparent selectable text mirror over the Monaco viewport.
   *
   * This is the key iOS trick: Safari needs real selectable DOM text to show
   * the native callout and draggable selection handles.
   *
   * @param {any} editor - Monaco editor.
   * @param {number} clientX - X coordinate.
   * @param {number} clientY - Y coordinate.
   * @returns {void}
   */
  function openNativeMirror(editor, clientX, clientY) {
    cleanupMirror();

    const model = editor.getModel();
    const node = editor.getDomNode();

    if (!(node instanceof HTMLElement) || !model) return;

    const rect = node.getBoundingClientRect();
    const text = model.getValue();

    const mirror = document.createElement("textarea");

    mirror.className = "migos-monaco-ios-native-mirror";
    mirror.value = text;
    mirror.readOnly = true;
    mirror.spellcheck = false;
    mirror.autocapitalize = "off";
    mirror.autocomplete = "off";
    mirror.autocorrect = "off";

    mirror.style.left = `${Math.max(0, rect.left)}px`;
    mirror.style.top = `${Math.max(0, rect.top)}px`;
    mirror.style.width = `${Math.max(1, rect.width)}px`;
    mirror.style.height = `${Math.max(1, rect.height)}px`;

    document.body.appendChild(mirror);

    state.mirror = mirror;

    const position = getPositionAtPoint(editor, clientX, clientY);
    const offset = position ? getOffsetAtPosition(model, position.lineNumber, position.column) : 0;

    focusAndSelectNativeText(mirror, offset);

    mirror.addEventListener("blur", () => {
      window.setTimeout(cleanupMirror, 350);
    });

    mirror.addEventListener("touchend", () => {
      window.clearTimeout(state.mirrorCleanupTimer);
      state.mirrorCleanupTimer = window.setTimeout(cleanupMirror, CONFIG.mirrorLifetimeMs);
    });

    window.clearTimeout(state.mirrorCleanupTimer);
    state.mirrorCleanupTimer = window.setTimeout(cleanupMirror, CONFIG.mirrorLifetimeMs);

    debug("Opened native mirror");
  }

  /**
   * Focuses the mirror and selects a small word-like range to trigger iOS callout.
   *
   * @param {HTMLTextAreaElement} mirror - Native mirror textarea.
   * @param {number} offset - Text offset.
   * @returns {void}
   */
  function focusAndSelectNativeText(mirror, offset) {
    const value = mirror.value;
    const start = findWordStart(value, offset);
    const end = findWordEnd(value, offset);

    mirror.focus({ preventScroll: true });

    try {
      mirror.setSelectionRange(start, end || start + 1);
    } catch {
      mirror.select();
    }

    const selectionEvent = new Event("select", { bubbles: true, cancelable: true });
    mirror.dispatchEvent(selectionEvent);
  }

  /**
   * Converts a Monaco line/column into a model offset.
   *
   * @param {any} model - Monaco model.
   * @param {number} lineNumber - Line number.
   * @param {number} column - Column.
   * @returns {number}
   */
  function getOffsetAtPosition(model, lineNumber, column) {
    try {
      return model.getOffsetAt({ lineNumber, column });
    } catch {
      let offset = 0;

      for (let line = 1; line < lineNumber; line++) {
        offset += model.getLineContent(line).length + 1;
      }

      return offset + Math.max(0, column - 1);
    }
  }

  /**
   * Finds the start of a word near an offset.
   *
   * @param {string} text - Full text.
   * @param {number} offset - Candidate offset.
   * @returns {number}
   */
  function findWordStart(text, offset) {
    let index = Math.max(0, Math.min(text.length, offset));

    while (index > 0 && /[\w$.-]/.test(text[index - 1])) {
      index--;
    }

    return index;
  }

  /**
   * Finds the end of a word near an offset.
   *
   * @param {string} text - Full text.
   * @param {number} offset - Candidate offset.
   * @returns {number}
   */
  function findWordEnd(text, offset) {
    let index = Math.max(0, Math.min(text.length, offset));

    while (index < text.length && /[\w$.-]/.test(text[index])) {
      index++;
    }

    return index;
  }

  /**
   * Removes the native mirror.
   *
   * @returns {void}
   */
  function cleanupMirror() {
    window.clearTimeout(state.mirrorCleanupTimer);

    if (state.mirror) {
      state.mirror.remove();
      state.mirror = null;
      debug("Removed native mirror");
    }
  }

  /**
   * Handles touchstart early.
   *
   * @param {TouchEvent} event - Touch event.
   * @returns {void}
   */
  function onTouchStart(event) {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];

    handleTap(event, touch.clientX, touch.clientY);
    startLongPress(event, touch.clientX, touch.clientY);
  }

  /**
   * Handles touchmove early.
   *
   * @param {TouchEvent} event - Touch event.
   * @returns {void}
   */
  function onTouchMove(event) {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];

    maybeCancelLongPress(touch.clientX, touch.clientY);
  }

  /**
   * Handles touchend early.
   *
   * @returns {void}
   */
  function onTouchEnd() {
    window.clearTimeout(state.longPressTimer);
    state.lastTouch = null;
  }

  /**
   * Handles pointerdown as fallback.
   *
   * @param {PointerEvent} event - Pointer event.
   * @returns {void}
   */
  function onPointerDown(event) {
    if (event.pointerType === "mouse") return;

    handleTap(event, event.clientX, event.clientY);
    startLongPress(event, event.clientX, event.clientY);
  }

  /**
   * Handles pointermove as fallback.
   *
   * @param {PointerEvent} event - Pointer event.
   * @returns {void}
   */
  function onPointerMove(event) {
    if (event.pointerType === "mouse") return;

    maybeCancelLongPress(event.clientX, event.clientY);
  }

  /**
   * Handles pointerup as fallback.
   *
   * @returns {void}
   */
  function onPointerUp() {
    window.clearTimeout(state.longPressTimer);
    state.lastTouch = null;
  }

  /**
   * Installs capture listeners above Monaco.
   *
   * @returns {void}
   */
  function installCaptureListeners() {
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    document.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: false });

    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", onPointerUp, { capture: true, passive: false });
    document.addEventListener("pointercancel", onPointerUp, { capture: true, passive: false });

    document.addEventListener(
      "contextmenu",
      (event) => {
        if (!isInsideMonaco(event.target)) return;

        event.stopImmediatePropagation();
      },
      { capture: true, passive: false },
    );

    document.addEventListener(
      "selectionchange",
      () => {
        if (state.mirror) {
          debug("Native selection changed");
        }
      },
      { capture: true },
    );
  }

  /**
   * Boots the userscript.
   *
   * @returns {void}
   */
  function boot() {
    injectCss();
    patchAddEventListener();
    patchEventMethods();
    installCaptureListeners();

    window.setInterval(scanEditors, CONFIG.scanIntervalMs);

    debug("Booted");
  }

  boot();
})();