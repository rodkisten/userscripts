// ==UserScript==
// @name         Rod / DevTools / Floating CodeMirror
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Safe floating CodeMirror enhancer for textareas and contenteditable editors.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @weight       850
// @grant        none
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/theme/material-darker.min.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/dialog/dialog.min.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/display/fullscreen.min.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/fold/foldgutter.min.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/hint/show-hint.min.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/lint/lint.min.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/scroll/simplescrollbars.min.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/meta.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/comment/comment.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/comment/continuecomment.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/display/autorefresh.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/display/fullscreen.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/display/panel.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/display/placeholder.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/dialog/dialog.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/edit/closebrackets.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/edit/continuelist.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/edit/matchbrackets.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/edit/trailingspace.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/fold/brace-fold.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/fold/foldcode.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/fold/foldgutter.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/fold/indent-fold.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/hint/anyword-hint.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/hint/css-hint.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/hint/html-hint.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/hint/javascript-hint.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/hint/show-hint.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/lint/lint.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/lint/css-lint.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/lint/html-lint.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/lint/javascript-lint.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/mode/loadmode.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/mode/overlay.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/runmode/colorize.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/runmode/runmode.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/scroll/scrollpastend.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/scroll/simplescrollbars.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/search/match-highlighter.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/search/matchesonscrollbar.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/search/search.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/search/searchcursor.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/selection/active-line.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/selection/mark-selection.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/selection/selection-pointer.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/wrap/hardwrap.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/css/css.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/go/go.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/javascript/javascript.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/jsx/jsx.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/markdown/markdown.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/properties/properties.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/python/python.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/shell/shell.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/xml/xml.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/htmlmixed/htmlmixed.min.js
          // @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/yaml/yaml.min.js
// ==/UserScript==

