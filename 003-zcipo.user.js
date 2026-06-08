// ==UserScript==
// @name         003 / Cipó Kitchen Sink
// @namespace    https://rod.dev/userscripts
// @version      1.1.0
// @description  Kitchen sink panel for Cipó: css, inline.css, aliases, helpers, theme-in-config, JIT cache, layers, REM, dark mode, responsive, scoped selectors and debug.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       800
// @grant        none
// @noframes
// @require      https://rodkisten.github.io/bundler/cipo.iife.js?v3
// @require      https://rodkisten.github.io/bundler/index.iife.js
// ==/UserScript==

(function RodCipoKitchenSink() {
  "use strict";

   //window.Cipo ??= Cipo;

  /* ==========================================================================
   * Constants
   * ========================================================================== */

  const SCRIPT_NAME = "RodCipoKitchenSink";
  const HOST_ID = "__rod_cipo_kitchen_sink__";
  const STORAGE_KEY = "rod.cipo.kitchen-sink.v1.1.0";

  const DEFAULT_STATE = {
    x: 12,
    y: 78,
    width: 410,
    height: 650,
    collapsed: false,
    tab: "preview",
    dark: true,
    minify: false,
    important: false,
    rem: true,
    colorMode: "oklch",
  };

  /* ==========================================================================
   * Runtime
   * ========================================================================== */

  const Cipo = window.Cipo || window?.Rod?.Cipo;

  if (!Cipo) {
    console.warn(`[${SCRIPT_NAME}] Cipó global not found.`);
    return;
  }

   console.log("dentro do script do cipo kitchen sink", Cipo)


  const {
    css,
    inline,
    cipo,
    configure,
    setup,
    registerAlias,
    registerHelper,
    injectGlobal,
    injectStyle,
    explain,
    getCssText,
    reset,
  } = Cipo;

  const state = {
    ...DEFAULT_STATE,
    ...readJson(STORAGE_KEY, {}),
  };

  const refs = {
    host: null,
    shadow: null,
    root: null,
  };

  /* ==========================================================================
   * Cipó Configuration
   * ========================================================================== */

  /**
   * Configures Cipó with the newest API.
   *
   * @returns {void}
   *
   * @example
   * configureCipo();
   * // Registers theme, aliases, helpers, layers, REM and JIT options.
   */
  function configureCipo() {
    const configureRuntime = setup || configure;

    configureRuntime({
      prefix: "rod",
      debug: true,
      important: state.important,
      minify: state.minify,
      layers: true,
      rem: {
        enabled: state.rem,
        baseFontSize: 16,
      },
      colorMode: state.colorMode,
      darkSelector: '[data-cipo-theme="dark"]',
      themeRootSelector: ":root, :host",
      jit: {
        enabled: true,
        cache: true,
        maxEntries: 3000,
        debug: true,
      },
      breakpoints: {
        sm: "(min-width: 480px)",
        md: "(min-width: 768px)",
        lg: "(min-width: 1024px)",
      },
      theme: {
        colors: {
          brand: "#f97316",
          primary: "#fb923c",
          panel: "#0f172a",
          panel2: "#111827",
          ink: "#f8fafc",
          muted: "#94a3b8",
          border: "rgb(255 255 255 / 0.13)",
          danger: "#ef4444",
          success: "#84cc16",
          cyan: "#22d3ee",
        },
        spacing: "0.25rem",
        radius: {
          sm: "8px",
          md: "12px",
          lg: "18px",
          xl: "24px",
          pill: "999px",
        },
        shadow: {
          glow: "0 0 0 1px rgb(249 115 22 / 0.20), 0 24px 90px rgb(249 115 22 / 0.18)",
          panel: "0 28px 100px rgb(0 0 0 / 0.45)",
        },
        text: {
          sm: "0.875rem",
          md: "1rem",
          lg: "1.25rem",
          xl: "1.75rem",
        },
      },
    });

    registerCipoExtensions();
  }

  /**
   * Registers kitchen-sink helpers and aliases.
   *
   * @returns {void}
   *
   * @example
   * registerAlias("glass", "bg: alpha($panel / 72%);");
   */
  function registerCipoExtensions() {
    registerHelper?.("outlineGlow", args => {
      const value = args.trim() || "$brand";
      return `0 0 0 3px alpha(${value} / 28%)`;
    });

    registerHelper?.("softBorder", args => {
      const value = args.trim() || "$border";
      return `1px solid ${value}`;
    });

    registerAlias?.(
      "glass",
      `
        bg: alpha($panel / 76%);
        border: softBorder(alpha($ink / 12%));
        backdrop-filter: blur(18px) saturate(140%);
      `,
    );

    registerAlias?.(
      "centerStack",
      `
        display: flex;
        align-items: center;
        justify-content: center;
      `,
    );

    registerAlias?.(
      "buttonBase",
      `
        px: 4;
        py: 2;
        rounded: $md;
        cursor: pointer;
        user-select: none;
        transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
      `,
    );

    registerAlias?.(
      "focusRing",
      `
        x:focus-visible {
          outline: 2px solid $brand;
          outline-offset: 2px;
        }
      `,
    );

    registerAlias?.(
      "interactive",
      `
        x:hover {
          transform: translateY(-1px);
        }

        x:active {
          transform: scale(.985);
        }
      `,
    );
  }

  /* ==========================================================================
   * Styles
   * ========================================================================== */

  configureCipo();

  injectGlobal?.`
    :root {
      color-scheme: dark;
    }
  `;

  const shellClass = css`
    glass;

    color: $ink;
    width: 100%;
    height: 100%;
    overflow: hidden;
    rounded: $xl;
    shadow: $panel;

    x:dark {
      bg: gradient(linear, 145deg, #020617, #111827);
    }

    x:hover {
      border-color: alpha($brand / 55%);
    }
  `;

  const topbarClass = css`
    px: 4;
    py: 3;

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 3;
    border-bottom: softBorder(alpha($ink / 12%));
    bg: alpha($brand / 10%);

    .title {
      text(size: lg, lh: 1.05, weight: 900, color: $ink, tracking: -0.04em);
    }

    .subtitle {
      mt: 1;
      text(size: sm, lh: 1.3, color: $muted);
    }
  `;

  const buttonClass = css`
    buttonBase;
    focusRing;
    interactive;

    color: $ink;
    border: softBorder(alpha($ink / 14%));
    bg: alpha($brand / 18%);
    font-weight: 800;

    x:hover {
      bg: alpha($brand / 30%);
      border-color: alpha($brand / 65%);
    }
  `;

  const tabClass = css`
    px: 3;
    py: 2;
    rounded: $md;

    border: 1px solid transparent;
    color: $muted;
    bg: transparent;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;

    &[data-active="true"] {
      color: $ink;
      bg: alpha($brand / 24%);
      border-color: alpha($brand / 52%);
    }
  `;

  const contentClass = css`
    p: 3;
    display: grid;
    gap: 3;
    height: calc(100% - 78px);
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  `;

  const cardClass = css`
    glass;

    p: 4;
    rounded: $lg;
    min-height: 92px;

    h3 {
      m: 0 0 8px;
      text(size: md, lh: 1.2, weight: 850, color: $ink);
    }

    p {
      m: 0;
      text(size: sm, lh: 1.55, color: $muted);
    }

    code {
      color: $cyan;
    }
  `;

  const gridClass = css`
    display: grid;
    gap: 3;
    grid-template-columns: 1fr;

    x:md {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  `;

  const badgeClass = css`
    px: 3;
    py: 1;
    rounded: $pill;

    display: inline-flex;
    align-items: center;
    gap: 2;
    color: $success;
    bg: alpha($success / 14%);
    border: softBorder(alpha($success / 34%));
    font-size: 12px;
    font-weight: 900;
  `;

  const inlineBadgeStyle = inline.css`
    px: 2;
    py: 1;
    rounded: $md;
    color: saturate($primary, 20%);
    bg: alpha($brand / 14%);
    text(size: sm, lh: 1.35, weight: 800, decoration: underline, shadow: 0 2px 8px rgb(0 0 0 / 0.24));
  `;

  /* ==========================================================================
   * Boot
   * ========================================================================== */

  createPanel();
  renderPanel();
  renderKitchenSink();

  /* ==========================================================================
   * Panel
   * ========================================================================== */

  /**
   * Creates the panel host.
   *
   * @returns {void}
   *
   * @example
   * createPanel();
   * // Adds a fixed-position host with Shadow DOM.
   */
  function createPanel() {
    document.getElementById(HOST_ID)?.remove();

    refs.host = document.createElement("div");
    refs.host.id = HOST_ID;
    refs.host.dataset.cipoTheme = state.dark ? "dark" : "light";

    Object.assign(refs.host.style, {
      position: "fixed",
      left: `${state.x}px`,
      top: `${state.y}px`,
      width: `min(${state.width}px, calc(100vw - 16px))`,
      height: state.collapsed ? "auto" : `min(${state.height}px, calc(100vh - 24px))`,
      zIndex: "2147483647",
      colorScheme: "dark",
      transform: "translate3d(0,0,0)",
    });

    refs.shadow = refs.host.attachShadow({ mode: "open" });

    const baseStyle = document.createElement("style");
    baseStyle.textContent = `
      :host {
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "SF Pro Display", "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      button,
      textarea,
      input {
        font: inherit;
      }

      button {
        -webkit-tap-highlight-color: transparent;
      }

      pre,
      textarea,
      code {
        font-family:
          "SF Mono", ui-monospace, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
      }

      .hidden {
        display: none !important;
      }

      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 10px 12px 0;
      }

      .actions {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }

      .output {
        width: 100%;
        min-height: 310px;
        border: 1px solid rgb(255 255 255 / 0.12);
        border-radius: 16px;
        background: rgb(2 6 23 / 0.78);
        color: #e5e7eb;
        padding: 12px;
        resize: vertical;
        outline: none;
        font-size: 12px;
        line-height: 1.55;
        white-space: pre;
      }

      .switches {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .switch {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #cbd5e1;
        font-size: 12px;
        user-select: none;
      }

      .switch input {
        accent-color: #f97316;
      }

      @media (max-width: 560px) {
        :host {
          left: 8px !important;
          right: 8px !important;
          width: calc(100vw - 16px) !important;
        }
      }
    `;

    refs.root = document.createElement("div");

    refs.shadow.append(baseStyle, refs.root);
    injectStyle?.(refs.shadow, [shellClass, topbarClass, buttonClass, tabClass, contentClass, cardClass, gridClass, badgeClass]);
    document.documentElement.appendChild(refs.host);

    makeDraggable(refs.host);
  }

  /**
   * Renders panel shell.
   *
   * @returns {void}
   *
   * @example
   * renderPanel();
   */
  function renderPanel() {
    refs.host.dataset.cipoTheme = state.dark ? "dark" : "light";
    refs.host.style.height = state.collapsed ? "auto" : `min(${state.height}px, calc(100vh - 24px))`;

    refs.root.innerHTML = `
      <section class="${shellClass}">
        <header class="${topbarClass}" data-drag-handle>
          <div>
            <div class="title">Cipó Kitchen Sink 🌿</div>
            <div class="subtitle">aliases, helpers, inline.css, JIT, theme configure, layers</div>
          </div>

          <div class="actions">
            <button class="${buttonClass}" data-action="run">Run</button>
            <button class="${buttonClass}" data-action="reset">Reset CSS</button>
            <button class="${buttonClass}" data-action="collapse">${state.collapsed ? "Open" : "Hide"}</button>
            <button class="${buttonClass}" data-action="close">×</button>
          </div>
        </header>

        <div class="${state.collapsed ? "hidden" : ""}">
          <nav class="tabs">
            ${tab("preview", "Preview")}
            ${tab("css", "CSS")}
            ${tab("inline", "Inline")}
            ${tab("debug", "Debug")}
            ${tab("code", "Code")}
          </nav>

          <main class="${contentClass}">
            ${renderControls()}

            <section data-tab-panel="preview" class="${state.tab === "preview" ? "" : "hidden"}">
              <div class="${gridClass}" data-preview></div>
            </section>

            <section data-tab-panel="css" class="${state.tab === "css" ? "" : "hidden"}">
              <textarea class="output" data-css-output spellcheck="false"></textarea>
            </section>

            <section data-tab-panel="inline" class="${state.tab === "inline" ? "" : "hidden"}">
              <textarea class="output" data-inline-output spellcheck="false"></textarea>
            </section>

            <section data-tab-panel="debug" class="${state.tab === "debug" ? "" : "hidden"}">
              <textarea class="output" data-debug-output spellcheck="false"></textarea>
            </section>

            <section data-tab-panel="code" class="${state.tab === "code" ? "" : "hidden"}">
              <textarea class="output" data-code-output spellcheck="false"></textarea>
            </section>
          </main>
        </div>
      </section>
    `;

    refs.root.onclick = handleClick;
    refs.root.onchange = handleChange;
  }

  /**
   * Renders a tab button.
   *
   * @param {string} name Tab key.
   * @param {string} label Tab label.
   * @returns {string} HTML string.
   *
   * @example
   * tab("preview", "Preview");
   */
  function tab(name, label) {
    return `<button class="${tabClass}" data-tab="${name}" data-active="${String(state.tab === name)}">${label}</button>`;
  }

  /**
   * Renders runtime controls.
   *
   * @returns {string} HTML string.
   *
   * @example
   * renderControls();
   */
  function renderControls() {
    return `
      <section class="${cardClass}">
        <h3>Runtime controls</h3>
        <div class="switches">
          ${renderSwitch("dark", "Dark", state.dark)}
          ${renderSwitch("minify", "Minify", state.minify)}
          ${renderSwitch("important", "Important", state.important)}
          ${renderSwitch("rem", "REM", state.rem)}
        </div>
      </section>
    `;
  }

  /**
   * Renders a checkbox switch.
   *
   * @param {string} key State key.
   * @param {string} label Switch label.
   * @param {boolean} checked Checked state.
   * @returns {string} HTML string.
   *
   * @example
   * renderSwitch("dark", "Dark", true);
   */
  function renderSwitch(key, label, checked) {
    return `
      <label class="switch">
        <input type="checkbox" data-toggle="${key}" ${checked ? "checked" : ""} />
        <span>${label}</span>
      </label>
    `;
  }

  /* ==========================================================================
   * Kitchen Sink
   * ========================================================================== */

  /**
   * Renders all Cipó examples into the panel.
   *
   * @returns {void}
   *
   * @example
   * renderKitchenSink();
   */
  function renderKitchenSink() {
    const preview = refs.root.querySelector("[data-preview]");
    const cssOutput = refs.root.querySelector("[data-css-output]");
    const inlineOutput = refs.root.querySelector("[data-inline-output]");
    const debugOutput = refs.root.querySelector("[data-debug-output]");
    const codeOutput = refs.root.querySelector("[data-code-output]");

    if (!preview) return;

    const Button = cipo.button.css`
      buttonBase;
      focusRing;
      interactive;

      bg: $brand;
      color: $ink;
      border: 0;
      font-weight: 900;

      x:hover {
        bg: alpha($brand / 70%);
      }
    `;

    const domButton = Button({
      children: "DOM factory button",
      class: "extra-button",
      onclick: () => console.log("[Cipó Kitchen Sink] DOM factory button clicked"),
    });

    preview.innerHTML = `
      ${tile("Alias identifiers", "glass; buttonBase; interactive; focusRing;")}
      ${tile("Token inference", "Use $brand, $ink, $xl, $glow without $theme.")}
      ${tile("Property aliases", "px: 4; py: 2; bg: $panel; rounded: $xl;")}
      ${tile("Helpers", "alpha(), gradient(), fluid(), spacing(), outlineGlow().")}
      ${tile("inline.css", `<span style="${String(inlineBadgeStyle)}">inline style artifact</span>`)}
      ${tile("Responsive", "x:md, x:not(md), x:dark, x:hover")}
      ${tile("Debug", escapeHtml(renderFirstExplain()))}
      ${tile("Factory", domButton instanceof Element ? domButton.outerHTML : escapeHtml(JSON.stringify(domButton)))}
    `;

    if (cssOutput) cssOutput.value = getCssText?.() || "";
    if (inlineOutput) inlineOutput.value = String(inlineBadgeStyle);
    if (debugOutput) debugOutput.value = renderDebugJson();
    if (codeOutput) codeOutput.value = renderCodeSample();
  }

  /**
   * Renders a demo tile.
   *
   * @param {string} title Tile title.
   * @param {string} body Tile body.
   * @returns {string} HTML string.
   *
   * @example
   * tile("CSS", "px: 4;");
   */
  function tile(title, body) {
    return `
      <article class="${cardClass}">
        <h3>${title}</h3>
        <p>${body}</p>
      </article>
    `;
  }

  /**
   * Renders explain() sample text.
   *
   * @returns {string} Debug text.
   *
   * @example
   * renderFirstExplain();
   */
  function renderFirstExplain() {
    const firstClass = String(buttonClass).split(/\s+/).find(Boolean);
    const info = firstClass && explain ? explain(firstClass) : null;

    if (!info || !info.found) return "explain(): no atom found";

    return `${info.className} => ${info.atom.property}: ${info.atom.value}`;
  }

  /**
   * Renders debug JSON.
   *
   * @returns {string} JSON text.
   *
   * @example
   * renderDebugJson();
   */
  function renderDebugJson() {
    return JSON.stringify(
      {
        state,
        classes: {
          shell: String(shellClass),
          topbar: String(topbarClass),
          button: String(buttonClass),
          card: String(cardClass),
          badge: String(badgeClass),
        },
        explain: renderFirstExplain(),
        cssTextLength: getCssText?.().length || 0,
        globals: {
          hasCipo: Boolean(window.Cipo),
          hasRodK: Boolean(window.RodK),
          hasInline: Boolean(inline?.css),
          hasRegisterAlias: Boolean(registerAlias),
          hasRegisterHelper: Boolean(registerHelper),
        },
      },
      null,
      2,
    );
  }

  /**
   * Renders copyable usage sample.
   *
   * @returns {string} TypeScript-ish sample.
   *
   * @example
   * renderCodeSample();
   */
  function renderCodeSample() {
    return `import {
  css,
  inline,
  cipo,
  setup,
  registerAlias,
  registerHelper,
  explain,
} from "cipo";

setup({
  prefix: "rod",
  minify: ${state.minify},
  important: ${state.important},
  layers: true,
  rem: { enabled: ${state.rem}, baseFontSize: 16 },
  colorMode: "${state.colorMode}",
  theme: {
    colors: {
      brand: "#f97316",
      panel: "#0f172a",
      ink: "#f8fafc",
    },
    spacing: "0.25rem",
    radius: { xl: "24px" },
  },
});

registerHelper("outlineGlow", args => {
  return "0 0 0 3px alpha(" + (args || "$brand") + " / 28%)";
});

registerAlias("glass", \`
  bg: alpha($panel / 76%);
  border: 1px solid alpha($ink / 12%);
  backdrop-filter: blur(18px);
\`);

const card = css\`
  glass;
  px: 4;
  py: 3;
  rounded: $xl;
  color: $ink;

  text(size: lg, weight: 850, lh: 1.1, color: $ink);

  x:hover {
    bg: alpha($brand / 18%);
  }

  x:md {
    px: 6;
  }
\`;

const inlineStyle = inline.css\`
  px: 2;
  py: 1;
  rounded: $md;
  color: saturate($primary, 20%);
  bg: alpha($brand / 14%);
\`;

const Button = cipo.button.css\`
  buttonBase;
  focusRing;
  bg: $brand;
  color: $ink;
\`;

console.log(String(card));
console.log(String(inlineStyle));
console.log(explain(String(card).split(" ")[0]));
`;
  }

  /* ==========================================================================
   * Events
   * ========================================================================== */

  /**
   * Handles panel clicks.
   *
   * @param {MouseEvent} event Click event.
   * @returns {void}
   *
   * @example
   * refs.root.onclick = handleClick;
   */
  function handleClick(event) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const action = target.closest("[data-action]")?.getAttribute("data-action");
    const tabName = target.closest("[data-tab]")?.getAttribute("data-tab");

    if (tabName) {
      state.tab = tabName;
      persist();
      renderPanel();
      renderKitchenSink();
      return;
    }

    if (action === "run") {
      configureCipo();
      renderKitchenSink();
      return;
    }

    if (action === "reset") {
      reset?.();
      configureCipo();
      renderPanel();
      renderKitchenSink();
      return;
    }

    if (action === "collapse") {
      state.collapsed = !state.collapsed;
      persist();
      renderPanel();
      renderKitchenSink();
      return;
    }

    if (action === "close") {
      refs.host?.remove();
    }
  }

  /**
   * Handles form changes.
   *
   * @param {Event} event Change event.
   * @returns {void}
   *
   * @example
   * refs.root.onchange = handleChange;
   */
  function handleChange(event) {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) return;

    const key = target.dataset.toggle;

    if (!key) return;

    state[key] = target.checked;
    persist();
    configureCipo();
    renderPanel();
    renderKitchenSink();
  }

  /**
   * Enables drag from topbar.
   *
   * @param {HTMLElement} host Panel host.
   * @returns {void}
   *
   * @example
   * makeDraggable(host);
   */
  function makeDraggable(host) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    host.addEventListener("pointerdown", event => {
      const handle = event.composedPath().find(node => {
        return node instanceof Element && node.hasAttribute("data-drag-handle");
      });

      if (!handle) return;

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      originX = state.x;
      originY = state.y;

      host.setPointerCapture(event.pointerId);
    });

    host.addEventListener("pointermove", event => {
      if (!dragging) return;

      state.x = clamp(originX + event.clientX - startX, 4, window.innerWidth - 80);
      state.y = clamp(originY + event.clientY - startY, 4, window.innerHeight - 72);

      host.style.left = `${state.x}px`;
      host.style.top = `${state.y}px`;
    });

    host.addEventListener("pointerup", event => {
      if (!dragging) return;

      dragging = false;
      host.releasePointerCapture(event.pointerId);
      persist();
    });
  }

  /* ==========================================================================
   * Utilities
   * ========================================================================== */

  /**
   * Persists panel state.
   *
   * @returns {void}
   *
   * @example
   * persist();
   */
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Some pages disable localStorage. The panel still works without it.
    }
  }

  /**
   * Reads JSON from storage.
   *
   * @param {string} key Storage key.
   * @param {unknown} fallback Fallback value.
   * @returns {any} Parsed JSON.
   *
   * @example
   * readJson("x", {});
   */
  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Escapes HTML.
   *
   * @param {string} value Raw string.
   * @returns {string} Escaped string.
   *
   * @example
   * escapeHtml("<div>");
   * // "&lt;div&gt;"
   */
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  /**
   * Clamps a number.
   *
   * @param {number} value Current value.
   * @param {number} min Minimum.
   * @param {number} max Maximum.
   * @returns {number} Clamped value.
   *
   * @example
   * clamp(12, 0, 10);
   * // 10
   */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();