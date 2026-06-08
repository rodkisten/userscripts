// ==UserScript==
// @name         000 / Alerta / Shared Utils
// @namespace    https://rod.dev/userscripts
// @version      1.4.0
// @description  Shared utilities for Alerta Docked Inspector.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/es-toolkit@^1
// @require      https://unpkg.com/lucide@0.468.0/dist/umd/lucide.js?v1
// @weight       999
// @grant        none
// ==/UserScript==

(function InstallRodUtils() {
  "use strict";

  /********************
   * Constants
   ********************/

  const GLOBAL_NAME = "RodUtils";
  const VERSION = "1.4.0";
  const DEBUG_FLAG = "__ROD_DEBUG__";
  const STYLE_LOADER_PREFIX = "rod-utils-style-";
  const SCRIPT_LOADER_PREFIX = "rod-utils-script-";

  const REACT_PROPS_PREFIX = "__reactProps$";
  const REACT_FIBER_PREFIX = "__reactFiber$";
  const REACT_LEGACY_INSTANCE_PREFIX = "__reactInternalInstance$";

  const MAX_PRETTY_SOURCE_LENGTH = 250_000;
  const DEFAULT_TIMEOUT_MS = 10_000;
  const DEFAULT_LOADER_TIMEOUT_MS = 12_000;

  const CURRENT_EFFECT_STACK = [];
  const EFFECT_DEPS = new WeakMap();

  const loadedScripts = new Map();
  const loadedStyles = new Map();

  const module = { exports: {} };
  const exports = module.exports;

  /********************
   * Logger
   ********************/

  /**
   * Creates a namespaced console logger.
   *
   * @param {string} namespace Logger namespace.
   * @returns {{
   *   log: (fn: string, ...args: any[]) => void;
   *   info: (fn: string, ...args: any[]) => void;
   *   warn: (fn: string, ...args: any[]) => void;
   *   error: (fn: string, ...args: any[]) => void;
   *   debug: (fn: string, ...args: any[]) => void;
   *   group: (fn: string, ...args: any[]) => void;
   *   groupEnd: () => void;
   * }}
   *
   * @example
   * const logger = RodUtils.createLogger("UTILS");
   * logger.log("boot", "Ready");
   */
  exports.createLogger = function createLogger(namespace) {
    /**
     * Formats the visible console prefix.
     *
     * @param {string} fn Function name.
     * @returns {string} Console prefix.
     */
    function prefix(fn) {
      return `[${namespace}] [${fn || "anonymous"}]`;
    }

    /**
     * Creates a console method wrapper.
     *
     * @param {"log"|"info"|"warn"|"error"|"debug"|"group"} level Console level.
     * @returns {(fn: string, ...args: any[]) => void} Wrapped method.
     */
    function createMethod(level) {
      return function loggerMethod(fn, ...args) {
        const output = console[level] || console.log;

        output.call(
          console,
          `%c${prefix(fn)}`,
          "color:#a78bfa;font-weight:700;",
          ...args,
        );
      };
    }

    return Object.freeze({
      log: createMethod("log"),
      info: createMethod("info"),
      warn: createMethod("warn"),
      error: createMethod("error"),
      debug: createMethod("debug"),
      group: createMethod("group"),
      groupEnd() {
        if (console.groupEnd) console.groupEnd();
      },
    });
  };

  const logger = exports.createLogger("RodUtils");

  /********************
   * General Helpers
   ********************/

  /**
   * Defines a global property.
   *
   * @param {string} name Global name.
   * @param {*} value Global value.
   * @param {{ immutable?: boolean; enumerable?: boolean }} [options] Options.
   * @returns {boolean} Success state.
   *
   * @example
   * RodUtils.defineGlobal("MyApi", api, { immutable: true });
   */
  exports.defineGlobal = function defineGlobal(name, value, options = {}) {
    const immutable = options.immutable === true;
    const enumerable = options.enumerable === true;

    try {
      Object.defineProperty(window, name, {
        value,
        configurable: !immutable,
        enumerable,
        writable: !immutable,
      });

      return true;
    } catch {
      try {
        window[name] = value;
        return true;
      } catch {
        return false;
      }
    }
  };

  /**
   * Hashes text into a compact id.
   *
   * @param {*} value Value.
   * @returns {string} Hash.
   *
   * @example
   * RodUtils.hashText("hello");
   */
  exports.hashText = function hashText(value) {
    let hash = 5381;
    const text = String(value);

    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 33) ^ text.charCodeAt(index);
    }

    return Math.abs(hash >>> 0).toString(36);
  };

  /**
   * Safely runs a callback.
   *
   * @template T
   * @param {() => T} callback Callback.
   * @param {*} [fallback=null] Fallback.
   * @returns {T|*} Result.
   *
   * @example
   * const data = RodUtils.safeCall(() => JSON.parse(raw), {});
   */
  exports.safeCall = function safeCall(callback, fallback = null) {
    try {
      return callback();
    } catch {
      return fallback;
    }
  };

  /**
   * Escapes HTML text.
   *
   * @param {*} value Raw value.
   * @returns {string} Escaped value.
   *
   * @example
   * RodUtils.escapeHtml("<div>");
   */
  exports.escapeHtml = function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  /**
   * Trims long text.
   *
   * @param {*} value Value.
   * @param {number} [limit=240] Max length.
   * @returns {string} Trimmed text.
   *
   * @example
   * RodUtils.trimText("abcdef", 3);
   */
  exports.trimText = function trimText(value, limit = 240) {
    const text = String(value ?? "");
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  };

  /**
   * Formats bytes.
   *
   * @param {number|null|undefined} bytes Byte size.
   * @returns {string} Human-readable size.
   *
   * @example
   * RodUtils.formatBytes(1024);
   */
  exports.formatBytes = function formatBytes(bytes) {
    if (bytes == null || Number.isNaN(Number(bytes))) return "n/a";

    const units = ["B", "KB", "MB", "GB"];
    let value = Math.abs(Number(bytes));
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }

    return `${bytes < 0 ? "-" : ""}${value.toFixed(2)} ${units[unit]}`;
  };

  /**
   * Reads JS heap memory when the browser exposes it.
   *
   * @returns {{ used: number; total: number; limit: number }|null} Memory info.
   *
   * @example
   * RodUtils.getMemorySnapshot();
   */
  exports.getMemorySnapshot = function getMemorySnapshot() {
    const memory = performance && performance.memory;

    if (!memory) return null;

    return {
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      limit: memory.jsHeapSizeLimit,
    };
  };

  /**
   * Creates a centered terminal line.
   *
   * @param {string} text Label.
   * @param {string} [symbol="•"] Fill symbol.
   * @param {number} [size=60] Width.
   * @param {(message: string) => void} [log=console.warn] Logger.
   * @returns {string} Generated line.
   *
   * @example
   * RodUtils.line("Summary");
   */
  exports.line = function line(text, symbol = "•", size = 60, log = console.warn) {
    const label = ` ${text} `;
    const available = Math.max(0, size - label.length);
    const left = Math.floor(available / 2);
    const right = available - left;
    const output = `${symbol.repeat(left)}${label}${symbol.repeat(right)}`;

    log(output);

    return output;
  };

  /**
   * Creates circular-safe JSON.
   *
   * @param {*} value Value.
   * @param {number} [space=2] Indentation.
   * @returns {string} JSON text.
   *
   * @example
   * RodUtils.safeJson(window);
   */
  exports.safeJson = function safeJson(value, space = 2) {
    const seen = new WeakSet();

    return JSON.stringify(
      value,
      function replacer(_key, currentValue) {
        if (typeof currentValue === "object" && currentValue !== null) {
          if (seen.has(currentValue)) return "[Circular]";
          seen.add(currentValue);
        }

        if (typeof currentValue === "function") return `[Function ${currentValue.name || "anonymous"}]`;
        if (typeof currentValue === "bigint") return `${currentValue}n`;
        if (currentValue instanceof Node) return exports.getNodeLabel(currentValue);

        return currentValue;
      },
      space,
    );
  };

  /********************
   * Async / Loading
   ********************/

  /**
   * Waits until requested globals exist.
   *
   * @param {string|string[]} globals Global names.
   * @param {number} [timeout=10000] Timeout.
   * @returns {Promise<*[]>} Global values.
   *
   * @example
   * const [utils] = await RodUtils.waitForGlobal("RodUtils");
   */
  exports.waitForGlobal = async function waitForGlobal(globals, timeout = DEFAULT_TIMEOUT_MS) {
    const keys = Array.isArray(globals) ? globals : [globals];
    const startedAt = performance.now();

    while (performance.now() - startedAt < timeout) {
      const values = keys.map((key) => window[key]);

      if (values.every((value) => value !== undefined)) return values;

      await new Promise((resolve) => setTimeout(resolve, 16));
    }

    throw new Error(`[RodUtils.waitForGlobal] Timeout waiting for: ${keys.join(", ")}`);
  };

  /**
   * Imports an ESM module with a timeout.
   *
   * @param {string} url Module URL.
   * @param {number} [timeout=4000] Timeout.
   * @returns {Promise<*>} Imported module.
   *
   * @example
   * const mod = await RodUtils.timeoutImport("https://esm.sh/lit");
   */
  exports.timeoutImport = function timeoutImport(url, timeout = 4_000) {
    return Promise.race([
      import(url),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`[RodUtils.timeoutImport] Timeout importing ${url}`)), timeout);
      }),
    ]);
  };

  /**
   * Loads a script once.
   *
   * @param {string} url Script URL.
   * @param {{ id?: string; timeout?: number }} [options] Options.
   * @returns {Promise<HTMLScriptElement>} Script element.
   *
   * @example
   * await RodUtils.loadScriptOnce("https://example.com/app.js");
   */
  exports.loadScriptOnce = function loadScriptOnce(url, options = {}) {
    const id = options.id || `${SCRIPT_LOADER_PREFIX}${exports.hashText(url)}`;
    const timeout = options.timeout || DEFAULT_LOADER_TIMEOUT_MS;

    if (loadedScripts.has(id)) return loadedScripts.get(id);

    const existing = document.getElementById(id);

    if (existing instanceof HTMLScriptElement) {
      const promise = Promise.resolve(existing);
      loadedScripts.set(id, promise);
      return promise;
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        script.remove();
        loadedScripts.delete(id);
        reject(new Error(`[RodUtils.loadScriptOnce] Timeout loading ${url}`));
      }, timeout);

      script.id = id;
      script.src = url;
      script.async = true;

      script.onload = () => {
        clearTimeout(timer);
        resolve(script);
      };

      script.onerror = () => {
        clearTimeout(timer);
        loadedScripts.delete(id);
        reject(new Error(`[RodUtils.loadScriptOnce] Failed loading ${url}`));
      };

      document.documentElement.appendChild(script);
    });

    loadedScripts.set(id, promise);

    return promise;
  };

  /**
   * Installs a style tag once.
   *
   * @param {string} cssText CSS text.
   * @param {string} [id=""] Optional id.
   * @param {Document|ShadowRoot} [root=document] Target root.
   * @returns {HTMLStyleElement} Style element.
   *
   * @example
   * RodUtils.installStyleOnce(".x{color:red}");
   */
  exports.installStyleOnce = function installStyleOnce(cssText, id = "", root = document) {
    const styleId = id || `${STYLE_LOADER_PREFIX}${exports.hashText(cssText)}`;
    const key = `${styleId}:${root === document ? "document" : exports.hashText(String(root))}`;

    if (loadedStyles.has(key)) return loadedStyles.get(key);

    const existing = root.getElementById?.(styleId) || document.getElementById(styleId);

    if (existing instanceof HTMLStyleElement) {
      loadedStyles.set(key, existing);
      return existing;
    }

    const style = document.createElement("style");

    style.id = styleId;
    style.textContent = String(cssText);

    if (root === document) {
      document.documentElement.appendChild(style);
    } else {
      root.appendChild(style);
    }

    loadedStyles.set(key, style);

    return style;
  };

  /********************
   * Timing / Debug
   ********************/

  /**
   * Wraps a function and logs time, memory delta, status, and errors.
   *
   * @template {(...args: any[]) => any} T
   * @param {string} label Log label.
   * @param {T} fn Function to wrap.
   * @param {{
   *   namespace?: string;
   *   logger?: Console;
   *   showArgs?: boolean;
   *   alwaysLog?: boolean;
   * }} [options] Options.
   * @returns {T} Wrapped function.
   *
   * @example
   * const run = RodUtils.timed("parseCss", () => parseCss(source));
   */
  exports.timed = function timed(label, fn, options = {}) {
    const namespace = options.namespace || "RodUtils";
    const logTarget = options.logger || console;
    const showArgs = options.showArgs === true;
    const alwaysLog = options.alwaysLog === true;
    const shouldDebug = alwaysLog || window[DEBUG_FLAG] === true;
    const scopedLogger = exports.createLogger(namespace);

    /**
     * Prints a small group when debug is disabled.
     *
     * @param {any[]} args Function args.
     * @param {() => *} invoke Invoke function.
     * @returns {*} Function result.
     */
    function runWithoutReport(args, invoke) {
      if (!shouldDebug) {
        alerta?.setFunction?.(label);

        try {
          return invoke();
        } finally {
          alerta?.clear?.();
        }
      }

      scopedLogger.debug(label, "Started", showArgs ? args : "");

      return invoke();
    }

    /**
     * Prints the final report.
     *
     * @param {"ok"|"error"} status Status.
     * @param {number} startedAt Start time.
     * @param {{ used: number; total: number; limit: number }|null} memoryBefore Memory before.
     * @param {*|null} error Error.
     * @param {any[]} args Function args.
     * @returns {void}
     */
    function printReport(status, startedAt, memoryBefore, error, args) {
      const duration = performance.now() - startedAt;
      const memoryAfter = exports.getMemorySnapshot();
      const memoryDelta = memoryBefore && memoryAfter ? memoryAfter.used - memoryBefore.used : null;

      const rows = [
        ["Namespace", namespace],
        ["Task", label],
        ["Status", status],
        ["Time", `${duration.toFixed(2)} ms`],
        ["Heap Δ", exports.formatBytes(memoryDelta)],
        ["Heap used", memoryAfter ? exports.formatBytes(memoryAfter.used) : "n/a"],
      ];

      if (showArgs) rows.push(["Args", exports.trimText(exports.safeJson(args), 240)]);
      if (error) rows.push(["Error", error?.message || String(error)]);

      const width = Math.min(
        80,
        Math.max(34, Math.max(...rows.map(([key, value]) => `${key}: ${value}`.length)) + 6),
      );

      const bar = "─".repeat(width - 2);
      const icon = status === "ok" ? "✅" : "💥";
      const method = status === "ok" ? "log" : "error";

      logTarget[method](
        [
          `╭${bar}╮`,
          `│ ${icon} ${"Timed Function".padEnd(width - 5)}│`,
          `├${bar}┤`,
          ...rows.map(([key, value]) => {
            const text = `${key}: ${value}`;
            return `│ ${text.padEnd(width - 4)} │`;
          }),
          `╰${bar}╯`,
        ].join("\n"),
      );
    }

    return function wrapped(...args) {
      return runWithoutReport(args, () => {
        const startedAt = performance.now();
        const memoryBefore = exports.getMemorySnapshot();

        try {
          const result = fn.apply(this, args);

          if (result && typeof result.then === "function") {
            return result
              .then((value) => {
                if (shouldDebug) printReport("ok", startedAt, memoryBefore, null, args);
                return value;
              })
              .catch((error) => {
                if (shouldDebug) printReport("error", startedAt, memoryBefore, error, args);
                throw error;
              });
          }

          if (shouldDebug) printReport("ok", startedAt, memoryBefore, null, args);

          return result;
        } catch (error) {
          if (shouldDebug) printReport("error", startedAt, memoryBefore, error, args);
          throw error;
        }
      });
    };
  };

  /********************
   * Formatting
   ********************/

  /**
   * Highlights code when highlight.js exists.
   *
   * @param {*} value Source code.
   * @param {string} [language="javascript"] Language.
   * @returns {string} HTML string.
   *
   * @example
   * RodUtils.highlightCode("const x = 1", "javascript");
   */
  exports.highlightCode = function highlightCode(value, language = "javascript") {
    const code = String(value ?? "");

    if (window.hljs?.highlight) {
      try {
        return window.hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } catch {}
    }

    if (window.hljs?.highlightAuto) {
      try {
        return window.hljs.highlightAuto(code).value;
      } catch {}
    }

    return exports.escapeHtml(code);
  };

  /**
   * Pretty-formats small source text without external libraries.
   *
   * @param {string} source Raw source.
   * @returns {string} Pretty-ish source.
   *
   * @example
   * RodUtils.miniPrettier("a{color:red}");
   */
  exports.miniPrettier = function miniPrettier(source) {
    return String(source ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*([{}[\]();,:>])\s*/g, "$1")
      .replace(/([{};>])\s*/g, "$1\n")
      .replace(/\n+/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce(
        (state, line) => {
          if (/^[}\])]/.test(line)) state.indent = Math.max(0, state.indent - 1);

          state.lines.push(`${"  ".repeat(state.indent)}${line}`);

          if (/[{[(]$/.test(line) && !/^[}\])]/.test(line)) state.indent += 1;

          return state;
        },
        { indent: 0, lines: [] },
      )
      .lines.join("\n");
  };

  /**
   * Pretty-formats source using Prettier when available.
   *
   * @param {string} source Source.
   * @param {string} [language="javascript"] Language.
   * @param {boolean} [highlight=false] Whether to return highlighted HTML.
   * @returns {Promise<string>} Formatted source or highlighted HTML.
   *
   * @example
   * await RodUtils.prettySource("const x=1", "javascript", true);
   */
  exports.prettySource = async function prettySource(source, language = "javascript", highlight = false) {
    const text = String(source ?? "");
    let output = text;

    if (text.length > MAX_PRETTY_SOURCE_LENGTH) {
      return highlight ? exports.highlightCode(output, language) : output;
    }

    if (!window.prettier || !window.prettierPlugins) {
      output = exports.miniPrettier(text);
      return highlight ? exports.highlightCode(output, language) : output;
    }

    try {
      const parser = language === "css" ? "css" : language === "html" || language === "xml" ? "html" : "babel";
      const result = window.prettier.format(text, {
        parser,
        plugins: window.prettierPlugins,
      });

      output = typeof result === "string" ? result : await result;
    } catch (error) {
      logger.warn("prettySource", "Prettier failed, using miniPrettier.", error);
      output = exports.miniPrettier(text);
    }

    return highlight ? exports.highlightCode(output, language) : output;
  };

  /********************
   * Reactivity
   ********************/

  /**
   * Removes dependencies from an effect runner.
   *
   * @param {Function} runner Runner.
   * @returns {void}
   */
  exports.cleanupEffect = function cleanupEffect(runner) {
    const deps = EFFECT_DEPS.get(runner);
    if (!deps) return;

    for (const dep of deps) dep.delete(runner);

    deps.clear();
  };

  /**
   * Tracks the current effect.
   *
   * @param {Set<Function>} subscribers Subscribers.
   * @returns {void}
   */
  exports.trackEffect = function trackEffect(subscribers) {
    const currentEffect = CURRENT_EFFECT_STACK[CURRENT_EFFECT_STACK.length - 1];

    if (!currentEffect || subscribers.has(currentEffect)) return;

    subscribers.add(currentEffect);

    let deps = EFFECT_DEPS.get(currentEffect);

    if (!deps) {
      deps = new Set();
      EFFECT_DEPS.set(currentEffect, deps);
    }

    deps.add(subscribers);
  };

