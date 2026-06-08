// ==UserScript==
// @name         Rod / Core / Stack Observatory
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Early error, rejection, action, and async stack observability for every page.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       990
// @grant        none
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// ==/UserScript==

(function StackObservatory() {
  "use strict";

  const GLOBAL_KEY = "__STACK_BOOT__";
  const BOOT_NAME = "StackBoot";
  const MAX_TIMELINE = 300;
  const MAX_USER_ACTIONS = 80;
  const MAX_STACK_LENGTH = 12000;

  if (window[GLOBAL_KEY]?.version) {
    return;
  }

  const native = {
    consoleError: console.error.bind(console),
    consoleWarn: console.warn.bind(console),
    consoleLog: console.log.bind(console),
    setTimeout: window.setTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    requestAnimationFrame: window.requestAnimationFrame?.bind(window),
    queueMicrotask: window.queueMicrotask?.bind(window),
    fetch: window.fetch?.bind(window),
    addEventListener: EventTarget.prototype.addEventListener,
    removeEventListener: EventTarget.prototype.removeEventListener,
    promiseThen: Promise.prototype.then,
    promiseCatch: Promise.prototype.catch,
    promiseFinally: Promise.prototype.finally,
    mutationObserver: window.MutationObserver,
  };

  const state = {
    version: "2.0.0",
    installedAt: new Date().toISOString(),
    href: location.href,
    timeline: [],
    userActions: [],
    wrappedListeners: new WeakMap(),
    panel: null,
    panelBody: null,
  };

  /**
   * Safely converts unknown values into serializable debug data.
   *
   * @param {unknown} value - Any value captured by the observability boot.
   * @returns {unknown} A JSON-safe-ish representation.
   */
  function serialize(value) {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: trimStack(value.stack),
      };
    }

    if (value instanceof Event) {
      return {
        type: value.type,
        target: describeNode(value.target),
        timeStamp: value.timeStamp,
      };
    }

    try {
      JSON.stringify(value);
      return value;
    } catch {
      return String(value);
    }
  }

  /**
   * Keeps large Safari stacks from turning the console into soup.
   *
   * @param {unknown} stack - Raw stack value.
   * @returns {string} Trimmed stack string.
   */
  function trimStack(stack) {
    const text = String(stack || "");
    return text.length > MAX_STACK_LENGTH ? `${text.slice(0, MAX_STACK_LENGTH)}\n… trimmed …` : text;
  }

  /**
   * Produces a compact readable DOM node label.
   *
   * @param {unknown} node - Possible DOM node.
   * @returns {string} Human readable node description.
   */
  function describeNode(node) {
    if (!(node instanceof Element)) {
      return String(node);
    }

    const id = node.id ? `#${node.id}` : "";
    const className = Array.from(node.classList || []).slice(0, 4).map((item) => `.${item}`).join("");

    return `${node.tagName.toLowerCase()}${id}${className}`;
  }

  /**
   * Adds an entry to the internal timeline.
   *
   * @param {string} type - Event type.
   * @param {string} label - Event label.
   * @param {Record<string, unknown>} data - Extra debug data.
   * @returns {Record<string, unknown>} Stored timeline entry.
   */
  function addTimeline(type, label, data = {}) {
    const entry = {
      id: state.timeline.length + 1,
      type,
      label,
      href: location.href,
      time: new Date().toISOString(),
      data: serialize(data),
    };

    state.timeline.push(entry);

    while (state.timeline.length > MAX_TIMELINE) {
      state.timeline.shift();
    }

    renderPanel();

    return entry;
  }

  /**
   * Captures a stack checkpoint before Safari has a chance to hide useful context.
   *
   * @param {string} label - Human-readable checkpoint label.
   * @param {Record<string, unknown>} data - Optional extra metadata.
   * @returns {Record<string, unknown>} Stored timeline entry.
   */
  function captureStack(label, data = {}) {
    const error = new Error(`[${BOOT_NAME}] ${label}`);

    return addTimeline("stack", label, {
      ...data,
      stack: trimStack(error.stack),
    });
  }

  /**
   * Records a lightweight marker without forcing a full stack.
   *
   * @param {string} label - Marker label.
   * @param {Record<string, unknown>} data - Optional marker data.
   * @returns {Record<string, unknown>} Stored timeline entry.
   */
  function mark(label, data = {}) {
    return addTimeline("mark", label, data);
  }

  /**
   * Reports an error with nearby timeline and user-action context.
   *
   * @param {unknown} error - Captured error.
   * @param {string} source - Source that captured the error.
   * @param {Record<string, unknown>} extra - Extra debug data.
   * @returns {void}
   */
  function reportError(error, source, extra = {}) {
    const entry = addTimeline("error", source, {
      error: serialize(error),
      recentTimeline: state.timeline.slice(-15),
      recentUserActions: state.userActions.slice(-10),
      ...extra,
    });
    
    console.log("-".repeat(20)) 

    console.groupCollapsed(
      `%c${BOOT_NAME}%c ${source}`,
      "background:#111;color:#fff;padding:2px 8px;border-radius:999px;font-weight:700",
      "color:#ef4444;font-weight:800"
    );
    native.consoleError(error);
    native.consoleLog("Entry:", entry);
    native.consoleLog("Recent timeline:", state.timeline.slice(-15));
    native.consoleLog("Recent user actions:", state.userActions.slice(-10));
    console.trace("Live trace");
    console.groupEnd();
  }

  /**
   * Wraps a callback and keeps the callback registration origin.
   *
   * @template {Function} T
   * @param {string} label - Debug label.
   * @param {T} fn - Function to wrap.
   * @returns {T} Wrapped function.
   */
  function wrap(label, fn) {
    if (typeof fn !== "function") {
      return fn;
    }

    const origin = captureStack(`registered:${label}`);

    return /** @type {T} */ (function wrappedStackBootCallback(...args) {
      try {
        return fn.apply(this, args);
      } catch (error) {
        reportError(error, `crash:${label}`, { origin });
        throw error;
      }
    });
  }

  /**
   * Tracks recent user actions to explain crashes caused by interaction.
   *
   * @param {Event} event - User event.
   * @returns {void}
   */
  function recordUserAction(event) {
    const action = {
      type: event.type,
      time: new Date().toISOString(),
      target: describeNode(event.target),
      x: "clientX" in event ? event.clientX : undefined,
      y: "clientY" in event ? event.clientY : undefined,
      key: "key" in event ? event.key : undefined,
    };

    state.userActions.push(action);

    while (state.userActions.length > MAX_USER_ACTIONS) {
      state.userActions.shift();
    }
  }

  /**
   * Patches async browser APIs to preserve scheduling origins.
   *
   * @returns {void}
   */
  function patchAsyncApis() {
    window.setTimeout = function patchedSetTimeout(callback, delay, ...args) {
      return native.setTimeout(
        typeof callback === "function" ? wrap("setTimeout", callback) : callback,
        delay,
        ...args
      );
    };

    window.setInterval = function patchedSetInterval(callback, delay, ...args) {
      return native.setInterval(
        typeof callback === "function" ? wrap("setInterval", callback) : callback,
        delay,
        ...args
      );
    };

    if (native.requestAnimationFrame) {
      window.requestAnimationFrame = function patchedRequestAnimationFrame(callback) {
        return native.requestAnimationFrame(wrap("requestAnimationFrame", callback));
      };
    }

    if (native.queueMicrotask) {
      window.queueMicrotask = function patchedQueueMicrotask(callback) {
        return native.queueMicrotask(wrap("queueMicrotask", callback));
      };
    }
  }

  /**
   * Patches EventTarget listeners while preserving removeEventListener behavior.
   *
   * @returns {void}
   */
  function patchEvents() {
    EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
      if (typeof listener !== "function") {
        return native.addEventListener.call(this, type, listener, options);
      }

      let listenerMap = state.wrappedListeners.get(listener);

      if (!listenerMap) {
        listenerMap = new Map();
        state.wrappedListeners.set(listener, listenerMap);
      }

      const key = String(type);
      const wrapped = listenerMap.get(key) || wrap(`event:${key}`, listener);
      listenerMap.set(key, wrapped);

      return native.addEventListener.call(this, type, wrapped, options);
    };

    EventTarget.prototype.removeEventListener = function patchedRemoveEventListener(type, listener, options) {
      const wrapped = typeof listener === "function"
        ? state.wrappedListeners.get(listener)?.get(String(type)) || listener
        : listener;

      return native.removeEventListener.call(this, type, wrapped, options);
    };

    ["click", "dblclick", "touchstart", "touchend", "pointerdown", "pointerup", "keydown"].forEach((type) => {
      native.addEventListener.call(window, type, recordUserAction, true);
    });
  }

  /**
   * Patches Promise chains to preserve callback origins.
   *
   * @returns {void}
   */
  function patchPromises() {
    Promise.prototype.then = function patchedThen(onFulfilled, onRejected) {
      return native.promiseThen.call(
        this,
        typeof onFulfilled === "function" ? wrap("Promise.then:onFulfilled", onFulfilled) : onFulfilled,
        typeof onRejected === "function" ? wrap("Promise.then:onRejected", onRejected) : onRejected
      );
    };

    Promise.prototype.catch = function patchedCatch(onRejected) {
      return native.promiseCatch.call(
        this,
        typeof onRejected === "function" ? wrap("Promise.catch", onRejected) : onRejected
      );
    };

    Promise.prototype.finally = function patchedFinally(onFinally) {
      return native.promiseFinally.call(
        this,
        typeof onFinally === "function" ? wrap("Promise.finally", onFinally) : onFinally
      );
    };
  }

  /**
   * Patches fetch to record request lifecycle and failures.
   *
   * @returns {void}
   */
  function patchFetch() {
    if (!native.fetch) {
      return;
    }

    window.fetch = async function patchedFetch(input, init) {
      const url = typeof input === "string" ? input : input?.url;
      const origin = captureStack("fetch:start", { url, method: init?.method || input?.method || "GET" });
      const startedAt = performance.now();

      try {
        const response = await native.fetch(input, init);

        mark("fetch:done", {
          url,
          status: response.status,
          ok: response.ok,
          durationMs: Math.round(performance.now() - startedAt),
          origin,
        });

        return response;
      } catch (error) {
        reportError(error, "fetch:error", { url, origin });
        throw error;
      }
    };
  }

  /**
   * Patches console.error so masked errors still attach timeline context.
   *
   * @returns {void}
   */
  function patchConsole() {
    console.error = function patchedConsoleError(...args) {
      addTimeline("console.error", "console.error", { args: args.map(serialize) });
      return native.consoleError(...args);
    };

    console.warn = function patchedConsoleWarn(...args) {
      addTimeline("console.warn", "console.warn", { args: args.map(serialize) });
      return native.consoleWarn(...args);
    };
  }

  /**
   * Patches MutationObserver callbacks.
   *
   * @returns {void}
   */
  function patchMutationObserver() {
    if (!native.mutationObserver) {
      return;
    }

    window.MutationObserver = class StackBootMutationObserver extends native.mutationObserver {
      constructor(callback) {
        super(wrap("MutationObserver", callback));
      }
    };
  }

  /**
   * Exports all captured observability state as JSON.
   *
   * @returns {string} Pretty JSON payload.
   */
  function exportJSON() {
    return JSON.stringify(
      {
        boot: {
          name: BOOT_NAME,
          version: state.version,
          installedAt: state.installedAt,
          href: location.href,
          userAgent: navigator.userAgent,
        },
        timeline: state.timeline,
        userActions: state.userActions,
      },
      null,
      2
    );
  }

  /**
   * Copies the captured observability state to the clipboard.
   *
   * @returns {Promise<boolean>} Whether copying succeeded.
   */
  async function copyJSON() {
    const payload = exportJSON();

    try {
      await navigator.clipboard.writeText(payload);
      mark("clipboard:copied", { bytes: payload.length });
      return true;
    } catch (error) {
      reportError(error, "clipboard:error");
      return false;
    }
  }

  /**
   * Creates a tiny local debug panel.
   *
   * @returns {void}
   */
  function showPanel() {
    if (state.panel) {
      state.panel.style.display = "block";
      renderPanel();
      return;
    }

    const panel = document.createElement("div");
    panel.style.cssText = [
      "position:fixed",
      "right:10px",
      "bottom:10px",
      "z-index:2147483647",
      "width:min(420px,calc(100vw - 20px))",
      "max-height:45vh",
      "background:rgba(14,14,16,.96)",
      "color:#f8fafc",
      "border:1px solid rgba(255,255,255,.14)",
      "border-radius:16px",
      "box-shadow:0 18px 60px rgba(0,0,0,.45)",
      "font:12px ui-monospace,SFMono-Regular,Menlo,monospace",
      "overflow:hidden",
    ].join(";");

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#111827;border-bottom:1px solid rgba(255,255,255,.12)">
        <strong style="font-size:12px">🧭 StackBoot</strong>
        <button data-stackboot-copy style="margin-left:auto;border:0;border-radius:10px;padding:6px 8px;background:#374151;color:white">Copy</button>
        <button data-stackboot-hide style="border:0;border-radius:10px;padding:6px 8px;background:#1f2937;color:white">Hide</button>
      </div>
      <div data-stackboot-body style="padding:10px 12px;overflow:auto;max-height:calc(45vh - 44px);white-space:pre-wrap"></div>
    `;

    state.panel = panel;
    state.panelBody = panel.querySelector("[data-stackboot-body]");

    panel.querySelector("[data-stackboot-copy]")?.addEventListener("click", () => {
      copyJSON();
    });

    panel.querySelector("[data-stackboot-hide]")?.addEventListener("click", () => {
      panel.style.display = "none";
    });

    document.documentElement.appendChild(panel);
    renderPanel();
  }

  /**
   * Updates the debug panel content.
   *
   * @returns {void}
   */
  function renderPanel() {
    if (!state.panelBody) {
      return;
    }

    const recent = state.timeline.slice(-10).reverse();

    state.panelBody.textContent = recent
      .map((entry) => `[${entry.time}] ${entry.type} :: ${entry.label}`)
      .join("\n");
  }

  window[GLOBAL_KEY] = {
    version: state.version,
    state,
    captureStack,
    mark,
    wrap,
    reportError,
    exportJSON,
    copyJSON,
    showPanel,
  };

  window.addEventListener("error", (event) => {
    reportError(event.error || event.message, "window.error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, "unhandledrejection");
  }, true);

  patchAsyncApis();
  patchEvents();
  //patchPromises();
  //patchFetch();
  patchConsole();
  //patchMutationObserver();

  captureStack("boot:installed");

  native.consoleLog(
    `%c${BOOT_NAME}%c installed`,
    "background:#111;color:#fff;padding:2px 8px;border-radius:999px;font-weight:700",
    "color:#22c55e;font-weight:800",
    window[GLOBAL_KEY]
  );
})();