// ==UserScript==
// @name         001 / Worker / Prettier + Highlight
// @namespace    https://rod.dev/userscripts
// @version      1.0.0
// @description  Inline worker bridge for Prettier formatting and Highlight.js syntax highlighting.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       999
// @grant        none
// @noframes
// ==/UserScript==

(function RodPrettierHighlightWorkerUserscript() {
  "use strict";

  /* ==========================================================================
   * Constants
   * ========================================================================== */

  const GLOBAL_NAME = "RodCodeWorker";
  const DEFAULT_TIMEOUT_MS = 15000;

  const WORKER_SOURCE = `
    "use strict";

    const CDN = {
      prettier: "https://unpkg.com/prettier@2.8.8/standalone.js",
      parserBabel: "https://unpkg.com/prettier@2.8.8/parser-babel.js",
      parserHtml: "https://unpkg.com/prettier@2.8.8/parser-html.js",
      parserPostcss: "https://unpkg.com/prettier@2.8.8/parser-postcss.js",
      parserTypescript: "https://unpkg.com/prettier@2.8.8/parser-typescript.js",
      highlight: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"
    };

    let loaded = false;
    let loadError = null;

    /**
     * Loads formatter/highlighter dependencies inside the worker.
     *
     * @returns {Promise<void>} Nothing.
     */
    async function loadDependencies() {
      if (loaded) return;
      if (loadError) throw loadError;

      try {
        importScripts(
          CDN.prettier,
          CDN.parserBabel,
          CDN.parserHtml,
          CDN.parserPostcss,
          CDN.parserTypescript,
          CDN.highlight
        );

        loaded = true;
      } catch (error) {
        loadError = error;
        throw error;
      }
    }

    /**
     * Resolves the best Prettier parser for a language.
     *
     * @param {string} language Language id.
     * @returns {string} Prettier parser.
     */
    function resolveParser(language) {
      const normalized = String(language || "").toLowerCase();

      if (normalized === "ts" || normalized === "tsx" || normalized === "typescript") {
        return "typescript";
      }

      if (normalized === "html" || normalized === "xml" || normalized === "svg") {
        return "html";
      }

      if (normalized === "css" || normalized === "scss" || normalized === "less") {
        return "css";
      }

      if (normalized === "json") {
        return "json";
      }

      return "babel";
    }

    /**
     * Formats code with Prettier.
     *
     * @param {{ code: string, language?: string, options?: Record<string, unknown> }} payload Input payload.
     * @returns {Promise<string>} Formatted code.
     */
    async function formatCode(payload) {
      await loadDependencies();

      const parser = payload.options && payload.options.parser
        ? payload.options.parser
        : resolveParser(payload.language);

      return self.prettier.format(String(payload.code || ""), {
        parser,
        plugins: self.prettierPlugins,
        printWidth: 90,
        tabWidth: 2,
        semi: true,
        singleQuote: false,
        trailingComma: "all",
        bracketSpacing: true,
        ...payload.options
      });
    }

    /**
     * Highlights code with Highlight.js.
     *
     * @param {{ code: string, language?: string }} payload Input payload.
     * @returns {Promise<{ html: string, language: string, relevance: number }>} Highlight result.
     */
    async function highlightCode(payload) {
      await loadDependencies();

      const code = String(payload.code || "");
      const language = String(payload.language || "").toLowerCase();

      if (language && self.hljs.getLanguage(language)) {
        const result = self.hljs.highlight(code, { language, ignoreIllegals: true });

        return {
          html: result.value,
          language: result.language || language,
          relevance: result.relevance || 0
        };
      }

      const result = self.hljs.highlightAuto(code);

      return {
        html: result.value,
        language: result.language || "plaintext",
        relevance: result.relevance || 0
      };
    }

    self.addEventListener("message", async event => {
      const message = event.data || {};
      const id = message.id;
      const type = message.type;
      const payload = message.payload || {};

      try {
        if (type === "ping") {
          await loadDependencies();
          self.postMessage({ id, ok: true, value: { ready: true } });
          return;
        }

        if (type === "format") {
          const value = await formatCode(payload);
          self.postMessage({ id, ok: true, value });
          return;
        }

        if (type === "highlight") {
          const value = await highlightCode(payload);
          self.postMessage({ id, ok: true, value });
          return;
        }

        throw new Error("Unknown worker message type: " + type);
      } catch (error) {
        self.postMessage({
          id,
          ok: false,
          error: {
            name: error && error.name ? error.name : "Error",
            message: error && error.message ? error.message : String(error),
            stack: error && error.stack ? error.stack : ""
          }
        });
      }
    });
  `;

  /* ==========================================================================
   * Types
   * ========================================================================== */

  /**
   * @typedef {Object} HighlightResult
   * @property {string} html Highlighted HTML.
   * @property {string} language Detected or requested language.
   * @property {number} relevance Highlight.js relevance score.
   */

  /**
   * @typedef {Object} WorkerBridge
   * @property {(code: string, language?: string, options?: Record<string, unknown>) => Promise<string>} formatCode
   * @property {(code: string, language?: string) => Promise<HighlightResult>} highlightCode
   * @property {() => Promise<boolean>} isReady
   * @property {() => void} dispose
   */

  /* ==========================================================================
   * Worker Bridge
   * ========================================================================== */

  /**
   * Creates a tiny RPC bridge for the inline code worker.
   *
   * @returns {WorkerBridge} Public bridge API.
   *
   * @example
   * const formatted = await window.RodCodeWorker.formatCode("const x={a:1}", "js");
   *
   * @example
   * const highlighted = await window.RodCodeWorker.highlightCode("const x = 1;", "js");
   * element.innerHTML = highlighted.html;
   */
  function createWorkerBridge() {
    const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    let nextId = 1;
    const pending = new Map();

    worker.addEventListener("message", event => {
      const message = event.data || {};
      const entry = pending.get(message.id);

      if (!entry) return;

      clearTimeout(entry.timeoutId);
      pending.delete(message.id);

      if (message.ok) {
        entry.resolve(message.value);
        return;
      }

      const error = new Error(message.error?.message || "Worker request failed.");
      error.name = message.error?.name || "WorkerError";
      error.stack = message.error?.stack || error.stack;

      entry.reject(error);
    });

    worker.addEventListener("error", event => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timeoutId);
        entry.reject(new Error(event.message || "Worker crashed."));
      }

      pending.clear();
    });

    /**
     * Sends one request to the worker and waits for the matching response.
     *
     * @param {string} type Message type.
     * @param {Record<string, unknown>} payload Message payload.
     * @returns {Promise<unknown>} Worker response.
     */
    function request(type, payload) {
      const id = nextId++;

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Worker request timed out."));
        }, DEFAULT_TIMEOUT_MS);

        pending.set(id, { resolve, reject, timeoutId });
        worker.postMessage({ id, type, payload });
      });
    }

    return {
      /**
       * Formats code using Prettier inside the worker.
       *
       * @param {string} code Raw source code.
       * @param {string} [language="js"] Language id.
       * @param {Record<string, unknown>} [options] Prettier options.
       * @returns {Promise<string>} Formatted code.
       */
      formatCode(code, language = "js", options = {}) {
        return request("format", { code, language, options });
      },

      /**
       * Highlights code using Highlight.js inside the worker.
       *
       * @param {string} code Raw source code.
       * @param {string} [language=""] Language id.
       * @returns {Promise<HighlightResult>} Highlight result.
       */
      highlightCode(code, language = "") {
        return request("highlight", { code, language });
      },

      /**
       * Checks whether worker dependencies are loaded.
       *
       * @returns {Promise<boolean>} True when ready.
       */
      async isReady() {
        const result = await request("ping", {});
        return Boolean(result && result.ready);
      },

      /**
       * Disposes the worker and releases its Blob URL.
       *
       * @returns {void}
       */
      dispose() {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);

        for (const entry of pending.values()) {
          clearTimeout(entry.timeoutId);
          entry.reject(new Error("Worker was disposed."));
        }

        pending.clear();
      }
    };
  }

  window[GLOBAL_NAME] = createWorkerBridge();
})();