(() => {
  "use strict";

  const APP_ID = "migos-codemirror-floating-editor";
  const BUTTON_CLASS = `${APP_ID}__button`;
  const EDITOR_CLASS = `${APP_ID}__editor`;
  const MIN_TARGET_HEIGHT = 36;
  const MIN_TARGET_WIDTH = 120;
  const EDGE_GAP = 10;
  const BUTTON_SIZE = 38;
  const BUTTON_GAP = 8;
  const SCAN_DELAY_MS = 300;
  const REFRESH_DELAY_MS = 80;

  const upgradedTargets = new WeakMap();
  const buttonTargets = new WeakMap();

  /**
   * Injects a stylesheet URL once.
   *
   * @param {string} href CSS URL.
   * @returns {void}
   */
  function addCssLink(href) {
    if (document.querySelector(`link[data-${APP_ID}="${href}"]`)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset[APP_ID] = href;
    document.documentElement.appendChild(link);
  }

  /**
   * Injects all CodeMirror CSS dependencies.
   *
   * @returns {void}
   */
  function installCodeMirrorCss() {
    const base = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7";

    [
      `${base}/codemirror.min.css`,
      `${base}/theme/material-darker.min.css`,
      `${base}/addon/dialog/dialog.min.css`,
      `${base}/addon/display/fullscreen.min.css`,
      `${base}/addon/fold/foldgutter.min.css`,
      `${base}/addon/hint/show-hint.min.css`,
      `${base}/addon/lint/lint.min.css`,
      `${base}/addon/scroll/simplescrollbars.min.css`,
    ].forEach(addCssLink);
  }

  /**
   * Installs the userscript UI CSS.
   *
   * @returns {void}
   */
  function installUiCss() {
    if (document.getElementById(`${APP_ID}-style`)) return;

    const style = document.createElement("style");
    style.id = `${APP_ID}-style`;
    style.textContent = `
      .${BUTTON_CLASS} {
        position: fixed !important;
        z-index: 2147483646 !important;
        width: ${BUTTON_SIZE}px !important;
        height: ${BUTTON_SIZE}px !important;
        border: 1px solid rgba(148, 163, 184, 0.32) !important;
        border-radius: 999px !important;
        padding: 0 !important;
        margin: 0 !important;
        display: grid !important;
        place-items: center !important;
        color: #e5e7eb !important;
        background:
          radial-gradient(circle at 30% 20%, rgba(129, 140, 248, 0.82), transparent 34%),
          linear-gradient(135deg, rgba(17, 24, 39, 0.96), rgba(3, 7, 18, 0.96)) !important;
        box-shadow:
          0 14px 32px rgba(0, 0, 0, 0.36),
          inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
        font: 700 17px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
        cursor: pointer !important;
        touch-action: manipulation !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }

      .${BUTTON_CLASS}:active {
        transform: scale(0.94) !important;
      }

      .${BUTTON_CLASS}[data-enabled="true"] {
        border-color: rgba(34, 197, 94, 0.6) !important;
        box-shadow:
          0 14px 34px rgba(34, 197, 94, 0.18),
          0 0 0 3px rgba(34, 197, 94, 0.12),
          inset 0 1px 0 rgba(255, 255, 255, 0.16) !important;
      }

      .${EDITOR_CLASS} {
        position: relative !important;
        z-index: 1 !important;
      }

      .${EDITOR_CLASS} .CodeMirror {
        min-height: 120px !important;
        height: auto !important;
        border-radius: 14px !important;
        border: 1px solid rgba(148, 163, 184, 0.24) !important;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28) !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
        font-size: 13px !important;
      }

      .${EDITOR_CLASS} .CodeMirror-scroll {
        min-height: 120px !important;
        max-height: min(64vh, 560px) !important;
      }

      .${EDITOR_CLASS} .CodeMirror-gutters {
        border-right-color: rgba(148, 163, 184, 0.22) !important;
      }
    `;

    document.documentElement.appendChild(style);
  }

  /**
   * Checks if a node is editable enough to receive a CodeMirror button.
   *
   * @param {Element} element Candidate element.
   * @returns {boolean} Whether the element should be enhanced.
   */
  function isEditableTarget(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest(`.${EDITOR_CLASS}`)) return false;
    if (element.matches("textarea")) return true;

    const editable = element.getAttribute("contenteditable");
    if (editable === "" || editable === "true" || editable === "plaintext-only") {
      return true;
    }

    return false;
  }

  /**
   * Checks whether a target has enough visible space to deserve a button.
   *
   * @param {HTMLElement} target Editable target.
   * @returns {boolean} Whether the target is visible and usable.
   */
  function isUsableTarget(target) {
    const rect = target.getBoundingClientRect();
    const style = window.getComputedStyle(target);

    return (
      rect.width >= MIN_TARGET_WIDTH &&
      rect.height >= MIN_TARGET_HEIGHT &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  /**
   * Reads text from textarea or contenteditable.
   *
   * @param {HTMLElement} target Editable target.
   * @returns {string} Current text.
   */
  function readTargetValue(target) {
    if (target instanceof HTMLTextAreaElement) return target.value;
    return target.innerText || target.textContent || "";
  }

  /**
   * Writes text back into the original editable element.
   *
   * @param {HTMLElement} target Editable target.
   * @param {string} value Next value.
   * @returns {void}
   */
  function writeTargetValue(target, value) {
    if (target instanceof HTMLTextAreaElement) {
      target.value = value;
      return;
    }

    target.textContent = value;
  }

  /**
   * Dispatches native-ish input/change events so page listeners keep working.
   *
   * @param {HTMLElement} target Original editable target.
   * @returns {void}
   */
  function dispatchTargetEvents(target) {
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * Guesses CodeMirror mode from element metadata and content.
   *
   * @param {HTMLElement} target Editable target.
   * @param {string} value Current text.
   * @returns {string} CodeMirror mode.
   */
  function guessMode(target, value) {
    const haystack = [
      target.getAttribute("data-language"),
      target.getAttribute("data-lang"),
      target.getAttribute("aria-label"),
      target.getAttribute("name"),
      target.getAttribute("id"),
      target.className,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (/\b(css|scss|style)\b/.test(haystack)) return "css";
    if (/\b(go|golang)\b/.test(haystack)) return "go";
    if (/\b(md|markdown)\b/.test(haystack)) return "markdown";
    if (/\b(py|python)\b/.test(haystack)) return "python";
    if (/\b(sh|bash|shell|zsh)\b/.test(haystack)) return "shell";
    if (/\bya?ml\b/.test(haystack)) return "yaml";
    if (/\b(properties|env)\b/.test(haystack)) return "properties";
    if (/\b(html|xml|svg)\b/.test(haystack)) return "htmlmixed";
    if (/\b(jsx|tsx)\b/.test(haystack)) return "jsx";

    const trimmed = value.trim();

    if (/^<([a-z][\w:-]*|!doctype)/i.test(trimmed)) return "htmlmixed";
    if (/^[.#]?[a-z0-9_-]+\s*\{[\s\S]*\}/i.test(trimmed)) return "css";
    if (/^(package\s+main|func\s+\w+\s*\()/m.test(trimmed)) return "go";
    if (/^#!.*\b(?:bash|zsh|sh)\b/m.test(trimmed)) return "shell";
    if (/^\s*[{[]/.test(trimmed) || /\b(function|const|let|var|class|import|export)\b/.test(trimmed)) {
      return "javascript";
    }

    return "javascript";
  }

  /**
   * Clamps a number between boundaries.
   *
   * @param {number} value Number to clamp.
   * @param {number} min Minimum.
   * @param {number} max Maximum.
   * @returns {number} Safe value.
   */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Calculates a collision-safe button position near the target.
   *
   * @param {HTMLElement} target Editable target.
   * @returns {{ left: number, top: number }} Fixed viewport position.
   */
  function getSafeButtonPosition(target) {
    const rect = target.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    const preferredRight = rect.right + BUTTON_GAP;
    const canUseRight = preferredRight + BUTTON_SIZE + EDGE_GAP <= viewportWidth;
    const left = canUseRight ? preferredRight : rect.left - BUTTON_SIZE - BUTTON_GAP;

    return {
      left: clamp(left, EDGE_GAP, viewportWidth - BUTTON_SIZE - EDGE_GAP),
      top: clamp(rect.top + 4, EDGE_GAP, viewportHeight - BUTTON_SIZE - EDGE_GAP),
    };
  }

  /**
   * Moves a floating button so it never escapes the viewport.
   *
   * @param {HTMLButtonElement} button Floating button.
   * @param {HTMLElement} target Editable target.
   * @returns {void}
   */
  function positionButton(button, target) {
    if (!isUsableTarget(target)) {
      button.hidden = true;
      return;
    }

    const position = getSafeButtonPosition(target);
    button.hidden = false;
    button.style.left = `${position.left}px`;
    button.style.top = `${position.top}px`;
  }

  /**
   * Creates a floating button for an editable target.
   *
   * @param {HTMLElement} target Editable target.
   * @returns {HTMLButtonElement} Button element.
   */
  function createButton(target) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = "⌘";
    button.title = "Convert to CodeMirror";
    button.setAttribute("aria-label", "Convert this editor to CodeMirror");
    button.dataset.enabled = "false";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleCodeMirror(target, button);
    });

    document.documentElement.appendChild(button);
    positionButton(button, target);

    return button;
  }

  /**
   * Builds a hidden textarea bridge for contenteditable targets.
   *
   * @param {HTMLElement} target Contenteditable target.
   * @returns {HTMLTextAreaElement} Hidden bridge textarea.
   */
  function createBridgeTextarea(target) {
    const textarea = document.createElement("textarea");
    textarea.value = readTargetValue(target);
    textarea.setAttribute("aria-hidden", "true");
    textarea.tabIndex = -1;
    textarea.style.cssText = [
      "position:absolute",
      "left:-99999px",
      "top:auto",
      "width:1px",
      "height:1px",
      "opacity:0",
      "pointer-events:none",
    ].join(";");

    target.after(textarea);
    return textarea;
  }

  /**
   * Creates CodeMirror options for a target.
   *
   * @param {HTMLElement} target Editable target.
   * @param {string} value Current text.
   * @returns {CodeMirror.EditorConfiguration} CodeMirror configuration.
   */
  function createEditorOptions(target, value) {
    const mode = guessMode(target, value);
    const placeholder = target.getAttribute("placeholder") || target.getAttribute("aria-placeholder") || "";

    return {
      value,
      mode,
      theme: "material-darker",
      lineNumbers: true,
      lineWrapping: true,
      autofocus: true,
      autoRefresh: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      styleActiveLine: true,
      styleSelectedText: true,
      showTrailingSpace: true,
      scrollPastEnd: true,
      scrollbarStyle: "simple",
      foldGutter: true,
      lint: true,
      gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"],
      placeholder,
      extraKeys: {
        "Ctrl-Space": "autocomplete",
        "Cmd-/": "toggleComment",
        "Ctrl-/": "toggleComment",
        "Cmd-F": "findPersistent",
        "Ctrl-F": "findPersistent",
        "Alt-F": "foldCode",
        "Alt-U": "unfoldCode",
        Tab(editor) {
          if (editor.somethingSelected()) {
            editor.indentSelection("add");
            return;
          }

          editor.replaceSelection("  ", "end", "+input");
        },
      },
    };
  }

  /**
   * Upgrades a textarea or contenteditable element into CodeMirror.
   *
   * @param {HTMLElement} target Editable target.
   * @param {HTMLButtonElement} button Floating button.
   * @returns {void}
   */
  function enableCodeMirror(target, button) {
    if (upgradedTargets.has(target)) return;
    if (!window.CodeMirror) return;

    const originalDisplay = target.style.display;
    const originalVisibility = target.style.visibility;
    const originalValue = readTargetValue(target);
    const bridge = target instanceof HTMLTextAreaElement ? target : createBridgeTextarea(target);
    const wrapper = document.createElement("div");

    wrapper.className = EDITOR_CLASS;
    target.after(wrapper);
    wrapper.appendChild(bridge);

    if (!(target instanceof HTMLTextAreaElement)) {
      target.style.display = "none";
    }

    const editor = window.CodeMirror.fromTextArea(bridge, createEditorOptions(target, originalValue));

    editor.on("change", () => {
      const nextValue = editor.getValue();
      writeTargetValue(target, nextValue);
      bridge.value = nextValue;
      dispatchTargetEvents(target);
    });

    editor.on("focus", () => {
      target.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    });

    editor.on("blur", () => {
      target.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      dispatchTargetEvents(target);
    });

    const refresh = () => {
      editor.refresh();
      editor.focus();
    };

    window.setTimeout(refresh, REFRESH_DELAY_MS);

    upgradedTargets.set(target, {
      bridge,
      button,
      editor,
      originalDisplay,
      originalVisibility,
      wrapper,
    });

    button.dataset.enabled = "true";
    button.title = "Restore original editor";
    positionButton(button, wrapper);
  }

  /**
   * Restores the original textarea/contenteditable element.
   *
   * @param {HTMLElement} target Editable target.
   * @returns {void}
   */
  function disableCodeMirror(target) {
    const record = upgradedTargets.get(target);
    if (!record) return;

    const value = record.editor.getValue();

    writeTargetValue(target, value);
    dispatchTargetEvents(target);
    record.editor.toTextArea();

    if (!(target instanceof HTMLTextAreaElement)) {
      target.style.display = record.originalDisplay;
      target.style.visibility = record.originalVisibility;
      record.bridge.remove();
    }

    record.wrapper.remove();
    record.button.dataset.enabled = "false";
    record.button.title = "Convert to CodeMirror";

    upgradedTargets.delete(target);
    positionButton(record.button, target);
  }

  /**
   * Toggles CodeMirror for the target.
   *
   * @param {HTMLElement} target Editable target.
   * @param {HTMLButtonElement} button Floating button.
   * @returns {void}
   */
  function toggleCodeMirror(target, button) {
    if (upgradedTargets.has(target)) {
      disableCodeMirror(target);
      return;
    }

    enableCodeMirror(target, button);
  }

  /**
   * Adds a floating button for a target if missing.
   *
   * @param {HTMLElement} target Editable target.
   * @returns {void}
   */
  function registerTarget(target) {
    if (!isEditableTarget(target)) return;
    if (!isUsableTarget(target)) return;
    if (buttonTargets.has(target)) return;

    const button = createButton(target);
    buttonTargets.set(target, button);
  }

  /**
   * Scans the page for editable targets.
   *
   * @returns {void}
   */
  function scanTargets() {
    document.querySelectorAll("textarea, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']").forEach((node) => {
      if (node instanceof HTMLElement) registerTarget(node);
    });

    repositionAllButtons();
  }

  /**
   * Repositions all known buttons.
   *
   * @returns {void}
   */
  function repositionAllButtons() {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;

      for (const [target, knownButton] of weakMapEntriesFallback()) {
        if (knownButton !== button) continue;

        const record = upgradedTargets.get(target);
        positionButton(button, record?.wrapper || target);
      }
    });
  }

  /**
   * Mirrors WeakMap target/button pairs because WeakMap is not iterable.
   *
   * @returns {Array<[HTMLElement, HTMLButtonElement]>} Known pairs.
   */
  function weakMapEntriesFallback() {
    const pairs = [];

    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
      const target = button.__migosCodeMirrorTarget;
      if (target instanceof HTMLElement) {
        pairs.push([target, button]);
      }
    });

    return pairs;
  }

  /**
   * Registers a button and stores a direct debug-safe reference.
   *
   * @param {HTMLElement} target Editable target.
   * @param {HTMLButtonElement} button Floating button.
   * @returns {void}
   */
  function rememberButtonTarget(target, button) {
    button.__migosCodeMirrorTarget = target;
  }

  const originalCreateButton = createButton;

  createButton = function patchedCreateButton(target) {
    const button = originalCreateButton(target);
    rememberButtonTarget(target, button);
    return button;
  };

  /**
   * Starts mutation watching for late-created editors.
   *
   * @returns {void}
   */
  function watchDom() {
    let scanTimer = 0;

    const scheduleScan = () => {
      window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(scanTargets, SCAN_DELAY_MS);
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["contenteditable", "style", "class"],
    });

    window.addEventListener("scroll", repositionAllButtons, true);
    window.addEventListener("resize", repositionAllButtons, true);
    window.addEventListener("orientationchange", repositionAllButtons, true);
    window.visualViewport?.addEventListener("resize", repositionAllButtons);
    window.visualViewport?.addEventListener("scroll", repositionAllButtons);
  }

  /**
   * Boots the userscript.
   *
   * @returns {void}
   */
  function boot() {
    if (!window.CodeMirror) return;

    installCodeMirrorCss();
    installUiCss();
    scanTargets();
    watchDom();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();