// ==UserScript==
// @name         000 - Rod / Core / Window Watcher
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Watches newly added window globals with throttled snapshots and a compact overlay.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       999
// @grant        none
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// ==/UserScript==

(async (globalWindow) => {
  "use strict";

  /********************************************************************************************************
   * Constants
   ********************************************************************************************************/

  const WATCH_INTERVAL_MS = 350;
  const LOG_THROTTLE_MS = 1400;
  const LOG_CHUNK_SIZE = 24;
  const INITIAL_REPORT_DELAY_MS = 2000;

  const ENABLE_TYPE_ICONS = true;
  const ENABLE_GROUP_VALUES = true;
  const ENABLE_SCRIPT_OBSERVER = true;
  const SHOW_ELEMENT_ADDED = false

  const INTERNAL_GLOBALS = new Set([
    "windowWatcher",
    "__rodWindowWatcher",
  ]);

  const BASE_BG = "background:rgba(255,255,255,0.018);padding:0 3px;border-radius:3px;font-weight:300";
  const HEADER_STYLE = "color:#f472b6;background:rgba(255,255,255,0.02);padding:1px 4px;border-radius:3px;font-weight:400";
  const COUNT_STYLE = "color:#67e8f9;background:rgba(255,255,255,0.02);padding:1px 4px;border-radius:3px;font-weight:400";
  const VALUE_STYLE = "color:#a1a1aa;background:rgba(255,255,255,0.015);padding:1px 4px;border-radius:3px;font-weight:400";
  const OBSERVER_STYLE = "color:#94a3b8;background:rgba(255,255,255,0.015);padding:1px 4px;border-radius:3px;font-weight:400";

  const TYPE_META = {
    class: {
      icon: "▣",
      label: "class",
      style: `color:#c084fc;${BASE_BG}`,
    },
    function: {
      icon: "ƒ",
      label: "function",
      style: `color:#4ade80;${BASE_BG}`,
    },
    string: {
      icon: "◌",
      label: "string",
      style: `color:#fde047;${BASE_BG}`,
    },
    number: {
      icon: "◍",
      label: "number",
      style: `color:#fb923c;${BASE_BG}`,
    },
    boolean: {
      icon: "◐",
      label: "boolean",
      style: `color:#67e8f9;${BASE_BG}`,
    },
    object: {
      icon: "⌬",
      label: "object",
      style: `color:#f472b6;${BASE_BG}`,
    },
    array: {
      icon: "▫",
      label: "array",
      style: `color:#ec4899;${BASE_BG}`,
    },
    element: {
      icon: "▤",
      label: "element",
      style: `color:#38bdf8;${BASE_BG}`,
    },
    node: {
      icon: "◈",
      label: "node",
      style: `color:#22d3ee;${BASE_BG}`,
    },
    promise: {
      icon: "◔",
      label: "promise",
      style: `color:#a78bfa;${BASE_BG}`,
    },
    symbol: {
      icon: "◇",
      label: "symbol",
      style: `color:#c084fc;${BASE_BG}`,
    },
    bigint: {
      icon: "◉",
      label: "bigint",
      style: `color:#fb923c;${BASE_BG}`,
    },
    undefined: {
      icon: "∅",
      label: "undefined",
      style: `color:#71717a;${BASE_BG}`,
    },
    null: {
      icon: "∅",
      label: "null",
      style: `color:#71717a;${BASE_BG}`,
    },
    inaccessible: {
      icon: "⨯",
      label: "inaccessible",
      style: `color:#ef4444;${BASE_BG}`,
    },
    unknown: {
      icon: "·",
      label: "unknown",
      style: `color:#d4d4d8;${BASE_BG}`,
    },
  };

  /********************************************************************************************************
   * Safe helpers
   ********************************************************************************************************/

  /**
   * Safely reads a property from a target object.
   *
   * @param {object} target
   * @param {PropertyKey} key
   * @returns {unknown}
   */
  function safeGet(target, key) {
    try {
      return target[key];
    } catch (error) {
      return {
        __access_error__: true,
        name: error?.name,
        message: error?.message,
      };
    }
  }

  /**
   * Checks whether a value is probably a class constructor.
   *
   * @param {unknown} value
   * @returns {boolean}
   */
  function isClassLike(value) {
    if (typeof value !== "function") {
      return false;
    }

    try {
      return Function.prototype.toString.call(value).startsWith("class ");
    } catch {
      return false;
    }
  }

  /**
   * Detects a readable kind for a value.
   *
   * @param {unknown} value
   * @returns {keyof typeof TYPE_META}
   */
  function getValueKind(value) {
    if (value && typeof value === "object" && value.__access_error__ === true) {
      return "inaccessible";
    }

    if (value === null) {
      return "null";
    }

    if (isClassLike(value)) {
      return "class";
    }

    if (Array.isArray(value)) {
      return "array";
    }

    if (typeof Element !== "undefined" && value instanceof Element) {
      return "element";
    }

    if (typeof Node !== "undefined" && value instanceof Node) {
      return "node";
    }

    if (typeof Promise !== "undefined" && value instanceof Promise) {
      return "promise";
    }

    const type = typeof value;

    if (Object.prototype.hasOwnProperty.call(TYPE_META, type)) {
      return type;
    }

    return "unknown";
  }

  /**
   * Creates a tiny trailing throttle.
   *
   * @param {Function} callback
   * @param {number} waitMs
   * @returns {Function}
   */
  function throttle(callback, waitMs) {
    let timeoutId = 0;
    let lastRunAt = 0;

    return function throttledCallback() {
      const now = Date.now();
      const elapsedMs = now - lastRunAt;
      const remainingMs = waitMs - elapsedMs;

      if (remainingMs <= 0) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = 0;
        }

        lastRunAt = now;
        callback();
        return;
      }

      if (timeoutId) {
        return;
      }

      timeoutId = setTimeout(() => {
        timeoutId = 0;
        lastRunAt = Date.now();
        callback();
      }, remainingMs);
    };
  }

  /**
   * Splits items into small chunks without extra cleverness.
   *
   * @param {unknown[]} items
   * @param {number} size
   * @returns {unknown[][]}
   */
  function chunkArray(items, size) {
    const chunks = [];

    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    return chunks;
  }

  /********************************************************************************************************
   * Clean window snapshot
   ********************************************************************************************************/

  /**
   * Creates a clean native Window reference using an iframe.
   *
   * @returns {{ cleanWindow: Window, dispose: () => void }}
   */
  function createCleanWindow() {
    const iframe = document.createElement("iframe");

    iframe.style.cssText = "display:none!important";
    iframe.setAttribute("aria-hidden", "true");

    const parent = document.documentElement || document.head || document.body;

    if (!parent) {
      throw new Error("Failed to find a parent node for the clean iframe.");
    }

    parent.append(iframe);

    const cleanWindow = iframe.contentWindow;

    if (!cleanWindow) {
      iframe.remove();
      throw new Error("Failed to create clean window reference.");
    }

    return {
      cleanWindow,
      dispose() {
        iframe.remove();
      },
    };
  }

  /**
   * Detects custom globals added to window.
   *
   * @param {{
   *   includeValues?: boolean;
   *   includeFunctions?: boolean;
   *   ignore?: string[];
   * }} [options]
   * @returns {{
   *   keys: string[];
   *   values?: Record<string, unknown>;
   * }}
   */
  function getCustomWindowGlobals(options = {}) {
    const {
      includeValues = true,
      includeFunctions = true,
      ignore = [],
    } = options;

    const ignoreSet = new Set([...ignore, ...INTERNAL_GLOBALS]);
    const clean = createCleanWindow();

    try {
      const nativeKeys = new Set(Reflect.ownKeys(clean.cleanWindow).map(String));
      const currentKeys = Reflect.ownKeys(globalWindow);
      const customKeys = [];

      for (const rawKey of currentKeys) {
        const key = String(rawKey);

        if (nativeKeys.has(key) || ignoreSet.has(key)) {
          continue;
        }

        if (!includeFunctions && typeof safeGet(globalWindow, rawKey) === "function") {
          continue;
        }

        customKeys.push(key);
      }

      customKeys.sort();

      const result = {
        keys: customKeys,
      };

      if (includeValues) {
        result.values = Object.create(null);

        for (const key of customKeys) {
          result.values[key] = safeGet(globalWindow, key);
        }
      }

      return result;
    } finally {
      clean.dispose();
    }
  }

  /********************************************************************************************************
   * Pretty console formatting
   ********************************************************************************************************/
