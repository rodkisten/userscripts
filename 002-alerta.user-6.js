// ==UserScript==
// @name         002 / Alerta / Docked Inspector Main
// @namespace    https://rod.dev/userscripts
// @version      6.6.2
// @description  Central Alerta docked inspector runtime with unified plugin API, scoped plugin storage, settings registry, rich logger, object store, source modal, compact mobile UI, and shared RodUtils exports.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       998
// @grant        none
// @require      https://unpkg.com/lucide@0.468.0/dist/umd/lucide.js?v1
// @require      https://code.migos.club/api/cdn?preset=highlight&css=highlight.js/styles/base16/material-darker.min.css&bundle=iife&global=RodCDN&cache=immutable
// @noframes
// ==/UserScript==

(async function DockedInspectorMain() {
  "use strict";

  /* *************** */
  /* RodUtils Boot   */
  /* *************** */

  /**
   * Waits for RodUtils without depending on RodUtils itself.
   *
   * @returns {Promise<object>} RodUtils namespace.
   */
  async function waitForRodUtils() {
    const startedAt = performance.now();
    const timeout = 10_000;

    while (!window.RodUtils) {
      if (performance.now() - startedAt >= timeout) {
        throw new Error("[Alerta] RodUtils was not found.");
      }

      await new Promise((resolve) => setTimeout(resolve, 16));
    }

    return window.RodUtils;
  }

  const Utils = await waitForRodUtils();

  /* *************** */
  /* Constants       */
  /* *************** */

  const VERSION = "6.6.2";
  const HOST_ID = "__rod_docked_inspector_host__";
  const ROOT_ID = "__rod_docked_inspector_root__";
  const STYLE_ID = "__rod_docked_inspector_style__";
  const STORAGE_KEY = "rod.docked.inspector.v6.6";
  const LEGACY_STORAGE_KEY = "rod.docked.inspector.v6.5";
  const PLUGIN_STORAGE_PREFIX = "rod.docked.inspector.plugin";
  const PATCHED = Symbol.for("rod.docked.inspector.v6.6.console");

  const MAX_RECORDS = 500;
  const MAX_TREE_ITEMS = 160;
  const MAX_TREE_RENDER_ITEMS = 42;
  const MAX_TEXT = 900;
  const INITIAL_LIMIT = 60;
  const LIMIT_STEP = 60;
  const SEARCH_DEBOUNCE_MS = 80;
  const FLASH_MS = 1_200;
  const LIT_TIMEOUT_MS = 3_500;

  /* *************** */
  /* Runtime State   */
  /* *************** */

  const nativeConsole = window.nativeConsole || {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    trace: console.trace ? console.trace.bind(console) : console.log.bind(console),
  };

  const nativeAlert = window.nativeAlert || window.alert.bind(window);
  const eventBus = Utils.createEventBus();

  const logs = [];
  const events = [];
  const plugins = [];
  const objectStoreMap = new Map();
  const objectRefs = new WeakMap();
  const expandedPaths = new Set();
  const expandedPathLimits = new Map();

  let runtime = createFallbackRuntime();
  let host = null;
  let root = null;
  let shadow = null;
  let mountedMode = "";
  let booted = false;
  let renderFrame = 0;
  let searchTimer = 0;
  let dockDragging = false;
  let dragState = null;
  let resizeState = null;
  let nextRecordId = 1;
  let nextObjectId = 1;
  let nextSurfaceId = 1;
  let stateRenderSuspended = false;
  let statePersistSuspended = false;
  let pendingStateRender = false;
  let pendingStatePersist = false;

  cleanupPreviousInstance();

  const state = Utils.createStore(readState(), handleStateChange);
  const api = createPluginApi("core");

  Utils.timed("exposePublicApi", exposePublicApi);
  Utils.timed("installConsolePatch", installConsolePatch);
  Utils.timed("installErrorInterceptors", installErrorInterceptors);
  Utils.timed("installNetworkInterceptors", installNetworkInterceptors);
  Utils.timed("registerBuiltInPlugins", registerBuiltInPlugins);
  Utils.timed("boot", boot);
  Utils.timed("loadHtmlRuntime", loadHtmlRuntime);

  /* *************** */
  /* State           */
  /* *************** */

  /**
   * Reads persistent state.
   *
   * @returns {object} State.
   */
  function readState() {
    const fallback = {
      open: false,
      docked: true,
      zen: false,
      dockY: Math.round(window.innerHeight * 0.34),
      x: 16,
      y: 72,
      width: 520,
      height: Math.min(780, window.innerHeight - 28),
      query: "",
      tab: "logs",
      defaultTab: "logs",
      defaultFullscreen: false,
      mountMode: "shadow",
      theme: "dark",
      density: "compact",
      fontSize: 12,
      opacity: 0.94,
      filters: { logs: "all", events: "all" },
      limits: { logs: INITIAL_LIMIT, events: INITIAL_LIMIT },
      plugins: {},
      settingsGroups: {},
      modal: null,
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "{}";
      const saved = JSON.parse(raw);

      return {
        ...fallback,
        ...saved,
        open: false,
        docked: true,
        zen: Boolean(saved.defaultFullscreen),
        tab: saved.defaultTab || saved.tab || fallback.tab,
        mountMode: saved.mountMode === "light" ? "light" : "shadow",
        filters: { ...fallback.filters, ...(saved.filters || {}) },
        limits: { logs: INITIAL_LIMIT, events: INITIAL_LIMIT },
        plugins: { ...(saved.plugins || {}) },
        settingsGroups: { ...(saved.settingsGroups || {}) },
        modal: null,
      };
    } catch {
      return fallback;
    }
  }

  /**
   * Saves persistent state.
   *
   * @returns {void}
   */
  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          open: false,
          docked: true,
          zen: state.zen,
          dockY: state.dockY,
          x: state.x,
          y: state.y,
          width: state.width,
          height: state.height,
          query: state.query,
          tab: state.tab,
          defaultTab: state.defaultTab,
          defaultFullscreen: state.defaultFullscreen,
          mountMode: state.mountMode,
          theme: state.theme,
          density: state.density,
          fontSize: state.fontSize,
          opacity: state.opacity,
          filters: { ...state.filters },
          plugins: { ...state.plugins },
          settingsGroups: { ...state.settingsGroups },
        }),
      );
    } catch (error) {
      nativeConsole.warn("[Alerta.state] save failed", error);
    }
  }

  /**
   * Handles state mutations.
   *
   * @returns {void}
   */
  function handleStateChange() {
    if (statePersistSuspended) pendingStatePersist = true;
    else saveState();

    if (stateRenderSuspended) {
      pendingStateRender = true;
      return;
    }

    scheduleRender();
  }

  /**
   * Runs a state batch without rendering.
   *
   * @param {Function} callback Batch callback.
   * @returns {*} Callback result.
   */
  function withoutStateRender(callback) {
    stateRenderSuspended = true;

    try {
      return callback();
    } finally {
      stateRenderSuspended = false;

      if (pendingStateRender) {
        pendingStateRender = false;
        scheduleRender();
      }
    }
  }

  /**
   * Runs a state batch without persistence.
   *
   * @param {Function} callback Batch callback.
   * @returns {*} Callback result.
   */
  function withoutStatePersistence(callback) {
    statePersistSuspended = true;

    try {
      return callback();
    } finally {
      statePersistSuspended = false;

      if (pendingStatePersist) {
        pendingStatePersist = false;
        saveState();
      }
    }
  }

  /**
   * Runs a silent state batch.
   *
   * @param {Function} callback Batch callback.
   * @returns {*} Callback result.
   */
  function withSilentState(callback) {
    const previousRender = stateRenderSuspended;
    const previousPersist = statePersistSuspended;

    stateRenderSuspended = true;
    statePersistSuspended = true;

    try {
      return callback();
    } finally {
      stateRenderSuspended = previousRender;
      statePersistSuspended = previousPersist;
    }
  }

  /* *************** */
  /* Runtime         */
  /* *************** */

  /**
   * Loads lit-html after the main UI has already booted.
   *
   * @returns {Promise<void>} Runtime promise.
   */
  async function loadHtmlRuntime() {
    runtime = await createHtmlRuntime();
    scheduleRender();
  }

  /**
   * Creates the preferred HTML runtime.
   *
   * @returns {Promise<object>} Runtime.
   */
  async function createHtmlRuntime() {
    try {
      const lit = await Utils.timeoutImport("https://esm.sh/lit@3.2.1?bundle", LIT_TIMEOUT_MS);
      const unsafe = await Utils.timeoutImport("https://esm.sh/lit@3.2.1/directives/unsafe-html.js?bundle", LIT_TIMEOUT_MS);
      const repeatDirective = await Utils.timeoutImport("https://esm.sh/lit@3.2.1/directives/repeat.js?bundle", LIT_TIMEOUT_MS);
      const cacheDirective = await Utils.timeoutImport("https://esm.sh/lit@3.2.1/directives/cache.js?bundle", LIT_TIMEOUT_MS);

      return {
        name: "lit-html",
        html: lit.html,
        render: lit.render,
        unsafeHTML: unsafe.unsafeHTML,
        repeat: repeatDirective.repeat,
        cache: cacheDirective.cache,
        nothing: lit.nothing,
        isFallback: false,
      };
    } catch (error) {
      nativeConsole.warn("[Alerta.runtime] Lit failed, using fallback", error);
      return createFallbackRuntime();
    }
  }

  /**
   * Runtime html tag.
   *
   * @param {TemplateStringsArray} strings Strings.
   * @param {...*} values Values.
   * @returns {*} Template.
   */
  function html(strings, ...values) {
    return runtime.html(strings, ...values);
  }

  /**
   * Creates fallback runtime.
   *
   * @returns {object} Runtime.
   */
  function createFallbackRuntime() {
    function fallbackHtml(strings, ...values) {
      let output = "";

      for (let index = 0; index < strings.length; index += 1) {
        output += strings[index];
        if (index < values.length) output += stringifyFallbackValue(values[index]);
      }

      return { __rodTemplate: true, value: output };
    }

    return {
      name: "minimal-fallback",
      html: fallbackHtml,
      render(view, container) {
        if (!container) return;

        const nextHtml = stringifyFallbackValue(view);

        if (container.__rodHtml === nextHtml) {
          bindFallbackActions(container);
          return;
        }

        container.__rodHtml = nextHtml;
        container.innerHTML = nextHtml;
        bindFallbackActions(container);
      },
      unsafeHTML(value) {
        return { __rodTemplate: true, value: String(value) };
      },
      repeat(items, _keyFn, viewFn) {
        const list = Array.from(items);
        const out = new Array(list.length);

        for (let index = 0; index < list.length; index += 1) {
          out[index] = viewFn(list[index], index);
        }

        return out;
      },
      cache(value) {
        return value;
      },
      nothing: "",
      isFallback: true,
    };
  }

  /**
   * Stringifies fallback value.
   *
   * @param {*} value Value.
   * @returns {string} HTML.
   */
  function stringifyFallbackValue(value) {
    if (Array.isArray(value)) return value.map(stringifyFallbackValue).join("");
    if (value && value.__rodTemplate) return value.value;
    if (typeof value === "function") return "";
    if (value === null || value === undefined || value === false) return "";

    return String(value);
  }

  /**
   * Binds fallback delegated events.
   *
   * @param {HTMLElement} container Container.
   * @returns {void}
   */
  function bindFallbackActions(container) {
    container.onclick = (event) => {
      const target = event.target.closest("[data-ra-action]");
      if (target) runAction(target.dataset.raAction, event, target);
    };

    container.oninput = (event) => {
      const target = event.target.closest("[data-ra-input]");
      if (target) runAction(target.dataset.raInput, event, target);
    };

    container.onchange = (event) => {
      const target = event.target.closest("[data-ra-change]");
      if (target) runAction(target.dataset.raChange, event, target);
    };
  }

  /* *************** */
  /* Mounting        */
  /* *************** */

  /**
   * Cleans previous instance from the page.
   *
   * @returns {void}
   */
  function cleanupPreviousInstance() {
    try {
      window.RodDockedInspector?.destroy?.();
    } catch {}

    const ids = [HOST_ID, ROOT_ID, STYLE_ID];

    for (let index = 0; index < ids.length; index += 1) {
      const node = document.getElementById(ids[index]);
      if (node) node.remove();
    }

    const leftovers = document.querySelectorAll('[data-ra-host="true"], .ra-root');

    for (let index = 0; index < leftovers.length; index += 1) {
      leftovers[index].remove();
    }
  }

  /**
   * Gets effective mount mode.
   *
   * @returns {"shadow"|"light"} Mount mode.
   */
  function getEffectiveMountMode() {
    if (state.mountMode === "light") return "light";
    if (!Element.prototype.attachShadow) return "light";

    return "shadow";
  }

  /**
   * Gets or creates the root node.
   *
   * @returns {HTMLElement} Root.
   */
  function getRoot() {
    const mode = getEffectiveMountMode();

    if (root && root.isConnected && mountedMode === mode) return root;

    host = document.getElementById(HOST_ID) || document.createElement("div");
    host.id = HOST_ID;
    host.dataset.raHost = "true";

    if (!host.isConnected) {
      document.documentElement.appendChild(host);
    }

    mountedMode = mode;

    if (mode === "shadow") {
      shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
      ensureShadowStyles(shadow);
      root = shadow.getElementById(ROOT_ID);

      if (!root) {
        root = document.createElement("div");
        root.id = ROOT_ID;
        root.className = "ra-root";
        shadow.appendChild(root);
      }

      return root;
    }

    shadow = null;
    ensureDocumentStyles();
    root = host;
    root.classList.add("ra-root");

    return root;
  }

  /**
   * Remounts the root after mount mode changes.
   *
   * @returns {void}
   */
  function remountInspectorRoot() {
    try {
      if (root && runtime?.render) runtime.render(runtime.nothing, root);
    } catch {}

    const oldHost = host || document.getElementById(HOST_ID);
    if (oldHost) oldHost.remove();

    host = null;
    root = null;
    shadow = null;
    mountedMode = "";

    if (booted) scheduleRender();
  }

  /* *************** */
  /* Plugin Storage  */
  /* *************** */

  /**
   * Safely serializes plugin storage payloads.
   *
   * @param {*} value Value.
   * @returns {string} JSON text.
   */
  function safeJsonStringify(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return "{}";
    }
  }

  /**
   * Normalizes plugin ids for stable localStorage keys.
   *
   * @param {string} pluginId Plugin id.
   * @returns {string} Safe plugin id.
   */
  function normalizePluginId(pluginId) {
    return String(pluginId || "core")
      .trim()
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "core";
  }

  /**
   * Gets the storage key for one plugin.
   *
   * @param {string} pluginId Plugin id.
   * @returns {string} Storage key.
   */
  function getPluginStorageKey(pluginId) {
    return `${PLUGIN_STORAGE_PREFIX}.${normalizePluginId(pluginId)}`;
  }

  /**
   * Creates a localStorage API scoped to one plugin id.
   *
   * @param {string} pluginId Plugin id.
   * @returns {object} Storage API.
   */
  function createPluginStorage(pluginId) {
    const storageKey = getPluginStorageKey(pluginId);

    function readAll() {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }

    function writeAll(nextState) {
      try {
        localStorage.setItem(storageKey, safeJsonStringify(nextState));
      } catch {}
    }

    return {
      key: storageKey,

      get(name, fallbackValue = null) {
        const currentState = readAll();
        return Object.prototype.hasOwnProperty.call(currentState, name) ? currentState[name] : fallbackValue;
      },

      set(name, value) {
        const currentState = readAll();
        currentState[name] = value;
        writeAll(currentState);
        return value;
      },

      patch(partialState) {
        const nextState = { ...readAll(), ...(partialState || {}) };
        writeAll(nextState);
        return nextState;
      },

      remove(name) {
        const currentState = readAll();
        delete currentState[name];
        writeAll(currentState);
      },

      clear() {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      },

      all() {
        return readAll();
      },
    };
  }

  /* *************** */
  /* Public API      */
  /* *************** */

  /**
   * Creates the plugin API.
   *
   * @param {string} pluginId Plugin id used to scope storage automatically.
   * @returns {object} API.
   */
  function createPluginApi(pluginId = "core") {
    const normalizedPluginId = normalizePluginId(pluginId);

    return {
      version: VERSION,
      pluginId: normalizedPluginId,

      get html() {
        return runtime.html;
      },

      get unsafeHTML() {
        return runtime.unsafeHTML;
      },

      get repeat() {
        return runtime.repeat;
      },

      get cache() {
        return runtime.cache;
      },

      get nothing() {
        return runtime.nothing;
      },

      logs,
      events,
      state,
      utils: Utils,

      createStore: Utils.createStore,
      signal: Utils.signal,
      effect: Utils.effect,
      computed: Utils.computed,
      bindText: Utils.bindText,
      bindAttr: Utils.bindAttr,
      bindStyle: Utils.bindStyle,
      copyText: Utils.copyText,

      icon,
      registerPlugin,
      scheduleRender,
      addLog: addInspectorLog,
      addEvent: pushEventRecord,
      createLogSurface,
      selectElement,
      revealElementInElementsPanel,
      viewInspectableObject,
      viewLogCard,
      viewRecords,

      objectStore: {
        raw: objectStoreMap,
        set: storeObject,
        get: (id) => objectStoreMap.get(id),
        has: (id) => objectStoreMap.has(id),
        delete: (id) => objectStoreMap.delete(id),
        entries: () => objectStoreMap.entries(),
        values: () => objectStoreMap.values(),
        size: () => objectStoreMap.size,
      },

      mount: {
        getMode: () => getEffectiveMountMode(),
        getHost: () => host,
        getRoot,
        remount: remountInspectorRoot,
        setMode(mode) {
          state.mountMode = mode === "light" ? "light" : "shadow";
          saveState();
          remountInspectorRoot();
        },
      },

      settings: {
        register: registerPluginSettings,
        get: getPluginSetting,
        set: setPluginSetting,
        groups: () => state.settingsGroups,
        resetAll: resetAllSettings,
      },

      format: {
        escapeHtml: Utils.escapeHtml,
        getNodeLabel: Utils.getNodeLabel,
        getObjectPreview,
        getRichCode,
        formatValue,
        formatHtml: Utils.formatHtml,
        formatCss: Utils.formatCss,
        highlightCode: Utils.highlightCode,
      },

      modal: {
        open: openSourceModal,
        openSource,
        close: closeModal,
      },

      dom: {
        focusObject,
        setDollarZero,
        flashElement,
        getElementFromObject: Utils.getElementFromObject,
      },

      on: eventBus.on.bind(eventBus),
      off: eventBus.off.bind(eventBus),
      emit: eventBus.emit.bind(eventBus),

      addStyle,
      minimize: minimizeInspector,
      open: openInspector,
      toggleZenMode,
      withoutStateRender,
      withoutStatePersistence,
      withSilentState,
      storage: createPluginStorage(normalizedPluginId),
    };
  }

  /**
   * Exposes the global API.
   *
   * @returns {void}
   */
  function exposePublicApi() {
    window.RodDockedInspector = {
      version: VERSION,
      registerPlugin,
      api,
      logs,
      events,
      objectStore: objectStoreMap,
      open: openInspector,
      minimize: minimizeInspector,
      toggleZenMode,
      selectElement,
      revealElementInElementsPanel,
      createLogSurface,
      clear() {
        logs.length = 0;
        events.length = 0;
        scheduleRender();
      },
      destroy() {
        try {
          if (root && runtime?.render) runtime.render(runtime.nothing, root);
        } catch {}

        document.getElementById(HOST_ID)?.remove();
        document.getElementById(ROOT_ID)?.remove();
        document.getElementById(STYLE_ID)?.remove();

        try {
          eventBus.clear();
        } catch {}
      },
    };
  }

  /* *************** */
  /* Settings        */
  /* *************** */

  /**
   * Registers plugin settings.
   *
   * @param {string} pluginId Plugin id.
   * @param {Array<object>} fields Fields.
   * @returns {boolean} Registered.
   */
  function registerPluginSettings(pluginId, fields) {
    const normalizedPluginId = normalizePluginId(pluginId);

    if (!normalizedPluginId || !Array.isArray(fields)) return false;
    if (!state.plugins[normalizedPluginId]) state.plugins[normalizedPluginId] = {};

    const normalized = [];

    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      if (!field?.key) continue;

      normalized.push({
        type: field.type || "text",
        key: field.key,
        label: field.label || field.key,
        description: field.description || "",
        defaultValue: field.defaultValue,
        min: field.min,
        max: field.max,
        step: field.step,
        options: field.options || [],
      });

      if (state.plugins[normalizedPluginId][field.key] === undefined) {
        state.plugins[normalizedPluginId][field.key] = field.defaultValue;
      }
    }

    state.settingsGroups[normalizedPluginId] = normalized;
    saveState();
    scheduleRender();

    return true;
  }

  /**
   * Gets one plugin setting.
   *
   * @param {string} pluginId Plugin id.
   * @param {string} key Key.
   * @param {*} fallback Fallback.
   * @returns {*} Value.
   */
  function getPluginSetting(pluginId, key, fallback = undefined) {
    const normalizedPluginId = normalizePluginId(pluginId);
    return state.plugins?.[normalizedPluginId]?.[key] !== undefined ? state.plugins[normalizedPluginId][key] : fallback;
  }

  /**
   * Sets one plugin setting.
   *
   * @param {string} pluginId Plugin id.
   * @param {string} key Key.
   * @param {*} value Value.
   * @returns {void}
   */
  function setPluginSetting(pluginId, key, value) {
    const normalizedPluginId = normalizePluginId(pluginId);

    if (!state.plugins[normalizedPluginId]) state.plugins[normalizedPluginId] = {};

    state.plugins[normalizedPluginId][key] = value;
    eventBus.emit("setting:changed", { pluginId: normalizedPluginId, key, value });
    saveState();
    scheduleRender();
  }

  /**
   * Handles a setting field mutation.
   *
   * @param {string} encodedAction Encoded action.
   * @param {Event} _event Event.
   * @param {HTMLElement} target Target.
   * @returns {void}
   */
  function handleSettingAction(encodedAction, _event, target) {
    const [pluginId, key, type] = encodedAction.split(":");
    let value = target.value;

    if (type === "boolean") value = Boolean(target.checked);
    if (type === "number" || type === "range") value = Number(value);

    if (pluginId === "core") {
      const previousMountMode = state.mountMode;

      state[key] = value;

      if (key === "defaultFullscreen") state.zen = Boolean(value);
      if (key === "defaultTab") state.tab = String(value);

      if (key === "mountMode" && previousMountMode !== value) {
        saveState();
        remountInspectorRoot();
        return;
      }

      scheduleRender();
      return;
    }

    setPluginSetting(pluginId, key, value);
  }

  /**
   * Resets all settings.
   *
   * @returns {void}
   */
  function resetAllSettings() {
    withSilentState(() => {
      state.defaultTab = "logs";
      state.defaultFullscreen = false;
      state.mountMode = "shadow";
      state.theme = "dark";
      state.density = "compact";
      state.fontSize = 12;
      state.opacity = 0.94;
      state.width = 520;
      state.height = Math.min(780, window.innerHeight - 28);
      state.zen = false;
      state.tab = "logs";
    });

    saveState();
    remountInspectorRoot();
    addInspectorLog("info", "Settings reset.");
  }

  /**
   * Exports settings to clipboard.
   *
   * @returns {void}
   */
  function exportSettings() {
    Utils.copyText(JSON.stringify({ core: state, plugins: state.plugins }, null, 2));
    addInspectorLog("info", "Settings copied to clipboard.");
  }

  /**
   * Imports settings from JSON.
   *
   * @returns {void}
   */
  function importSettings() {
    const raw = window.prompt("Paste Alerta settings JSON:");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const previousMountMode = state.mountMode;

      withSilentState(() => {
        Object.assign(state, parsed.core || {});
        state.mountMode = state.mountMode === "light" ? "light" : "shadow";
        state.plugins = { ...state.plugins, ...(parsed.plugins || {}) };
      });

      saveState();

      if (previousMountMode !== state.mountMode) {
        remountInspectorRoot();
      }

      scheduleRender();
      addInspectorLog("info", "Settings imported.");
    } catch (error) {
      addInspectorLog("error", "Invalid settings JSON.", error);
    }
  }

  /* *************** */
  /* Plugins         */
  /* *************** */

  /**
   * Registers built-in plugins.
   *
   * @returns {void}
   */
  function registerBuiltInPlugins() {
    registerPlugin({
      id: "logs",
      title: "Logs",
      icon: "terminal",
      order: 10,
      filters: ["all", "log", "info", "warn", "error", "debug", "trace", "alert", "alerta"],
      renderFilters: renderDefaultFilter,
      render: () => viewRecords("logs", getVisibleLogs(), viewLogCard),
    });

    registerPlugin({
      id: "events",
      title: "Events",
      icon: "radio",
      order: 20,
      filters: ["all", "listener", "network", "error"],
      renderFilters: renderDefaultFilter,
      render: () => viewRecords("events", getVisibleEvents(), viewEventCard),
    });

    registerPlugin({
      id: "settings",
      title: "Settings",
      icon: "settings",
      order: 999,
      render: renderSettingsPlugin,
    });

    registerPluginSettings("logs", [
      { key: "groupRepeated", type: "boolean", label: "Group repeated logs", description: "Collapse repeated log records.", defaultValue: true },
      { key: "compactCards", type: "boolean", label: "Compact cards", description: "Use a tighter logger layout.", defaultValue: true },
      { key: "showActions", type: "boolean", label: "Show object actions", description: "Show $0, reveal and source buttons.", defaultValue: true },
      { key: "maxRecords", type: "number", label: "Max records", min: 50, max: 2000, step: 50, defaultValue: MAX_RECORDS },
    ]);

    registerPluginSettings("events", [
      { key: "captureNetwork", type: "boolean", label: "Capture network", description: "Capture fetch and XHR.", defaultValue: true },
      { key: "captureErrors", type: "boolean", label: "Capture errors", description: "Capture errors and unhandled promises.", defaultValue: true },
      { key: "maxRecords", type: "number", label: "Max records", min: 50, max: 2000, step: 50, defaultValue: MAX_RECORDS },
    ]);
  }

  /**
   * Registers a plugin.
   *
   * @param {object} plugin Plugin.
   * @returns {boolean} Registered.
   *
   * @example
   * window.RodDockedInspector.registerPlugin({
   *   id: "demo",
   *   title: "Demo",
   *   icon: "sparkles",
   *   order: 50,
   *
   *   setup(api) {
   *     const openedTimes = api.storage.get("openedTimes", 0);
   *     api.storage.set("openedTimes", openedTimes + 1);
   *   },
   *
   *   render(api) {
   *     const openedTimes = api.storage.get("openedTimes", 0);
   *
   *     return api.html`
   *       <section class="ra-card">
   *         <div class="ra-card-head">
   *           <strong>Demo plugin</strong>
   *           <span>Opened ${openedTimes} times.</span>
   *         </div>
   *       </section>
   *     `;
   *   },
   * });
   */
  function registerPlugin(plugin) {
    if (!plugin?.id) return false;

    const pluginId = normalizePluginId(plugin.id);
    const pluginApi = createPluginApi(pluginId);
    const existingIndex = plugins.findIndex((item) => item.id === pluginId);
    const finalPlugin = {
      order: 100,
      enabled: true,
      setup: null,
      renderFilters: null,
      ...plugin,
      id: pluginId,
      api: pluginApi,
    };

    if (existingIndex >= 0) {
      plugins.splice(existingIndex, 1, finalPlugin);
    } else {
      plugins.push(finalPlugin);
    }

    plugins.sort((left, right) => left.order - right.order);

    if (typeof finalPlugin.setup === "function") {
      try {
        finalPlugin.setup(pluginApi);
      } catch (error) {
        nativeConsole.warn(`[Alerta.plugin] setup failed: ${pluginId}`, error);
      }
    }

    eventBus.emit("plugin:registered", finalPlugin);
    scheduleRender();

    return true;
  }

  /* *************** */
  /* Rendering       */
  /* *************** */

  /**
   * Boots the UI.
   *
   * @returns {void}
   */
  function boot() {
    booted = true;
    getRoot();
    scheduleRender();
    eventBus.emit("boot", api);
  }

  /**
   * Schedules one render frame.
   *
   * @returns {void}
   */
  function scheduleRender() {
    updateDockCount();

    if (!booted || !runtime?.render || renderFrame) return;

    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      renderApp();
    });
  }

  /**
   * Renders the app.
   *
   * @returns {void}
   */
  function renderApp() {
    try {
      runtime.render(
        html`
          ${viewDock()}
          ${viewPanel()}
          ${state.modal ? viewModal(state.modal) : runtime.nothing}
        `,
        getRoot(),
      );

      applyRootSettingsVars();
      refreshIcons();
      eventBus.emit("render", api);
    } catch (error) {
      nativeConsole.error("[Alerta.render] render crash", error);
    }
  }

  /**
   * Applies root CSS variables.
   *
   * @returns {void}
   */
  function applyRootSettingsVars() {
    const node = getRoot();

    node.style.setProperty("--ra-font-size", `${state.fontSize}px`);
    node.style.setProperty("--ra-opacity", String(state.opacity));
    node.style.setProperty("--ra-density-scale", state.density === "compact" ? "0.82" : state.density === "spacious" ? "1.14" : "1");

    node.dataset.raTheme = state.theme || "dark";
    node.dataset.raMountMode = getEffectiveMountMode();
  }

  /**
   * Updates dock badge count.
   *
   * @returns {void}
   */
  function updateDockCount() {
    const currentRoot = root || host;
    const dockCount = currentRoot?.querySelector?.(".ra-dock-count");

    if (dockCount) {
      dockCount.textContent = String(logs.length + events.length);
    }
  }

  /**
   * Renders dock button.
   *
   * @returns {*} Template.
   */
  function viewDock() {
    return html`
      <button
        class="ra-dock"
        style="--ra-dock-y:${state.dockY}px"
        type="button"
        data-ra-action="open"
        @click=${openInspector}
        @pointerdown=${startDockDrag}
        @pointermove=${moveDockDrag}
        @pointerup=${endDockDrag}
      >
        <span class="ra-dock-inner">
          ${icon("panel-right-open")}
          <span class="ra-dock-count">${logs.length + events.length}</span>
        </span>
      </button>
    `;
  }

  /**
   * Renders main panel.
   *
   * @returns {*} Template.
   */
  function viewPanel() {
    const activePlugin = getActivePlugin();
    const activeApi = activePlugin?.api || api;

    return html`
      <section
        class="ra-panel ${state.open ? "ra-open" : ""} ${state.docked ? "" : "ra-floating"} ${state.zen ? "ra-zen" : ""}"
        style="--ra-w:${state.width}px;--ra-h:${state.height}px;--ra-x:${state.x}px;--ra-y:${state.y}px"
      >
        <header class="ra-header" @pointerdown=${startPanelDrag} @pointermove=${movePanelDrag} @pointerup=${endPanelDrag}>
          <div class="ra-title">
            ${icon("bug")}
            <span>Alerta</span>
          </div>

          <div class="ra-actions">
            <button class="ra-button" type="button" data-ra-action="zen" @click=${toggleZenMode}>
              ${icon(state.zen ? "shrink" : "expand")}
              <span>Zen</span>
            </button>
            <button class="ra-button" type="button" data-ra-action="copy" @click=${copyVisible}>
              ${icon("copy")}
              <span>Copy</span>
            </button>
            <button class="ra-button" type="button" data-ra-action="clear" @click=${clearCurrent}>
              ${icon("trash-2")}
              <span>Clear</span>
            </button>
            <button class="ra-button" type="button" data-ra-action="minimize" @click=${minimizeInspector}>
              ${icon("minus")}
              <span>Min</span>
            </button>
          </div>
        </header>

        <div class="ra-toolbar">
          ${icon("search")}
          <input
            class="ra-search"
            type="search"
            placeholder="Filter..."
            autocomplete="off"
            .value=${state.query}
            data-ra-input="search"
            @input=${handleSearch}
          />
        </div>

        <nav class="ra-tabs">
          ${runtime.repeat(
            getVisiblePlugins(),
            (plugin) => plugin.id,
            (plugin) => html`
              <button
                class="ra-tab ${state.tab === plugin.id ? "ra-active" : ""}"
                type="button"
                data-ra-action="tab:${plugin.id}"
                @click=${() => setTab(plugin.id)}
              >
                ${icon(plugin.icon || "puzzle")}
                ${state.zen ? runtime.nothing : html`<span>${plugin.title}</span>`}
              </button>
            `,
          )}
        </nav>

        <div class="ra-filter-row">
          ${activePlugin?.renderFilters ? activePlugin.renderFilters(activeApi) : runtime.nothing}
        </div>

        <main class="ra-main">
          ${activePlugin?.render ? activePlugin.render(activeApi) : runtime.nothing}
        </main>

        <div class="ra-resize" @pointerdown=${startResize} @pointermove=${moveResize} @pointerup=${endResize}></div>
      </section>
    `;
  }

  /**
   * Renders source modal.
   *
   * @param {object} modal Modal.
   * @returns {*} Template.
   */
  function viewModal(modal) {
    return html`
      <div class="ra-modal-root" @click=${handleModalBackdrop}>
        <section class="ra-modal" role="dialog">
          <header class="ra-modal-head">
            <div class="ra-modal-title">
              ${icon("code-2")}
              ${modal.title || "Source"}
            </div>
            <div class="ra-actions">
              <button class="ra-button" type="button" data-ra-action="copy-modal" @click=${copyModalSource}>
                ${icon("copy")}
                <span>Copy</span>
              </button>
              <button class="ra-button" type="button" data-ra-action="close-modal" @click=${closeModal}>
                ${icon("x")}
                <span>Close</span>
              </button>
            </div>
          </header>
          <pre class="ra-modal-code"><code>${runtime.unsafeHTML(Utils.highlightCode(modal.source, modal.language || "javascript"))}</code></pre>
        </section>
      </div>
    `;
  }

  /* *************** */
  /* Settings Views  */
  /* *************** */

  /**
   * Renders settings plugin.
   *
   * @returns {*} Template.
   */
  function renderSettingsPlugin() {
    const visiblePlugins = getVisiblePlugins();

    return html`
      <section class="ra-settings">
        <div class="ra-settings-hero">
          <div>
            <strong>Alerta Settings</strong>
            <span>Core UI and every plugin setting in one place.</span>
          </div>

          <div class="ra-settings-actions">
            <button class="ra-pill" type="button" data-ra-action="settings:export" @click=${exportSettings}>
              ${icon("copy")}
              Export
            </button>
            <button class="ra-pill" type="button" data-ra-action="settings:import" @click=${importSettings}>
              ${icon("upload")}
              Import
            </button>
            <button class="ra-pill" type="button" data-ra-action="settings:reset-all" @click=${resetAllSettings}>
              ${icon("rotate-ccw")}
              Reset
            </button>
          </div>
        </div>

        ${renderSettingsGroup("core", "Core", "panel-top", [
          {
            key: "mountMode",
            type: "select",
            label: "Mount target",
            description: "Shadow DOM by default, Light DOM for CSS debugging.",
            value: state.mountMode,
            options: [
              { label: "Shadow DOM", value: "shadow" },
              { label: "Light DOM", value: "light" },
            ],
          },
          {
            key: "defaultTab",
            type: "select",
            label: "Default tab",
            value: state.defaultTab,
            options: visiblePlugins.map((plugin) => ({ label: plugin.title, value: plugin.id })),
          },
          { key: "defaultFullscreen", type: "boolean", label: "Default Zen", value: state.defaultFullscreen },
          {
            key: "theme",
            type: "select",
            label: "Theme",
            value: state.theme,
            options: [
              { label: "Dark", value: "dark" },
              { label: "Charcoal", value: "charcoal" },
              { label: "OLED", value: "oled" },
            ],
          },
          {
            key: "density",
            type: "select",
            label: "Density",
            value: state.density,
            options: [
              { label: "Compact", value: "compact" },
              { label: "Comfortable", value: "comfortable" },
              { label: "Spacious", value: "spacious" },
            ],
          },
          { key: "fontSize", type: "range", label: "Font size", min: 10, max: 18, step: 1, value: state.fontSize },
          { key: "opacity", type: "range", label: "Opacity", min: 0.7, max: 1, step: 0.01, value: state.opacity },
          { key: "width", type: "number", label: "Width", min: 320, max: 1200, step: 20, value: state.width },
          { key: "height", type: "number", label: "Height", min: 260, max: 1200, step: 20, value: state.height },
        ])}

        ${Object.entries(state.settingsGroups || {}).map(([pluginId, fields]) => {
          const plugin = plugins.find((item) => item.id === pluginId);

          return renderSettingsGroup(
            pluginId,
            plugin ? plugin.title : pluginId,
            plugin?.icon || "puzzle",
            fields.map((field) => ({
              ...field,
              value: getPluginSetting(pluginId, field.key, field.defaultValue),
            })),
          );
        })}
      </section>
    `;
  }

  /**
   * Renders one settings group.
   *
   * @param {string} pluginId Plugin id.
   * @param {string} title Title.
   * @param {string} iconName Icon.
   * @param {Array<object>} fields Fields.
   * @returns {*} Template.
   */
  function renderSettingsGroup(pluginId, title, iconName, fields) {
    return html`
      <article class="ra-settings-group">
        <header class="ra-settings-group-head">
          <div>
            ${icon(iconName)}
            <strong>${title}</strong>
          </div>
          <span>${fields.length}</span>
        </header>
        <div class="ra-settings-grid">
          ${fields.map((field) => renderSettingField(pluginId, field))}
        </div>
      </article>
    `;
  }

  /**
   * Renders one setting field.
   *
   * @param {string} pluginId Plugin id.
   * @param {object} field Field.
   * @returns {*} Template.
   */
  function renderSettingField(pluginId, field) {
    const type = field.type || "text";
    const action = `setting:${pluginId}:${field.key}:${type}`;

    return html`
      <label class="ra-setting-field">
        <span class="ra-setting-label">
          <strong>${field.label || field.key}</strong>
          ${field.description ? html`<small>${field.description}</small>` : runtime.nothing}
        </span>

        <span class="ra-setting-control">
          ${type === "boolean"
            ? html`
                <input
                  class="ra-switch"
                  type="checkbox"
                  .checked=${Boolean(field.value)}
                  data-ra-change=${action}
                  @change=${(event) => handleSettingAction(`${pluginId}:${field.key}:${type}`, event, event.target)}
                />
              `
            : runtime.nothing}

          ${type === "select"
            ? html`
                <select
                  class="ra-select"
                  .value=${String(field.value)}
                  data-ra-change=${action}
                  @change=${(event) => handleSettingAction(`${pluginId}:${field.key}:${type}`, event, event.target)}
                >
                  ${(field.options || []).map((option) => html`<option value=${option.value}>${option.label}</option>`)}
                </select>
              `
            : runtime.nothing}

          ${type === "range"
            ? html`
                <div class="ra-range-wrap">
                  <input
                    class="ra-range"
                    type="range"
                    min=${field.min}
                    max=${field.max}
                    step=${field.step || 1}
                    .value=${String(field.value)}
                    data-ra-input=${action}
                    @input=${(event) => handleSettingAction(`${pluginId}:${field.key}:${type}`, event, event.target)}
                  />
                  <code>${field.value}</code>
                </div>
              `
            : runtime.nothing}

          ${type === "number"
            ? html`
                <input
                  class="ra-input"
                  type="number"
                  min=${field.min}
                  max=${field.max}
                  step=${field.step || 1}
                  .value=${String(field.value)}
                  data-ra-input=${action}
                  @input=${(event) => handleSettingAction(`${pluginId}:${field.key}:${type}`, event, event.target)}
                />
              `
            : runtime.nothing}

          ${type === "text"
            ? html`
                <input
                  class="ra-input"
                  type="text"
                  .value=${String(field.value ?? "")}
                  data-ra-input=${action}
                  @input=${(event) => handleSettingAction(`${pluginId}:${field.key}:${type}`, event, event.target)}
                />
              `
            : runtime.nothing}
        </span>
      </label>
    `;
  }

  /* *************** */
  /* Records Views   */
  /* *************** */

  /**
   * Renders default plugin filter.
   *
   * @returns {*} Template.
   */
  function renderDefaultFilter() {
    const plugin = getActivePlugin();
    if (!plugin) return runtime.nothing;

    const value = state.filters[plugin.id] || "all";

    return html`
      <select
        class="ra-select ra-filter-select"
        .value=${value}
        data-ra-change="filter:${plugin.id}"
        @change=${(event) => setPluginFilter(plugin.id, event.target.value)}
      >
        ${plugin.filters.map((item) => html`<option value=${item}>${item === "all" ? `All ${plugin.title.toLowerCase()}` : item}</option>`)}
      </select>
    `;
  }

  /**
   * Renders record list.
   *
   * @param {string} pluginId Plugin id.
   * @param {Array<object>} records Records.
   * @param {Function} renderRecord Renderer.
   * @returns {*} Template.
   */
  function viewRecords(pluginId, records, renderRecord) {
    const limit = state.limits[pluginId] || INITIAL_LIMIT;
    const visible = records.slice(0, limit);

    if (!visible.length) {
      return html`
        <div class="ra-empty">
          ${icon("moon")}
          <div>No ${pluginId} yet.</div>
        </div>
      `;
    }

    return html`
      ${runtime.repeat(visible, (record) => record.id, renderRecord)}
      ${records.length > visible.length
        ? html`<button class="ra-load-more" type="button" data-ra-action="load-more" @click=${loadMore}>Load more</button>`
        : runtime.nothing}
    `;
  }

  /**
   * Renders one log card.
   *
   * @param {object} record Record.
   * @param {object} options Options.
   * @returns {*} Template.
   */
  function viewLogCard(record, options = {}) {
    const hasText = record.parts.length > 0;
    const hasObjects = record.refIds.length > 0;
    const compact = getPluginSetting("logs", "compactCards", true);
    const showActions = options.showActions ?? getPluginSetting("logs", "showActions", true);

    return html`
      <article class="ra-card ra-kind-${record.kind} ${compact ? "ra-compact-card" : ""}">
        <div class="ra-card-head ${hasObjects ? "ra-has-body" : ""}">
          <span class="ra-meta">
            <span class="ra-kind">
              ${icon(kindToIcon(record.kind))}
              <span>${record.kind}</span>
              ${record.react ? html`<span class="ra-react-badge">⚛</span>` : runtime.nothing}
              ${record.count > 1 ? html`<span class="ra-count">${record.count}</span>` : runtime.nothing}
            </span>
            <span class="ra-time">${record.time}</span>
          </span>

          ${hasText ? html`<div class="ra-message">${record.parts.map(viewConsolePart)}</div>` : runtime.nothing}
        </div>

        ${hasObjects
          ? html`
              <div class="ra-card-body">
                ${record.refIds.map((refId, index) => viewInspectableObject(refId, `$[${index}]`, "", { showActions }))}
              </div>
            `
          : runtime.nothing}
      </article>
    `;
  }

  /**
   * Renders one event card.
   *
   * @param {object} record Record.
   * @returns {*} Template.
   */
  function viewEventCard(record) {
    return html`
      <article class="ra-card ${record.kind === "error" ? "ra-kind-error" : ""}">
        <div class="ra-card-head ${record.refId ? "ra-has-body" : ""}">
          <span class="ra-meta">
            <span class="ra-kind">
              ${icon(eventKindToIcon(record.kind))}
              <span>${record.type}</span>
              ${record.count > 1 ? html`<span class="ra-count">${record.count}</span>` : runtime.nothing}
            </span>
            <span class="ra-time">${record.time}</span>
          </span>

          <div class="ra-message">
            <span class="ra-key">${record.action}</span>
            <span class="ra-muted"> ${record.targetLabel}</span>
            ${record.detail ? html`<br /><span class="ra-muted">${record.detail}</span>` : runtime.nothing}
          </div>
        </div>

        ${record.refId ? html`<div class="ra-card-body">${viewInspectableObject(record.refId, `event:${record.id}`, "")}</div>` : runtime.nothing}
      </article>
    `;
  }

  /**
   * Renders one console part.
   *
   * @param {object} part Part.
   * @returns {*} Template.
   */
  function viewConsolePart(part) {
    if (part.type === "styled") return html`<span style=${part.style}>${part.text}</span>`;
    if (part.type === "html") return runtime.unsafeHTML(part.html);

    return html`${part.text}`;
  }

  /* *************** */
  /* Object View     */
  /* *************** */

  /**
   * Renders one inspectable object.
   *
   * @param {number} refId Ref id.
   * @param {string} path Path.
   * @param {string} label Label.
   * @param {object} options Options.
   * @returns {*} Template.
   */
  function viewInspectableObject(refId, path, label, options = {}) {
    const value = objectStoreMap.get(refId);
    if (!value) return runtime.nothing;

    const element = Utils.getElementFromObject(value);
    const showActions = options.showActions !== false;
    const isReact = element && Utils.isReactElement(element);

    return html`
      <section class="ra-object-card">
        ${showActions
          ? html`
              <div class="ra-inspect-actions">
                <button class="ra-pill" type="button" data-ra-action="dollar:${refId}" @click=${() => setDollarZero(refId)}>
                  ${icon("badge-dollar-sign")}$0
                </button>
                ${element
                  ? html`
                      <button class="ra-pill" type="button" data-ra-action="elements:${refId}" @click=${() => revealElementRef(refId)}>
                        ${icon("mouse-pointer-click")}Elements
                      </button>
                    `
                  : runtime.nothing}
                ${isReact
                  ? html`
                      <button class="ra-pill" type="button" data-ra-action="react:${refId}" @click=${() => revealReactRef(refId)}>
                        ${icon("atom")}React
                      </button>
                    `
                  : runtime.nothing}
                <button class="ra-pill" type="button" data-ra-action="focus:${refId}" @click=${() => focusObject(refId)}>
                  ${icon("scan-search")}Focus
                </button>
                <button class="ra-pill" type="button" data-ra-action="source:${refId}" @click=${() => openSourceModal(refId)}>
                  ${icon("code-2")}Source
                </button>
              </div>
            `
          : runtime.nothing}

        ${viewNode(value, path, label, 0)}
      </section>
    `;
  }

  /**
   * Renders object tree node.
   *
   * @param {*} value Value.
   * @param {string} path Path.
   * @param {string} label Label.
   * @param {number} depth Depth.
   * @returns {*} Template.
   */
  function viewNode(value, path, label, depth) {
    if (!Utils.isObjectLike(value)) {
      return html`
        <div class="ra-tree-row" style="--ra-depth:${depth}">
          <span class="ra-tree-spacer"></span>
          <span>${label ? html`<span class="ra-key">${label}:</span> ` : runtime.nothing}${Utils.getNodeLabel(value)}</span>
        </div>
      `;
    }

    const isOpen = expandedPaths.has(path);
    const allEntries = isOpen ? getEntries(value, path) : [];
    const pathLimit = expandedPathLimits.get(path) || MAX_TREE_RENDER_ITEMS;
    const entries = allEntries.slice(0, pathLimit);

    return html`
      <div class="ra-tree-item">
        <div class="ra-tree-row" style="--ra-depth:${depth}">
          <button class="ra-tree-toggle" type="button" data-ra-action="toggle:${path}" @click=${() => togglePath(path)}>
            ${icon(isOpen ? "chevron-down" : "chevron-right")}
          </button>

          <span class="ra-tree-summary">
            ${label ? html`<span class="ra-key">${label}:</span> ` : runtime.nothing}
            ${runtime.unsafeHTML(getObjectPreview(value))}
          </span>
        </div>

        ${isOpen
          ? html`
              ${entries.map((entry) => viewNode(entry.value, entry.path, entry.label, depth + 1))}
              ${allEntries.length > entries.length
                ? html`
                    <button class="ra-tree-more" type="button" data-ra-action="more-path:${path}" @click=${() => expandPathLimit(path)}>
                      Load ${Math.min(MAX_TREE_RENDER_ITEMS, allEntries.length - entries.length)} more
                    </button>
                  `
                : runtime.nothing}
            `
          : runtime.nothing}
      </div>
    `;
  }

  /**
   * Gets lazy object entries.
   *
   * @param {*} value Value.
   * @param {string} basePath Base path.
   * @returns {Array<object>} Entries.
   */
  function getEntries(value, basePath) {
    if (!Utils.isObjectLike(value)) return [];

    if (Utils.isNodeListLike(value) || Array.isArray(value)) {
      const limit = Math.min(value.length, MAX_TREE_ITEMS);
      const output = new Array(limit);

      for (let index = 0; index < limit; index += 1) {
        output[index] = {
          label: String(index),
          value: value[index],
          path: `${basePath}[${index}]`,
        };
      }

      return output;
    }

    if (value instanceof Map) {
      const output = [];
      let index = 0;

      for (const [key, item] of value.entries()) {
        if (index >= MAX_TREE_ITEMS) break;

        output.push({
          label: `entry ${index}`,
          value: { key, value: item },
          path: `${basePath}.map[${index}]`,
        });

        index += 1;
      }

      return output;
    }

    if (value instanceof Set) {
      const output = [];
      let index = 0;

      for (const item of value.values()) {
        if (index >= MAX_TREE_ITEMS) break;

        output.push({
          label: String(index),
          value: item,
          path: `${basePath}.set[${index}]`,
        });

        index += 1;
      }

      return output;
    }

    if (value instanceof Element) {
      return [
        { label: "tagName", value: value.tagName, path: `${basePath}.tagName` },
        { label: "id", value: value.id, path: `${basePath}.id` },
        { label: "className", value: value.className, path: `${basePath}.className` },
        {
          label: "attributes",
          value: Array.from(value.attributes).map((attr) => ({ name: attr.name, value: attr.value })),
          path: `${basePath}.attributes`,
        },
        { label: "dataset", value: { ...value.dataset }, path: `${basePath}.dataset` },
        { label: "children", value: Array.from(value.children), path: `${basePath}.children` },
        { label: "outerHTML", value: Utils.formatHtml(value.outerHTML || ""), path: `${basePath}.outerHTML` },
      ];
    }

    const keys = Reflect.ownKeys(value).slice(0, MAX_TREE_ITEMS);
    const output = new Array(keys.length);

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];

      output[index] = {
        label: String(key),
        value: Utils.safeCall(() => value[key], "[Throws]"),
        path: `${basePath}.${String(key)}`,
      };
    }

    return output;
  }

  /* *************** */
  /* Log Surfaces    */
  /* *************** */

  /**
   * Creates a standalone log surface.
   *
   * @param {HTMLElement|string} container Container.
   * @param {object} options Options.
   * @returns {object} Surface.
   */
  function createLogSurface(container, options = {}) {
    const target = typeof container === "string" ? document.querySelector(container) : container;

    if (!target) {
      throw new Error("[Alerta] createLogSurface needs a valid container.");
    }

    const surface = {
      id: `surface-${nextSurfaceId++}`,
      container: target,
      records: [],
      options: { toolbar: true, group: true, maxRecords: MAX_RECORDS, ...options },
      limit: options.limit || INITIAL_LIMIT,

      log(...values) {
        return surface.add("log", ...values);
      },

      info(...values) {
        return surface.add("info", ...values);
      },

      warn(...values) {
        return surface.add("warn", ...values);
      },

      error(...values) {
        return surface.add("error", ...values);
      },

      debug(...values) {
        return surface.add("debug", ...values);
      },

      add(kind, ...values) {
        const record = createLogRecord(kind, values);
        const previous = surface.records[0];

        if (surface.options.group && previous?.groupKey === record.groupKey) {
          previous.count += 1;
          previous.time = getTime();
        } else {
          surface.records.unshift(record);
        }

        if (surface.records.length > surface.options.maxRecords) {
          surface.records.length = surface.options.maxRecords;
        }

        surface.render();

        return values.length === 1 ? values[0] : values;
      },

      clear() {
        surface.records.length = 0;
        surface.render();
      },

      destroy() {
        runtime.render(runtime.nothing, surface.container);
      },

      render() {
        ensureDocumentStyles();
        runtime.render(viewLogSurface(surface), surface.container);
        refreshIcons();
      },
    };

    target.classList.add("ra-log-surface-host");
    surface.render();

    return surface;
  }

  /**
   * Renders standalone log surface.
   *
   * @param {object} surface Surface.
   * @returns {*} Template.
   */
  function viewLogSurface(surface) {
    const visible = surface.records.slice(0, surface.limit);

    return html`
      <section class="ra-log-surface">
        ${surface.options.toolbar
          ? html`
              <div class="ra-surface-toolbar">
                <span class="ra-kind">${icon(surface.options.icon || "terminal")}${surface.options.title || "Logs"}</span>
                <button class="ra-pill" type="button" @click=${surface.clear}>${icon("trash-2")}Clear</button>
              </div>
            `
          : runtime.nothing}

        ${visible.length
          ? runtime.repeat(visible, (record) => record.id, (record) => viewLogCard(record, surface.options))
          : html`
              <div class="ra-empty">
                ${icon("moon")}
                <div>No logs yet.</div>
              </div>
            `}
      </section>
    `;
  }

  /* *************** */
  /* Records         */
  /* *************** */

  /**
   * Creates a log record.
   *
   * @param {string} kind Kind.
   * @param {Array<*>} values Values.
   * @returns {object} Record.
   */
  function createLogRecord(kind, values) {
    const parsed = parseConsoleValues(values);
    const refIds = [];
    let react = false;

    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];

      if (Utils.isObjectLike(value)) {
        const refId = storeObject(value);

        if (refId !== null) {
          refIds.push(refId);
        }

        const element = Utils.getElementFromObject(value);

        if (element && Utils.isReactElement(element)) {
          react = true;
        }
      }
    }

    const preview = parsed.raw || values.map(stringifyPreview).join(" ");

    return {
      id: nextRecordId++,
      kind,
      time: getTime(),
      parts: parsed.parts,
      raw: parsed.raw,
      preview,
      refIds,
      react,
      groupKey: `${kind}:${preview}:${react}:${refIds.map((id) => Utils.getNodeLabel(objectStoreMap.get(id))).join("|")}`,
      count: 1,
    };
  }

  /**
   * Adds one inspector log.
   *
   * @param {string} kind Kind.
   * @param {...*} values Values.
   * @returns {*} Input.
   */
  function addInspectorLog(kind, ...values) {
    const record = createLogRecord(kind, values);
    const previous = logs[0];
    const shouldGroup = getPluginSetting("logs", "groupRepeated", true);
    const maxRecords = getPluginSetting("logs", "maxRecords", MAX_RECORDS);

    if (shouldGroup && previous?.groupKey === record.groupKey) {
      previous.count += 1;
      previous.time = getTime();
      eventBus.emit("log:grouped", previous);
      scheduleRender();

      return values.length === 1 ? values[0] : values;
    }

    logs.unshift(record);

    if (logs.length > maxRecords) {
      logs.length = maxRecords;
    }

    eventBus.emit("log:add", record);
    scheduleRender();

    return values.length === 1 ? values[0] : values;
  }

  /**
   * Pushes one event record.
   *
   * @param {object} record Record.
   * @returns {void}
   */
  function pushEventRecord(record) {
    const previous = events[0];
    const maxRecords = getPluginSetting("events", "maxRecords", MAX_RECORDS);

    if (previous?.groupKey === record.groupKey) {
      previous.count += 1;
      previous.time = getTime();
      eventBus.emit("event:grouped", previous);
      scheduleRender();
      return;
    }

    events.unshift(record);

    if (events.length > maxRecords) {
      events.length = maxRecords;
    }

    eventBus.emit("event:add", record);
    scheduleRender();
  }

  /**
   * Parses console values.
   *
   * @param {Array<*>} values Values.
   * @returns {object} Parsed.
   */
  function parseConsoleValues(values) {
    const parts = [];
    const rawParts = [];

    if (!values.length) return { parts, raw: "" };

    if (typeof values[0] !== "string") {
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index];

        if (Utils.isObjectLike(value)) {
          rawParts.push(stringifyPreview(value));
        } else {
          const text = stringifyPreview(value);
          parts.push({ type: "text", text });
          rawParts.push(text);
        }
      }

      return { parts, raw: rawParts.join(" ") };
    }

    const format = String(values[0]);
    const args = values.slice(1);
    const matcher = /%([%csdiffoO])/g;

    let activeStyle = "";
    let argIndex = 0;
    let lastIndex = 0;
    let match;

    while ((match = matcher.exec(format))) {
      if (match.index > lastIndex) {
        const text = format.slice(lastIndex, match.index);
        parts.push(activeStyle ? { type: "styled", text, style: activeStyle } : { type: "text", text });
        rawParts.push(text);
      }

      const token = match[1];

      if (token === "%") {
        parts.push({ type: "text", text: "%" });
        rawParts.push("%");
      } else if (token === "c") {
        activeStyle = Utils.sanitizeConsoleStyle(args[argIndex++]);
      } else {
        const value = args[argIndex++];

        if (token === "o" || token === "O") {
          rawParts.push(stringifyPreview(value));
        } else {
          const text = formatPlaceholder(token, value);
          parts.push(activeStyle ? { type: "styled", text, style: activeStyle } : { type: "text", text });
          rawParts.push(text);
        }
      }

      lastIndex = matcher.lastIndex;
    }

    if (lastIndex < format.length) {
      const text = format.slice(lastIndex);
      parts.push(activeStyle ? { type: "styled", text, style: activeStyle } : { type: "text", text });
      rawParts.push(text);
    }

    for (let index = argIndex; index < args.length; index += 1) {
      const value = args[index];

      if (Utils.isObjectLike(value)) {
        rawParts.push(stringifyPreview(value));
      } else {
        const text = `${parts.length ? " " : ""}${stringifyPreview(value)}`;
        parts.push({ type: "text", text });
        rawParts.push(stringifyPreview(value));
      }
    }

    return { parts, raw: rawParts.join(" ") };
  }

  /* *************** */
  /* Console Hooks   */
  /* *************** */

  /**
   * Installs console patches.
   *
   * @returns {void}
   */
  function installConsolePatch() {
    if (console[PATCHED]) return;

    Object.defineProperty(console, PATCHED, {
      value: true,
      configurable: true,
    });

    for (const kind of ["log", "info", "warn", "error", "debug", "trace", "group", "groupCollapsed", "time", "table"]) {
      const original = nativeConsole[kind] || nativeConsole.log;

      console[kind] = function patchedConsoleMethod(...values) {
        original(...values);
        addInspectorLog(kind, ...values);
      };
    }

    window.alert = function patchedAlert(...values) {
      addInspectorLog("alert", ...values);
    };

    window.alerta = function alerta(...values) {
      return addInspectorLog("alerta", ...values);
    };

    window.alerta.open = function openAlerta() {
      state.open = true;
      scheduleRender();
      return window.alerta;
    };

    window.alerta.clear = function clearAlerta() {
      logs.length = 0;
      events.length = 0;
      scheduleRender();
      return window.alerta;
    };

    window.nativeAlert = nativeAlert;
    window.nativeConsole = nativeConsole;
    window.addInspectorLog = addInspectorLog;
  }

  /**
   * Installs error interceptors.
   *
   * @returns {void}
   */
  function installErrorInterceptors() {
    window.addEventListener(
      "error",
      (event) => {
        if (!getPluginSetting("events", "captureErrors", true)) return;

        const refId = event.target && Utils.isObjectLike(event.target) ? storeObject(event.target) : null;

        pushEventRecord({
          id: nextRecordId++,
          kind: "error",
          type: "error",
          action: "error",
          time: getTime(),
          targetLabel: event.filename || describeTarget(event.target || window),
          detail: `${event.message || ""}:${event.lineno || 0}:${event.colno || 0}`,
          preview: event.message || "error",
          refId,
          groupKey: `error:${event.message}:${event.filename}:${event.lineno}`,
          count: 1,
        });
      },
      true,
    );

    window.addEventListener(
      "unhandledrejection",
      (event) => {
        if (!getPluginSetting("events", "captureErrors", true)) return;

        const refId = Utils.isObjectLike(event.reason) ? storeObject(event.reason) : null;

        pushEventRecord({
          id: nextRecordId++,
          kind: "error",
          type: "promise",
          action: "unhandledrejection",
          time: getTime(),
          targetLabel: "window",
          detail: stringifyPreview(event.reason),
          preview: stringifyPreview(event.reason),
          refId,
          groupKey: `promise:${stringifyPreview(event.reason)}`,
          count: 1,
        });
      },
      true,
    );
  }

  /**
   * Installs network interceptors.
   *
   * @returns {void}
   */
  function installNetworkInterceptors() {
    const fetchPatchKey = Symbol.for("rod.alerta.fetch.v66");

    if (window.fetch && !window.fetch[fetchPatchKey]) {
      const originalFetch = window.fetch;

      const wrappedFetch = async function interceptedFetch(input, initOptions) {
        const startedAt = performance.now();
        const url = typeof input === "string" ? input : input?.url;
        const method = initOptions?.method || input?.method || "GET";

        try {
          const response = await originalFetch.apply(this, arguments);

          if (getPluginSetting("events", "captureNetwork", true)) {
            pushEventRecord({
              id: nextRecordId++,
              kind: "network",
              type: method,
              action: "fetch",
              time: getTime(),
              targetLabel: String(url || ""),
              detail: `${response.status} ${Math.round(performance.now() - startedAt)}ms`,
              preview: `${method} ${url}`,
              refId: null,
              groupKey: `fetch:${method}:${url}:${response.status}`,
              count: 1,
            });
          }

          return response;
        } catch (error) {
          addInspectorLog("error", error);
          throw error;
        }
      };

      Object.defineProperty(wrappedFetch, fetchPatchKey, {
        value: true,
      });

      window.fetch = wrappedFetch;
    }
  }

  /* *************** */
  /* Actions         */
  /* *************** */

  function getVisiblePlugins() {
    return plugins.filter((plugin) => plugin.enabled !== false);
  }

  function getActivePlugin() {
    return getVisiblePlugins().find((plugin) => plugin.id === state.tab) || getVisiblePlugins()[0] || null;
  }

  function setTab(tab) {
    state.tab = tab;
    resetLimits();
    eventBus.emit("tab:changed", tab);
  }

  function setPluginFilter(pluginId, value) {
    state.filters[pluginId] = value;
    resetLimits();
    eventBus.emit("filter:changed", { pluginId, value });
  }

  function resetLimits() {
    withSilentState(() => {
      state.limits.logs = INITIAL_LIMIT;
      state.limits.events = INITIAL_LIMIT;
    });

    saveState();
    scheduleRender();
  }

  function loadMore() {
    const pluginId = state.tab;
    state.limits[pluginId] = (state.limits[pluginId] || INITIAL_LIMIT) + LIMIT_STEP;
  }

  function openInspector(event) {
    event?.preventDefault?.();

    if (dockDragging) return;

    state.open = !state.open;
    eventBus.emit(state.open ? "panel:open" : "panel:minimize", api);
  }

  function minimizeInspector() {
    withSilentState(() => {
      state.open = false;
      state.docked = true;
    });

    saveState();
    scheduleRender();
    eventBus.emit("panel:minimize", api);
  }

  function toggleZenMode() {
    withSilentState(() => {
      state.zen = !state.zen;
      state.open = true;
      state.docked = true;
    });

    saveState();
    scheduleRender();
    eventBus.emit("panel:zen", state.zen);
  }

  function clearCurrent() {
    if (state.tab === "events") events.length = 0;
    else if (state.tab === "logs") logs.length = 0;

    eventBus.emit("records:clear", state.tab);
    scheduleRender();
  }

  function copyVisible() {
    const active = getActivePlugin();
    const records = active?.id === "events" ? getVisibleEvents() : getVisibleLogs();

    Utils.copyText(records.map((record) => `[${record.time}] ${record.kind || record.type}: ${record.preview}`).join("\n"));
  }

  function handleSearch(event) {
    clearTimeout(searchTimer);

    const value = event.target.value;

    searchTimer = setTimeout(() => {
      state.query = value;
      resetLimits();
      eventBus.emit("search:changed", state.query);
    }, SEARCH_DEBOUNCE_MS);
  }

  function togglePath(path) {
    if (expandedPaths.has(path)) expandedPaths.delete(path);
    else expandedPaths.add(path);

    scheduleRender();
  }

  function expandPathLimit(path) {
    expandedPathLimits.set(path, (expandedPathLimits.get(path) || MAX_TREE_RENDER_ITEMS) + MAX_TREE_RENDER_ITEMS);
    scheduleRender();
  }

  function openSourceModal(input) {
    if (typeof input === "number") {
      const value = objectStoreMap.get(input);
      if (!value) return;

      openSource({
        title: Utils.getNodeLabel(value),
        source: getRichCode(value) || formatValue(value),
        language: getCodeLanguage(value),
        refId: input,
      });

      return;
    }

    openSource(input);
  }

  function openSource(options) {
    state.modal = {
      title: String(options?.title || "Source"),
      source: String(options?.source || ""),
      language: String(options?.language || "javascript"),
      refId: options?.refId ?? null,
    };

    eventBus.emit("modal:open", state.modal);
  }

  function closeModal() {
    state.modal = null;
    eventBus.emit("modal:close", api);
  }

  function copyModalSource() {
    if (state.modal) Utils.copyText(state.modal.source);
  }

  function handleModalBackdrop(event) {
    if (event.target.classList.contains("ra-modal-root")) closeModal();
  }

  function storeObject(value, preferredId = null) {
    if (!Utils.isObjectLike(value)) return null;
    if (objectRefs.has(value)) return objectRefs.get(value);

    const id = preferredId ?? nextObjectId++;

    objectStoreMap.set(id, value);

    try {
      objectRefs.set(value, id);
    } catch {}

    return id;
  }

  function setDollarZero(refId) {
    const value = objectStoreMap.get(refId);
    const element = Utils.getElementFromObject(value);

    window.$0 = element || value;

    if (element) flashElement(element);

    addInspectorLog("info", "%c$0 updated", "color:#7dd3fc;font-weight:900", window.$0);
    eventBus.emit("$0:updated", window.$0);
  }

  function selectElement(element, options = {}) {
    if (!(element instanceof Element)) return false;

    window.$0 = element;
    flashElement(element);
    eventBus.emit("element:selected", { element, source: options.source || "api" });

    return true;
  }

  function revealElementRef(refId) {
    const value = objectStoreMap.get(refId);
    const element = Utils.getElementFromObject(value);

    if (!element) return;

    revealElementInElementsPanel(element);
  }

  function revealReactRef(refId) {
    const value = objectStoreMap.get(refId);
    const element = Utils.getElementFromObject(value);

    if (!element) return;

    window.$r = Utils.getReactOwnerInfo(element);
    selectElement(element, { source: "react" });
    eventBus.emit("react:selected", { element, react: window.$r });
    setTab("elements");
  }

  function revealElementInElementsPanel(element) {
    selectElement(element, { source: "logs" });
    setTab("elements");
    eventBus.emit("elements:reveal", element);
  }

  function focusObject(refId) {
    const value = objectStoreMap.get(refId);
    const element = Utils.getElementFromObject(value);

    if (!element) {
      addInspectorLog("warn", "No element target for", value);
      return;
    }

    minimizeInspector();
    window.$0 = element;

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });

    flashElement(element);
  }

  function flashElement(element) {
    const previous = {
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
      transition: element.style.transition,
    };

    element.style.transition = "outline 160ms ease, outline-offset 160ms ease";
    element.style.outline = "4px solid rgba(125,211,252,.95)";
    element.style.outlineOffset = "5px";

    setTimeout(() => {
      element.style.outline = previous.outline;
      element.style.outlineOffset = previous.outlineOffset;
      element.style.transition = previous.transition;
    }, FLASH_MS);
  }

  function startDockDrag(event) {
    dragState = {
      type: "dock",
      startY: event.clientY,
      initialY: state.dockY,
    };

    dockDragging = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDockDrag(event) {
    if (!dragState || dragState.type !== "dock") return;

    const deltaY = event.clientY - dragState.startY;

    if (Math.abs(deltaY) > 5) {
      dockDragging = true;
    }

    withSilentState(() => {
      state.dockY = Math.max(18, Math.min(window.innerHeight - 88, dragState.initialY + deltaY));
    });

    root?.querySelector?.(".ra-dock")?.style.setProperty("--ra-dock-y", `${state.dockY}px`);
  }

  function endDockDrag() {
    dragState = null;
    saveState();

    setTimeout(() => {
      dockDragging = false;
    }, 0);
  }

  function startPanelDrag(event) {
    if (event.target.closest("button,input,select,textarea")) return;
    if (state.zen) return;

    const panel = event.currentTarget.closest(".ra-panel");
    const rect = panel.getBoundingClientRect();

    dragState = {
      type: "panel",
      startX: event.clientX,
      startY: event.clientY,
      initialX: rect.left,
      initialY: rect.top,
    };

    withSilentState(() => {
      state.docked = false;
    });

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePanelDrag(event) {
    if (!dragState || dragState.type !== "panel") return;

    withSilentState(() => {
      state.x = Math.max(6, Math.min(window.innerWidth - 90, dragState.initialX + event.clientX - dragState.startX));
      state.y = Math.max(6, Math.min(window.innerHeight - 64, dragState.initialY + event.clientY - dragState.startY));
    });

    const panel = root?.querySelector?.(".ra-panel");

    if (panel) {
      panel.style.setProperty("--ra-x", `${state.x}px`);
      panel.style.setProperty("--ra-y", `${state.y}px`);
    }
  }

  function endPanelDrag() {
    dragState = null;
    saveState();
    scheduleRender();
  }

  function startResize(event) {
    if (state.zen) return;

    const panel = event.currentTarget.closest(".ra-panel");

    resizeState = {
      startX: event.clientX,
      startY: event.clientY,
      width: panel.offsetWidth,
      height: panel.offsetHeight,
    };

    withSilentState(() => {
      state.docked = false;
    });

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveResize(event) {
    if (!resizeState) return;

    withSilentState(() => {
      state.width = Math.max(320, Math.min(window.innerWidth - 16, resizeState.width + event.clientX - resizeState.startX));
      state.height = Math.max(260, Math.min(window.innerHeight - 16, resizeState.height + event.clientY - resizeState.startY));
    });

    const panel = root?.querySelector?.(".ra-panel");

    if (panel) {
      panel.style.setProperty("--ra-w", `${state.width}px`);
      panel.style.setProperty("--ra-h", `${state.height}px`);
    }
  }

  function endResize() {
    resizeState = null;
    saveState();
    scheduleRender();
  }

  function runAction(action, event, target) {
    if (!action) return;

    if (action === "open") openInspector(event);
    if (action === "copy") copyVisible();
    if (action === "clear") clearCurrent();
    if (action === "minimize") minimizeInspector();
    if (action === "zen") toggleZenMode();
    if (action === "search") handleSearch(event);
    if (action === "load-more") loadMore();
    if (action === "close-modal") closeModal();
    if (action === "copy-modal") copyModalSource();
    if (action === "settings:reset-all") resetAllSettings();
    if (action === "settings:export") exportSettings();
    if (action === "settings:import") importSettings();

    if (action.startsWith("tab:")) setTab(action.slice(4));
    if (action.startsWith("filter:")) setPluginFilter(action.slice(7), target.value);
    if (action.startsWith("toggle:")) togglePath(action.slice(7));
    if (action.startsWith("more-path:")) expandPathLimit(action.slice(10));
    if (action.startsWith("focus:")) focusObject(Number(action.slice(6)));
    if (action.startsWith("source:")) openSourceModal(Number(action.slice(7)));
    if (action.startsWith("dollar:")) setDollarZero(Number(action.slice(7)));
    if (action.startsWith("elements:")) revealElementRef(Number(action.slice(9)));
    if (action.startsWith("react:")) revealReactRef(Number(action.slice(6)));
    if (action.startsWith("setting:")) handleSettingAction(action.slice(8), event, target);
  }

  /* *************** */
  /* Formatting      */
  /* *************** */

  function getObjectPreview(value) {
    if (!Utils.isObjectLike(value)) return Utils.escapeHtml(Utils.getNodeLabel(value));

    if (value instanceof Element) {
      return `<span class="ra-element">${Utils.escapeHtml(Utils.formatElement(value))}</span>${Utils.isReactElement(value) ? '<span class="ra-react-badge">⚛</span>' : ""}`;
    }

    if (value instanceof Text) return `<span class="ra-object-type">${Utils.escapeHtml(Utils.getNodeLabel(value))}</span>`;
    if (value instanceof Document) return `<span class="ra-object-type">Document</span>`;
    if (value instanceof Window) return `<span class="ra-object-type">Window</span>`;
    if (Array.isArray(value)) return `<span class="ra-object-type">Array(${value.length})</span>`;
    if (value instanceof Map) return `<span class="ra-object-type">Map(${value.size})</span>`;
    if (value instanceof Set) return `<span class="ra-object-type">Set(${value.size})</span>`;
    if (value instanceof Error) return `<span class="ra-object-type">${Utils.escapeHtml(value.name)}</span> ${Utils.escapeHtml(value.message)}`;

    const keys = Reflect.ownKeys(value).slice(0, 4);
    const body = keys
      .map((key) => `<span class="ra-key">${Utils.escapeHtml(String(key))}</span>: ${Utils.escapeHtml(stringifyPreview(Utils.safeCall(() => value[key], "[Throws]")))}`)
      .join(", ");

    return `<span class="ra-object-type">${Utils.escapeHtml(Utils.getNodeLabel(value))}</span> {${body}${Reflect.ownKeys(value).length > 4 ? ", …" : ""}}`;
  }

  function getRichCode(value) {
    if (value instanceof HTMLStyleElement) return Utils.formatCss(value.textContent || "");
    if (value instanceof HTMLScriptElement) return Utils.prettySource(Utils.dedent(value.textContent || ""), "javascript", true);
    if (value instanceof HTMLTemplateElement) return Utils.formatHtml(value.innerHTML || "");
    if (value instanceof Element) return Utils.formatHtml(value.outerHTML || "");
    if (typeof value === "function") return Utils.dedent(Function.prototype.toString.call(value));

    return null;
  }

  function getCodeLanguage(value) {
    if (value instanceof HTMLStyleElement) return "css";
    if (value instanceof HTMLScriptElement || typeof value === "function") return "javascript";

    return "xml";
  }

  function formatValue(value, depth = 0, seen = new WeakSet()) {
    if (!Utils.isObjectLike(value)) return Utils.getNodeLabel(value);
    if (seen.has(value)) return "[Circular]";

    seen.add(value);

    const rich = getRichCode(value);
    if (rich) return rich;

    const keys = Reflect.ownKeys(value).slice(0, MAX_TREE_ITEMS);
    const body = keys
      .map((key) => `${"  ".repeat(depth + 1)}${String(key)}: ${formatValue(Utils.safeCall(() => value[key], "[Throws]"), depth + 1, seen)}`)
      .join(",\n");

    return keys.length ? `{\n${body}\n${"  ".repeat(depth)}}` : "{}";
  }

  function stringifyPreview(value) {
    return typeof value === "string" ? Utils.trimText(value, MAX_TEXT) : Utils.getNodeLabel(value);
  }

  function formatPlaceholder(token, value) {
    if (token === "d" || token === "i") return String(Number.parseInt(String(value), 10));
    if (token === "f") return String(Number.parseFloat(String(value)));

    return String(value);
  }

  function describeTarget(target) {
    if (target === window) return "window";
    if (target === document) return "document";
    if (target instanceof Element) return Utils.formatElement(target);
    if (target instanceof Node) return `Node ${target.nodeName}`;

    return Utils.getNodeLabel(target);
  }

  function getTime() {
    return new Date().toLocaleTimeString();
  }

  function getVisibleLogs() {
    const query = state.query.trim().toLowerCase();
    const filter = state.filters.logs || "all";

    return logs.filter((record) => {
      if (filter !== "all" && record.kind !== filter) return false;
      if (!query) return true;

      return record.preview.toLowerCase().includes(query) || record.kind.toLowerCase().includes(query);
    });
  }

  function getVisibleEvents() {
    const query = state.query.trim().toLowerCase();
    const filter = state.filters.events || "all";

    return events.filter((record) => {
      if (filter !== "all" && record.kind !== filter) return false;
      if (!query) return true;

      return record.preview.toLowerCase().includes(query) || record.targetLabel.toLowerCase().includes(query) || record.type.toLowerCase().includes(query);
    });
  }

  function icon(name) {
    return html`<i data-lucide=${name} class="ra-icon" aria-hidden="true"></i>`;
  }

  function refreshIcons() {
    if (!window.lucide?.createIcons) return;

    const options = {
      icons: window.lucide.icons,
      attrs: { "stroke-width": 2 },
    };

    try {
      window.lucide.createIcons({ ...options, root: getRoot() });
      return;
    } catch {}

    try {
      window.lucide.createIcons(options);
    } catch {}
  }

  function kindToIcon(kind) {
    if (kind === "error") return "circle-alert";
    if (kind === "warn") return "triangle-alert";
    if (kind === "info") return "info";
    if (kind === "debug") return "bug";
    if (kind === "trace") return "list-tree";
    if (kind === "alert" || kind === "alerta") return "message-square-warning";

    return "terminal";
  }

  function eventKindToIcon(kind) {
    if (kind === "network") return "wifi";
    if (kind === "error") return "circle-alert";

    return "radio";
  }

  function addStyle(cssText, id = "") {
    return Utils.installStyleOnce(String(cssText), id || `rod-inspector-plugin-style-${Utils.hashText(cssText)}`, document);
  }

  function ensureDocumentStyles() {
    Utils.installStyleOnce(getStyleText(), STYLE_ID, document);
  }

  function ensureShadowStyles(shadowRoot) {
    Utils.installStyleOnce(getStyleText(), STYLE_ID, shadowRoot);
  }

  function getStyleText() {
    return `.ra-root,
.ra-log-surface-host {
  --ra-panel: rgb(12 13 15 / var(--ra-opacity, 0.94));
  --ra-panel-2: rgb(18 19 22 / 0.96);
  --ra-border: rgb(255 255 255 / 0.1);
  --ra-border-strong: rgb(255 255 255 / 0.18);
  --ra-text: #e5e7eb;
  --ra-strong: #fff;
  --ra-muted: #9ca3af;
  --ra-faint: #6b7280;
  --ra-cyan: #7dd3fc;
  --ra-key: #8ab4ff;
  --ra-string: #7ee787;
  --ra-error-border: rgb(248 81 73 / 0.62);
  --ra-warning-border: rgb(251 191 36 / 0.5);
  --ra-radius-md: 14px;
  --ra-radius-lg: 22px;
  --ra-radius-pill: 999px;
  --ra-font-ui: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --ra-font-mono: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
  --ra-z: 9999998;
  --ra-shadow: 0 28px 90px rgb(0 0 0 / 0.72);
  --ra-blur: 18px;
  --ra-density-scale: 1;
  --ra-font-size: 12px;
  font-family: var(--ra-font-ui);
  color: var(--ra-text);
  -webkit-font-smoothing: antialiased;
}
.ra-root[data-ra-theme="oled"] {
  --ra-panel: rgb(0 0 0 / var(--ra-opacity, 0.96));
  --ra-panel-2: rgb(0 0 0 / 0.98);
  --ra-border: rgb(255 255 255 / 0.13);
}
.ra-root[data-ra-theme="charcoal"] {
  --ra-panel: rgb(22 23 26 / var(--ra-opacity, 0.94));
  --ra-panel-2: rgb(31 32 36 / 0.96);
  --ra-cyan: #ffb86b;
  --ra-key: #f6c177;
}
.ra-root {
  position: fixed;
  inset: 0;
  z-index: var(--ra-z);
  pointer-events: none;
}
.ra-root *,
.ra-log-surface-host * {
  box-sizing: border-box;
}
.ra-icon {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}
.ra-dock {
  position: fixed;
  right: 0;
  top: var(--ra-dock-y, 34vh);
  z-index: var(--ra-z);
  pointer-events: auto;
  width: 42px;
  border: 1px solid var(--ra-border-strong);
  border-right: 0;
  border-radius: 14px 0 0 14px;
  background: linear-gradient(180deg, rgb(24 25 28 / 0.88), rgb(9 10 12 / 0.88));
  box-shadow: var(--ra-shadow);
  backdrop-filter: blur(var(--ra-blur));
  -webkit-backdrop-filter: blur(var(--ra-blur));
  touch-action: none;
}
.ra-dock-inner {
  display: grid;
  gap: 8px;
  justify-items: center;
  padding: 5px 6px;
}
.ra-dock-count {
  min-width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.075);
  color: var(--ra-strong);
  font: 900 11px/1 var(--ra-font-ui);
}
.ra-panel {
  position: fixed;
  top: max(12px, env(safe-area-inset-top));
  right: max(10px, env(safe-area-inset-right));
  width: min(var(--ra-w, 520px), calc(100vw - 18px));
  height: min(var(--ra-h, calc(100vh - 24px)), calc(100vh - 24px));
  pointer-events: auto;
  display: none;
  grid-template-rows: auto auto auto auto 1fr;
  overflow: hidden;
  border: 1px solid var(--ra-border-strong);
  border-radius: var(--ra-radius-lg);
  background: linear-gradient(180deg, var(--ra-panel), rgb(6 7 9 / 0.98));
  box-shadow: var(--ra-shadow);
  backdrop-filter: blur(var(--ra-blur));
  -webkit-backdrop-filter: blur(var(--ra-blur));
}
.ra-panel.ra-open {
  display: grid;
}
.ra-panel.ra-floating {
  right: auto;
  left: var(--ra-x);
  top: var(--ra-y);
}
.ra-panel.ra-zen {
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  border-radius: 0 !important;
  border: 0;
}
.ra-header,
.ra-toolbar,
.ra-tabs,
.ra-actions,
.ra-filter-row,
.ra-inspect-actions,
.ra-surface-toolbar,
.ra-settings-actions,
.ra-settings-group-head,
.ra-range-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ra-header {
  justify-content: space-between;
  min-height: calc(40px * var(--ra-density-scale));
  padding: calc(7px * var(--ra-density-scale)) 9px;
  border-bottom: 1px solid var(--ra-border);
  background: rgb(255 255 255 / 0.035);
  touch-action: none;
}
.ra-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ra-strong);
  font-size: 12px;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ra-toolbar,
.ra-tabs,
.ra-filter-row,
.ra-surface-toolbar {
  padding: calc(7px * var(--ra-density-scale));
  border-bottom: 1px solid var(--ra-border);
  background: rgb(0 0 0 / 0.14);
}
.ra-tabs {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.ra-search,
.ra-select,
.ra-input {
  border: 1px solid var(--ra-border);
  border-radius: var(--ra-radius-pill);
  background: rgb(0 0 0 / 0.3);
  color: var(--ra-text);
  outline: 0;
}
.ra-search {
  flex: 1;
  height: 34px;
  padding: 0 14px;
  font: 650 12px/1 var(--ra-font-ui);
}
.ra-select,
.ra-input {
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  font: 650 12px/1 var(--ra-font-ui);
}
.ra-filter-select {
  max-width: 100%;
}
.ra-button,
.ra-tab,
.ra-pill,
.ra-load-more,
.ra-tree-toggle,
.ra-tree-more {
  appearance: none;
  border: 1px solid var(--ra-border);
  border-radius: var(--ra-radius-pill);
  background: rgb(255 255 255 / 0.055);
  color: var(--ra-text);
  font: 700 11px/1 var(--ra-font-ui);
  user-select: none;
  -webkit-user-select: none;
}
.ra-button,
.ra-tab,
.ra-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  padding: 6px 10px;
  white-space: nowrap;
}
.ra-tab.ra-active {
  background: rgb(255 255 255 / 0.14);
  color: var(--ra-strong);
}
.ra-main,
.ra-log-surface {
  min-height: 0;
  overflow: auto;
  padding: calc(7px * var(--ra-density-scale));
  contain: content;
  -webkit-overflow-scrolling: touch;
}
.ra-card {
  position: relative;
  display: grid;
  margin-bottom: 8px;
  overflow: visible;
  border: 1px solid var(--ra-border);
  border-left: 3px solid transparent;
  border-radius: var(--ra-radius-md);
  background: rgb(12 13 15 / 0.72);
}
.ra-kind-warn {
  border-left-color: var(--ra-warning-border);
}
.ra-kind-error {
  border-left-color: var(--ra-error-border);
}
.ra-card-head {
  display: grid;
  gap: 5px;
  padding: 8px 10px;
  background: rgb(12 13 15 / 0.9);
  border-radius: var(--ra-radius-md) var(--ra-radius-md) 0 0;
}
.ra-compact-card .ra-card-head {
  padding: 7px 9px;
}
.ra-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--ra-muted);
  font-size: 10px;
  font-weight: 850;
}
.ra-kind {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ra-cyan);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.ra-count,
.ra-react-badge {
  min-width: 20px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.11);
}
.ra-time {
  color: var(--ra-faint);
}
.ra-message,
.ra-tree-row {
  font: 420 var(--ra-font-size)/1.38 var(--ra-font-mono);
  white-space: pre-wrap;
  word-break: break-word;
}
.ra-card-body {
  display: grid;
  gap: 6px;
  padding: 0 9px 8px;
}
.ra-object-card {
  display: grid;
  gap: 6px;
  overflow-x: auto;
}
.ra-inspect-actions {
  flex-wrap: wrap;
  padding: 5px 0;
}
.ra-tree-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 5px;
  align-items: start;
  padding: 3px 3px 3px calc(var(--ra-depth) * 12px);
  border-radius: 10px;
}
.ra-tree-toggle {
  width: 22px;
  height: 22px;
  padding: 0;
  display: grid;
  place-items: center;
  background: transparent;
  border-color: transparent;
}
.ra-tree-more {
  width: calc(100% - 24px);
  min-height: 30px;
  margin: 4px 0 4px 24px;
}
.ra-key,
.hljs-attr,
.hljs-property {
  color: var(--ra-key);
}
.ra-string,
.hljs-string {
  color: var(--ra-string);
}
.ra-muted,
.hljs-comment {
  color: var(--ra-muted);
}
.ra-element {
  color: var(--ra-cyan);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.ra-object-type {
  color: var(--ra-muted);
}
.ra-load-more {
  width: 100%;
  min-height: 40px;
}
.ra-empty {
  min-height: 130px;
  display: grid;
  place-items: center;
  color: var(--ra-muted);
  text-align: center;
}
.ra-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 30px;
  height: 30px;
  touch-action: none;
}
.ra-zen .ra-resize {
  display: none;
}
.ra-modal-root {
  position: fixed;
  inset: 0;
  z-index: calc(var(--ra-z) + 20);
  display: grid;
  place-items: end center;
  pointer-events: auto;
  background: rgb(0 0 0 / 0.48);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.ra-modal {
  width: min(960px, calc(100vw - 14px));
  height: min(78vh, 760px);
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  border: 1px solid var(--ra-border-strong);
  border-radius: 22px 22px 0 0;
  background: rgb(8 9 11 / 0.96);
}
.ra-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid var(--ra-border);
}
.ra-modal-title {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: var(--ra-strong);
  font: 850 12px/1.2 var(--ra-font-ui);
}
.ra-modal-code {
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 12px;
  font: var(--ra-font-size)/1.45 var(--ra-font-mono);
  white-space: pre-wrap;
}
.ra-settings {
  display: grid;
  gap: 10px;
}
.ra-settings-hero,
.ra-settings-group {
  border: 1px solid var(--ra-border);
  border-radius: var(--ra-radius-md);
  background: rgb(255 255 255 / 0.04);
}
.ra-settings-hero {
  display: grid;
  gap: 10px;
  padding: 12px;
}
.ra-settings-hero strong {
  display: block;
  color: var(--ra-strong);
  font: 900 13px/1.2 var(--ra-font-ui);
}
.ra-settings-hero span,
.ra-setting-label small,
.ra-settings-group-head span {
  color: var(--ra-muted);
  font: 500 11px/1.35 var(--ra-font-ui);
}
.ra-settings-actions {
  flex-wrap: wrap;
}
.ra-settings-group {
  overflow: hidden;
}
.ra-settings-group-head {
  justify-content: space-between;
  padding: 9px 11px;
  border-bottom: 1px solid var(--ra-border);
  background: rgb(0 0 0 / 0.16);
}
.ra-settings-group-head div {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ra-strong);
  font: 850 12px/1.2 var(--ra-font-ui);
}
.ra-settings-grid {
  display: grid;
  gap: 1px;
}
.ra-setting-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(132px, 210px);
  gap: 10px;
  align-items: center;
  padding: 10px 11px;
  background: rgb(0 0 0 / 0.1);
}
.ra-setting-label {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.ra-setting-label strong {
  color: var(--ra-text);
  font: 750 12px/1.25 var(--ra-font-ui);
}
.ra-setting-control {
  display: grid;
  justify-items: stretch;
  min-width: 0;
}
.ra-range {
  width: 100%;
}
.ra-switch {
  width: 42px;
  height: 24px;
  justify-self: end;
  accent-color: var(--ra-cyan);
}
.ra-range-wrap {
  width: 100%;
}
.ra-range-wrap code {
  min-width: 42px;
  color: var(--ra-cyan);
  font: 800 11px/1 var(--ra-font-mono);
  text-align: right;
}
@media (max-width: 720px) {
  .ra-panel {
    inset: max(72px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
    width: auto;
    height: auto;
  }
  .ra-panel.ra-zen {
    inset: 0 !important;
  }
  .ra-button {
    width: 34px;
    padding: 0;
  }
  .ra-button span {
    display: none;
  }
  .ra-resize {
    display: none;
  }
  .ra-setting-field {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .ra-switch {
    justify-self: start;
  }
}`;
  }
})();