/* ****************************** */
/* Symbols                        */
/* ****************************** */

const SIGNAL_SYMBOL = Symbol.for("rod.signal");
exports.SIGNAL_SYMBOL;


/**
 * Checks if a value is a signal.
 *
 * @param {*} value Possible signal.
 * @returns {boolean} True when signal.
 */

exports.isSignalLike = function isSignalLike(value) {
  return Boolean(
    value &&
      typeof value === "function" &&
      value[SIGNAL_SYMBOL] === true, 
  );
}

/* ****************************** */
/* Signal                         */
/* ****************************** */

/**
 * Creates a reactive signal.
 *
 * @param {*} initialValue Initial value.
 * @returns {Function} Signal reader.
 */
exports.signal = function signal(initialValue) {
  let value = initialValue;

  const subscribers = new Set();

  function read() {
    exports.trackEffect(subscribers);

    return value;
  }

  /* ****************************** */
  /* Signal Metadata                */
  /* ****************************** */

  Object.defineProperty(read, SIGNAL_SYMBOL, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  /* ****************************** */
  /* Public API                     */
  /* ****************************** */

  read.set = function set(nextValue) {
    if (Object.is(value, nextValue)) return;

    value = nextValue;

    Array.from(subscribers).forEach((subscriber) => {
      subscriber();
    });
  };

  read.update = function update(updater) {
    read.set(updater(value));
  };

  read.peek = function peek() {
    return value;
  };

  return read;
}
  /**
   * Creates a small signal.
   *
   * @template T
   * @param {T} initialValue Initial value.
   * @returns {Function} Signal getter.
   */
  exports.signalOld = function signal(initialValue) {
    let value = initialValue;
    const subscribers = new Set();

    function read() {
      exports.trackEffect(subscribers);
      return value;
    }

    read.set = function set(nextValue) {
      if (Object.is(value, nextValue)) return;

      value = nextValue;

      Array.from(subscribers).forEach((subscriber) => subscriber());
    };

    read.update = function update(updater) {
      read.set(updater(value));
    };

    read.peek = function peek() {
      return value;
    };

    return read;
  };

  /**
   * Runs a reactive effect.
   *
   * @param {Function} callback Effect callback.
   * @returns {Function} Dispose callback.
   */
  exports.effect = function effect(callback) {
    function run() {
      exports.cleanupEffect(run);
      CURRENT_EFFECT_STACK.push(run);

      try {
        callback();
      } finally {
        CURRENT_EFFECT_STACK.pop();
      }
    }

    run();

    return function dispose() {
      exports.cleanupEffect(run);
    };
  };

  /**
   * Creates a computed signal.
   *
   * @param {Function} callback Compute callback.
   * @returns {Function} Computed signal.
   */
  exports.computed = function computed(callback) {
    const output = exports.signal(undefined);

    exports.effect(function computeEffect() {
      output.set(callback());
    });

    return output;
  };

  /********************
   * DOM / React
   ********************/

  /**
   * Formats an element as a compact tag.
   *
   * @param {Element} element Element.
   * @returns {string} Element label.
   */
  exports.formatElement = function formatElement(element) {
    const tag = element.tagName ? element.tagName.toLowerCase() : "element";
    const id = element.id ? ` id="${exports.escapeHtml(element.id)}"` : "";
    const className =
      typeof element.className === "string" && element.className.trim()
        ? ` class="${exports.escapeHtml(element.className.trim().split(/\s+/).slice(0, 6).join(" "))}"`
        : "";

    return `<${tag}${id}${className}>`;
  };

  /**
   * Gets a compact label for any common value.
   *
   * @param {*} value Value.
   * @returns {string} Label.
   */
  exports.getNodeLabel = function getNodeLabel(value) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") return `"${exports.trimText(value, 260)}"`;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "symbol") return value.toString();
    if (typeof value === "function") return `ƒ ${value.name || "anonymous"}()`;
    if (value instanceof Window) return "Window";
    if (value instanceof Document) return "Document";
    if (value instanceof Element) return exports.formatElement(value);
    if (value instanceof Text) return `Text("${exports.trimText(value.textContent || "", 160)}")`;
    if (value instanceof Comment) return "Comment";
    if (value instanceof Node) return `Node ${value.nodeName}`;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value instanceof Map) return `Map(${value.size})`;
    if (value instanceof Set) return `Set(${value.size})`;
    if (value instanceof NodeList) return `NodeList(${value.length})`;
    if (value instanceof HTMLCollection) return `HTMLCollection(${value.length})`;

    return value?.constructor?.name || "Object";
  };

  /**
   * Finds a private React key.
   *
   * @param {Element} element Element.
   * @param {string} prefix React prefix.
   * @returns {string|undefined} Private key.
   */
  exports.findReactPrivateKey = function findReactPrivateKey(element, prefix) {
    if (!element) return undefined;

    return Object.keys(element).find((key) => key.startsWith(prefix));
  };

  /**
   * Gets React props from a DOM element.
   *
   * @param {Element} element Element.
   * @returns {*|null} Props.
   */
  exports.getReactProps = function getReactProps(element) {
    const key = exports.findReactPrivateKey(element, REACT_PROPS_PREFIX);
    return key ? element[key] : null;
  };

  /**
   * Finds a React fiber.
   *
   * @param {Element} element Element.
   * @returns {*|null} Fiber.
   */
  exports.findReact = function findReact(element) {
    if (!element) return null;

    const fiberKey = exports.findReactPrivateKey(element, REACT_FIBER_PREFIX);
    if (fiberKey) return element[fiberKey];

    const legacyKey = exports.findReactPrivateKey(element, REACT_LEGACY_INSTANCE_PREFIX);
    if (legacyKey) return element[legacyKey];

    return null;
  };

  exports.FindReact = exports.findReact;

  /********************
   * Virtualization
   ********************/

  /**
   * Splits source into normalized lines.
   *
   * @param {string} source Source.
   * @returns {string[]} Lines.
   */
  exports.splitLines = function splitLines(source) {
    return String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  };

  /**
   * Creates a virtual list slice.
   *
   * @param {{
   *   scrollTop: number;
   *   viewportHeight: number;
   *   rowHeight: number;
   *   total: number;
   *   overscan?: number;
   * }} options Options.
   * @returns {{ start: number; end: number; before: number; after: number }} Slice.
   */
  exports.getVirtualSlice = function getVirtualSlice(options) {
    const rowHeight = Math.max(1, Number(options.rowHeight || 20));
    const viewportHeight = Math.max(rowHeight, Number(options.viewportHeight || 300));
    const total = Math.max(0, Number(options.total || 0));
    const overscan = Math.max(0, Number(options.overscan || 20));
    const start = Math.max(0, Math.floor(Number(options.scrollTop || 0) / rowHeight) - overscan);
    const count = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const end = Math.min(total, start + count);

    return {
      start,
      end,
      before: start * rowHeight,
      after: Math.max(0, (total - end) * rowHeight),
    };
  };
  
  /********************
 * Store
 ********************/