function createChunkLabel(chunk) {
  const format = [];
  const styles = [];

  for (const item of chunk) {
    const meta = TYPE_META[item.kind] || TYPE_META.unknown;
    const prefix = ENABLE_TYPE_ICONS ? `${meta.icon} ` : "";

    format.push(`%c${prefix}${item.key}`);
    styles.push(meta.style);
  }

  return {
    text: format.join(" ┄ "),
    styles,
  };
}
  /**
   * Logs one item per line with a tiny almost-transparent background.
   *
   * @param {{ key: string; value: unknown; kind: keyof typeof TYPE_META }[]} chunk
   * @returns {void}
   */
function logChunkItems(chunk) {
  const format = [];
  const styles = [];

  for (let index = 0; index < chunk.length; index += 1) {
    const item = chunk[index];
    const meta = TYPE_META[item.kind] || TYPE_META.unknown;
    const prefix = ENABLE_TYPE_ICONS ? `${meta.icon} ` : "";

    format.push(`%c${prefix}${item.key}`);
    styles.push(meta.style);
  }

 // console.log(format.join("  "), ...styles);
}

  /**
   * Logs values lazily after the readable item list.
   *
   * @param {{ key: string; value: unknown; kind: keyof typeof TYPE_META }[]} chunk
   * @returns {void}
   */
  function logChunkValues(chunk) {
    const values = Object.create(null);

    for (let index = 0; index < chunk.length; index += 1) {
      const item = chunk[index];

      values[item.key] = item.value;
    }

    //console.log("%c▶︎ ", VALUE_STYLE, values);
    console.log(values);
  }

  /********************************************************************************************************
   * Script observer
   ********************************************************************************************************/

  /**
   * Watches added script nodes and schedules a scan.
   *
   * @param {Function} onScriptAdded
   * @returns {MutationObserver | null}
   */
  function createScriptObserver(onScriptAdded) {
    if (!ENABLE_SCRIPT_OBSERVER || typeof MutationObserver === "undefined") {
      return null;
    }

    const root = document.documentElement || document;

    const observer = new MutationObserver((mutations) => {
      for (let mutationIndex = 0; mutationIndex < mutations.length; mutationIndex += 1) {
        const mutation = mutations[mutationIndex];

        if (!mutation.addedNodes || mutation.addedNodes.length === 0) {
          continue;
        }

        for (let nodeIndex = 0; nodeIndex < mutation.addedNodes.length; nodeIndex += 1) {
          const node = mutation.addedNodes[nodeIndex];

          if (node.nodeType !== 1) {
            continue;
          }

          const element = /** @type {Element} */ (node);
          const isScript =
            element.tagName === "SCRIPT" ||
            Boolean(element.querySelector && element.querySelector("script"));

          if (!isScript) {
            continue;
          }

          console.debug("%c◇ script node added", OBSERVER_STYLE, SHOW_ELEMENT_ADDED && element);
          onScriptAdded();
          return;
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    return observer;
  }

  /********************************************************************************************************
   * Window watcher
   ********************************************************************************************************/

  /**
   * Watches future globals added to window.
   *
   * @param {{
   *   intervalMs?: number;
   *   throttleMs?: number;
   *   chunkSize?: number;
   *   includeValues?: boolean;
   *   ignore?: string[];
   * }} [options]
   * @returns {{
   *   stop: () => void;
   *   flush: () => void;
   *   scan: () => void;
   *   known: Set<string>;
   *   bag: Map<string, { value: unknown; kind: keyof typeof TYPE_META }>;
   * }}
   */
  function watchWindowGlobals(options = {}) {
    const {
      intervalMs = WATCH_INTERVAL_MS,
      throttleMs = LOG_THROTTLE_MS,
      chunkSize = LOG_CHUNK_SIZE,
      includeValues = ENABLE_GROUP_VALUES,
      ignore = [],
    } = options;

    const ignoreSet = new Set([...ignore, ...INTERNAL_GLOBALS]);
    const known = new Set(Reflect.ownKeys(globalWindow).map(String));
    const bag = new Map();

    let intervalId = 0;
    let observer = null;

    /**
     * Flushes queued globals in clean chunks.
     *
     * @returns {void}
     */
    function flush() {
      if (bag.size === 0) {
        return;
      }

      const entries = new Array(bag.size);
      let entryIndex = 0;

      for (const [key, record] of bag) {
        entries[entryIndex] = {
          key,
          value: record.value,
          kind: record.kind,
        };

        entryIndex += 1;
      }

      bag.clear();

      const chunks = chunkArray(entries, chunkSize);

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];

        console.groupCollapsed(
          "%c⮑ globals %c+" + String(chunk.length),
          HEADER_STYLE,
          COUNT_STYLE,
        );
        
        /** rod added **/
        const label = createChunkLabel(chunk);

console.groupCollapsed(
  `%c🍉 Added window globals (${chunk.length}) → ${label.text}`,
  "color:#a855f7;font-weight:normal",
  ...label.styles,
);

console.groupEnd();

        /** end **/

        logChunkItems(chunk);

        if (includeValues) {
          logChunkValues(chunk);
        }

        console.groupEnd();
      }
    }

    const throttledFlush = throttle(flush, throttleMs);

    /**
     * Scans window and queues new globals.
     *
     * @returns {void}
     */
    function scan() {
      const keys = Reflect.ownKeys(globalWindow);

      for (let index = 0; index < keys.length; index += 1) {
        const rawKey = keys[index];
        const key = String(rawKey);

        if (known.has(key)) {
          continue;
        }

        known.add(key);

        if (ignoreSet.has(key)) {
          continue;
        }

        const value = safeGet(globalWindow, rawKey);
        const kind = getValueKind(value);

        bag.set(key, {
          value,
          kind,
        });
      }

      throttledFlush();
    }

    intervalId = setInterval(scan, intervalMs);
    observer = createScriptObserver(scan);

    return {
      stop() {
        clearInterval(intervalId);

        if (observer) {
          observer.disconnect();
          observer = null;
        }

        flush();
      },
      flush,
      scan,
      known,
      bag,
    };
  }

  /********************************************************************************************************
   * Boot
   ********************************************************************************************************/

  const watcher = watchWindowGlobals({
    intervalMs: WATCH_INTERVAL_MS,
    throttleMs: LOG_THROTTLE_MS,
    chunkSize: LOG_CHUNK_SIZE,
    includeValues: ENABLE_GROUP_VALUES,
  });

  Object.defineProperty(globalWindow, "__rodWindowWatcher", {
    value: {
      getCustomWindowGlobals,
      watchWindowGlobals,
      stop: watcher.stop,
      flush: watcher.flush,
      scan: watcher.scan,
      known: watcher.known,
      bag: watcher.bag,
    },
    configurable: true,
    enumerable: false,
    writable: false,
  });

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      const globals = getCustomWindowGlobals({
        includeValues: true,
      });

      console.groupCollapsed(
        "%c◇ custom globals %c+" + String(globals.keys.length),
        HEADER_STYLE,
        COUNT_STYLE,
      );

      for (let index = 0; index < globals.keys.length; index += 1) {
        const key = globals.keys[index];
        const value = globals.values ? globals.values[key] : undefined;
        const kind = getValueKind(value);
        const meta = TYPE_META[kind] || TYPE_META.unknown;
        const prefix = ENABLE_TYPE_ICONS ? `${meta.icon} ` : "";

        console.log(`%c${prefix}${key}`, meta.style);
      }

      if (globals.values) {
        console.log("%cvalues", VALUE_STYLE, globals.values);
      }

      console.groupEnd();
    }, INITIAL_REPORT_DELAY_MS);
  });
  
  
  
  
  
(() => {
  const registry = new WeakMap();
  const originalAdd = EventTarget.prototype.addEventListener;

  EventTarget.prototype.addEventListener = function (
    type,
    listener,
    options,
  ) {
    let listeners = registry.get(this);

    if (!listeners) {
      listeners = [];
      registry.set(this, listeners);
    }

    listeners.push({
      type,
      listener,
      options,
    });

    return originalAdd.call(
      this,
      type,
      listener,
      options,
    );
  };

  window.getEventListenersSafe = target =>
    registry.get(target) ?? [];
    
  console.log([...registry])
})();
  
})(window);