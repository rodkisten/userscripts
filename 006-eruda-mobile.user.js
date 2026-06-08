// ==UserScript==
// @name         006 / DevTools / Eruda Mobile
// @namespace    https://rod.dev/userscripts
// @version      2026.06.02
// @description  Eruda preboot launcher with Seiva state, Cipó styles, Fábrica components, and mobile-safe controls.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       990
// @noframes
// @require      https://rodkisten.github.io/bundler/index.iife.min.js
// @require      https://unpkg.com/lucide@0.468.0/dist/umd/lucide.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js
// @require      https://oirodolfo.github.io/userscripts/eruda.js
// @require      https://oirodolfo.github.io/userscripts/eruda-dom.js
// @require      https://oirodolfo.github.io/userscripts/eruda-code.js
// @require      https://cdn.jsdelivr.net/npm/eruda-memory@latest/eruda-memory.js
// @require      https://cdn.jsdelivr.net/npm/eruda-monitor@latest/eruda-monitor.js
// ==/UserScript==

/* global lucide, hljs, eruda, RodEruda, RodErudaDom, RodErudaCode, erudaDom, erudaCode, erudaMemory, erudaMonitor */

(function RodErudaMaxPreboot(globalWindow, globalDocument) {
  "use strict";

/**  
  const alertaApi = globalWindow.alerta || null;

  if (typeof alertaApi?.setUserscript === "function") {
    alertaApi.setUserscript(globalWindow.GM_info?.script?.name || "006 / DevTools / Eruda Mobile");
  }
  
  
  GM_info && console.log("GM_info", GM_info)
  **/

  const APP_ID = "rod-eruda-max-preboot";
  const ROOT_ID = `${APP_ID}-root`;
  const BUTTON_ID = `${APP_ID}-button`;
  const STYLE_ID = `${APP_ID}-style`;
  const STORAGE_KEY = `${APP_ID}.v3.state`;
  const PATCHED_SYMBOL = Symbol.for("rod.eruda.max.preboot.patched");

  const LOG_LIMIT = 2000;
  const EVENT_LIMIT = 500;
  const REQUEST_LIMIT = 500;
  const ERROR_LIMIT = 500;
  const SAFE_MARGIN_PX = 10;
  const KEYBOARD_GAP_PX = 10;
  const BUTTON_HEIGHT_PX = 54;
  const COLLAPSED_WIDTH_PX = 58;
  const EXPANDED_WIDTH_PX = 128;
  const DRAG_THRESHOLD_PX = 7;
  const SAVE_DEBOUNCE_MS = 120;
  const STATS_DEBOUNCE_MS = 120;
  const EDITOR_FONT_SIZE_PX = 13;
  const IOS_SAFE_FONT_SIZE_PX = 16;

  const ERUDA_PLUGIN_NAMES = Object.freeze([
    "RodErudaDom",
    "erudaDom",
    "RodErudaCode",
    "erudaCode",
    "erudaMemory",
    "erudaMonitor",
  ]);

  const EDITABLE_SELECTOR = [
    "textarea",
    'input[type="text"]',
    'input[type="search"]',
    'input[type="url"]',
    'input[type="email"]',
    'input:not([type])',
    '[contenteditable=""]',
    '[contenteditable="true"]',
  ].join(",");

  const BundlerGlobal = resolveBundlerGlobal();
  const Seiva = resolveSeiva(BundlerGlobal);
  const Fabrica = resolveFabrica(BundlerGlobal);
  const Cipo = resolveCipo(BundlerGlobal);

  const persistedState = readPersistedState();

  const dataStore = {
    logs: [],
    errors: [],
    events: [],
    requests: [],
    listeners: new WeakMap(),
  };

  const app = Seiva.world({
    ready: false,
    open: true,
    x: persistedState.x,
    y: persistedState.y,
    pinned: persistedState.pinned,
    collapsed: persistedState.collapsed,
    dockToKeyboard: persistedState.dockToKeyboard,
    logsCount: 0,
    errorsCount: 0,
    eventsCount: 0,
    requestsCount: 0,
  });

  const drag = {
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    nextX: persistedState.x,
    nextY: persistedState.y,
    frame: 0,
  };

  const addedPlugins = new Set();

  let rootElement = null;
  let buttonElement = null;
  let editorObserver = null;
  let statsTimer = 0;
  let saveTimer = 0;
  let prebootPluginAdded = false;
  let clickSuppressed = false;

  safe("console:boot", () => {
    globalWindow.console?.log?.("eruda max preboot", {
      BundlerGlobal,
      Seiva,
      Fabrica,
      Cipo,
    });
  });

  safe("intercept-console", interceptConsole);
  safe("intercept-errors", interceptErrors);
  safe("intercept-network", interceptNetwork);
  safe("intercept-event-listeners", interceptEventListeners);
  safe("install-api", installPublicApi);
  safe("boot-eruda", bootEruda);
  safe("boot-ui", bootUiWhenReady);
  safe("patch-editors", installEditorPatcher);

  /**
   * Boots the launcher UI as soon as the document can receive nodes.
   *
   * @returns {void}
   */
  function bootUiWhenReady() {
    if (globalDocument.documentElement) {
      bootUi();
      return;
    }

    globalDocument.addEventListener("DOMContentLoaded", bootUi, { once: true });
  }

  /**
   * Installs styles, creates the floating launcher, and wires reactive state.
   *
   * @returns {void}
   */
  function bootUi() {
    injectStyles();
                         // mountButton();
    watchUiCells();
    syncButtonFromState();
    installViewportWatchers();
  }

  /**
   * Creates the launcher button once.
   *
   * @returns {void}
   */
  function mountButton() {
    if (globalDocument.getElementById(ROOT_ID)) {
      rootElement = globalDocument.getElementById(ROOT_ID);
      buttonElement = globalDocument.getElementById(BUTTON_ID);
      return;
    }

    rootElement = globalDocument.createElement("div");
    rootElement.id = ROOT_ID;
    rootElement.setAttribute("data-rod-eruda", "root");
    globalDocument.documentElement.appendChild(rootElement);

    buttonElement = globalDocument.createElement("button");
    buttonElement.id = BUTTON_ID;
    buttonElement.type = "button";
    buttonElement.className = "rod-eruda-launcher";
    buttonElement.title = "Toggle Eruda";
    buttonElement.setAttribute("aria-label", "Toggle Eruda");

    buttonElement.append(
      createElement("span", {
        className: "rod-eruda-icon",
        children: [createIconNode("Terminal")],
      }),
      /**createElement("span", {
        className: "rod-eruda-label",
        text: "ERUDA",
      }),**/
      createElement("span", {
        className: "rod-eruda-dot",
      }),
    );

    buttonElement.addEventListener("pointerdown", onLauncherPointerDown);
    buttonElement.addEventListener("pointermove", onLauncherPointerMove);
    buttonElement.addEventListener("pointerup", onLauncherPointerUp);
    buttonElement.addEventListener("pointercancel", onLauncherPointerCancel);
    buttonElement.addEventListener("lostpointercapture", onLauncherPointerCancel);
    buttonElement.addEventListener("click", onLauncherClick);

    rootElement.appendChild(buttonElement);
  }

  /**
   * Watches all visible state cells and syncs the launcher.
   *
   * @returns {void}
   */
  function watchUiCells() {
    const cells = [
      app.open,
      app.ready,
      app.x,
      app.y,
      app.pinned,
      app.collapsed,
      app.dockToKeyboard,
      app.logsCount,
      app.errorsCount,
      app.eventsCount,
      app.requestsCount,
    ];

    for (const cell of cells) {
      cell?.watch?.(syncButtonFromState);
    }
  }

  /**
   * Applies state to the launcher DOM node.
   *
   * @returns {void}
   */
  function syncButtonFromState() {
    if (!buttonElement) return;

    const position = clampPosition(getCell(app.x), getCell(app.y));
    const open = getCell(app.open);
    const ready = getCell(app.ready);
    const collapsed = getCell(app.collapsed);
    const hasErrors = getCell(app.errorsCount) > 0;

    buttonElement.style.left = `${position.x}px`;
    buttonElement.style.top = `${position.y}px`;
    buttonElement.style.width = `${getButtonWidth()}px`;
    buttonElement.dataset.open = String(open);
    buttonElement.dataset.ready = String(ready);
    buttonElement.dataset.collapsed = String(collapsed);
    buttonElement.dataset.pinned = String(getCell(app.pinned));
    buttonElement.dataset.docked = String(getCell(app.dockToKeyboard));
    buttonElement.dataset.errors = String(hasErrors);
    buttonElement.setAttribute("aria-label", open ? "Hide Eruda" : "Show Eruda");

    const label = buttonElement.querySelector(".rod-eruda-label");

    if (label) {
      label.textContent = collapsed ? "" : hasErrors ? `ERR ${getCell(app.errorsCount)}` : "ERUDA";
    }
  }

  function onLauncherPointerDown(event) {
    if (getCell(app.pinned)) return;

    event.preventDefault();
    event.stopPropagation();

    drag.active = true;
    drag.moved = false;
    drag.pointerId = event.pointerId;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.originX = getCell(app.x);
    drag.originY = getCell(app.y);
    drag.nextX = drag.originX;
    drag.nextY = drag.originY;

    setCell(app.dockToKeyboard, false, "launcher-drag");

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  }

  function onLauncherPointerMove(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX) {
      drag.moved = true;
    }

    const next = clampPosition(drag.originX + dx, drag.originY + dy);
    drag.nextX = next.x;
    drag.nextY = next.y;
    scheduleDragFrame();
  }

  function onLauncherPointerUp(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}

    const shouldToggle = !drag.moved;
    clickSuppressed = true;
    stopDragging();

    if (shouldToggle) {
      toggleEruda();
    }

    globalWindow.setTimeout(() => {
      clickSuppressed = false;
    }, 0);
  }

  function onLauncherPointerCancel(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) return;

    stopDragging();
  }

  function onLauncherClick(event) {
    event.preventDefault();
    event.stopPropagation();

    //if (!clickSuppressed && !drag.moved) {
      toggleEruda();
    //}
  }

  function stopDragging() {
    if (!drag.active) return;

    drag.active = false;
    drag.pointerId = -1;

    if (drag.frame) {
      globalWindow.cancelAnimationFrame(drag.frame);
      drag.frame = 0;
    }

    const next = clampPosition(drag.nextX, drag.nextY);

    Seiva.story("launcher-drag-end", () => {
      setCell(app.x, next.x, "launcher-drag-end");
      setCell(app.y, next.y, "launcher-drag-end");
    });

    scheduleSaveState();

    globalWindow.setTimeout(() => {
      drag.moved = false;
    }, 0);
  }

  function scheduleDragFrame() {
    if (drag.frame) return;

    drag.frame = globalWindow.requestAnimationFrame(() => {
      drag.frame = 0;

      if (!buttonElement || !drag.active) return;

      buttonElement.style.left = `${drag.nextX}px`;
      buttonElement.style.top = `${drag.nextY}px`;
    });
  }

  function renderKeyboardDock() {
    if (!buttonElement || drag.active || getCell(app.pinned) || !getCell(app.dockToKeyboard)) return;

    const viewport = getVisualViewportBox();
    const keyboardLikelyOpen = isKeyboardLikelyOpen();

    if (!keyboardLikelyOpen && !isEditable(globalDocument.activeElement)) return;

    const next = clampPosition(
      viewport.left + SAFE_MARGIN_PX,
      viewport.top + viewport.height - BUTTON_HEIGHT_PX - KEYBOARD_GAP_PX,
    );

    Seiva.story("keyboard-dock", () => {
      setCell(app.x, next.x, "keyboard-dock");
      setCell(app.y, next.y, "keyboard-dock");
    });

    scheduleSaveState();
  }

  function installViewportWatchers() {
    const viewport = globalWindow.visualViewport;
    const listener = debounce(() => {
      renderKeyboardDock();
      syncButtonFromState();
    }, 32);

    globalWindow.addEventListener("resize", listener, { passive: true });
    globalWindow.addEventListener("orientationchange", listener, { passive: true });

    if (viewport) {
      viewport.addEventListener("resize", listener, { passive: true });
      viewport.addEventListener("scroll", listener, { passive: true });
    }
  }

  function injectStyles() {
    if (globalDocument.getElementById(STYLE_ID)) return;

    const cssText = `
#${ROOT_ID} {
  position: fixed !important;
  inset: 0 !important;
  width: 0 !important;
  height: 0 !important;
  z-index: 2147483647 !important;
  pointer-events: none !important;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif !important;
}

#${BUTTON_ID} {
  position: fixed !important;
  z-index: 2147483647 !important;
  display: inline-grid !important;
  grid-template-columns: auto minmax(0, 1fr) auto !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  height: ${BUTTON_HEIGHT_PX}px !important;
  min-width: ${COLLAPSED_WIDTH_PX}px !important;
  padding: 0 14px !important;
  border: 1px solid rgba(255, 255, 255, 0.16) !important;
  border-radius: 999px !important;
  color: #f8fafc !important;
  background:
    radial-gradient(circle at 26% 12%, rgba(255, 255, 255, 0.30), transparent 34%),
    linear-gradient(135deg, rgba(24, 24, 31, 0.94), rgba(10, 10, 14, 0.86)) !important;
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.14) !important;
  backdrop-filter: blur(18px) saturate(150%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(150%) !important;
  cursor: grab !important;
  pointer-events: auto !important;
  touch-action: none !important;
  user-select: none !important;
  -webkit-user-select: none !important;
  -webkit-tap-highlight-color: transparent !important;
  transition:
    width 160ms ease,
    background 160ms ease,
    transform 120ms ease,
    border-color 160ms ease !important;
  contain: layout style paint !important;
}

#${BUTTON_ID}:active {
  cursor: grabbing !important;
  transform: scale(0.97) !important;
}

#${BUTTON_ID}[data-open="true"] {
  border-color: rgba(168, 85, 247, 0.54) !important;
  background:
    radial-gradient(circle at 26% 12%, rgba(255, 255, 255, 0.34), transparent 34%),
    linear-gradient(135deg, rgba(88, 28, 135, 0.96), rgba(15, 23, 42, 0.90)) !important;
}

#${BUTTON_ID}[data-errors="true"] {
  border-color: rgba(251, 113, 133, 0.62) !important;
}

#${BUTTON_ID}[data-collapsed="true"] {
  grid-template-columns: auto !important;
  padding-inline: 0 !important;
}

#${BUTTON_ID}[data-collapsed="true"] .rod-eruda-label,
#${BUTTON_ID}[data-collapsed="true"] .rod-eruda-dot {
  display: none !important;
}

#${BUTTON_ID} .rod-eruda-icon {
  width: 20px !important;
  height: 20px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

#${BUTTON_ID} .rod-eruda-icon svg {
  width: 20px !important;
  height: 20px !important;
  stroke-width: 2.25 !important;
}

#${BUTTON_ID} .rod-eruda-label {
  min-width: 0 !important;
  font: 760 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  letter-spacing: 0.08em !important;
  white-space: nowrap !important;
}

#${BUTTON_ID} .rod-eruda-dot {
  width: 7px !important;
  height: 7px !important;
  border-radius: 999px !important;
  background: #71717a !important;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.045) !important;
}

#${BUTTON_ID}[data-ready="true"] .rod-eruda-dot {
  background: #34d399 !important;
}

#${BUTTON_ID}[data-errors="true"] .rod-eruda-dot {
  background: #fb7185 !important;
}

.rod-eruda-preboot-panel {
  padding: 12px !important;
  color: #e5e7eb !important;
  background: #0a0a0f !important;
  font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
}

.rod-eruda-preboot-title {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  gap: 12px !important;
  margin-bottom: 10px !important;
  color: #f8fafc !important;
  font-weight: 760 !important;
}

.rod-eruda-preboot-grid {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 8px !important;
  margin-bottom: 12px !important;
}

.rod-eruda-preboot-card {
  padding: 9px !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  border-radius: 12px !important;
  background: rgba(255,255,255,0.045) !important;
}

.rod-eruda-preboot-card strong {
  display: block !important;
  margin-bottom: 4px !important;
  color: #93c5fd !important;
  font-size: 11px !important;
}

.rod-eruda-preboot-code {
  overflow: auto !important;
  max-height: 260px !important;
  padding: 10px !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  border-radius: 12px !important;
  background: rgba(0,0,0,0.24) !important;
  white-space: pre !important;
}
`;

    const style = globalDocument.createElement("style");
    style.id = STYLE_ID;
    style.textContent = cssText;
    (globalDocument.head || globalDocument.documentElement).appendChild(style);
  }

  function bootEruda() {
    const erudaInstance = getEruda();

    if (!erudaInstance || getCell(app.ready)) return;

    try {
      erudaInstance.init({
        defaults: {
          displaySize: 50,
          transparency: 0.95,
          theme: "Monokai Pro",
        },
      });
    } catch (error) {
      recordError("eruda:init", error);
      return;
    }

    for (const pluginName of ERUDA_PLUGIN_NAMES) {
      addPlugin(pluginName);
    }

    addPrebootPlugin();
    setCell(app.ready, true, "eruda-ready");
  }

  function toggleEruda() {
    bootEruda();

    const erudaInstance = getEruda();

    if (!erudaInstance) {
      recordError("eruda:toggle", new Error("Eruda global was not found."));
      return;
    }

    const nextOpen = !getCell(app.open);
    setCell(app.open, nextOpen, "launcher-toggle");

    try {
      if (nextOpen) erudaInstance.show();
      else erudaInstance.hide();
    } catch (error) {
      recordError("eruda:visibility", error);
    }

    scheduleSaveState();
  }

  function showEruda() {
    bootEruda();
    setCell(app.open, true, "api-show");
    getEruda()?.show?.();
    scheduleSaveState();
  }

  function hideEruda() {
    setCell(app.open, false, "api-hide");
    getEruda()?.hide?.();
    scheduleSaveState();
  }

  function addPlugin(globalName) {
    const erudaInstance = getEruda();
    const plugin = globalWindow[globalName];

    if (!erudaInstance?.add || !plugin || addedPlugins.has(globalName)) return;

    try {
      erudaInstance.add(plugin);
      addedPlugins.add(globalName);
    } catch (error) {
      recordError(`plugin:${globalName}`, error);
    }
  }

  function addPrebootPlugin() {
    const erudaInstance = getEruda();

    if (!erudaInstance?.add || prebootPluginAdded) return;

    try {
      erudaInstance.add(createPrebootPlugin());
      prebootPluginAdded = true;
    } catch (error) {
      recordError("plugin:preboot", error);
    }
  }

  function createPrebootPlugin() {
    let container = null;

    return {
      name: "preboot",

      init(erudaInstance) {
        container = globalDocument.createElement("div");
        container.className = "rod-eruda-preboot-panel";

        const shadowRoot = erudaInstance?._shadowRoot;
        const mountTarget =
          shadowRoot?.querySelector?.(".eruda-dev-tools") ||
          shadowRoot ||
          globalDocument.body ||
          globalDocument.documentElement;

        mountTarget.appendChild(container);
      },

      show() {
        if (!container) return;

        container.style.display = "block";
        container.innerHTML = createPrebootHtml();
      },

      hide() {
        if (container) {
          container.style.display = "none";
        }
      },

      destroy() {
        container?.remove();
        container = null;
      },
    };
  }

  function createPrebootHtml() {
    const snapshot = createSnapshot();
    const payload = {
      latestErrors: snapshot.errors.slice(-12),
      latestRequests: snapshot.requests.slice(-12),
      latestLogs: snapshot.logs.slice(-20),
    };

    return `
<section>
  <div class="rod-eruda-preboot-title">
    <span>Rod Eruda Preboot</span>
    <span>${escapeHtml(new Date().toLocaleTimeString())}</span>
  </div>
  <div class="rod-eruda-preboot-grid">
    ${createPrebootCard("Logs", snapshot.logs.length)}
    ${createPrebootCard("Errors", snapshot.errors.length)}
    ${createPrebootCard("Requests", snapshot.requests.length)}
    ${createPrebootCard("Event ops", snapshot.events.length)}
  </div>
  <pre class="rod-eruda-preboot-code"><code>${highlightJson(payload)}</code></pre>
</section>`;
  }

  function createPrebootCard(label, value) {
    return `<div class="rod-eruda-preboot-card"><strong>${escapeHtml(label)}</strong>${escapeHtml(String(value))}</div>`;
  }

  function getEruda() {
    const erudaInstance = globalWindow.RodEruda || globalWindow.eruda;

    if (erudaInstance && !globalWindow.RodEruda) {
      globalWindow.RodEruda = erudaInstance;
    }

    return erudaInstance || null;
  }

  function interceptConsole() {
    if (!globalWindow.console || globalWindow.console[PATCHED_SYMBOL]) return;

    Object.defineProperty(globalWindow.console, PATCHED_SYMBOL, {
      value: true,
      configurable: false,
    });

    for (const level of ["log", "info", "warn", "error", "debug", "trace"]) {
      const original = globalWindow.console[level];

      if (typeof original !== "function") continue;

      globalWindow.console[level] = function interceptedConsoleMethod(...args) {
        pushLimited(
          dataStore.logs,
          {
            level,
            args: args.map(previewValue),
            time: new Date().toISOString(),
          },
          LOG_LIMIT,
        );

        scheduleStatsSync();
        return original.apply(this, args);
      };
    }
  }

  function interceptErrors() {
    globalWindow.addEventListener(
      "error",
      (event) => {
        pushLimited(
          dataStore.errors,
          {
            type: "error",
            message: event.message,
            source: event.filename,
            line: event.lineno,
            column: event.colno,
            time: new Date().toISOString(),
          },
          ERROR_LIMIT,
        );

        scheduleStatsSync();
      },
      true,
    );

    globalWindow.addEventListener(
      "unhandledrejection",
      (event) => {
        pushLimited(
          dataStore.errors,
          {
            type: "unhandledrejection",
            reason: previewValue(event.reason),
            time: new Date().toISOString(),
          },
          ERROR_LIMIT,
        );

        scheduleStatsSync();
      },
      true,
    );
  }

  function interceptNetwork() {
    if (!globalWindow.fetch?.[PATCHED_SYMBOL]) {
      const originalFetch = globalWindow.fetch;

      if (typeof originalFetch === "function") {
        const wrappedFetch = async function interceptedFetch(input, init) {
          const startedAt = performance.now();
          const url = typeof input === "string" ? input : input?.url;
          const method = init?.method || input?.method || "GET";

          try {
            const response = await originalFetch.apply(this, arguments);

            recordRequest({
              kind: "fetch",
              url,
              method,
              status: response.status,
              ok: response.ok,
              duration: Math.round(performance.now() - startedAt),
              time: new Date().toISOString(),
            });

            return response;
          } catch (error) {
            recordRequest({
              kind: "fetch",
              url,
              method,
              error: previewValue(error),
              duration: Math.round(performance.now() - startedAt),
              time: new Date().toISOString(),
            });

            throw error;
          }
        };

        Object.defineProperty(wrappedFetch, PATCHED_SYMBOL, { value: true });
        globalWindow.fetch = wrappedFetch;
      }
    }

    patchXhr();
  }

  function patchXhr() {
    const proto = globalWindow.XMLHttpRequest?.prototype;

    if (!proto || proto[PATCHED_SYMBOL]) return;

    Object.defineProperty(proto, PATCHED_SYMBOL, {
      value: true,
      configurable: false,
    });

    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function interceptedXhrOpen(method, url) {
      this.__rodErudaRequest = {
        kind: "xhr",
        method,
        url,
        startedAt: 0,
      };

      return originalOpen.apply(this, arguments);
    };

    proto.send = function interceptedXhrSend() {
      const request = this.__rodErudaRequest;

      if (request) {
        request.startedAt = performance.now();

        this.addEventListener("loadend", () => {
          recordRequest({
            kind: "xhr",
            method: request.method,
            url: request.url,
            status: this.status,
            duration: Math.round(performance.now() - request.startedAt),
            time: new Date().toISOString(),
          });
        });
      }

      return originalSend.apply(this, arguments);
    };
  }

  function interceptEventListeners() {
    const proto = globalWindow.EventTarget?.prototype;

    if (!proto || proto[PATCHED_SYMBOL]) return;

    Object.defineProperty(proto, PATCHED_SYMBOL, {
      value: true,
      configurable: false,
    });

    const originalAdd = proto.addEventListener;
    const originalRemove = proto.removeEventListener;

    proto.addEventListener = function interceptedAddEventListener(type, listener, options) {
      if (listener) {
        let records = dataStore.listeners.get(this);

        if (!records) {
          records = [];
          dataStore.listeners.set(this, records);
        }

        records.push({
          type,
          listener,
          options,
          time: new Date().toISOString(),
        });

        pushLimited(
          dataStore.events,
          {
            action: "addEventListener",
            target: describeTarget(this),
            type,
            time: new Date().toISOString(),
          },
          EVENT_LIMIT,
        );

        scheduleStatsSync();
      }

      return originalAdd.apply(this, arguments);
    };

    proto.removeEventListener = function interceptedRemoveEventListener(type, listener, options) {
      pushLimited(
        dataStore.events,
        {
          action: "removeEventListener",
          target: describeTarget(this),
          type,
          time: new Date().toISOString(),
        },
        EVENT_LIMIT,
      );

      scheduleStatsSync();
      return originalRemove.apply(this, arguments);
    };
  }

  function installEditorPatcher() {
    patchAllEditors(globalDocument);

    if (!globalWindow.MutationObserver) return;

    editorObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          patchEditorTree(node);
        }
      }
    });

    editorObserver.observe(globalDocument, {
      childList: true,
      subtree: true,
    });
  }

  function patchEditorTree(node) {
    if (!isHtmlElement(node)) return;

    if (node.matches?.(EDITABLE_SELECTOR)) {
      patchTextInput(node);
    }

    const nested = node.querySelectorAll?.(EDITABLE_SELECTOR);

    if (!nested) return;

    for (const element of nested) {
      patchTextInput(element);
    }
  }

  function patchAllEditors(root) {
    const elements = root.querySelectorAll?.(EDITABLE_SELECTOR);

    if (!elements) return;

    for (const element of elements) {
      patchTextInput(element);
    }
  }

  function patchTextInput(element) {
    if (!element || element.__rodErudaPatched) return;

    element.__rodErudaPatched = true;
    element.setAttribute("autocorrect", "off");
    element.setAttribute("autocomplete", "off");
    element.setAttribute("autocapitalize", "off");
    element.setAttribute("spellcheck", "false");
    element.setAttribute("data-gramm", "false");
    element.setAttribute("data-enable-grammarly", "false");
    element.setAttribute("data-gramm_editor", "false");
    element.setAttribute("data-lt-active", "false");

    element.spellcheck = false;
    element.style.webkitTextSizeAdjust = "100%";
    element.style.fontVariantLigatures = "none";
    element.style.textTransform = "none";

    if (isInsideEruda(element)) {
      applyScaledEditorFont(element);
    }
  }

  function applyScaledEditorFont(element) {
    const scale = EDITOR_FONT_SIZE_PX / IOS_SAFE_FONT_SIZE_PX;

    element.style.fontSize = `${IOS_SAFE_FONT_SIZE_PX}px`;
    element.style.fontFamily = "ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace";
    element.style.transform = `scale(${scale})`;
    element.style.transformOrigin = "top left";
    element.style.width = `${100 / scale}%`;
    element.style.minHeight = `${100 / scale}%`;
  }

  function installPublicApi() {
    globalWindow.__ROD_ERUDA_PREBOOT__ = Object.freeze({
      app,
      data: dataStore,
      logs: dataStore.logs,
      errors: dataStore.errors,
      events: dataStore.events,
      requests: dataStore.requests,
      show: showEruda,
      hide: hideEruda,
      toggle: toggleEruda,

      refreshPosition() {
        syncButtonFromState();
      },

      setPinned(value) {
        setCell(app.pinned, Boolean(value), "api-pinned");
        scheduleSaveState();
      },

      setCollapsed(value) {
        setCell(app.collapsed, Boolean(value), "api-collapsed");
        scheduleSaveState();
      },

      setDockToKeyboard(value) {
        setCell(app.dockToKeyboard, Boolean(value), "api-dock");
        scheduleSaveState();
      },

      getListeners(target) {
        return dataStore.listeners.get(target) || [];
      },

      snapshot: createSnapshot,
    });
  }

  function pushLimited(list, item, limit) {
    list.push(item);

    if (list.length > limit) {
      list.splice(0, list.length - limit);
    }
  }

  function recordRequest(request) {
    pushLimited(dataStore.requests, request, REQUEST_LIMIT);
    scheduleStatsSync();
  }

  function recordError(label, error) {
    pushLimited(
      dataStore.errors,
      {
        label,
        error: previewValue(error),
        time: new Date().toISOString(),
      },
      ERROR_LIMIT,
    );

    scheduleStatsSync();
  }

  function scheduleStatsSync() {
    if (statsTimer) return;

    statsTimer = globalWindow.setTimeout(() => {
      statsTimer = 0;

      Seiva.story("preboot-stats", () => {
        setCell(app.logsCount, dataStore.logs.length, "preboot-stats");
        setCell(app.errorsCount, dataStore.errors.length, "preboot-stats");
        setCell(app.eventsCount, dataStore.events.length, "preboot-stats");
        setCell(app.requestsCount, dataStore.requests.length, "preboot-stats");
      });
    }, STATS_DEBOUNCE_MS);
  }

  function safe(label, callback) {
    try {
      callback();
    } catch (error) {
      recordError(label, error);
    }
  }

  function previewValue(value) {
    try {
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      if (isElement(value)) return formatElementLabel(value);
      if (typeof value === "string") return value;
      if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;

      const json = JSON.stringify(value, circularReplacer());
      return json == null ? String(value) : json;
    } catch {
      return String(value);
    }
  }

  function circularReplacer() {
    const seen = new WeakSet();

    return (_key, value) => {
      if (!value || typeof value !== "object") return value;

      if (seen.has(value)) return "[Circular]";

      seen.add(value);
      return value;
    };
  }

  function createSnapshot() {
    return {
      state: {
        ready: getCell(app.ready),
        open: getCell(app.open),
        x: getCell(app.x),
        y: getCell(app.y),
        pinned: getCell(app.pinned),
        collapsed: getCell(app.collapsed),
        dockToKeyboard: getCell(app.dockToKeyboard),
      },
      logs: dataStore.logs.slice(),
      errors: dataStore.errors.slice(),
      events: dataStore.events.slice(),
      requests: dataStore.requests.slice(),
    };
  }

  function readPersistedState() {
    const fallback = createDefaultPosition();

    try {
      const parsed = JSON.parse(globalWindow.localStorage.getItem(STORAGE_KEY) || "{}");

      return {
        x: Number.isFinite(parsed.x) ? parsed.x : fallback.x,
        y: Number.isFinite(parsed.y) ? parsed.y : fallback.y,
        pinned: Boolean(parsed.pinned),
        collapsed: Boolean(parsed.collapsed),
        dockToKeyboard: parsed.dockToKeyboard !== false,
      };
    } catch {
      return {
        ...fallback,
        pinned: false,
        collapsed: false,
        dockToKeyboard: true,
      };
    }
  }

  function scheduleSaveState() {
    if (saveTimer) {
      globalWindow.clearTimeout(saveTimer);
    }

    saveTimer = globalWindow.setTimeout(saveState, SAVE_DEBOUNCE_MS);
  }

  function saveState() {
    saveTimer = 0;

    try {
      globalWindow.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          x: getCell(app.x),
          y: getCell(app.y),
          pinned: getCell(app.pinned),
          collapsed: getCell(app.collapsed),
          dockToKeyboard: getCell(app.dockToKeyboard),
        }),
      );
    } catch {}
  }