/**
 * Creates a tiny deep reactive store.
 *
 * @template {Record<string, any>} T
 * @param {T} initialState Initial state.
 * @param {(change: {
 *   key: string;
 *   path: string[];
 *   value: any;
 *   previousValue: any;
 *   deleted?: boolean;
 *   target: object;
 * }) => void} [onChange]
 * @returns {T} Reactive proxy store.
 *
 * @example
 * const state = RodUtils.createStore(
 *   {
 *     count: 0,
 *   },
 *   console.log,
 * );
 */
exports.createStore = function createStore(
  initialState,
  onChange = function noop() {},
) {
  const proxyCache = new WeakMap();

  /**
   * Recursively proxifies objects.
   *
   * @param {*} target Target object.
   * @param {string[]} path Current path.
   * @returns {*}
   */
  function proxify(target, path = []) {
    if (
      target === null ||
      typeof target !== "object"
    ) {
      return target;
    }

    if (proxyCache.has(target)) {
      return proxyCache.get(target);
    }

    const proxy = new Proxy(target, {
      get(object, key) {
        if (typeof key === "symbol") {
          return object[key];
        }

        return proxify(
          object[key],
          path.concat(String(key)),
        );
      },

      set(object, key, value) {
        const previousValue = object[key];

        if (Object.is(previousValue, value)) {
          return true;
        }

        object[key] = value;

        onChange({
          key: String(key),
          path: path.concat(String(key)),
          value,
          previousValue,
          target: object,
        });

        return true;
      },

      deleteProperty(object, key) {
        if (!Reflect.has(object, key)) {
          return true;
        }

        const previousValue = object[key];

        const deleted = Reflect.deleteProperty(
          object,
          key,
        );

        if (deleted) {
          onChange({
            key: String(key),
            path: path.concat(String(key)),
            value: undefined,
            previousValue,
            deleted: true,
            target: object,
          });
        }

        return deleted;
      },
    });

    proxyCache.set(target, proxy);

    return proxy;
  }

  return proxify(initialState);
};


