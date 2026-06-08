// ==UserScript==
// @name         Rod / Core / Boot Essentials
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Boot helpers, safe module registry, Safari/mobile guards, and shared userscript utilities.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       999
// @grant        none
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// @require      https://gist.githubusercontent.com/oirodolfo/d4bec87818e03483d9fe84cc8531a18b/raw/d4d59f16f93b380ccd5693dba1dc7bc771e7cb21/001-modules.user.js?v2
// @require      https://gist.githubusercontent.com/oirodolfo/d4bec87818e03483d9fe84cc8531a18b/raw/f293f77f755c94844357063626e9f73c34286eb6/00-boot.user.js?v0.2
// @require      https://gist.githubusercontent.com/oirodolfo/82093fc62a004566fdc7334a2e6dba34/raw/2a5df257d8536132c96d74fef54222d5a33ca592/002-alertify.user.js?v1
// @require      https://gist.githubusercontent.com/oirodolfo/d4bec87818e03483d9fe84cc8531a18b/raw/2a79e009dba6accc4bfd732957b2a7ca9ab95e2e/001-modules.user.js?v3
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v3
// @require      https://oirodolfo.github.io/bundler/cipo.js?v0
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/highlight.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/javascript.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/css.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/json.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/html.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/basic.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/go.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/rust.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/typescript.min.js
// ==/UserScript==

