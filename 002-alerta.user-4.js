// ==UserScript==
// @name         XXX4 / Alerta / Docked Inspector Logs
// @namespace    https://rod.dev/userscripts
// @version      6.2.0
// @description  Plugin-based mobile DevTools inspector with reusable log surfaces, Zen mode, Lit html, plugin API, source modal, $0, and lazy tree rendering.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       999
// @require      https://unpkg.com/lucide@0.468.0/dist/umd/lucide.js
// @require      https://rodkisten.github.io/bundler/cipo.iife.js?v1
// @require      https://code.migos.club/api/cdn?preset=highlight&css=highlight.js/styles/base16/material-darker.min.css&bundle=iife&global=RodCDN&cache=immutable
// @noframes
// ==/UserScript==

(async function DockedInspectorLogs() {
  "use strict";

  const VERSION = "6.2.0";
  const ROOT_ID = "__rod_docked_inspector_root__";
  const STYLE_ID = "__rod_docked_inspector_style__";
  const STORAGE_KEY = "rod.docked.inspector.v6.2";
  const PATCHED = Symbol.for("rod.docked.inspector.v6.2.patched");

  const MAX_RECORDS = 500;
  const MAX_TREE_ITEMS = 220;
  const MAX_TEXT = 1400;
  const INITIAL_LIMIT = 45;
  const LIMIT_STEP = 45;
  const SEARCH_DEBOUNCE_MS = 90;
  const FLASH_MS = 1600;

  const nativeConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    trace: console.trace?.bind(console),
  };

  const nativeAlert = window.alert.bind(window);

  const runtime = await createHtmlRuntime();
  const html = runtime.html;
  const render = runtime.render;
  const unsafeHTML = runtime.unsafeHTML;
  const repeat = runtime.repeat;
  const cache = runtime.cache;
  const nothing = runtime.nothing;

  nativeConsole.info(
    `%c[Docked Inspector]%c html engine: ${runtime.name}`,
    "color:#7dd3fc;background:rgba(255,255,255,.08);padding:2px 6px;border-radius:8px;font-weight:900",
    "color:#e5e7eb",
  );
  
  if(typeof Cipo.configure === "function"){
    Cipo.configure({
      prefix: 'rod',
      minify: false,
      layers: true,
      rem: { enabled: true, baseFontSize: 16 },
      theme: { colors: { brand: '#f97316' } },
      jit: true,
      debug: true,
     })    
  }

  let root = null;
  let renderFrame = 0;
  let searchTimer = 0;
  let dockDragging = false;
  let dragState = null;
  let resizeState = null;
  let nextRecordId = 1;
  let nextObjectId = 1;
  let nextSurfaceId = 1;

  const logs = [];
  const events = [];
  const plugins = [];
  const objectStore = new Map();
  const objectRefs = new WeakMap();
  const expandedPaths = new Set();
  const pluginStyleIds = new Set();
  const eventBus = new Map();

  let state = readState();
  const api = createPluginApi();

  registerBuiltInPlugins();
  exposePublicApi();
  installConsolePatch();
  installConsoleRepairLoop();
  installErrorInterceptors();
  installNetworkInterceptors();

  if (document.documentElement) runOnlyOnTopWindow(boot);
  else document.addEventListener("DOMContentLoaded", () => runOnlyOnTopWindow(boot), { once: true });

  async function createHtmlRuntime() {
    try {
      const lit = await import("https://esm.sh/lit@3.2.1?bundle");
      const unsafe = await import("https://esm.sh/lit@3.2.1/directives/unsafe-html.js?bundle");
      const repeatDirective = await import("https://esm.sh/lit@3.2.1/directives/repeat.js?bundle");
      const cacheDirective = await import("https://esm.sh/lit@3.2.1/directives/cache.js?bundle");

      return {
        name: "lit-html",
        html: lit.html,
        render: lit.render,
        unsafeHTML: unsafe.unsafeHTML,
        repeat: repeatDirective.repeat,
        cache: cacheDirective.cache,
        nothing: lit.nothing,
      };
    } catch (error) {
      nativeConsole.warn("[Docked Inspector] Lit failed. Using minimal fallback.", error);

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
        render: (view, container) => {
          container.innerHTML = stringifyFallbackValue(view);
          bindFallbackActions(container);
        },
        unsafeHTML: (value) => ({ __rodTemplate: true, value: String(value) }),
        repeat: (items, keyFn, viewFn) => Array.from(items).map((item, index) => viewFn(item, index)),
        cache: (value) => value,
        nothing: "",
      };
    }
  }
  
  /**function css(strings, ...values) {
        let output = "";

        for (let index = 0; index < strings.length; index += 1) {
          output += strings[index];

          if (index < values.length) output += stringifyFallbackValue(values[index]);
        }

       return output;
      }
      **/
  

  function stringifyFallbackValue(value) {
    if (Array.isArray(value)) return value.map(stringifyFallbackValue).join("");
    if (value && value.__rodTemplate) return value.value;
    if (typeof value === "function") return "";
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function bindFallbackActions(container) {
    container.onclick = (event) => {
      const target = event.target.closest("[data-ra-action]");
      if (!target) return;
      runAction(target.dataset.raAction, event, target);
    };

    container.oninput = (event) => {
      const target = event.target.closest("[data-ra-input]");
      if (!target) return;
      runAction(target.dataset.raInput, event, target);
    };

    container.onchange = (event) => {
      const target = event.target.closest("[data-ra-change]");
      if (!target) return;
      runAction(target.dataset.raChange, event, target);
    };
  }

  function runAction(action, event, target) {
    if (action === "open") openInspector();
    if (action === "dock") dockPanel();
    if (action === "copy") copyVisible();
    if (action === "clear") clearCurrent();
    if (action === "minimize") minimizeInspector();
    if (action === "zen") toggleZenMode();
    if (action === "search") handleSearch(event);
    if (action === "load-more") loadMore();

    if (action.startsWith("tab:")) setTab(action.slice(4));
    if (action.startsWith("filter:")) setPluginFilter(action.slice(7), target.value);
    if (action.startsWith("toggle:")) togglePath(action.slice(7));
    if (action.startsWith("focus:")) focusObject(Number(action.slice(6)));
    if (action.startsWith("source:")) openSourceModal(Number(action.slice(7)));
    if (action.startsWith("dollar:")) setDollarZero(Number(action.slice(7)));

    if (action === "close-modal") closeModal();
    if (action === "copy-modal") copyModalSource();
  }

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
      filters: { logs: "all", events: "all" },
      limits: { logs: INITIAL_LIMIT, events: INITIAL_LIMIT },
      modal: null,
    };

    try {
      return {
        ...fallback,
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
        open: false,
        docked: true,
        limits: { logs: INITIAL_LIMIT, events: INITIAL_LIMIT },
        modal: null,
      };
    } catch {
      return fallback;
    }
  }

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
          filters: state.filters,
        }),
      );
    } catch {}
  }

  function runOnlyOnTopWindow(callback) {
    if (window.self === window.top) callback();
  }

  function boot() {
    ensureStyles();
    getRoot();
    scheduleRender();
    emit("boot", api);
  }

  function getRoot() {
    if (root) return root;

    root = document.getElementById(ROOT_ID);

    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
    }

    return root;
  }

  function scheduleRender() {
    if (renderFrame) return;

    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      renderApp();
    });
  }

  function renderApp() {
    render(
      html`
        ${cache(viewDock())}
        ${cache(viewPanel())}
        ${state.modal ? viewModal(state.modal) : nothing}
      `,
      getRoot(),
    );

    refreshIcons();
    emit("render", api);
  }

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

  function viewPanel() {
    const activePlugin = getActivePlugin();

    return html`
      <section
        class="ra-panel ${state.open ? "ra-open" : ""} ${state.docked ? "" : "ra-floating"} ${state.zen ? "ra-zen" : ""}"
        style="--ra-w:${state.width}px;--ra-h:${state.height}px;--ra-x:${state.x}px;--ra-y:${state.y}px"
      >
        <header class="ra-header" @pointerdown=${startPanelDrag} @pointermove=${movePanelDrag} @pointerup=${endPanelDrag}>
          <div class="ra-title">
            ${icon("bug")}
            <span>Docked Inspector ${typeof Cipo?.css !== "undefined" && html`<i>(Cipó 🌿)</i>`}</span>
          </div>

          <div class="ra-actions">
            <button class="ra-button" type="button" data-ra-action="zen" @click=${toggleZenMode}>${icon("expand")}<span>Zen</span></button>
           <!-- <button class="ra-button" type="button" data-ra-action="dock" @click=${dockPanel}>${icon("panel-right")}<span>Dock</span></button>
            <button class="ra-button" type="button" data-ra-action="copy" @click=${copyVisible}>${icon("copy")}<span>Copy</span></button> -->
            <button class="ra-button" type="button" data-ra-action="clear" @click=${clearCurrent}>${icon("trash-2")}<span>Clear</span></button>
            <button class="ra-button" type="button" data-ra-action="minimize" @click=${minimizeInspector}>${icon("minus")}<span>Min</span></button>
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
          ${repeat(
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
                ${state.zen ? nothing : plugin.title}
              </button>
            `,
          )}
        </nav>

        <div class="ra-filter-row">${activePlugin?.renderFilters?.(api) || nothing}</div>

        <main class="ra-main">${activePlugin ? activePlugin.render(api) : nothing}</main>

        <div class="ra-resize" @pointerdown=${startResize} @pointermove=${moveResize} @pointerup=${endResize}></div>
      </section>
    `;
  }

  function viewModal(modal) {
    return html`
      <div class="ra-modal-root" @click=${handleModalBackdrop}>
        <section class="ra-modal" role="dialog">
          <header class="ra-modal-head">
            <div class="ra-modal-title">${icon("code-2")} ${modal.title || "Source"}</div>
            <div class="ra-actions">
              <button class="ra-button" type="button" data-ra-action="copy-modal" @click=${copyModalSource}>${icon("copy")}<span>Copy</span></button>
              <button class="ra-button" type="button" data-ra-action="close-modal" @click=${closeModal}>${icon("x")}<span>Close</span></button>
            </div>
          </header>

          <pre class="ra-modal-code"><code>${unsafeHTML(highlightCode(modal.source, modal.language || "javascript"))}</code></pre>
        </section>
      </div>
    `;
  }

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
      title: "Eventos",
      icon: "radio",
      order: 20,
      filters: ["all", "listener", "network", "error"],
      renderFilters: renderDefaultFilter,
      render: () => viewRecords("events", getVisibleEvents(), viewEventCard),
    });
  }

  function renderDefaultFilter() {
    const plugin = getActivePlugin();
    const value = state.filters[plugin.id] || "all";

    return html`
      <select
        class="ra-select"
        .value=${value}
        data-ra-change="filter:${plugin.id}"
        @change=${(event) => setPluginFilter(plugin.id, event.target.value)}
      >
        ${plugin.filters.map((item) => html`<option value=${item}>${item === "all" ? `All ${plugin.title.toLowerCase()}` : item}</option>`)}
      </select>
    `;
  }

  function viewRecords(pluginId, records, renderRecord) {
    const limit = state.limits[pluginId] || INITIAL_LIMIT;
    const visible = records.slice(0, limit);

    if (!visible.length) {
      return html`<div class="ra-empty">${icon("moon")}<div>No ${pluginId} yet.</div></div>`;
    }

    return html`
      ${repeat(visible, (record) => record.id, renderRecord)}
      ${records.length > visible.length
        ? html`<button class="ra-load-more" type="button" data-ra-action="load-more" @click=${loadMore}>Load more</button>`
        : nothing}
    `;
  }

  function viewLogCard(record, options = {}) {
    const behavior = normalizeLogSurfaceOptions(options);
    const hasText = record.parts.length > 0;
    const hasObjects = record.refIds.length > 0;

    return html`
      <article class="ra-card ra-kind-${record.kind} ${behavior.stickyHeader ? "" : "ra-no-sticky"}">
        <div class="ra-card-head ${hasObjects ? "ra-has-body" : ""}">
          <span class="ra-meta">
            <span class="ra-kind">
              ${icon(kindToIcon(record.kind))}
              <span>${record.kind}</span>
              ${record.count > 1 ? html`<span class="ra-count">${record.count}</span>` : nothing}
            </span>
            <span class="ra-time">${record.time}</span>
          </span>

          ${hasText ? html`<div class="ra-message">${record.parts.map(viewConsolePart)}</div>` : nothing}
        </div>

        ${hasObjects
          ? html`<div class="ra-card-body">${record.refIds.map((refId, index) => viewInspectableObject(refId, `$[${index}]`, "", behavior))}</div>`
          : nothing}
      </article>
    `;
  }

  function viewEventCard(record) {
    return html`
      <article class="ra-card ${record.kind === "error" ? "ra-kind-error" : ""}">
        <div class="ra-card-head ${record.refId ? "ra-has-body" : ""}">
          <span class="ra-meta">
            <span class="ra-kind">
              ${icon(eventKindToIcon(record.kind))}
              <span>${record.type}</span>
              ${record.count > 1 ? html`<span class="ra-count">${record.count}</span>` : nothing}
            </span>
            <span class="ra-time">${record.time}</span>
          </span>

          <div class="ra-message">
            <span class="ra-key">${record.action}</span>
            <span class="ra-muted"> ${record.targetLabel}</span>
            ${record.detail ? html`<br /><span class="ra-muted">${record.detail}</span>` : nothing}
          </div>
        </div>

        ${record.refId ? html`<div class="ra-card-body">${viewInspectableObject(record.refId, `event:${record.id}`, "")}</div>` : nothing}
      </article>
    `;
  }

  function viewConsolePart(part) {
    if (part.type === "styled") return html`<span style=${part.style}>${part.text}</span>`;
    if (part.type === "html") return unsafeHTML(part.html);
    return html`${part.text}`;
  }

  function viewInspectableObject(refId, path, label, options = {}) {
    const value = objectStore.get(refId);
    const behavior = normalizeLogSurfaceOptions(options);

    if (!value) return nothing;

    return html`
      <section class="ra-object-card">
        ${viewInspectActions(refId, behavior)}
        ${behavior.tree ? viewNode(value, path, label, 0) : html`<div class="ra-tree-row" style="--ra-depth:0">${unsafeHTML(getObjectPreview(value))}</div>`}
      </section>
    `;
  }

  function viewInspectActions(refId, behavior = {}) {
    return html`
      <div class="ra-inspect-actions">
        ${behavior.dollarZero
          ? html`<button class="ra-pill" type="button" data-ra-action="dollar:${refId}" @click=${() => setDollarZero(refId)}>${icon("badge-dollar-sign")}$0</button>`
          : nothing}
        ${behavior.focus
          ? html`<button class="ra-pill" type="button" data-ra-action="focus:${refId}" @click=${() => focusObject(refId)}>${icon("scan-search")}Focus</button>`
          : nothing}
        ${behavior.source
          ? html`<button class="ra-pill" type="button" data-ra-action="source:${refId}" @click=${() => openSourceModal(refId)}>${icon("code-2")}Source</button>`
          : nothing}
      </div>
    `;
  }

  function viewNode(value, path, label, depth) {
    if (!isObjectLike(value)) {
      return html`
        <div class="ra-tree-row" style="--ra-depth:${depth}">
          <span class="ra-tree-spacer"></span>
          <span>${label ? html`<span class="ra-key">${label}:</span> ` : nothing}${getNodeLabel(value)}</span>
        </div>
      `;
    }

    const isOpen = expandedPaths.has(path);
    const entries = isOpen ? getEntries(value, path).slice(0, MAX_TREE_ITEMS) : [];

    return html`
      <div class="ra-tree-item">
        <div class="ra-tree-row" style="--ra-depth:${depth}">
          <button class="ra-tree-toggle" type="button" data-ra-action="toggle:${path}" @click=${() => togglePath(path)}>
            ${icon(isOpen ? "chevron-down" : "chevron-right")}
          </button>

          <span class="ra-tree-summary">
            ${label ? html`<span class="ra-key">${label}:</span> ` : nothing}
            ${unsafeHTML(getObjectPreview(value))}
          </span>
        </div>

        ${isOpen ? html`${entries.map((entry) => viewNode(entry.value, entry.path, entry.label, depth + 1))}` : nothing}
      </div>
    `;
  }

  function createLogSurface(container, options = {}) {
    const target = typeof container === "string" ? document.querySelector(container) : container;

    if (!target) {
      throw new Error("[Docked Inspector] createLogSurface needs a valid container.");
    }

    const surface = {
      id: `surface-${nextSurfaceId++}`,
      container: target,
      records: [],
      options: normalizeLogSurfaceOptions(options),
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

      setOptions(nextOptions = {}) {
        surface.options = normalizeLogSurfaceOptions({
          ...surface.options,
          ...nextOptions,
          cssVars: {
            ...surface.options.cssVars,
            ...(nextOptions.cssVars || {}),
          },
        });

        surface.render();
      },

      destroy() {
        render(nothing, surface.container);
      },

      render() {
        applySurfaceCssVars(surface.container, surface.options.cssVars);

        render(viewLogSurface(surface), surface.container);
        refreshIcons();
      },
    };

    target.classList.add("ra-log-surface-host");
    surface.render();

    return surface;
  }

  function viewLogSurface(surface) {
    const visible = surface.records.slice(0, surface.limit);

    return html`
      <section class="ra-log-surface ${surface.options.className || ""}">
        ${surface.options.toolbar
          ? html`
              <div class="ra-surface-toolbar">
                <span class="ra-kind">${icon(surface.options.icon || "terminal")}${surface.options.title || "Logs"}</span>
                <button class="ra-pill" type="button" @click=${surface.clear}>${icon("trash-2")}Clear</button>
              </div>
            `
          : nothing}

        ${visible.length
          ? repeat(visible, (record) => record.id, (record) => viewLogCard(record, surface.options))
          : html`<div class="ra-empty">${icon("moon")}<div>No logs yet.</div></div>`}

        ${surface.records.length > visible.length
          ? html`
              <button
                class="ra-load-more"
                type="button"
                @click=${() => {
                  surface.limit += LIMIT_STEP;
                  surface.render();
                }}
              >
                Load more
              </button>
            `
          : nothing}
      </section>
    `;
  }

  function normalizeLogSurfaceOptions(options = {}) {
    return {
      title: options.title || "Logs",
      icon: options.icon || "terminal",
      className: options.className || "",
      toolbar: options.toolbar ?? true,
      group: options.group ?? true,
      maxRecords: options.maxRecords || MAX_RECORDS,
      focus: options.focus ?? true,
      source: options.source ?? true,
      dollarZero: options.dollarZero ?? true,
      tree: options.tree ?? true,
      stickyHeader: options.stickyHeader ?? true,
      cssVars: options.cssVars || {},
    };
  }

  function applySurfaceCssVars(container, cssVars = {}) {
    for (const [key, value] of Object.entries(cssVars)) {
      container.style.setProperty(key, String(value));
    }
  }

  function createLogRecord(kind, values) {
    const parsed = parseConsoleValues(values);
    const refIds = values.filter(isObjectLike).map(storeObject);
    const preview = parsed.raw || values.map(stringifyPreview).join(" ");

    return {
      id: nextRecordId++,
      kind,
      time: getTime(),
      parts: parsed.parts,
      raw: parsed.raw,
      preview,
      refIds,
      groupKey: `${kind}:${preview}:${refIds.map((id) => getNodeLabel(objectStore.get(id))).join("|")}`,
      count: 1,
    };
  }

  function registerPlugin(plugin) {
    if (!plugin || !plugin.id) return false;

    const existingIndex = plugins.findIndex((item) => item.id === plugin.id);
    const finalPlugin = {
      order: 100,
      enabled: true,
      setup: null,
      renderFilters: null,
      ...plugin,
    };

    if (existingIndex >= 0) plugins.splice(existingIndex, 1, finalPlugin);
    else plugins.push(finalPlugin);

    plugins.sort((left, right) => left.order - right.order);
    finalPlugin.setup?.(api);

    emit("plugin:registered", finalPlugin);
    scheduleRender();

    return true;
  }

  function createPluginApi() {
    return {
      version: VERSION,

      html,
      unsafeHTML,
      repeat,
      cache,
      nothing,
      icon,

      registerPlugin,
      scheduleRender,

      addLog: addInspectorLog,
      addEvent: pushEventRecord,
      createLogSurface,

      logs,
      events,
      state,

      objectStore: {
        raw: objectStore,
        set: storeObject,
        get: (id) => objectStore.get(id),
        has: (id) => objectStore.has(id),
        delete: (id) => objectStore.delete(id),
        entries: () => objectStore.entries(),
        values: () => objectStore.values(),
        size: () => objectStore.size,
      },

      on,
      off,
      emit,
      addStyle,
      css,

      minimize: minimizeInspector,
      open: openInspector,
      toggleZenMode,

      modal: {
        open: openSourceModal,
        openSource,
        close: closeModal,
      },

      factories: {
        viewRecords,
        viewLogSurface,
        viewLogCard,
        viewInspectableObject,
        viewInspectActions,
        viewNode,
        renderDefaultFilter,
      },

      dom: {
        focusObject,
        setDollarZero,
        flashElement,
        getElementFromObject,
      },

      format: {
        escapeHtml,
        getNodeLabel,
        getObjectPreview,
        getRichCode,
        formatValue,
        formatHtml,
        formatCss,
        highlightCode,
      },
    };
  }

  function exposePublicApi() {
    window.RodDockedInspector = {
      version: VERSION,
      registerPlugin,
      api,
      logs,
      events,
      objectStore,
      createLogSurface,
      open: openInspector,
      minimize: minimizeInspector,
      toggleZenMode,
      clear: () => {
        logs.length = 0;
        events.length = 0;
        scheduleRender();
      },
    };
  }

  function on(eventName, handler) {
    const handlers = eventBus.get(eventName) || new Set();

    handlers.add(handler);
    eventBus.set(eventName, handlers);

    return () => off(eventName, handler);
  }

  function off(eventName, handler) {
    const handlers = eventBus.get(eventName);
    if (!handlers) return false;

    handlers.delete(handler);
    if (!handlers.size) eventBus.delete(eventName);

    return true;
  }

  function emit(eventName, payload) {
    const handlers = eventBus.get(eventName);
    if (!handlers) return;

    for (const handler of handlers) {
      safeCall(() => handler(payload, api), null);
    }
  }


const pluginStyleDeclarations = new Map();

/**
 * Hashes a text value into a stable small id.
 *
 * @param {string} text Input text.
 * @returns {string} Stable hash.
 */
function hashText(text) {
  let hash = 5381;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }

  return Math.abs(hash >>> 0).toString(36);
}

/**
 * Removes block comments from CSS.
 *
 * @param {string} cssText Raw CSS.
 * @returns {string} CSS without comments.
 */
function removeCssComments(cssText) {
  return String(cssText).replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Makes CSS output easier to inspect while staying small.
 *
 * @param {string} cssText Raw CSS.
 * @returns {string} Pretty CSS.
 */
function prettyCss(cssText) {
  return String(cssText)
    .replace(/\s+/g, " ")
    .replace(/\s*{\s*/g, " {\n  ")
    .replace(/;\s*/g, ";\n  ")
    .replace(/\s*}\s*/g, "\n}\n\n")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}

/**
 * Adds !important to declarations that do not already have it.
 *
 * @param {string} cssText Raw CSS.
 * @returns {string} CSS with important declarations.
 */
function importantCss(cssText) {
  return String(cssText).replace(/:\s*([^;{}]+);/g, (_match, value) => {
    const cleanValue = String(value).trim();

    if (/!important$/i.test(cleanValue)) {
      return `: ${cleanValue};`;
    }

    return `: ${cleanValue} !important;`;
  });
}

/**
 * Shared CSS transform pipeline.
 *
 * @param {string} cssText Raw CSS.
 * @param {{
 *   important?: boolean;
 *   pretty?: boolean;
 *   removeComments?: boolean;
 * }} [options]
 * @returns {string}
 */
function transformCss(cssText, options = {}) {
  const {
    important = false,
    pretty = true,
    removeComments = true,
  } = options;

  let css = String(cssText);

  if (removeComments) {
    css = removeCssComments(css);
  }

  if (important) {
    css = importantCss(css);
  }

  if (pretty) {
    css = prettyCss(css);
  }

  return css.trim();
}

/**
 * Extracts declaration keys so duplicated plugin styles can be warned about.
 *
 * @param {string} cssText CSS text.
 * @returns {string[]} Declaration keys.
 */
function collectDeclarationKeys(cssText) {
  const keys = [];
  const rulePattern = /([^{}]+)\{([^{}]+)\}/g;

  let ruleMatch;

  while ((ruleMatch = rulePattern.exec(cssText))) {
    const selector = ruleMatch[1].trim();
    const body = ruleMatch[2];

    for (const declaration of body.split(";")) {
      const [property] = declaration.split(":");

      if (!property || !property.trim()) continue;

      keys.push(`${selector}::${property.trim().toLowerCase()}`);
    }
  }

  return keys;
}

/**
 * Tagged template helper with the same transform pipeline as addStyle().
 *
 * @param {TemplateStringsArray} strings Template strings.
 * @param {...unknown} values Template values.
 * @returns {string}
 *
 * @example
 * const styles = css`
 *   .box {
 *     color: red;
 *   }
 * `;
 *
 * @example
 * const styles = css(
 *   [`.box { color: red; }`],
 *   {
 *     important: true,
 *   },
 * );
 */
 

function css(strings, ...values) {
  if(typeof Cipo?.css !== "undefined") {
    console.log("TODO: migrar para Cipo");
    console.log("Cipo.css", Cipo.css`
    body{color:$brand;
  px: 4
  py: 3 
  rounded: $xl;
  shadow: $panel;
  color: $brand;

  text(size: lg, weight: 800, lh: 1.1, color: $ink);
  

          bg: $brand
  
   
  x:md {
    px: 6;
  } 
    }
    `.toString())
    //return Cipo.css(strings, ...values)
  
  
  }
  
  const lastValue = values.at(-1);

  const hasOptionsObject =
    lastValue &&
    typeof lastValue === "object" &&
    !Array.isArray(lastValue);

  const options = hasOptionsObject ? values.pop() : {};

  const rawCss = strings.reduce((output, chunk, index) => {
    return `${output}${chunk}${index < values.length ? String(values[index]) : ""}`;
  }, "");

  return transformCss(rawCss, options);
}

/**
 * Adds plugin CSS once.
 *
 * @param {string} cssText Raw CSS.
 * @param {string} [id]
 * @param {{
 *   important?: boolean;
 *   pretty?: boolean;
 *   removeComments?: boolean;
 *   warnOnDuplicateDeclaration?: boolean;
 * }} [options]
 * @returns {{ id: string; css: string; existed: boolean; duplicates: string[] }}
 */
function addStyle(cssText, id = "", options = {}) {
  const {
    warnOnDuplicateDeclaration = true,
  } = options;

  const cssOutput = transformCss(cssText, options);

  const styleId =
    id || `rod-inspector-plugin-style-${hashText(cssOutput)}`;

  const existingStyle = document.getElementById(styleId);

  const duplicates = [];

  for (const declarationKey of collectDeclarationKeys(cssOutput)) {
    const previousStyleId =
      pluginStyleDeclarations.get(declarationKey);

    if (previousStyleId && previousStyleId !== styleId) {
      duplicates.push(declarationKey);
    }

    pluginStyleDeclarations.set(declarationKey, styleId);
  }

  if (duplicates.length > 0 && warnOnDuplicateDeclaration) {
    console.warn("[RodInspector] CSS declarations already defined:", {
      styleId,
      duplicates,
    });
  }

  if (existingStyle) {
    return {
      id: styleId,
      css: cssOutput,
      existed: true,
      duplicates,
    };
  }

  const style = document.createElement("style");

  style.id = styleId;
  style.textContent = cssOutput;

  document.documentElement.appendChild(style);

  return {
    id: styleId,
    css: cssOutput,
    existed: false,
    duplicates,
  };
}

addStyle.css = css;


  function hashText(value) {
    let hash = 0;
    const text = String(value);

    for (let index = 0; index < text.length; index += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(index);
      hash |= 0;
    }

    return Math.abs(hash).toString(36);
  }

  function getVisiblePlugins() {
    return plugins.filter((plugin) => plugin.enabled !== false);
  }

  function getActivePlugin() {
    return getVisiblePlugins().find((plugin) => plugin.id === state.tab) || getVisiblePlugins()[0];
  }

  function setTab(tab) {
    state.tab = tab;
    resetLimits();
    saveState();
    emit("tab:changed", tab);
    scheduleRender();
  }

  function setPluginFilter(pluginId, value) {
    state.filters[pluginId] = value;
    resetLimits();
    saveState();
    emit("filter:changed", { pluginId, value });
    scheduleRender();
  }

  function resetLimits() {
    state.limits.logs = INITIAL_LIMIT;
    state.limits.events = INITIAL_LIMIT;
  }

  function loadMore() {
    const pluginId = state.tab;

    state.limits[pluginId] = (state.limits[pluginId] || INITIAL_LIMIT) + LIMIT_STEP;
    scheduleRender();
  }

  function openInspector() {
    if (dockDragging) return;
    if(state.open === true) return  minimizeInspector();

    state.open = true;
    saveState();
    emit("panel:open", api);
    scheduleRender();
  }

  function minimizeInspector() {
    state.open = false;
    state.docked = true;
    saveState();
    emit("panel:minimize", api);
    scheduleRender();
  }

  function dockPanel() {
    state.open = true;
    state.docked = true;
    state.zen = false;
    saveState();
    emit("panel:dock", api);
    scheduleRender();
  }

  function toggleZenMode() {
    state.zen = !state.zen;
    state.open = true;
    state.docked = true;
    saveState();
    emit("panel:zen", state.zen);
    scheduleRender();
  }

  function clearCurrent() {
    if (state.tab === "events") events.length = 0;
    else if (state.tab === "logs") logs.length = 0;

    emit("records:clear", state.tab);
    scheduleRender();
  }

  function copyVisible() {
    const active = getActivePlugin();
    const records = active?.id === "events" ? getVisibleEvents() : getVisibleLogs();

    copyText(records.map((record) => `[${record.time}] ${record.kind || record.type}: ${record.preview}`).join("\n"));
  }

  function handleSearch(event) {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
      state.query = event.target.value;
      resetLimits();
      saveState();
      emit("search:changed", state.query);
      scheduleRender();
    }, SEARCH_DEBOUNCE_MS);
  }

  function togglePath(path) {
    if (expandedPaths.has(path)) expandedPaths.delete(path);
    else expandedPaths.add(path);

    emit("tree:toggle", path);
    scheduleRender();
  }

  function openSourceModal(input) {
    if (typeof input === "number") {
      const value = objectStore.get(input);
      if (!value) return;

      openSource({
        title: getNodeLabel(value),
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

    emit("modal:open", state.modal);
    scheduleRender();
  }
  
  on("modal:open", (modal) => {
    console.log("received event modal:open", {modal})
  })

  function closeModal() {
    state.modal = null;
    emit("modal:close", api);
    scheduleRender();
  }

  function copyModalSource() {
    if (!state.modal) return;
    copyText(state.modal.source);
  }

  function handleModalBackdrop(event) {
    if (event.target.classList.contains("ra-modal-root")) closeModal();
  }

  function startDockDrag(event) {
    dragState = { type: "dock", startY: event.clientY, initialY: state.dockY };
    dockDragging = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDockDrag(event) {
    if (!dragState || dragState.type !== "dock") return;

    const deltaY = event.clientY - dragState.startY;
    if (Math.abs(deltaY) > 5) dockDragging = true;

    state.dockY = Math.max(18, Math.min(window.innerHeight - 88, dragState.initialY + deltaY));
    scheduleRender();
  }

  function endDockDrag() {
    dragState = null;
    saveState();

    setTimeout(() => {
      dockDragging = false;
    }, 0);
  }

  function startPanelDrag(event) {
    if (event.target.closest("button,input,select")) return;
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

    state.docked = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePanelDrag(event) {
    if (!dragState || dragState.type !== "panel") return;

    state.x = Math.max(6, Math.min(window.innerWidth - 90, dragState.initialX + event.clientX - dragState.startX));
    state.y = Math.max(6, Math.min(window.innerHeight - 64, dragState.initialY + event.clientY - dragState.startY));
    scheduleRender();
  }

  function endPanelDrag() {
    dragState = null;
    saveState();
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

    state.docked = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveResize(event) {
    if (!resizeState) return;

    state.width = Math.max(320, Math.min(window.innerWidth - 16, resizeState.width + event.clientX - resizeState.startX));
    state.height = Math.max(260, Math.min(window.innerHeight - 16, resizeState.height + event.clientY - resizeState.startY));
    scheduleRender();
  }

  function endResize() {
    resizeState = null;
    saveState();
  }

  function addInspectorLog(kind, ...values) {
    const record = createLogRecord(kind, values);
    const previous = logs[0];

    if (previous && previous.groupKey === record.groupKey) {
      previous.count += 1;
      previous.time = getTime();
      emit("log:grouped", previous);
      scheduleRender();
      return values.length === 1 ? values[0] : values;
    }

    logs.unshift(record);

    if (logs.length > MAX_RECORDS) logs.length = MAX_RECORDS;

    emit("log:add", record);
    scheduleRender();

    return values.length === 1 ? values[0] : values;
  }

  function pushEventRecord(record) {
    const previous = events[0];

    if (previous && previous.groupKey === record.groupKey) {
      previous.count += 1;
      previous.time = getTime();
      emit("event:grouped", previous);
      scheduleRender();
      return;
    }

    events.unshift(record);

    if (events.length > MAX_RECORDS) events.length = MAX_RECORDS;

    emit("event:add", record);
    scheduleRender();
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

      return (
        record.preview.toLowerCase().includes(query) ||
        record.targetLabel.toLowerCase().includes(query) ||
        record.type.toLowerCase().includes(query)
      );
    });
  }

  function parseConsoleValues(values) {
    const parts = [];
    const rawParts = [];

    if (!values.length) return { parts, raw: "" };

    if (typeof values[0] !== "string") {
      for (const value of values) {
        if (isObjectLike(value)) {
          rawParts.push(stringifyPreview(value));
          continue;
        }

        parts.push({ type: "text", text: stringifyPreview(value) });
        rawParts.push(stringifyPreview(value));
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
        activeStyle = sanitizeConsoleStyle(args[argIndex++]);
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

      if (isObjectLike(value)) {
        rawParts.push(stringifyPreview(value));
      } else {
        const text = `${parts.length ? " " : ""}${stringifyPreview(value)}`;
        parts.push({ type: "text", text });
        rawParts.push(stringifyPreview(value));
      }
    }

    return { parts, raw: rawParts.join(" ") };
  }

  function installConsolePatch() {
    if (console[PATCHED]) return;

    Object.defineProperty(console, PATCHED, { value: true, configurable: true });

    for (const kind of ["log", "info", "warn", "error", "debug", "trace"]) {
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
      openInspector();
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
    window.formatAlertaValue = formatValue;
  }

  function installConsoleRepairLoop() {
    setInterval(() => {
      if (!console[PATCHED]) installConsolePatch();
    }, 1000);
  }

  function installErrorInterceptors() {
    window.addEventListener(
      "error",
      (event) => {
        const refId = event.target && isObjectLike(event.target) ? storeObject(event.target) : null;

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
        const refId = isObjectLike(event.reason) ? storeObject(event.reason) : null;

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

  function installNetworkInterceptors() {
    if (window.fetch && !window.fetch[PATCHED]) {
      const originalFetch = window.fetch;

      const wrappedFetch = async function interceptedFetch(input, init) {
        const startedAt = performance.now();
        const url = typeof input === "string" ? input : input?.url;
        const method = init?.method || input?.method || "GET";

        try {
          const response = await originalFetch.apply(this, arguments);

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

          return response;
        } catch (error) {
          addInspectorLog("error", error);
          throw error;
        }
      };

      Object.defineProperty(wrappedFetch, PATCHED, { value: true });
      window.fetch = wrappedFetch;
    }

    patchXhr();
  }

  function patchXhr() {
    const proto = window.XMLHttpRequest?.prototype;
    if (!proto || proto[PATCHED]) return;

    Object.defineProperty(proto, PATCHED, { value: true, configurable: true });

    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function interceptedXhrOpen(method, url) {
      this.__rodInspectorRequest = { method, url, startedAt: 0 };
      return originalOpen.apply(this, arguments);
    };

    proto.send = function interceptedXhrSend() {
      const request = this.__rodInspectorRequest;

      if (request) {
        request.startedAt = performance.now();

        this.addEventListener("loadend", () => {
          pushEventRecord({
            id: nextRecordId++,
            kind: "network",
            type: String(request.method || "GET"),
            action: "xhr",
            time: getTime(),
            targetLabel: String(request.url || ""),
            detail: `${this.status} ${Math.round(performance.now() - request.startedAt)}ms`,
            preview: `${request.method} ${request.url}`,
            refId: null,
            groupKey: `xhr:${request.method}:${request.url}:${this.status}`,
            count: 1,
          });
        });
      }

      return originalSend.apply(this, arguments);
    };
  }

  function storeObject(value, preferredId = null) {
    if (!isObjectLike(value)) return null;

    if (objectRefs.has(value)) return objectRefs.get(value);

    const id = preferredId ?? nextObjectId++;
    objectStore.set(id, value);

    try {
      objectRefs.set(value, id);
    } catch {}

    return id;
  }

  function getElementFromObject(value) {
    if (value instanceof Element) return value;
    if (value instanceof Node && value.parentElement) return value.parentElement;
    if (isNodeListLike(value)) return Array.from(value).find((node) => node instanceof Element) || null;
    if (value instanceof Event && value.target instanceof Element) return value.target;
    return null;
  }

  function setDollarZero(refId) {
    const value = objectStore.get(refId);
    const element = getElementFromObject(value);

    window.$0 = element || value;

    if (element) flashElement(element);

    addInspectorLog("info", "%c$0 updated", "color:#7dd3fc;font-weight:900", window.$0);
    emit("$0:updated", window.$0);
  }

  function focusObject(refId) {
    const value = objectStore.get(refId);
    const element = getElementFromObject(value);

    if (!element) {
      addInspectorLog("warn", "No element target for", value);
      return;
    }

    minimizeInspector();

    window.$0 = element;
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    flashElement(element);

    emit("element:focus", element);
  }

  function flashElement(element) {
    const previous = {
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
      transition: element.style.transition,
    };

    element.style.transition = "outline 160ms ease, outline-offset 160ms ease";
    element.style.outline = "4px solid rgba(125, 211, 252, .95)";
    element.style.outlineOffset = "5px";

    setTimeout(() => {
      element.style.outline = previous.outline;
      element.style.outlineOffset = previous.outlineOffset;
      element.style.transition = previous.transition;
    }, FLASH_MS);
  }

  function getEntries(value, basePath) {
    if (!isObjectLike(value)) return [];

    if (isNodeListLike(value) || Array.isArray(value)) {
      return Array.from(value).map((item, index) => ({ label: String(index), value: item, path: `${basePath}[${index}]` }));
    }

    if (value instanceof Map) {
      return Array.from(value.entries()).map(([key, item], index) => ({
        label: `entry ${index}`,
        value: { key, value: item },
        path: `${basePath}.map[${index}]`,
      }));
    }

    if (value instanceof Set) {
      return Array.from(value).map((item, index) => ({ label: String(index), value: item, path: `${basePath}.set[${index}]` }));
    }

    if (value instanceof Document) {
      return [
        ["documentElement", value.documentElement],
        ["head", value.head],
        ["body", value.body],
        ["scripts", Array.from(value.scripts || [])],
        ["stylesheets", Array.from(value.styleSheets || [])],
      ].map(([label, entryValue]) => ({ label, value: entryValue, path: `${basePath}.${label}` }));
    }

    if (value instanceof Element) {
      return [
        { label: "tagName", value: value.tagName, path: `${basePath}.tagName` },
        { label: "id", value: value.id, path: `${basePath}.id` },
        { label: "className", value: value.className, path: `${basePath}.className` },
        { label: "attributes", value: Array.from(value.attributes).map((attr) => ({ name: attr.name, value: attr.value })), path: `${basePath}.attributes` },
        { label: "dataset", value: { ...value.dataset }, path: `${basePath}.dataset` },
        { label: "children", value: Array.from(value.children), path: `${basePath}.children` },
        { label: "childNodes", value: Array.from(value.childNodes), path: `${basePath}.childNodes` },
        { label: "outerHTML", value: formatHtml(value.outerHTML || ""), path: `${basePath}.outerHTML` },
      ];
    }

    if (value instanceof Node) {
      return [
        { label: "nodeType", value: value.nodeType, path: `${basePath}.nodeType` },
        { label: "nodeName", value: value.nodeName, path: `${basePath}.nodeName` },
        { label: "nodeValue", value: value.nodeValue, path: `${basePath}.nodeValue` },
        { label: "textContent", value: value.textContent, path: `${basePath}.textContent` },
      ];
    }

    return Reflect.ownKeys(value).slice(0, MAX_TREE_ITEMS).map((key) => ({
      label: String(key),
      value: safeCall(() => value[key], "[Throws]"),
      path: `${basePath}.${String(key)}`,
    }));
  }

  function getObjectPreview(value) {
    if (!isObjectLike(value)) return escapeHtml(getNodeLabel(value));

    if (value instanceof Element) return `<span class="ra-element">${escapeHtml(formatElement(value))}</span>`;
    if (value instanceof Text) return `<span class="ra-object-type">${escapeHtml(getNodeLabel(value))}</span>`;
    if (value instanceof Document) return `<span class="ra-object-type">Document</span>`;
    if (value instanceof Window) return `<span class="ra-object-type">Window</span>`;

    if (isNodeListLike(value)) {
      const items = Array.from(value).slice(0, 4).map((node) => escapeHtml(getNodeLabel(node))).join(", ");
      return `<span class="ra-object-type">${escapeHtml(getNodeLabel(value))}</span> [${items}${value.length > 4 ? ", …" : ""}]`;
    }

    if (Array.isArray(value)) return `<span class="ra-object-type">Array(${value.length})</span>`;
    if (value instanceof Map) return `<span class="ra-object-type">Map(${value.size})</span>`;
    if (value instanceof Set) return `<span class="ra-object-type">Set(${value.size})</span>`;
    if (value instanceof Error) return `<span class="ra-object-type">${escapeHtml(value.name)}</span> ${escapeHtml(value.message)}`;
    if (typeof value === "function") return `<span class="ra-object-type">${escapeHtml(getNodeLabel(value))}</span>`;

    const keys = Reflect.ownKeys(value).slice(0, 5);
    const body = keys
      .map((key) => {
        const item = safeCall(() => value[key], "[Throws]");
        return `<span class="ra-key">${escapeHtml(String(key))}</span>: ${escapeHtml(stringifyPreview(item))}`;
      })
      .join(", ");

    return `<span class="ra-object-type">${escapeHtml(getNodeLabel(value))}</span> {${body}${Reflect.ownKeys(value).length > 5 ? ", …" : ""}}`;
  }

  function getNodeLabel(value) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    const type = typeof value;

    if (type === "string") return `"${trimText(value)}"`;
    if (type === "number" || type === "boolean") return String(value);
    if (type === "bigint") return `${value}n`;
    if (type === "symbol") return value.toString();
    if (type === "function") return `ƒ ${value.name || "anonymous"}()`;

    if (isNodeListLike(value)) return `${value instanceof HTMLCollection ? "HTMLCollection" : "NodeList"}(${value.length})`;
    if (value instanceof Window) return "Window";
    if (value instanceof Document) return "Document";
    if (value instanceof Element) return formatElement(value);
    if (value instanceof Text) return `Text("${trimText(value.textContent || "")}")`;
    if (value instanceof Comment) return "Comment";
    if (value instanceof Node) return `Node ${value.nodeName}`;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : `Date("${value.toISOString()}")`;
    if (value instanceof RegExp) return value.toString();
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value instanceof Map) return `Map(${value.size})`;
    if (value instanceof Set) return `Set(${value.size})`;
    if (ArrayBuffer.isView(value)) return `${value.constructor.name}(${value.length})`;
    if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`;
    if (isPlainObject(value)) return "Object";

    return value?.constructor?.name || "Object";
  }

  function getRichCode(value) {
    if (value instanceof HTMLStyleElement) return formatCss(value.textContent || "");
    if (value instanceof HTMLScriptElement) return stripCodeComments(dedent(value.textContent || ""));
    if (value instanceof HTMLTemplateElement) return formatHtml(value.innerHTML || "");
    if (value instanceof Element) return formatHtml(value.outerHTML || "");
    if (isNodeListLike(value)) return Array.from(value).map((node) => (node instanceof Element ? formatHtml(node.outerHTML || "") : String(node))).join("\n\n");
    if (typeof value === "function") return stripCodeComments(dedent(Function.prototype.toString.call(value)));
    return null;
  }

  function getCodeLanguage(value) {
    if (value instanceof HTMLStyleElement) return "css";
    if (value instanceof HTMLScriptElement || typeof value === "function") return "javascript";
    return "xml";
  }

  function formatValue(value, depth = 0, seen = new WeakSet()) {
    if (!isObjectLike(value)) return getNodeLabel(value);
    if (seen.has(value)) return "[Circular]";

    seen.add(value);

    const rich = getRichCode(value);
    if (rich) return rich;

    const keys = Reflect.ownKeys(value).slice(0, MAX_TREE_ITEMS);
    const body = keys
      .map((key) => {
        const item = safeCall(() => value[key], "[Throws]");
        return `${"  ".repeat(depth + 1)}${String(key)}: ${formatValue(item, depth + 1, seen)}`;
      })
      .join(",\n");

    return keys.length ? `{\n${body}\n${"  ".repeat(depth)}}` : "{}";
  }

  function stringifyPreview(value) {
    if (typeof value === "string") return value;
    return getNodeLabel(value);
  }

  function formatElement(element) {
    const tag = element.tagName ? element.tagName.toLowerCase() : "element";
    const id = element.id ? ` id="${escapeHtml(element.id)}"` : "";
    const className =
      typeof element.className === "string" && element.className.trim()
        ? ` class="${escapeHtml(element.className.trim().split(/\s+/).slice(0, 6).join(" "))}"`
        : "";

    return `<${tag}${id}${className}>`;
  }

  function formatHtml(value) {
    const lines = String(value)
      .replace(/>\s+</g, "><")
      .replace(/</g, "\n<")
      .replace(/>/g, ">\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    let level = 0;

    return lines
      .map((line) => {
        if (/^<\//.test(line)) level = Math.max(0, level - 1);

        const output = `${"  ".repeat(level)}${line}`;

        if (
          /^<[^/!][^>]*>$/.test(line) &&
          !/\/>$/.test(line) &&
          !/^<(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b/i.test(line)
        ) {
          level += 1;
        }

        return output;
      })
      .join("\n");
  }

  function formatCss(value) {
    return String(value)
      .replace(/\s*{\s*/g, " {\n  ")
      .replace(/;\s*/g, ";\n  ")
      .replace(/\s*}\s*/g, "\n}\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function dedent(value) {
    const lines = String(value).replace(/\r\n?/g, "\n").split("\n");

    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    const indent = lines.reduce((minimum, line) => {
      if (!line.trim()) return minimum;

      const size = line.match(/^\s*/)?.[0].length || 0;
      return minimum === null ? size : Math.min(minimum, size);
    }, null);

    return indent ? lines.map((line) => line.slice(indent)).join("\n") : lines.join("\n");
  }

  function stripCodeComments(value) {
    return String(value)
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .trim();
  }

  function sanitizeConsoleStyle(value) {
    return String(value)
      .split(";")
      .map((rule) => rule.trim())
      .filter(Boolean)
      .filter((rule) => !/url\s*\(|expression\s*\(|javascript:/i.test(rule))
      .join(";");
  }

  function formatPlaceholder(token, value) {
    if (token === "d" || token === "i") return String(Number.parseInt(String(value), 10));
    if (token === "f") return String(Number.parseFloat(String(value)));
    return String(value);
  }

  function describeTarget(target) {
    if (target === window) return "window";
    if (target === document) return "document";
    if (target instanceof Element) return formatElement(target);
    if (target instanceof Node) return `Node ${target.nodeName}`;
    return getNodeLabel(target);
  }

  function highlightCode(value, language = "javascript") {
    const code = String(value);

    if (window.hljs?.highlight) {
      try {
        return window.hljs.highlight(code, { language }).value;
      } catch {}
    }

    return escapeHtml(code);
  }

  function isObjectLike(value) {
    return (typeof value === "object" && value !== null) || typeof value === "function";
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object") return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function isNodeListLike(value) {
    return value instanceof NodeList || value instanceof HTMLCollection;
  }

  function copyText(value) {
    const text = String(value);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
      return;
    }

    fallbackCopyText(text);
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
    document.documentElement.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function trimText(value) {
    const text = String(value);
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
  }

  function safeCall(callback, fallback) {
    try {
      return callback();
    } catch {
      return fallback;
    }
  }

  function getTime() {
    return new Date().toLocaleTimeString();
  }

  function icon(name) {
    return html`<i data-lucide=${name} class="ra-icon" aria-hidden="true"></i>`;
  }

  function refreshIcons() {
    window.lucide?.createIcons?.({ attrs: { "stroke-width": 2 } });
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

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css`
      :root {
        --ra-panel: rgb(12 13 15 / .93);
        --ra-panel-2: rgb(18 19 22 / .96);
        --ra-border: rgb(255 255 255 / .10);
        --ra-border-strong: rgb(255 255 255 / .18);
        --ra-text: #e5e7eb;
        --ra-strong: #fff;
        --ra-muted: #9ca3af;
        --ra-faint: #6b7280;
        --ra-cyan: #7dd3fc;
        --ra-key: #8ab4ff;
        --ra-string: #7ee787;
        --ra-error-border: rgb(248 81 73 / .62);
        --ra-warning-border: rgb(251 191 36 / .5);
        --ra-radius-md: 14px;
        --ra-radius-lg: 22px;
        --ra-radius-pill: 999px;
        --ra-font-ui: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --ra-font-mono: "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, monospace;
        --ra-z: 9999998;
        --ra-shadow: 0 28px 90px rgb(0 0 0 / .72);
        --ra-blur: 22px;
      }

     html {
         scrollbar-gutter: stable; /* Reserva o espaço da barra mesmo quando escondida */
      }

      #${ROOT_ID},
      .ra-log-surface-host {
        font-family: var(--ra-font-ui);
        color: var(--ra-text);
        -webkit-font-smoothing: antialiased;
      }

      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: var(--ra-z);
        pointer-events: none;
      }

      #${ROOT_ID} *,
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
        background: linear-gradient(180deg, rgb(24 25 28 / .36), rgb(9 10 12 / .36));
        box-shadow: var(--ra-shadow);
        backdrop-filter: blur(var(--ra-blur));
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
        background: rgb(255 255 255 / .075);
        color: var(--ra-strong);
        font: 900 11px / 1 var(--ra-font-ui);
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
        background: linear-gradient(180deg, var(--ra-panel), rgb(6 7 9 / .98));
        box-shadow: var(--ra-shadow);
        backdrop-filter: blur(var(--ra-blur));
        
        &:active {
          outline: 1px solid rgba(255,255,255,0.2);
        }
      }

      .ra-panel.ra-open {
        display: grid;
      }
      
      
      body:has(.ra-open) {
        filter: brightness(50%);
        overflow: hidden;         
        /* Esconde a barra e trava o scroll no PC */
        touch-action: none;       
        /* Bloqueia o scroll por toque no celular (iOS/Android) */
        overscroll-behavior: none; 
        /* Garante que o scroll não vaze para o fundo */
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
        max-width: none !important;
        max-height: none !important;
        border-radius: 0 !important;
        border: 0;
        grid-template-rows: auto auto auto 1fr;
      }

      .ra-panel.ra-zen .ra-header {
        min-height: 34px;
        padding: 5px 7px;
      }

      .ra-panel.ra-zen .ra-title span,
      .ra-panel.ra-zen .ra-button span {
        display: none;
      }

      .ra-panel.ra-zen .ra-toolbar,
      .ra-panel.ra-zen .ra-filter-row {
        padding: 5px 7px;
      }

      .ra-panel.ra-zen .ra-tabs {
        padding: 5px 7px;
      }

      .ra-panel.ra-zen .ra-main {
        padding: 6px;
      }

      .ra-header,
      .ra-toolbar,
      .ra-tabs,
      .ra-actions,
      .ra-filter-row,
      .ra-inspect-actions,
      .ra-surface-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .ra-header {
        justify-content: space-between;
        min-height: 44px;
        padding: 8px 9px 8px 12px;
        border-bottom: 1px solid var(--ra-border);
        background: rgb(255 255 255 / .035);
        touch-action: none;
      }

      .ra-title {
        display: flex;
        align-items: center;
        gap: 9px;
        color: var(--ra-strong);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
        
        i {
          font-weight: 400;
          text-transform: none;
          font-style: normal;
          letter-spacing: initial; 
        }
      }

      .ra-toolbar,
      .ra-tabs,
      .ra-filter-row,
      .ra-surface-toolbar {
        padding: 8px;
        border-bottom: 1px solid var(--ra-border);
        background: rgb(0 0 0 / .14);
      }

      .ra-tabs {
        overflow-x: auto;
      }

      .ra-search,
      .ra-select {
        border: 1px solid var(--ra-border);
        border-radius: var(--ra-radius-pill);
        background: rgb(0 0 0 / .3);
        color: var(--ra-text);
        outline: 0;
      }

      .ra-search {
        flex: 1;
        height: 36px;
        padding: 0 14px;
        font: 650 12px / 1 var(--ra-font-ui);
      }

      .ra-select {
        min-width: 160px;
        height: 32px;
        padding: 0 10px;
        font: 650 11px / 1 var(--ra-font-ui);
      }

      .ra-button,
      .ra-tab,
      .ra-pill,
      .ra-load-more,
      .ra-tree-toggle {
        appearance: none;
        border: 1px solid var(--ra-border);
        border-radius: var(--ra-radius-pill);
        background: rgb(255 255 255 / .055);
        color: var(--ra-text);
        font: 400 11px / 1 var(--ra-font-ui);
        select-none;
      }

      .ra-button,
      .ra-tab,
      .ra-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 32px;
        padding: 7px 10px;
      }

      .ra-tab.ra-active {
        background: rgb(255 255 255 / .14);
        color: var(--ra-strong);
        font-weight: 600;
      }

      .ra-main,
      .ra-log-surface {
        min-height: 0;
        overflow: auto;
        padding: 8px;
        contain: content;
      }

      .ra-card {
        position: relative;
        display: grid;
        gap: 8px;
        margin-bottom: 8px;
        overflow: visible;
        border: 1px solid var(--ra-border);
        border-left: 3px solid transparent;
        border-radius: var(--ra-radius-md);
        background: var(--ra-card-bg, rgb(12 13 15 / .78));
      }

      .ra-kind-warn {
        border-left-color: var(--ra-warning-border);
      }

      .ra-kind-error {
        border-left-color: var(--ra-error-border);
      }

      .ra-card-head {
        position: sticky;
        top: 0;
        z-index: 4;
        display: grid;
        gap: 7px;
        padding: 10px 11px;
        background: var(--ra-card-head-bg, rgb(12 13 15 / .96));
        border-radius: var(--ra-radius-md) var(--ra-radius-md) 0 0;
        backdrop-filter: blur(14px);
      }

      .ra-no-sticky .ra-card-head {
        position: static;
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
        letter-spacing: .07em;
      }

      .ra-count {
        min-width: 22px;
        height: 20px;
        display: inline-grid;
        place-items: center;
        border-radius: 999px;
        background: rgb(255 255 255 / .11);
      }

      .ra-time {
        color: var(--ra-faint);
      }

      .ra-message,
      .ra-tree-row {
        font: 420 12px / 1.45 var(--ra-font-mono);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .ra-card-body {
        display: grid;
        gap: 8px;
        padding: 0 11px 10px;
      }

      .ra-object-card {
        display: grid;
        gap: 8px;
        overflow-x: auto;
      }

      .ra-inspect-actions {
        position: sticky;
        top: 48px;
        z-index: 3;
        flex-wrap: wrap;
        padding: 6px 0;
        background: rgb(12 13 15 / .88);
        backdrop-filter: blur(12px);
      }

      .ra-tree-row {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr);
        gap: 6px;
        align-items: start;
        padding: 4px 4px 4px calc(var(--ra-depth) * 18px);
        border-radius: 10px;
      }

      .ra-tree-row:hover {
        background: rgb(255 255 255 / .045);
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
        min-height: 42px;
      }

      .ra-empty {
        min-height: 140px;
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
        background: rgb(0 0 0 / .48);
        backdrop-filter: blur(10px);
      }

      .ra-modal {
        width: min(960px, calc(100vw - 14px));
        height: min(78vh, 760px);
        display: grid;
        grid-template-rows: auto 1fr;
        overflow: hidden;
        border: 1px solid var(--ra-border-strong);
        border-radius: 22px 22px 0 0;
        background: rgb(8 9 11 / .96);
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
        font: 850 12px / 1.2 var(--ra-font-ui);
      }

      .ra-modal-code {
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden; 
        margin: 0;
        padding: 12px;
        font: 12px / 1.45 var(--ra-font-mono);
        white-space: pre-wrap;
      }

      @media (max-width: 720px) {
        .ra-panel {
          inset:
            max(72px, env(safe-area-inset-top))
            max(8px, env(safe-area-inset-right))
            max(18px, env(safe-area-inset-bottom))
            max(8px, env(safe-area-inset-left));
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
      }
    `.toString();

    document.documentElement.appendChild(style);
  }
})();