/**
 * Creates a tiny event bus with on/off/once/emit support.
 *
 * @returns {{
 *   on: (event: string, handler: Function) => () => void;
 *   once: (event: string, handler: Function) => () => void;
 *   off: (event: string, handler?: Function) => boolean;
 *   emit: (event: string, payload?: any) => void;
 *   clear: (event?: string) => void;
 *   listenerCount: (event?: string) => number;
 * }}
 *
 * @example
 * const bus = createEventBus();
 *
 * const dispose = bus.on("save", (payload) => {
 *   console.log("saved", payload);
 * });
 *
 * bus.emit("save", {
 *   id: 1,
 * });
 *
 * dispose();
 */
exports.createEventBus = function createEventBus() {
  const listeners = new Map();

  /**
   * Gets or creates one listener bucket.
   *
   * @param {string} event Event name.
   * @returns {Set<Function>} Listener bucket.
   */
  function getBucket(event) {
    let bucket = listeners.get(event);

    if (!bucket) {
      bucket = new Set();
      listeners.set(event, bucket);
    }

    return bucket;
  }

  return Object.freeze({
    /**
     * Subscribes to an event.
     *
     * @param {string} event Event name.
     * @param {Function} handler Event handler.
     * @returns {() => void} Dispose callback.
     */
    on(event, handler) {
      const bucket = getBucket(event);

      bucket.add(handler);

      return () => {
        this.off(event, handler);
      };
    },

    /**
     * Subscribes once to an event.
     *
     * @param {string} event Event name.
     * @param {Function} handler Event handler.
     * @returns {() => void} Dispose callback.
     */
    once(event, handler) {
      const dispose = this.on(event, function onceHandler(payload) {
        dispose();
        handler(payload);
      });

      return dispose;
    },

    /**
     * Removes listeners.
     *
     * @param {string} event Event name.
     * @param {Function} [handler] Specific handler.
     * @returns {boolean} Success state.
     */
    off(event, handler) {
      const bucket = listeners.get(event);

      if (!bucket) return false;

      if (!handler) {
        listeners.delete(event);
        return true;
      }

      const deleted = bucket.delete(handler);

      if (bucket.size === 0) {
        listeners.delete(event);
      }

      return deleted;
    },

    /**
     * Emits an event.
     *
     * @param {string} event Event name.
     * @param {*} [payload] Event payload.
     * @returns {void}
     */
    emit(event, payload) {
      const bucket = listeners.get(event);

      if (!bucket || bucket.size === 0) return;

      const handlers = Array.from(bucket);

      for (let index = 0; index < handlers.length; index += 1) {
        try {
          handlers[index](payload);
        } catch (error) {
          console.error(
            `[EventBus:${event}]`,
            error,
          );
        }
      }
    },

    /**
     * Clears listeners.
     *
     * @param {string} [event] Event name.
     * @returns {void}
     */
    clear(event) {
      if (event) {
        listeners.delete(event);
        return;
      }

      listeners.clear();
    },

    /**
     * Gets listener count.
     *
     * @param {string} [event] Event name.
     * @returns {number} Listener count.
     */
    listenerCount(event) {
      if (event) {
        return listeners.get(event)?.size || 0;
      }

      let total = 0;

      for (const bucket of listeners.values()) {
        total += bucket.size;
      }

      return total;
    },
  });
}
  /********************
   * Public Export
   ********************/

  exports.toolkit = window.esToolkit || window._ || {};
  exports.VERSION = VERSION;
  exports.logger = logger;

  exports.defineGlobal(GLOBAL_NAME, Object.freeze(exports), {
    immutable: true,
  });

  logger.debug("install", `Installed ${GLOBAL_NAME} v${VERSION}`);
})();