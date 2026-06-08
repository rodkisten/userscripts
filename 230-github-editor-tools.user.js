// ==UserScript==
// @name         Rod / GitHub / Editor Tools
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile editor helpers for GitHub edit pages.
// @author       Rod
// @match        https://github.com/*/*/edit/*
// @match        https://github.com/*/*/new/*
// @run-at       document-idle
// @weight       670
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = {
    toolbarId: "migos-github-ios-editor-toolbar",
    zoomClass: "migos-github-ios-editor-zoom",
    buttonClass: "migos-github-ios-editor-button",
    editorSelector: [
      "textarea",
      ".cm-content[contenteditable='true']",
      "[role='textbox'][contenteditable='true']",
      ".monaco-editor textarea",
    ].join(", "),
    githubHeaderOffsetPx: 64,
    focusDelayMs: 80,
    toastDurationMs: 1800,
  };

  /**
   * @returns {boolean}
   */
  function isIOSLikeSafari() {
    const ua = navigator.userAgent || "";
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);

    return isiOS && isSafari;
  }

  /**
   * @returns {HTMLElement | HTMLTextAreaElement | null}
   */
  function findEditor() {
    const candidates = [...document.querySelectorAll(CONFIG.editorSelector)];

    return candidates.find((element) => {
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 40 && rect.height > 40;
      const editable =
        element instanceof HTMLTextAreaElement ||
        element.getAttribute("contenteditable") === "true" ||
        element.getAttribute("role") === "textbox";

      return visible && editable;
    }) || null;
  }

  /**
   * @param {HTMLElement | HTMLTextAreaElement} editor
   * @returns {string}
   */
  function getEditorValue(editor) {
    if (editor instanceof HTMLTextAreaElement) {
      return editor.value;
    }

    return editor.textContent || "";
  }

  /**
   * @param {HTMLElement | HTMLTextAreaElement} editor
   * @param {string} value
   * @returns {void}
   */
  function setEditorValue(editor, value) {
    editor.focus();

    if (editor instanceof HTMLTextAreaElement) {
      editor.value = value;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();

    editor.textContent = value;
    range.selectNodeContents(editor);
    range.collapse(false);

    selection?.removeAllRanges();
    selection?.addRange(range);

    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }

  /**
   * @param {HTMLElement | HTMLTextAreaElement} editor
   * @param {string} value
   * @returns {void}
   */
  function insertAtCursor(editor, value) {
    editor.focus();

    if (editor instanceof HTMLTextAreaElement) {
      const start = editor.selectionStart ?? editor.value.length;
      const end = editor.selectionEnd ?? editor.value.length;
      const before = editor.value.slice(0, start);
      const after = editor.value.slice(end);

      editor.value = `${before}${value}${after}`;
      editor.selectionStart = start + value.length;
      editor.selectionEnd = start + value.length;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: value }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    document.execCommand("insertText", false, value);
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: value }));
  }

  /**
   * Clipboard reads on Safari need to be triggered by a real user action.
   *
   * @returns {Promise<string>}
   */
  async function readClipboardText() {
    if (navigator.clipboard?.readText) {
      return navigator.clipboard.readText();
    }

    throw new Error("Clipboard API unavailable. Use the native paste menu inside the editor.");
  }

  /**
   * @param {string} message
   * @returns {void}
   */
  function toast(message) {
    let node = document.querySelector("#migos-github-ios-editor-toast");

    if (!node) {
      node = document.createElement("div");
      node.id = "migos-github-ios-editor-toast";
      document.body.appendChild(node);
    }

    node.textContent = message;
    node.classList.add("is-visible");

    window.clearTimeout(toast.timeoutId);
    toast.timeoutId = window.setTimeout(() => {
      node.classList.remove("is-visible");
    }, CONFIG.toastDurationMs);
  }

  toast.timeoutId = 0;

  /**
   * @returns {void}
   */
  function focusEditorComfortably() {
    const editor = findEditor();

    if (!editor) {
      toast("Editor não encontrado ainda");
      return;
    }

    document.documentElement.classList.add(CONFIG.zoomClass);

    window.setTimeout(() => {
      editor.focus({ preventScroll: false });

      const rect = editor.getBoundingClientRect();
      const top = rect.top + window.scrollY - CONFIG.githubHeaderOffsetPx;

      window.scrollTo({
        top: Math.max(0, top),
        behavior: "smooth",
      });
    }, CONFIG.focusDelayMs);
  }

  /**
   * @param {string} label
   * @param {string} title
   * @param {() => void | Promise<void>} action
   * @returns {HTMLButtonElement}
   */
  function createButton(label, title, action) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = CONFIG.buttonClass;
    button.textContent = label;
    button.title = title;

    button.addEventListener("click", async () => {
      try {
        await action();
      } catch (error) {
        console.error("[GitHub iOS Editor Toolbar]", error);
        toast(error instanceof Error ? error.message : "Erro inesperado");
      }
    });

    return button;
  }

  /**
   * @returns {void}
   */
  function installStyles() {
    if (document.querySelector("#migos-github-ios-editor-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "migos-github-ios-editor-style";
    style.textContent = `
      #${CONFIG.toolbarId} {
        position: fixed;
        top: max(8px, env(safe-area-inset-top));
        left: 8px;
        right: 8px;
        z-index: 2147483647;
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: center;
        padding: 8px;
        border: 1px solid rgba(140, 149, 159, 0.35);
        border-radius: 16px;
        background: color-mix(in srgb, Canvas 86%, transparent);
        backdrop-filter: blur(18px) saturate(1.25);
        -webkit-backdrop-filter: blur(18px) saturate(1.25);
        box-shadow: 0 12px 38px rgba(0, 0, 0, 0.22);
      }

      .${CONFIG.buttonClass} {
        min-height: 38px;
        padding: 0 12px;
        border: 1px solid rgba(140, 149, 159, 0.45);
        border-radius: 999px;
        background: rgba(125, 125, 125, 0.12);
        color: inherit;
        font: 700 13px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .${CONFIG.buttonClass}:active {
        transform: scale(0.96);
        background: rgba(125, 125, 125, 0.22);
      }

      #migos-github-ios-editor-toast {
        position: fixed;
        left: 50%;
        bottom: max(18px, env(safe-area-inset-bottom));
        z-index: 2147483647;
        max-width: calc(100vw - 32px);
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(20, 20, 20, 0.88);
        color: white;
        font: 700 13px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        opacity: 0;
        pointer-events: none;
        transform: translateX(-50%) translateY(10px);
        transition: opacity 160ms ease, transform 160ms ease;
      }

      #migos-github-ios-editor-toast.is-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      html.${CONFIG.zoomClass} body {
        -webkit-text-size-adjust: 115%;
      }

      html.${CONFIG.zoomClass} textarea,
      html.${CONFIG.zoomClass} .cm-content,
      html.${CONFIG.zoomClass} [contenteditable="true"],
      html.${CONFIG.zoomClass} [role="textbox"] {
        font-size: 16px !important;
        line-height: 1.55 !important;
        tab-size: 2 !important;
        -webkit-text-size-adjust: 100% !important;
        caret-color: currentColor;
      }

      html.${CONFIG.zoomClass} .react-code-text,
      html.${CONFIG.zoomClass} .cm-line {
        min-height: 1.55em !important;
      }

      @media (max-width: 720px) {
        body {
          padding-top: 64px !important;
        }

        #${CONFIG.toolbarId} {
          justify-content: space-between;
        }

        .${CONFIG.buttonClass} {
          flex: 1;
          padding-inline: 8px;
          font-size: 12px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * @returns {void}
   */
  function installToolbar() {
    if (document.querySelector(`#${CONFIG.toolbarId}`)) {
      return;
    }

    installStyles();

    const toolbar = document.createElement("div");
    toolbar.id = CONFIG.toolbarId;

    toolbar.append(
      createButton("🔍 Editor", "Focar editor e aplicar zoom confortável", () => {
        focusEditorComfortably();
        toast("Editor em modo leitura confortável");
      }),

      createButton("🧹 Limpar", "Limpar todo o conteúdo do editor", () => {
        const editor = findEditor();

        if (!editor) {
          toast("Editor não encontrado");
          return;
        }

        setEditorValue(editor, "");
        toast("Editor limpo");
      }),

      createButton("📋 Colar", "Colar no cursor sem limpar", async () => {
        const editor = findEditor();

        if (!editor) {
          toast("Editor não encontrado");
          return;
        }

        const text = await readClipboardText();
        insertAtCursor(editor, text);
        toast("Colado no cursor");
      }),

      createButton("♻️ Substituir", "Limpar tudo e colar o clipboard", async () => {
        const editor = findEditor();

        if (!editor) {
          toast("Editor não encontrado");
          return;
        }

        const text = await readClipboardText();
        setEditorValue(editor, text);
        toast("Conteúdo substituído");
      }),
    );

    document.body.appendChild(toolbar);
  }

  /**
   * @returns {void}
   */
  function boot() {
    installToolbar();

    if (isIOSLikeSafari()) {
      focusEditorComfortably();
    }
  }

  boot();

  new MutationObserver(() => {
    installToolbar();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();