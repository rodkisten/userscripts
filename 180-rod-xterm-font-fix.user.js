// ==UserScript==
// @name         Rod / DevTools / XTerm Font Fix
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Improves xterm.js canvas font readability on mobile.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @weight       800
// @grant        none
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// ==/UserScript==

(() => {
  "use strict";

  const FONT_FAMILY = "Menlo, Monaco, Consolas, 'Courier New', monospace";
  const FONT_SIZE = 14;
  const LINE_HEIGHT = 1.15;

  const STYLE_ID = "migos-xterm-canvas-font-fix";
  const LOG_PREFIX = "🖥️ [xterm-font-fix]";

  /**
   * Logs safely.
   *
   * @param {...unknown} args
   * @returns {void}
   */
  function log(...args) {
    try {
      console.log(LOG_PREFIX, ...args);
    } catch {
      // Ignore hostile consoles.
    }
  }

  /**
   * Replaces any canvas font family with our safe monospace stack.
   *
   * @param {string} value
   * @returns {string}
   */
  function normalizeCanvasFont(value) {
    if (typeof value !== "string") {
      return `${FONT_SIZE}px ${FONT_FAMILY}`;
    }

    const sizeMatch = value.match(/(?:normal|italic|bold|\d+\s*)*\s*(\d+(?:\.\d+)?px)/i);
    const size = sizeMatch?.[1] || `${FONT_SIZE}px`;

    return `${size} ${FONT_FAMILY}`;
  }

  /**
   * Patches CanvasRenderingContext2D.font globally.
   *
   * @returns {void}
   */
  function patchCanvasFontSetter() {
    const proto = CanvasRenderingContext2D.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "font");

    if (!descriptor?.get || !descriptor?.set) {
      log("Canvas font descriptor not found");
      return;
    }

    if (proto.__migosXtermCanvasFontPatched) {
      return;
    }

    Object.defineProperty(proto, "__migosXtermCanvasFontPatched", {
      value: true,
      configurable: false,
    });

    Object.defineProperty(proto, "font", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        return descriptor.get.call(this);
      },
      set(nextFont) {
        const fixedFont = normalizeCanvasFont(nextFont);
        descriptor.set.call(this, fixedFont);
      },
    });

    log("Canvas font setter patched");
  }

  /**
   * Injects CSS fallback for DOM renderer and helper textarea.
   *
   * @returns {void}
   */
  function injectCss() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .xterm,
      .xterm *,
      .xterm-rows,
      .xterm-rows span,
      .xterm-screen,
      .xterm-helper-textarea,
      .xterm-accessibility,
      .xterm-decoration-container {
        font-family: ${FONT_FAMILY} !important;
        font-size: ${FONT_SIZE}px !important;
        line-height: ${LINE_HEIGHT} !important;
        font-style: normal !important;
        font-variant-ligatures: none !important;
        font-feature-settings: "liga" 0, "calt" 0 !important;
        -webkit-font-smoothing: antialiased !important;
        text-rendering: optimizeLegibility !important;
      }

      .xterm canvas {
        image-rendering: auto !important;
        transform: translateZ(0) !important;
      }

      .xterm-helper-textarea {
        font-size: 16px !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Patches a Terminal instance.
   *
   * @param {any} terminal
   * @returns {void}
   */
  function patchTerminalInstance(terminal) {
    if (!terminal || terminal.__migosXtermFixed) {
      return;
    }

    terminal.__migosXtermFixed = true;

    try {
      terminal.options ||= {};
      terminal.options.fontFamily = FONT_FAMILY;
      terminal.options.fontSize = FONT_SIZE;
      terminal.options.lineHeight = LINE_HEIGHT;
      terminal.options.fontWeight = "normal";
      terminal.options.fontWeightBold = "bold";

      terminal.setOption?.("fontFamily", FONT_FAMILY);
      terminal.setOption?.("fontSize", FONT_SIZE);
      terminal.setOption?.("lineHeight", LINE_HEIGHT);
      terminal.setOption?.("fontWeight", "normal");
      terminal.setOption?.("fontWeightBold", "bold");

      setTimeout(() => {
        terminal.refresh?.(0, terminal.rows || 999);
        terminal._core?._charSizeService?.measure?.();
        terminal._core?._renderService?.clear?.();
        terminal._core?._renderService?.refreshRows?.(0, terminal.rows || 999);
      }, 100);

      log("Terminal instance patched", terminal);
    } catch (error) {
      log("Failed patching terminal instance", error);
    }
  }

  /**
   * Wraps xterm prototype methods.
   *
   * @param {Function} Terminal
   * @returns {void}
   */
  function patchTerminalConstructor(Terminal) {
    if (!Terminal?.prototype || Terminal.__migosXtermConstructorPatched) {
      return;
    }

    Terminal.__migosXtermConstructorPatched = true;

    for (const methodName of ["open", "write", "writeln", "loadAddon", "refresh"]) {
      const original = Terminal.prototype[methodName];

      if (typeof original !== "function") {
        continue;
      }

      Terminal.prototype[methodName] = function patchedMethod(...args) {
        const result = original.apply(this, args);

        patchTerminalInstance(this);

        setTimeout(() => patchTerminalInstance(this), 0);
        setTimeout(() => patchTerminalInstance(this), 250);
        setTimeout(() => patchTerminalInstance(this), 1000);

        return result;
      };
    }

    log("Terminal constructor patched");
  }

  /**
   * Patches known global xterm exports.
   *
   * @returns {void}
   */
  function scanGlobals() {
    patchTerminalConstructor(window.Terminal);
    patchTerminalConstructor(window.XTerm?.Terminal);
    patchTerminalConstructor(window.xterm?.Terminal);
  }

  /**
   * Reapplies DOM styles.
   *
   * @returns {void}
   */
  function scanDom() {
    injectCss();

    for (const element of document.querySelectorAll(".xterm, .xterm *")) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      element.style.setProperty("font-family", FONT_FAMILY, "important");
      element.style.setProperty("font-style", "normal", "important");
      element.style.setProperty("font-size", `${FONT_SIZE}px`, "important");
      element.style.setProperty("line-height", String(LINE_HEIGHT), "important");
    }
  }

  /**
   * Runs the full patch cycle.
   *
   * @returns {void}
   */
  function run() {
    patchCanvasFontSetter();
    scanGlobals();
    scanDom();
  }

  patchCanvasFontSetter();
  injectCss();

  const observer = new MutationObserver(run);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });

  document.addEventListener("DOMContentLoaded", run);
  window.addEventListener("load", run);

  run();
  setInterval(run, 700);
})();