(async (globalWindow) => {
  "use strict";




  /***************************************************************************
   * Constants
   **************************************************************************/

  const BOOT_MODULE_NAME = "🍉 boot-essentials";
  const ACTIONS_MAP_NAME = "RodActionsMap";
  const ZOOM_STYLE_ID = "rod-lock-safari-zoom-style";
  const DEV_MODE = false;
  const DEV_CACHE_KEY = String(Date.now());

  const VIEWPORT_CONTENT =
    "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover";

  const DEV_DEPENDENCIES = [
    {
      name: "Rod Modules",
      url: "https://gist.githubusercontent.com/oirodolfo/d4bec87818e03483d9fe84cc8531a18b/raw/2a79e009dba6accc4bfd732957b2a7ca9ab95e2e/001-modules.user.js?v2",
      globals: ["Rod"],
    },
    {
      name: "Boot Helpers",
      url: "https://gist.githubusercontent.com/oirodolfo/d4bec87818e03483d9fe84cc8531a18b/raw/f293f77f755c94844357063626e9f73c34286eb6/00-boot.user.js",
      globals: ["debug"],
    },
    {
      name: "Alertify",
      url: "https://gist.githubusercontent.com/oirodolfo/82093fc62a004566fdc7334a2e6dba34/raw/2a5df257d8536132c96d74fef54222d5a33ca592/002-alertify.user.js?v0",
      globals: ["alertify"],
    },
    {
      name: "Elemental",
      url: "https://gist.githubusercontent.com/oirodolfo/61a97f2f4ad28a0c70c735ef514ecc69/raw/33a41ee9ed748a96b9030714fd4cb6e7ec45c699/elemental.js",
      globals: ["$el"],
    },
  ];

  /***************************************************************************
   * Logger
   **************************************************************************/

  /**
   * Shows an emergency message without depending on any boot dependency.
   *
   * @param {...unknown} values Values to report.
   * @returns {void}
   */
  function emergencyLog(...values) {
    try {
      console.log("🍉 [boot-essentials]", ...values);
    } catch {
      // Console can be patched by hostile pages. This keeps boot defensive.
    }
  }

  /**
   * Logs safely with a watermelon-themed console group.
   *
   * @param {...unknown} values Values to log.
   * @returns {void}
   */
  function log(...values) {
    const now = new Date();
    const time = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    try {
      if (typeof globalWindow.alertify === "function") {
        globalWindow.alertify("🍉 boot-essentials", ...values);
      }

      console.group(
        "%c 🍉 BOOT %c " + time + " %c boot-essentials ",
        [
          "background: linear-gradient(135deg, #ff1744 0%, #ff4d6d 45%, #43a047 100%);",
          "color: white;",
          "font-weight: 700;",
          "padding: 4px 10px;",
          "border-radius: 999px;",
          "font-family: Menlo, monospace;",
          "font-size: 12px;",
        ].join(" "),
        [
          "background: #111;",
          "color: #9ca3af;",
          "padding: 4px 8px;",
          "border-top: 1px solid #222;",
          "border-bottom: 1px solid #222;",
          "font-family: Menlo, monospace;",
          "font-size: 11px;",
        ].join(" "),
        [
          "background: #1b1b1b;",
          "color: #86efac;",
          "padding: 4px 10px;",
          "border-radius: 0 999px 999px 0;",
          "font-weight: 600;",
          "font-family: Menlo, monospace;",
          "font-size: 11px;",
        ].join(" "),
      );

      for (const value of values) {
        if (value && typeof value === "object") {
          console.dir(value);
        } else {
          console.log(value);
        }
      }

      console.groupEnd();
    } catch (error) {
      emergencyLog(...values);
      emergencyLog(error);
    }
  }

  /**
   * Logs a pretty development loader message.
   *
   * @param {string} title Log title.
   * @param {...unknown} values Extra values.
   * @returns {void}
   */
  function loaderLog(title, ...values) {
    const styles = [
      "background: linear-gradient(135deg, #ff1744, #ff4d6d 45%, #22c55e);",
      "color: white;",
      "font-weight: 800;",
      "padding: 4px 10px;",
      "border-radius: 999px;",
      "font-family: Menlo, monospace;",
      "font-size: 12px;",
    ].join(" ");

    try {
      console.groupCollapsed(
        `%c 🍉 DEV LOADER %c ${title}`,
        styles,
        "color:#86efac;font-weight:700;",
      );

      for (const value of values) {
        if (value && typeof value === "object") {
          console.dir(value);
        } else {
          console.log(value);
        }
      }

      console.groupEnd();
    } catch (error) {
      emergencyLog("DEV LOADER", title, ...values, error);
    }
  }

  /**
   * Reports a boot error without hiding the original stack.
   *
   * @param {unknown} error Error thrown during boot.
   * @returns {void}
   */
  function reportBootError(error) {
    const message = error instanceof Error ? error.message : String(error);

    try {
      alert(`Erro no boot: ${message}`);
    } catch {
      // Some pages can block alert. Console still keeps the trail.
    }

    emergencyLog(error);
    console.error(`[${BOOT_MODULE_NAME}] boot failed`, error);
  }

  /***************************************************************************
   * Dev Loader
   **************************************************************************/

  /**
   * Builds a URL with a dev-only cache buster.
   *
   * @param {string} url Base script URL.
   * @returns {string} Final URL.
   */
  function withDevCacheBust(url) {
    if (!DEV_MODE) {
      return url;
    }

    const separator = url.includes("?") ? "&" : "?";

    return `${url}${separator}rod_dev=${DEV_CACHE_KEY}`;
  }

  /**
   * Reads selected globals from window after a dependency loads.
   *
   * @param {readonly string[]} names Global names to inspect.
   * @returns {Record<string, { available: boolean, type: string, value: unknown }>} Snapshot.
   */
  function inspectGlobals(names) {
    const snapshot = {};

    for (const name of names) {
      const value = globalWindow[name];

      snapshot[name] = {
        available: value != null,
        type: typeof value,
        value,
      };
    }

    return snapshot;
  }

  /**
   * Loads and evaluates a remote script only when DEV_MODE is enabled.
   *
   * @param {{ name: string, url: string, globals?: readonly string[] }} dependency Dependency config.
   * @returns {Promise<void>}
   */
  async function loadScript(dependency) {
    const startedAt = performance.now();
    const finalUrl = withDevCacheBust(dependency.url);

    loaderLog(`Loading ${dependency.name}`, {
      devMode: DEV_MODE,
      url: finalUrl,
    });

    const response = await fetch(finalUrl, {
      cache: DEV_MODE ? "no-store" : "default",
    });

    if (!response.ok) {
      throw new Error(
        `Failed loading ${dependency.name}: ${response.status} ${response.statusText}`,
      );
    }

    const source = await response.text();

    try {
      (0, eval)(
        `${source}\n//# sourceURL=${dependency.name.replaceAll(" ", "-")}.dev-loader.js`,
      );
    } catch (error) {
      console.error(`🍉 Failed evaluating ${dependency.name}`, error);
      throw error;
    }

    loaderLog(`Loaded ${dependency.name}`, {
      elapsedMs: Math.round(performance.now() - startedAt),
      globals: inspectGlobals(dependency.globals || []),
    });
  }

  /**
   * Loads development dependencies in order.
   *
   * @returns {Promise<void>}
   */
  async function loadDependencies() {
    if (!DEV_MODE) {
      loaderLog("DEV loader disabled. Using @require dependencies.", {
        availableGlobals: inspectGlobals(["Rod", "debug", "alertify", "$el"]),
      });

      return;
    }

    const startedAt = performance.now();

    loaderLog("Starting dependency load", {
      devMode: DEV_MODE,
      count: DEV_DEPENDENCIES.length,
      cacheKey: DEV_CACHE_KEY,
    });

    for (const dependency of DEV_DEPENDENCIES) {
      await loadScript(dependency);
    }

    loaderLog("All dependencies loaded", {
      elapsedMs: Math.round(performance.now() - startedAt),
      availableGlobals: inspectGlobals(["Rod", "debug", "alertify", "$el", "FabricaHTML"]),
    });
  }

  /***************************************************************************
   * DOM Readiness Helpers
   **************************************************************************/

  /**
   * Runs a callback when document.head is available.
   *
   * @param {() => void} callback Callback to run.
   * @returns {void}
   */
  function whenHeadReady(callback) {
    if (document.head) {
      callback();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!document.head) {
        return;
      }

      observer.disconnect();
      callback();
    });

    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Gets or creates a meta viewport safely.
   *
   * @returns {{ element: HTMLMetaElement, created: boolean }} Viewport meta data.
   */
  function getOrCreateViewportMeta() {
    let viewport = document.querySelector('meta[name="viewport"]');

    if (viewport instanceof HTMLMetaElement) {
      return {
        element: viewport,
        created: false,
      };
    }

    viewport = document.createElement("meta");
    viewport.name = "viewport";
    document.head.appendChild(viewport);

    return {
      element: viewport,
      created: true,
    };
  }

  /**
   * Gets or creates the zoom lock style element.
   *
   * @returns {HTMLStyleElement} Style element.
   */
  function getOrCreateZoomStyle() {
    let style = document.getElementById(ZOOM_STYLE_ID);

    if (style instanceof HTMLStyleElement) {
      return style;
    }

    style = document.createElement("style");
    style.id = ZOOM_STYLE_ID;
    document.head.appendChild(style);

    return style;
  }

  /***************************************************************************
   * Safari Zoom Lock
   **************************************************************************/

  /**
   * Blocks most Safari iOS zoom paths.
   *
   * @returns {() => void} Cleanup function.
   */
  function lockZoom() {
    let cleanup = () => {};

    whenHeadReady(() => {
      let lastTouchEnd = 0;

      const viewport = getOrCreateViewportMeta();
      const previousViewportContent = viewport.element.getAttribute("content");

      const style = getOrCreateZoomStyle();
      const previousStyleText = style.textContent;

      viewport.element.setAttribute("content", VIEWPORT_CONTENT);

      style.textContent = `
        html,
        body,
        input,
        textarea,
        select,
        button {
          -webkit-text-size-adjust: 100% !important;
          text-size-adjust: 100% !important;
          touch-action: manipulation !important;
        }

        input,
        textarea,
        select {
          font-size: max(16px, 1em) !important;
        }

        * {
          -webkit-tap-highlight-color: transparent !important;
        }
      `;

      /**
       * Blocks an event aggressively.
       *
       * @param {Event} event Event to block.
       * @returns {void}
       */
      function block(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      /**
       * Blocks multi-touch gestures.
       *
       * @param {TouchEvent} event Touch event.
       * @returns {void}
       */
      function blockMultiTouch(event) {
        if (event.touches && event.touches.length > 1) {
          block(event);
        }
      }

      /**
       * Blocks double-tap zoom.
       *
       * @param {TouchEvent} event Touch event.
       * @returns {void}
       */
      function blockDoubleTap(event) {
        const now = Date.now();

        if (now - lastTouchEnd <= 350) {
          block(event);
        }

        lastTouchEnd = now;
      }

      /**
       * Blocks keyboard, wheel, or trackpad zoom shortcuts where available.
       *
       * @param {KeyboardEvent | WheelEvent} event Event.
       * @returns {void}
       */
      function blockShortcutZoom(event) {
        const isKeyboardEvent = "key" in event;
        const isZoomKey =
          isKeyboardEvent &&
          (event.key === "+" ||
            event.key === "-" ||
            event.key === "=" ||
            event.key === "0");

        if ((event.ctrlKey || event.metaKey) && isZoomKey) {
          block(event);
        }
      }

      const blockingOptions = {
        passive: false,
        capture: true,
      };

      document.addEventListener("gesturestart", block, blockingOptions);
      document.addEventListener("gesturechange", block, blockingOptions);
      document.addEventListener("gestureend", block, blockingOptions);
      document.addEventListener("touchstart", blockMultiTouch, blockingOptions);
      document.addEventListener("touchmove", blockMultiTouch, blockingOptions);
      document.addEventListener("touchend", blockDoubleTap, blockingOptions);
      document.addEventListener("wheel", blockShortcutZoom, blockingOptions);
      document.addEventListener("keydown", blockShortcutZoom, blockingOptions);

      cleanup = function unlockSafariZoom() {
        document.removeEventListener("gesturestart", block, blockingOptions);
        document.removeEventListener("gesturechange", block, blockingOptions);
        document.removeEventListener("gestureend", block, blockingOptions);
        document.removeEventListener("touchstart", blockMultiTouch, blockingOptions);
        document.removeEventListener("touchmove", blockMultiTouch, blockingOptions);
        document.removeEventListener("touchend", blockDoubleTap, blockingOptions);
        document.removeEventListener("wheel", blockShortcutZoom, blockingOptions);
        document.removeEventListener("keydown", blockShortcutZoom, blockingOptions);

        if (viewport.created) {
          viewport.element.remove();
        } else if (previousViewportContent == null) {
          viewport.element.removeAttribute("content");
        } else {
          viewport.element.setAttribute("content", previousViewportContent);
        }

        style.textContent = previousStyleText || "";
      };
    });

    return function unlockZoomWhenReady() {
      cleanup();
    };
  }

  /***************************************************************************
   * Window Waiters
   **************************************************************************/

  /**
   * Safely resolves a nested property path from a target object.
   *
   * @param {Record<string, unknown>} target Target object.
   * @param {string} path Dot-separated path.
   * @returns {unknown} Resolved value.
   */
  function getNestedProperty(target, path) {
    return path.split(".").reduce((current, key) => {
      if (current == null || typeof current !== "object") {
        return undefined;
      }

      return current[key];
    }, target);
  }

  /**
   * Waits until one or more variables become available on window.
   *
   * @param {string | string[]} paths Window paths to wait for.
   * @param {{
   *   timeout?: number;
   *   interval?: number;
   *   predicate?: (value: unknown, path: string) => boolean;
   *   signal?: AbortSignal;
   *   debug?: boolean;
   * }} [options] Wait options.
   * @returns {Promise<Record<string, unknown>>} Resolved values by path.
   */
  function waitForWindow(paths, options = {}) {
    const {
      timeout = 30_000,
      interval = 16,
      predicate = (value) => value != null,
      signal,
      debug = true,
    } = options;

    const normalizedPaths = Array.isArray(paths) ? paths : [paths];

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let timer = null;
      let settled = false;

      /**
       * Clears resources and settles once.
       *
       * @param {"resolve" | "reject"} mode Settlement mode.
       * @param {Record<string, unknown> | Error} payload Promise payload.
       * @returns {void}
       */
      function finish(mode, payload) {
        if (settled) {
          return;
        }

        settled = true;

        if (timer != null) {
          clearInterval(timer);
        }

        if (signal) {
          signal.removeEventListener("abort", handleAbort);
        }

        if (mode === "resolve") {
          resolve(payload);
        } else {
          reject(payload);
        }
      }

      /**
       * Handles abort signals.
       *
       * @returns {void}
       */
      function handleAbort() {
        if (debug) {
          log("WAIT: abort", normalizedPaths);
        }

        finish(
          "reject",
          new Error(`waitForWindow aborted: ${normalizedPaths.join(", ")}`),
        );
      }

      if (signal?.aborted) {
        handleAbort();
        return;
      }

      signal?.addEventListener("abort", handleAbort);

      if (debug) {
        log("WAIT: start", normalizedPaths);
      }

      timer = setInterval(() => {
        const results = {};
        let allResolved = true;

        for (const path of normalizedPaths) {
          const value = getNestedProperty(globalWindow, path);

          if (!predicate(value, path)) {
            allResolved = false;
            break;
          }

          results[path] = value;
        }

        if (allResolved) {
          if (debug) {
            log("WAIT: finished", results);
          }

          finish("resolve", results);
          return;
        }

        if (Date.now() - startedAt >= timeout) {
          finish(
            "reject",
            new Error(
              `Timed out waiting for window variables: ${normalizedPaths.join(", ")}`,
            ),
          );
        }
      }, interval);
    });
  }

  /**
   * Waits for a single top-level global to exist.
   *
   * @param {string} name Global property name.
   * @param {number} [interval=16] Polling interval.
   * @returns {Promise<unknown>} Global value.
   */
  function waitForGlobal(name, interval = 16) {
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (globalWindow[name]) {
          clearInterval(timer);
          resolve(globalWindow[name]);
        }
      }, interval);
    });
  }

  /***************************************************************************
   * Extension Bridge Listener
   **************************************************************************/

  /**
   * Installs a page message listener for extension/content-script bridges.
   *
   * @returns {() => void} Cleanup function.
   */
  function installBridgeListener() {
    /**
     * Handles messages posted into the page.
     *
     * @param {MessageEvent} event Message event.
     * @returns {void}
     */
    function handleBridgeMessage(event) {
      if (event.source !== globalWindow) {
        return;
      }

      log("Bridge message received:", event.data);
    }

    globalWindow.addEventListener("message", handleBridgeMessage);

    return function removeBridgeListener() {
      globalWindow.removeEventListener("message", handleBridgeMessage);
    };
  }

  /***************************************************************************
   * Rod Actions
   **************************************************************************/

  globalWindow[ACTIONS_MAP_NAME] ??= new Map();

  /**
   * Registers an action callable from a launcher or another userscript.
   *
   * @param {{
   *   id: string;
   *   label: string;
   *   description?: string;
   *   run: () => void | Promise<void>;
   * }} action Script action.
   * @returns {boolean} Whether the action was registered.
   */
  function registerScriptAction(action) {
    if (!action || typeof action.id !== "string" || typeof action.run !== "function") {
      console.warn("[RodScriptLauncher] Invalid action", action);
      return false;
    }

    globalWindow[ACTIONS_MAP_NAME].set(action.id, action);

    globalWindow.dispatchEvent(
      new CustomEvent("rod:script-action-registered", {
        detail: action,
      }),
    );

    log("Registered script action:", action.id);

    return true;
  }

  /**
   * Installs a window event API for external scripts to register actions.
   *
   * @returns {() => void} Cleanup function.
   */
  function installActionRegistryListener() {
    /**
     * Registers actions sent through a custom event.
     *
     * @param {Event} event Custom event.
     * @returns {void}
     */
    function handleRegisterAction(event) {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      registerScriptAction(event.detail);
    }

    globalWindow.addEventListener("rod:register-script-action", handleRegisterAction);

    return function removeActionRegistryListener() {
      globalWindow.removeEventListener("rod:register-script-action", handleRegisterAction);
    };
  }

  /**
   * Registers built-in script actions.
   *
   * @returns {void}
   */
  function registerBuiltinActions() {
    registerScriptAction({
      id: "run-highlight",
      label: "Highlight code",
      description: "Executa o highlight manualmente.",
      run() {
        globalWindow.hljs?.highlightAll?.();
      },
    });

    registerScriptAction({
      id: "enable-eruda",
      label: "Abrir Eruda",
      description: "Inicializa ou mostra o Eruda.",
      run() {
        globalWindow.eruda?.init?.();
        globalWindow.eruda?.show?.();
      },
    });

    if (globalWindow.RodScriptLauncher?.register) {
      for (const action of globalWindow[ACTIONS_MAP_NAME].values()) {
        globalWindow.RodScriptLauncher.register(action);
      }
    }
  }

  /***************************************************************************
   * Rod Module Registration
   **************************************************************************/

  /**
   * Defines a Rod module with validation and logging.
   *
   * @param {string} namespace Module namespace.
   * @param {Record<string, unknown>} moduleValue Module exports.
   * @returns {Promise<void>}
   */
  async function defineRodModule(namespace, moduleValue) {
    const result = await waitForWindow("Rod", {
      debug: false,
    });

    const Rod = result.Rod;

    if (!Rod || typeof Rod.define !== "function") {
      throw new Error("Rod.define is not available.");
    }

    if (!moduleValue || typeof moduleValue !== "object") {
      throw new TypeError(`Invalid module for namespace "${namespace}".`);
    }

    log(`Registering module "${namespace}"`, moduleValue);

    Rod.define(namespace, moduleValue);
  }

  /**
   * Registers shared boot modules into Rod.
   *
   * @returns {Promise<void>}
   */
  async function registerModules() {
    const result = await waitForWindow("Rod", {
      timeout: 30_000,
      debug: true,
    });

    const Rod = result.Rod;
    const extend = Rod?.extend || Rod?.extnd;

    if (!Rod) {
      throw new Error("Rod module registry was not found on window.");
    }

    if (typeof Rod.define !== "function") {
      throw new Error("Rod.define is not a function.");
    }

    if (typeof extend !== "function") {
      throw new Error("Rod.extend or Rod.extnd is not a function.");
    }

    await defineRodModule("html", {
      $el: globalWindow.$el,
    });

    await defineRodModule("logger", {
      alertify: globalWindow.alertify,
      debug: globalWindow.debug,
      log,
    });

    extend("utils", {
      lockZoom,
      waitForWindow,
      waitForGlobal,
      getNestedProperty,
      registerScriptAction,
    });

    globalWindow.waitForWindow = waitForWindow;
    globalWindow.waitForGlobal = waitForGlobal;
    globalWindow.registerScriptAction = registerScriptAction;

    if (typeof Rod.list === "function") {
      log("Available modules:", Rod.list());
    }
  }

  /***************************************************************************
   * Boot
   **************************************************************************/

  /**
   * Boots essential globals and shared modules.
   *
   * @returns {Promise<void>}
   */
  async function boot() {
    log("BOOT INIT");

    installBridgeListener();
    installActionRegistryListener();
    registerBuiltinActions();

    await registerModules();

    if (typeof globalWindow.debug === "function") {
      globalWindow.debug({
        module: BOOT_MODULE_NAME,
        status: "ready",
        modules: globalWindow.Rod?.list?.(),
      });
    }

    log("Ready", {
      Rod: globalWindow.Rod,
      actions: Array.from(globalWindow[ACTIONS_MAP_NAME].keys()),
      globals: inspectGlobals(["Rod", "debug", "alertify", "$el", "waitForWindow"]),
    });
  }

  /***************************************************************************
   * Main
   **************************************************************************/

  try {
  //  await loadDependencies();
    await boot();

    try {
      alert("BOOT OK");
    } catch {
      // Alert can fail or be blocked, but boot is already done.
    }
  } catch (error) {
    reportBootError(error);
  }
})(window);