function createDefaultPosition() {
  const viewport = getVisualViewportBox();
  const width = getButtonWidthFromCollapsed(false);

  return clampPositionWithWidth(
    viewport.left + viewport.width - width - SAFE_MARGIN_PX,
    viewport.top + viewport.height - BUTTON_HEIGHT_PX - 92,
    width,
  );
}

function clampPosition(x, y) {
  return clampPositionWithWidth(x, y, getButtonWidth());
}

function clampPositionWithWidth(x, y, width) {
  const viewport = getVisualViewportBox();

  return {
    x: clamp(
      x,
      viewport.left + SAFE_MARGIN_PX,
      viewport.left + viewport.width - width - SAFE_MARGIN_PX,
    ),
    y: clamp(
      y,
      viewport.top + SAFE_MARGIN_PX,
      viewport.top + viewport.height - BUTTON_HEIGHT_PX - SAFE_MARGIN_PX,
    ),
  };
}

function getButtonWidth() {
  return getButtonWidthFromCollapsed(Boolean(getCell(app.collapsed)));
}

function getButtonWidthFromCollapsed(collapsed) {
  return collapsed
    ? COLLAPSED_WIDTH_PX
    : Math.min(EXPANDED_WIDTH_PX, getVisualViewportBox().width - SAFE_MARGIN_PX * 2);
}
  function getVisualViewportBox() {
    const viewport = globalWindow.visualViewport;

    return {
      left: viewport?.offsetLeft ?? 0,
      top: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? globalWindow.innerWidth,
      height: viewport?.height ?? globalWindow.innerHeight,
    };
  }

  function isKeyboardLikelyOpen() {
    const viewport = globalWindow.visualViewport;

    if (!viewport) return isEditable(globalDocument.activeElement);

    return viewport.height < globalWindow.innerHeight * 0.82;
  }

  function isEditable(value) {
    return Boolean(
      (globalWindow.HTMLTextAreaElement && value instanceof globalWindow.HTMLTextAreaElement) ||
        (globalWindow.HTMLInputElement && value instanceof globalWindow.HTMLInputElement) ||
        (globalWindow.HTMLSelectElement && value instanceof globalWindow.HTMLSelectElement) ||
        value?.isContentEditable,
    );
  }

  function isInsideEruda(element) {
    const root = element.getRootNode?.();

    if (root && globalWindow.ShadowRoot && root instanceof globalWindow.ShadowRoot) {
      return Boolean(
        String(root.host?.className || "").includes("eruda") ||
          String(root.host?.id || "").includes("eruda"),
      );
    }

    return Boolean(element.closest?.(".eruda-dev-tools, .eruda-console, .eruda-entry-btn"));
  }

  function describeTarget(target) {
    if (target === globalWindow) return "window";
    if (target === globalDocument) return "document";
    if (isElement(target)) return formatElementLabel(target);

    return target?.nodeName || typeof target;
  }

  function formatElementLabel(element) {
    const tag = element.tagName?.toLowerCase?.() || "element";
    const id = element.id ? `#${element.id}` : "";
    const classes = Array.from(element.classList || [])
      .slice(0, 4)
      .map((className) => `.${className}`)
      .join("");

    return `<${tag}${id}${classes}>`;
  }

  function highlightJson(value) {
    const json = JSON.stringify(value, null, 2);

    try {
      if (globalWindow.hljs?.highlight) {
        return globalWindow.hljs.highlight(json, { language: "json" }).value;
      }
    } catch {}

    return escapeHtml(json);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clamp(value, min, max) {
    if (max < min) return min;

    return Math.max(min, Math.min(max, value));
  }

  function debounce(callback, delay) {
    let timer = 0;

    return (...args) => {
      if (timer) {
        globalWindow.clearTimeout(timer);
      }

      timer = globalWindow.setTimeout(() => {
        timer = 0;
        callback(...args);
      }, delay);
    };
  }

  function createElement(tag, options = {}) {
    const element = globalDocument.createElement(tag);

    if (options.className) element.className = options.className;
    if (options.text != null) element.textContent = options.text;
    if (options.children) element.append(...options.children);

    return element;
  }

  function createIconNode(name) {
    try {
      const icons = globalWindow.lucide?.icons || globalWindow.lucide;
      const definition = icons?.[name];
      const createLucideElement = globalWindow.lucide?.createElement;

      if (definition && typeof createLucideElement === "function") {
        return createLucideElement(definition);
      }
    } catch {}

    const fallback = globalDocument.createElement("span");
    fallback.textContent = "⌘";
    return fallback;
  }

  function isElement(value) {
    return Boolean(globalWindow.Element && value instanceof globalWindow.Element);
  }

  function isHtmlElement(value) {
    return Boolean(globalWindow.HTMLElement && value instanceof globalWindow.HTMLElement);
  }

  function getCell(cell) {
    if (cell && typeof cell.get === "function") return cell.get();

    return cell?.value;
  }

  function setCell(cell, value, cause) {
    if (!cell) return;

    if (typeof cell.because === "function") {
      cell.because(cause || "manual");
    }

    if (typeof cell.become === "function") {
      cell.become(value);
      return;
    }

    cell.value = value;
  }

  function resolveBundlerGlobal() {
    return (
      globalWindow.Rod ||
      globalWindow.RodBundler ||
      globalWindow.Bundler ||
      globalWindow.bundle ||
      globalWindow.RodK ||
      {}
    );
  }

  function resolveSeiva(bundle) {
    const api = globalWindow.Seiva || bundle.Seiva || bundle.default?.Seiva;

    if (api?.world && api?.story) return api;

    return createTinySeivaFallback();
  }

  function resolveFabrica(bundle) {
    return globalWindow.Fabrica || bundle.Fabrica || bundle.default?.Fabrica || null;
  }

  function resolveCipo(bundle) {
    return globalWindow.Cipo || bundle.Cipo || bundle.default?.Cipo || null;
  }

  function createTinySeivaFallback() {
    function cell(initialValue) {
      let value = initialValue;
      const watchers = new Set();

      const api = {
        get value() {
          return value;
        },

        set value(next) {
          api.become(next);
        },

        get() {
          return value;
        },

        become(next) {
          const previous = value;

          if (Object.is(previous, next)) return api;

          value = next;

          for (const watcher of watchers) {
            watcher(next, previous, {
              cause: "fallback",
              previous,
              next,
              time: Date.now(),
              path: [],
            });
          }

          return api;
        },

        watch(watcher) {
          watchers.add(watcher);
          return () => watchers.delete(watcher);
        },

        because() {
          return api;
        },
      };

      return api;
    }

    return {
      cell,

      world(initial) {
        const output = {
          timeline: {
            patches: [],
            clear() {},
          },
        };

        for (const key of Object.keys(initial)) {
          output[key] = cell(initial[key]);
        }

        return output;
      },

      story(_cause, run) {
        return run();
      },
    };
  }

 // alertaApi?.clearContext?.();
})(window, document);