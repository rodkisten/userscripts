// ==UserScript==
// @name         Rod / DevTools / Panel Shell
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile panel shell powered by Seiva state, Cipó styles, and Fábrica DOM rendering.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       900
// @grant        none
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js
// @require      https://unpkg.com/lucide@0.468.0/dist/umd/lucide.js
// @require      https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/lib/common.min.js
// @require      https://oirodolfo.github.io/rod-panel-codemirror6.iife.js
// ==/UserScript==

/* global lucide, hljs */
(function RodPanelShell(globalWindow, globalDocument) {
	"use strict";

	
	alert("dmdk"); 

	const SCRIPT_NAME = "RodPanelShell";
	const VERSION = "2.1.0";
	const STORAGE_KEY = "rod.panel.shell.v2";
	const ROOT_ID = "rod-panel-shell-root";
	const STYLE_SCOPE_CLASS = "rod-panel-v2";
	const FLOAT_ID = "rod-panel-floating-button";
	const PANEL_ID = "rod-panel-shell";
	const INSPECT_OVERLAY_ID = "rod-panel-inspect-overlay";
	const SUGGESTION_ID = "rod-panel-repl-suggestions";

	const MIN_WIDTH = 300;
	const MIN_HEIGHT = 320;
	const DEFAULT_WIDTH = 420;
	const DEFAULT_HEIGHT = 620;
	const DEFAULT_FLOAT_SIZE = 54;
	const SAFE_MARGIN = 8;
	const DRAG_CLICK_THRESHOLD_PX = 7;
	const MAX_LOGS = 700;
	const MAX_ROOT_DOM_ROWS = 3500;
	const MAX_DOM_DEPTH = 28;
	const MAX_DOM_ATTRIBUTES = 8;
	const MAX_DOM_TEXT_PREVIEW = 90;
	const MAX_OBJECT_KEYS = 90;
	const MAX_VALUE_DEPTH = 5;
	const LOG_ROW_HEIGHT = 40;
	const DOM_ROW_HEIGHT = 24;
	const VIRTUAL_OVERSCAN = 12;
	const RENDER_DEBOUNCE_MS = 16;
	const AUTOCOMPLETE_LIMIT = 80;
	const AUTOCOMPLETE_MIN_CHARS = 0;
	const REPL_MIN_HEIGHT = 92;
	const REPL_MAX_HEIGHT = 360;
	const DEFAULT_REPL_HEIGHT = 150;
	const SAFARI_INPUT_FONT_SIZE = 16;
	const REQUIRED_CODEMIRROR_GLOBALS = Object.freeze([
		"EditorState",
		"EditorView",
		"basicSetup",
		"javascript",
		"keymap",
	]);

	const LOG_METHODS = Object.freeze(["log", "info", "warn", "error", "debug", "trace"]);
	const LOG_FILTERS = Object.freeze(["all", "log", "info", "warn", "error", "debug", "trace"]);
	const TABS = Object.freeze([
		{ id: "console", label: "Console", icon: "terminal" },
		{ id: "dom", label: "Elements", icon: "tree" },
		{ id: "settings", label: "Settings", icon: "settings" },
	]);

	const THEMES = Object.freeze({
		graphite: {
			id: "graphite",
			label: "Graphite",
			bg: "rgba(13, 14, 18, 0.96)",
			bgSoft: "rgba(22, 24, 31, 0.92)",
			bgSofter: "rgba(255, 255, 255, 0.055)",
			border: "rgba(255, 255, 255, 0.12)",
			borderStrong: "rgba(255, 255, 255, 0.19)",
			text: "#f4f4f5",
			muted: "#a1a1aa",
			subtle: "#71717a",
			accent: "#7dd3fc",
			accent2: "#a78bfa",
			danger: "#fb7185",
			warn: "#fbbf24",
			success: "#34d399",
			info: "#60a5fa",
			shadow: "rgba(0, 0, 0, 0.52)",
		},
		tokyo: {
			id: "tokyo",
			label: "Tokyo Night",
			bg: "rgba(9, 11, 22, 0.96)",
			bgSoft: "rgba(17, 21, 39, 0.93)",
			bgSofter: "rgba(122, 162, 247, 0.07)",
			border: "rgba(122, 162, 247, 0.18)",
			borderStrong: "rgba(122, 162, 247, 0.32)",
			text: "#c0caf5",
			muted: "#a9b1d6",
			subtle: "#565f89",
			accent: "#7aa2f7",
			accent2: "#bb9af7",
			danger: "#f7768e",
			warn: "#e0af68",
			success: "#9ece6a",
			info: "#7dcfff",
			shadow: "rgba(0, 0, 0, 0.62)",
		},
		jade: {
			id: "jade",
			label: "Jade",
			bg: "rgba(5, 17, 15, 0.96)",
			bgSoft: "rgba(9, 31, 27, 0.93)",
			bgSofter: "rgba(52, 211, 153, 0.065)",
			border: "rgba(110, 231, 183, 0.16)",
			borderStrong: "rgba(110, 231, 183, 0.29)",
			text: "#ecfdf5",
			muted: "#a7f3d0",
			subtle: "#6ee7b7",
			accent: "#34d399",
			accent2: "#22d3ee",
			danger: "#fb7185",
			warn: "#facc15",
			success: "#86efac",
			info: "#67e8f9",
			shadow: "rgba(0, 0, 0, 0.58)",
		},
	});

	const ICONS = Object.freeze({
		terminal: "Terminal",
		tree: "GitFork",
		settings: "Settings",
		inspect: "MousePointerClick",
		close: "X",
		search: "Search",
		trash: "Trash2",
		chevronRight: "ChevronRight",
		chevronDown: "ChevronDown",
		play: "Play",
		pause: "Pause",
		grip: "GripHorizontal",
		code: "Code2",
		tag: "CodeXml",
		warning: "TriangleAlert",
		error: "CircleAlert",
		info: "Info",
		bug: "Bug",
		box: "Box",
		copy: "Copy",
		sparkle: "Sparkles",
		focus: "ScanSearch",
		wrap: "WrapText",
	});

	const DEFAULT_STATE = Object.freeze({
		open: false,
		activeTab: "console",
		theme: "graphite",
		opacity: 0.96,
		floatingOpacity: 0.92,
		floatingIcon: "terminal",
		consoleFilter: "all",
		consoleSearch: "",
		consoleWrap: true,
		replHeight: DEFAULT_REPL_HEIGHT,
		domSearch: "",
		selectedNodeId: "",
		floatingPosition: {
			x: Math.max(SAFE_MARGIN, globalWindow.innerWidth - 76),
			y: Math.max(SAFE_MARGIN, globalWindow.innerHeight - 168),
		},
		panelRect: {
			x: Math.max(SAFE_MARGIN, globalWindow.innerWidth - DEFAULT_WIDTH - 14),
			y: Math.max(36, globalWindow.innerHeight - DEFAULT_HEIGHT - 90),
			width: DEFAULT_WIDTH,
			height: DEFAULT_HEIGHT,
		},
	});

	const Runtime = resolveBundlerRuntime();
	const Seiva = Runtime.Seiva;
	const Fabrica = Runtime.Fabrica;
	const Cipo = Runtime.Cipo;

	const C = Cipo.cipo || Cipo;
	const F = Fabrica;
	const S = Seiva;

	const originalConsole = {};
	const logs = S.cell([]);
	const app = createAppState(readState());
	const nodeIds = new WeakMap();
	const nodesById = new Map();
	const expandedDomNodeIds = new Set(["dom-1", "dom-2"]);
	const expandedLogIds = new Set();
	const expandedValueIds = new Set();
	const groupStack = [];
	const counters = new Map();
	const timers = new Map();
	const replHistory = [];
	const disposers = [];
	const dragRuntime = createDragRuntime();

	let root = null;
	let floatingButton = null;
	let panel = null;
	let contentHost = null;
	let overlay = null;
	let activeCleanup = null;
	let nextNodeId = 1;
	let nextLogId = 1;
	let inspectorEnabled = false;
	let selectedNode = null;
	let currentDomViewport = null;
	let currentConsoleViewport = null;
	let currentSuggestionController = null;
	let replEditor = null;
	let replFallbackInput = null;
	let lastReplResult = undefined;
	let suppressConsoleCapture = false;

	boot();

	/** Initializes runtime dependencies, styles, state subscriptions and DOM roots. */
	function boot() {
		setupCipo();
		installSafariZoomGuard();
		exposeApi();
		interceptConsole();
		createRoots();
		observeState();
		renderShell();
		globalWindow.addEventListener("resize", onWindowResize, { passive: true });
	}

	function createAppState(initial) {
		return S.world({
			open: Boolean(initial.open),
			activeTab: String(initial.activeTab || DEFAULT_STATE.activeTab),
			theme: String(initial.theme || DEFAULT_STATE.theme),
			opacity: Number(initial.opacity ?? DEFAULT_STATE.opacity),
			floatingOpacity: Number(initial.floatingOpacity ?? DEFAULT_STATE.floatingOpacity),
			floatingIcon: String(initial.floatingIcon || DEFAULT_STATE.floatingIcon),
			consoleFilter: String(initial.consoleFilter || DEFAULT_STATE.consoleFilter),
			consoleSearch: String(initial.consoleSearch || DEFAULT_STATE.consoleSearch),
			consoleWrap: Boolean(initial.consoleWrap ?? DEFAULT_STATE.consoleWrap),
			replHeight: Number(initial.replHeight || DEFAULT_STATE.replHeight),
			domSearch: String(initial.domSearch || DEFAULT_STATE.domSearch),
			selectedNodeId: String(initial.selectedNodeId || DEFAULT_STATE.selectedNodeId),
			floatingX: Number(initial.floatingPosition?.x ?? DEFAULT_STATE.floatingPosition.x),
			floatingY: Number(initial.floatingPosition?.y ?? DEFAULT_STATE.floatingPosition.y),
			panelX: Number(initial.panelRect?.x ?? DEFAULT_STATE.panelRect.x),
			panelY: Number(initial.panelRect?.y ?? DEFAULT_STATE.panelRect.y),
			panelWidth: Number(initial.panelRect?.width ?? DEFAULT_STATE.panelRect.width),
			panelHeight: Number(initial.panelRect?.height ?? DEFAULT_STATE.panelRect.height),
		});
	}

	/** Uses Cipó as the single styling pipe for theme tokens and global panel CSS. */
	function setupCipo() {
		C.configure?.({
			prefix: "rodp",
			important: false,
			adapter: "dom",
			debug: false,
			darkSelector: `[data-rod-panel-theme="dark"]`,
			themeRootSelector: `.${STYLE_SCOPE_CLASS}`,
		});

		C.theme?.({
			spacing: "0.25rem",
			radius: { lg: "14px", xl: "22px", full: "999px" },
		});

		C.injectGlobal`
      #${ROOT_ID}.${STYLE_SCOPE_CLASS} {
        position: fixed;
        inset: 0;
        width: 0;
        height: 0;
        z-index: 2147483647;
        pointer-events: none;
        color: var(--rod-panel-text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-text-size-adjust: 100%;
      }

      #${ROOT_ID} *,
      #${ROOT_ID} *::before,
      #${ROOT_ID} *::after {
        box-sizing: border-box;
      }

      #${ROOT_ID} button,
      #${ROOT_ID} input,
      #${ROOT_ID} textarea,
      #${ROOT_ID} select {
        font: inherit;
      }

      #${ROOT_ID} button {
        -webkit-tap-highlight-color: transparent;
      }

      #${FLOAT_ID} {
        position: fixed;
        z-index: 2147483647;
        width: ${DEFAULT_FLOAT_SIZE}px;
        height: ${DEFAULT_FLOAT_SIZE}px;
        border: 1px solid var(--rod-panel-border);
        border-radius: 999px;
        color: var(--rod-panel-text);
        background:
          radial-gradient(circle at 24% 18%, color-mix(in srgb, var(--rod-panel-accent) 42%, transparent), transparent 34%),
          linear-gradient(135deg, var(--rod-panel-bg-soft), var(--rod-panel-bg));
        box-shadow: 0 22px 70px var(--rod-panel-shadow);
        backdrop-filter: blur(20px) saturate(1.35);
        -webkit-backdrop-filter: blur(20px) saturate(1.35);
        opacity: var(--rod-panel-floating-opacity);
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        cursor: grab;
      }

      #${FLOAT_ID}:active {
        cursor: grabbing;
        transform: scale(0.97);
      }

      #${PANEL_ID} {
        position: fixed;
        z-index: 2147483647;
        display: grid;
        grid-template-rows: auto auto minmax(0, 1fr) auto;
        min-width: ${MIN_WIDTH}px;
        min-height: ${MIN_HEIGHT}px;
        overflow: hidden;
        border: 1px solid var(--rod-panel-border);
        border-radius: 24px;
        color: var(--rod-panel-text);
        background:
          radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--rod-panel-accent) 15%, transparent), transparent 36%),
          linear-gradient(180deg, var(--rod-panel-bg-soft), var(--rod-panel-bg));
        box-shadow: 0 28px 96px var(--rod-panel-shadow);
        backdrop-filter: blur(22px) saturate(1.35);
        -webkit-backdrop-filter: blur(22px) saturate(1.35);
        pointer-events: auto;
      }

      .rod-panel-hidden {
        display: none !important;
      }

      .rod-icon {
        width: 1.1em;
        height: 1.1em;
        min-width: 1.1em;
        min-height: 1.1em;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        vertical-align: -0.16em;
      }

      .rod-icon svg {
        width: 1em;
        height: 1em;
        stroke-width: 2.1;
      }

      .rod-panel-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        padding: 10px 10px 8px 12px;
        border-bottom: 1px solid var(--rod-panel-border);
        background: color-mix(in srgb, var(--rod-panel-bg-soft) 74%, transparent);
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }

      .rod-panel-brand {
        min-width: 0;
        display: inline-flex;
        align-items: center;
        gap: 9px;
        font-size: 13px;
        font-weight: 760;
        letter-spacing: -0.01em;
      }

      .rod-panel-brand small {
        display: block;
        color: var(--rod-panel-muted);
        font-size: 11px;
        font-weight: 520;
      }

      .rod-panel-actions,
      .rod-panel-tabs,
      .rod-toolbar,
      .rod-inline-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .rod-icon-button,
      .rod-tab,
      .rod-pill-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        border: 1px solid var(--rod-panel-border);
        color: var(--rod-panel-text);
        background: var(--rod-panel-bg-softer);
        user-select: none;
        -webkit-user-select: none;
      }

      .rod-icon-button {
        width: 34px;
        height: 34px;
        padding: 0;
        border-radius: 12px;
      }

      .rod-icon-button.is-active,
      .rod-tab.is-active,
      .rod-pill-button.is-active {
        background: color-mix(in srgb, var(--rod-panel-accent) 22%, transparent);
        border-color: color-mix(in srgb, var(--rod-panel-accent) 55%, var(--rod-panel-border));
      }

      .rod-tabbar {
        overflow-x: auto;
        padding: 8px 10px;
        border-bottom: 1px solid var(--rod-panel-border);
        -webkit-overflow-scrolling: touch;
      }

      .rod-tab {
        flex: 0 0 auto;
        min-height: 34px;
        padding: 0 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 650;
        white-space: nowrap;
      }

      .rod-panel-content {
        min-height: 0;
        overflow: hidden;
        padding: 10px;
      }

      .rod-panel-footer {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-top: 1px solid var(--rod-panel-border);
        color: var(--rod-panel-muted);
        font-size: 11px;
      }

      .rod-panel-resize {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 28px;
        height: 28px;
        cursor: nwse-resize;
        touch-action: none;
      }

      .rod-panel-resize::after {
        content: "";
        position: absolute;
        right: 8px;
        bottom: 8px;
        width: 11px;
        height: 11px;
        border-right: 2px solid var(--rod-panel-muted);
        border-bottom: 2px solid var(--rod-panel-muted);
        opacity: 0.78;
      }

      #${INSPECT_OVERLAY_ID} {
        position: fixed;
        z-index: 2147483646;
        display: none;
        pointer-events: none;
        border: 2px solid var(--rod-panel-accent, #7dd3fc);
        background: color-mix(in srgb, var(--rod-panel-accent, #7dd3fc) 18%, transparent);
        box-shadow: 0 0 0 99999px rgba(0, 0, 0, 0.18);
        border-radius: 8px;
      }

      .rod-console-shell {
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto var(--rod-repl-height);
        gap: 8px;
      }

      .rod-toolbar {
        min-width: 0;
      }

      .rod-search-wrap {
        min-width: 0;
        flex: 1;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 6px;
        border: 1px solid var(--rod-panel-border);
        border-radius: 14px;
        padding: 0 9px;
        background: var(--rod-panel-bg-softer);
      }

      .rod-search-wrap input,
      .rod-select,
      .rod-repl-input {
        color: var(--rod-panel-text);
        background: transparent;
        outline: none;
        border: 0;
        min-width: 0;
      }

      .rod-search-wrap input {
        width: 100%;
        padding: 9px 0;
        font-size: ${SAFARI_INPUT_FONT_SIZE}px;
      }

      .rod-select {
        min-width: 82px;
        height: 36px;
        border: 1px solid var(--rod-panel-border);
        border-radius: 13px;
        background: var(--rod-panel-bg-softer);
        padding: 0 8px;
        font-size: 12px;
      }

      .rod-pill-button {
        height: 36px;
        padding: 0 10px;
        border-radius: 13px;
        font-size: 12px;
      }

      .rod-viewport {
        position: relative;
        min-height: 0;
        height: 100%;
        overflow: auto;
        border: 1px solid var(--rod-panel-border);
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015));
        -webkit-overflow-scrolling: touch;
        contain: strict;
      }

      .rod-spacer {
        position: relative;
        min-height: 100%;
        width: 100%;
      }

      .rod-virtual-rows {
        position: absolute;
        inset-inline: 0;
        top: 0;
        will-change: transform;
      }

      .rod-log-row {
        min-height: ${LOG_ROW_HEIGHT}px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: start;
        gap: 7px;
        padding: 7px 8px;
        border-bottom: 1px solid rgba(255,255,255,0.075);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11.5px;
        line-height: 1.42;
      }

      .rod-log-row:hover,
      .rod-dom-row:hover {
        background: rgba(255,255,255,0.045);
      }

      .rod-log-row.is-error {
        border-left: 3px solid var(--rod-panel-danger);
        background: color-mix(in srgb, var(--rod-panel-danger) 9%, transparent);
      }

      .rod-log-row.is-warn {
        border-left: 3px solid var(--rod-panel-warn);
        background: color-mix(in srgb, var(--rod-panel-warn) 8%, transparent);
      }

      .rod-log-row.is-info {
        border-left: 3px solid var(--rod-panel-info);
        background: color-mix(in srgb, var(--rod-panel-info) 7%, transparent);
      }

      .rod-log-meta,
      .rod-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .rod-log-meta {
        margin-right: 7px;
        color: var(--rod-panel-muted);
        font-size: 10.5px;
      }

      .rod-badge {
        padding: 1px 6px;
        border: 1px solid var(--rod-panel-border);
        border-radius: 999px;
        background: rgba(255,255,255,0.04);
        color: var(--rod-panel-muted);
      }

      .rod-toggle {
        width: 18px;
        height: 18px;
        border: 0;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--rod-panel-muted);
        background: transparent;
      }

      .rod-toggle.is-hidden {
        visibility: hidden;
      }

      .rod-log-message {
        min-width: 0;
        overflow-wrap: anywhere;
        white-space: var(--rod-console-white-space);
      }

      .rod-value {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        max-width: 100%;
        margin-inline: 1px;
        padding: 1px 5px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 7px;
        background: rgba(255,255,255,0.035);
        vertical-align: baseline;
      }

      .rod-value.is-string { color: #a7f3d0; }
      .rod-value.is-number { color: #fcd34d; }
      .rod-value.is-boolean { color: #93c5fd; }
      .rod-value.is-nullish { color: #a1a1aa; }
      .rod-value.is-function { color: #c4b5fd; }
      .rod-value.is-element { color: #67e8f9; }
      .rod-value.is-error-value { color: var(--rod-panel-danger); }

      .rod-log-children {
        grid-column: 2 / -1;
        display: grid;
        gap: 2px;
        margin-top: 5px;
        padding-left: 12px;
        border-left: 1px dashed rgba(255,255,255,0.14);
      }

      .rod-prop-row {
        display: grid;
        grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
        gap: 7px;
        padding: 2px 0;
      }

      .rod-prop-key { color: #93c5fd; white-space: nowrap; }
      .rod-prop-value { min-width: 0; overflow-wrap: anywhere; }

      .rod-repl-resizer {
        height: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--rod-panel-border);
        border-radius: 999px;
        color: var(--rod-panel-muted);
        background: rgba(255,255,255,0.04);
        cursor: ns-resize;
        touch-action: none;
      }

      .rod-repl-wrap {
        position: relative;
        min-height: 0;
        border: 1px solid var(--rod-panel-border);
        border-radius: 16px;
        overflow: hidden;
        background: rgba(0,0,0,0.18);
      }

      .rod-repl-toolbar {
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 0 8px;
        border-bottom: 1px solid var(--rod-panel-border);
        color: var(--rod-panel-muted);
        font-size: 11px;
      }

      .rod-repl-editor {
        height: calc(100% - 32px);
        min-height: 0;
      }

      .rod-repl-input {
        width: 100%;
        height: 100%;
        resize: none;
        border-radius: 0;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: ${SAFARI_INPUT_FONT_SIZE}px;
        line-height: 1.45;
      }

      .rod-repl-editor .cm-editor {
        height: 100%;
        background: transparent;
        color: var(--rod-panel-text);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: ${SAFARI_INPUT_FONT_SIZE}px;
      }

      .rod-repl-editor .cm-scroller {
        font-family: inherit;
      }

      .rod-suggest-popover {
        position: fixed;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 20px));
        max-height: min(290px, calc(100vh - 32px));
        overflow: hidden;
        border: 1px solid var(--rod-panel-border-strong, rgba(255,255,255,0.22));
        border-radius: 16px;
        background: var(--rod-panel-bg, rgba(13,14,18,0.97));
        color: var(--rod-panel-text, #f4f4f5);
        box-shadow: 0 22px 80px var(--rod-panel-shadow, rgba(0,0,0,0.55));
        backdrop-filter: blur(18px) saturate(1.35);
        -webkit-backdrop-filter: blur(18px) saturate(1.35);
        pointer-events: auto;
      }

      .rod-suggest-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 8px;
        border-bottom: 1px solid var(--rod-panel-border, rgba(255,255,255,0.12));
        color: var(--rod-panel-muted, #a1a1aa);
        font-size: 11px;
      }

      .rod-suggest-list {
        max-height: 238px;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
      }

      .rod-suggest-item {
        width: 100%;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        border: 0;
        padding: 8px 10px;
        color: inherit;
        background: transparent;
        text-align: left;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
      }

      .rod-suggest-item:hover,
      .rod-suggest-item.is-active {
        background: color-mix(in srgb, var(--rod-panel-accent, #7dd3fc) 16%, transparent);
      }

      .rod-suggest-kind {
        color: var(--rod-panel-muted, #a1a1aa);
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-size: 10px;
      }

      .rod-dom-shell {
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        gap: 8px;
      }

      .rod-dom-row {
        min-height: ${DOM_ROW_HEIGHT}px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        border-bottom: 1px solid rgba(255,255,255,0.045);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        line-height: 1.35;
        cursor: default;
        user-select: none;
        -webkit-user-select: none;
      }

      .rod-dom-row.is-selected {
        background: color-mix(in srgb, var(--rod-panel-accent) 26%, transparent);
        outline: 1px solid color-mix(in srgb, var(--rod-panel-accent) 42%, transparent);
        outline-offset: -1px;
      }

      .rod-dom-code {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .rod-dom-badges {
        display: inline-flex;
        gap: 4px;
      }

      .rod-mini-badge {
        padding: 0 5px;
        border: 1px solid color-mix(in srgb, var(--rod-panel-accent) 46%, transparent);
        border-radius: 999px;
        color: var(--rod-panel-accent);
        font-size: 10px;
      }

      .tok-punct { color: #8b949e; }
      .tok-tag { color: #7dd3fc; }
      .tok-attr { color: #f0abfc; }
      .tok-string { color: #a7f3d0; }
      .tok-comment { color: #71717a; font-style: italic; }
      .tok-text { color: #e5e7eb; }
      .tok-equals { color: #8b949e; }
      .tok-doctype { color: #facc15; }

      .rod-empty {
        color: var(--rod-panel-muted);
        padding: 20px 8px;
        text-align: center;
        font-size: 13px;
      }

      .rod-settings-grid {
        height: 100%;
        overflow: auto;
        display: grid;
        align-content: start;
        gap: 10px;
        -webkit-overflow-scrolling: touch;
      }

      .rod-setting {
        display: grid;
        gap: 5px;
      }

      .rod-setting label {
        color: var(--rod-panel-muted);
        font-size: 11px;
        font-weight: 680;
      }

      .rod-setting input,
      .rod-setting select {
        width: 100%;
        min-height: 38px;
        border: 1px solid var(--rod-panel-border);
        border-radius: 13px;
        padding: 8px 10px;
        color: var(--rod-panel-text);
        background: var(--rod-panel-bg-softer);
        font-size: ${SAFARI_INPUT_FONT_SIZE}px;
      }
    `;
	}

	function createRoots() {
		globalDocument.getElementById(ROOT_ID)?.remove();
		globalDocument.getElementById(INSPECT_OVERLAY_ID)?.remove();

		root = globalDocument.createElement("div");
		root.id = ROOT_ID;
		root.className = STYLE_SCOPE_CLASS;
		root.setAttribute("data-rod-panel", "root");

		overlay = globalDocument.createElement("div");
		overlay.id = INSPECT_OVERLAY_ID;
		overlay.setAttribute("data-rod-panel", "inspect-overlay");

		globalDocument.documentElement.append(root, overlay);
	}

	function observeState() {
		const shellCells = [
			app.open,
			app.activeTab,
			app.theme,
			app.opacity,
			app.floatingOpacity,
			app.floatingIcon,
			app.consoleWrap,
			app.replHeight,
			app.selectedNodeId,
			app.floatingX,
			app.floatingY,
			app.panelX,
			app.panelY,
			app.panelWidth,
			app.panelHeight,
		];

		for (const entry of shellCells) {
			disposers.push(entry.watch(() => scheduleShellRender()));
		}

		disposers.push(app.consoleFilter.watch(() => updateConsoleViewport()));
		disposers.push(app.consoleSearch.watch(() => updateConsoleViewport()));
		disposers.push(logs.watch(() => updateConsoleViewport({ stickToBottom: true })));
		disposers.push(app.domSearch.watch(() => updateDomViewport()));
	}

	function scheduleShellRender() {
		scheduleFrame("shell", renderShell);
	}

	function renderShell() {
		if (!root) {
			return;
		}

		applyRootThemeVars();

		const activeTab = app.activeTab.value;
		const activeTabLabel = TABS.find((tab) => tab.id === activeTab)?.label || "Panel";
		const open = app.open.value;
		const selectedLabel = selectedNode ? formatNodeLabel(selectedNode) : "No element selected";

		F.render(root, F.html`
      <button
        id="${FLOAT_ID}"
        type="button"
        aria-label="Toggle Rod panel"
        style=${floatingStyle()}
        @pointerdown=${onFloatingPointerDown}
        @pointermove=${onFloatingPointerMove}
        @pointerup=${onFloatingPointerUp}
        @pointercancel=${onFloatingPointerCancel}
      >
        ${icon(app.floatingIcon.value)}
      </button>

      <section
        id="${PANEL_ID}"
        class=${open ? "" : "rod-panel-hidden"}
        aria-label="Rod panel"
        style=${panelStyle()}
      >
        <header class="rod-panel-header" @pointerdown=${onPanelHeaderPointerDown}>
          <div class="rod-panel-brand">
            ${icon("sparkle")}
            <span>
              Rod Panel <small>${activeTabLabel} · v${VERSION}</small>
            </span>
          </div>

          <div class="rod-panel-actions">
            <button
              class=${`rod-icon-button ${inspectorEnabled ? "is-active" : ""}`}
              type="button"
              title="Inspect page element"
              @click=${toggleInspector}
            >${icon("inspect")}</button>

            <button
              class="rod-icon-button"
              type="button"
              title="Close"
              @click=${() => app.open.become(false)}
            >${icon("close")}</button>
          </div>
        </header>

        <nav class="rod-tabbar rod-panel-tabs" aria-label="Panel tabs">
          ${TABS.map((tab) => F.html`
            <button
              class=${`rod-tab ${activeTab === tab.id ? "is-active" : ""}`}
              type="button"
              @click=${() => app.activeTab.become(tab.id)}
            >
              ${icon(tab.icon)} ${tab.label}
            </button>
          `)}
        </nav>

        <main class="rod-panel-content"></main>

        <footer class="rod-panel-footer">
          <span>${selectedLabel}</span>
          <span>${THEMES[app.theme.value]?.label || app.theme.value}</span>
        </footer>

        <div class="rod-panel-resize" @pointerdown=${onPanelResizePointerDown}></div>
      </section>
    `);

		floatingButton = globalDocument.getElementById(FLOAT_ID);
		panel = globalDocument.getElementById(PANEL_ID);
		contentHost = panel?.querySelector(".rod-panel-content") || null;

		mountActiveTab();
	}

	function mountActiveTab() {
		if (!contentHost || !app.open.value) {
			return;
		}

		if (activeCleanup) {
			activeCleanup();
			activeCleanup = null;
		}

		const tab = app.activeTab.value;

		if (tab === "console") {
			activeCleanup = mountConsoleTab(contentHost);
			return;
		}

		if (tab === "dom") {
			activeCleanup = mountDomTab(contentHost);
			return;
		}

		activeCleanup = mountSettingsTab(contentHost);
	}

	/** Mounts the Chrome-ish Console with virtual logs and the resizable REPL. */
	function mountConsoleTab(host) {
		const shellVars = `--rod-repl-height:${clamp(app.replHeight.value, REPL_MIN_HEIGHT, REPL_MAX_HEIGHT)}px;--rod-console-white-space:${app.consoleWrap.value ? "pre-wrap" : "pre"};`;

		F.render(host, F.html`
      <section class="rod-console-shell" style=${shellVars}>
        <div class="rod-toolbar">
          <label class="rod-search-wrap">
            ${icon("search")}
            <input
              type="search"
              value=${app.consoleSearch.value}
              placeholder="Filter logs, values, errors..."
              autocomplete="off"
              spellcheck="false"
              @input=${(event) => app.consoleSearch.become(event.currentTarget.value)}
            />
          </label>

          <select class="rod-select" @change=${(event) => app.consoleFilter.become(event.currentTarget.value)}>
            ${LOG_FILTERS.map((filter) => F.html`
              <option value=${filter} selected=${filter === app.consoleFilter.value}>${filter}</option>
            `)}
          </select>

          <button class="rod-pill-button" type="button" title="Clear console" @click=${clearConsole}>
            ${icon("trash")}
          </button>
        </div>

        <div class="rod-viewport" data-role="console-viewport">
          <div class="rod-spacer"><div class="rod-virtual-rows"></div></div>
        </div>

        <div class="rod-repl-resizer" title="Resize REPL" @pointerdown=${onReplResizePointerDown}>
          ${icon("grip")}
        </div>

        <div class="rod-repl-wrap">
          <div class="rod-repl-toolbar">
            <span>${icon("code")} REPL · Enter runs · Shift+Enter newline</span>
            <div class="rod-inline-actions">
              <button class="rod-pill-button" type="button" @click=${runCurrentRepl}>Run</button>
            </div>
          </div>
          <div class="rod-repl-editor" data-role="repl-editor"></div>
        </div>
      </section>
    `);

		currentConsoleViewport = createVirtualConsoleViewport(host.querySelector('[data-role="console-viewport"]'));
		updateConsoleViewport({ stickToBottom: true });
		mountRepl(host.querySelector('[data-role="repl-editor"]'));

		return () => {
			currentConsoleViewport?.dispose();
			currentConsoleViewport = null;
			replEditor?.destroy?.();
			replEditor = null;
			replFallbackInput = null;
			closeSuggestions();
		};
	}

	/** Mounts the virtualized DOM outline with DevTools-style tokens and focus sync. */
	function mountDomTab(host) {
		F.render(host, F.html`
      <section class="rod-dom-shell">
        <div class="rod-toolbar">
          <label class="rod-search-wrap">
            ${icon("search")}
            <input
              type="search"
              value=${app.domSearch.value}
              placeholder="Search DOM nodes, ids, classes, text..."
              autocomplete="off"
              spellcheck="false"
              @input=${(event) => app.domSearch.become(event.currentTarget.value)}
            />
          </label>

          <button class="rod-pill-button" type="button" title="Focus selected node" @click=${focusSelectedNode}>
            ${icon("focus")} Focus
          </button>
        </div>

        <div class="rod-viewport" data-role="dom-viewport">
          <div class="rod-spacer"><div class="rod-virtual-rows"></div></div>
        </div>
      </section>
    `);

		currentDomViewport = createVirtualDomViewport(host.querySelector('[data-role="dom-viewport"]'));
		updateDomViewport({ scrollToSelected: true });

		return () => {
			currentDomViewport?.dispose();
			currentDomViewport = null;
		};
	}

	function mountSettingsTab(host) {
		F.render(host, F.html`
      <section class="rod-settings-grid">
        <div class="rod-setting">
          <label>Theme</label>
          <select @change=${(event) => app.theme.become(event.currentTarget.value)}>
            ${Object.values(THEMES).map((theme) => F.html`
              <option value=${theme.id} selected=${theme.id === app.theme.value}>${theme.label}</option>
            `)}
          </select>
        </div>

        <div class="rod-setting">
          <label>Panel opacity</label>
          <input type="range" min="0.62" max="1" step="0.01" value=${app.opacity.value} @input=${(event) => app.opacity.become(Number(event.currentTarget.value))} />
        </div>

        <div class="rod-setting">
          <label>Floating button opacity</label>
          <input type="range" min="0.25" max="1" step="0.01" value=${app.floatingOpacity.value} @input=${(event) => app.floatingOpacity.become(Number(event.currentTarget.value))} />
        </div>

        <div class="rod-setting">
          <label>Console wrap</label>
          <select @change=${(event) => app.consoleWrap.become(event.currentTarget.value === "true")}>
            <option value="true" selected=${app.consoleWrap.value}>Wrap long logs</option>
            <option value="false" selected=${!app.consoleWrap.value}>Single line logs</option>
          </select>
        </div>

        <div class="rod-setting">
          <label>Floating icon alias</label>
          <input value=${app.floatingIcon.value} @change=${(event) => app.floatingIcon.become(event.currentTarget.value || "terminal")} />
        </div>
      </section>
    `);

		return null;
	}

	function createVirtualConsoleViewport(viewport) {
		const spacer = viewport.querySelector(".rod-spacer");
		const rowsHost = viewport.querySelector(".rod-virtual-rows");
		let rows = [];
		let scheduled = 0;

		const render = () => {
			scheduled = 0;
			const height = viewport.clientHeight || 240;
			const scrollTop = viewport.scrollTop || 0;
			const start = Math.max(0, Math.floor(scrollTop / LOG_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
			const end = Math.min(rows.length, Math.ceil((scrollTop + height) / LOG_ROW_HEIGHT) + VIRTUAL_OVERSCAN);
			rowsHost.style.transform = `translate3d(0, ${start * LOG_ROW_HEIGHT}px, 0)`;
			F.render(rowsHost, F.html`${rows.slice(start, end).map(renderLogRow)}`);
		};

		const schedule = () => {
			if (scheduled) {
				return;
			}
			scheduled = globalWindow.setTimeout(render, RENDER_DEBOUNCE_MS);
		};

		viewport.addEventListener("scroll", schedule, { passive: true });

		return {
			setRows(nextRows, options = {}) {
				rows = nextRows;
				spacer.style.height = `${Math.max(LOG_ROW_HEIGHT, rows.length * LOG_ROW_HEIGHT)}px`;
				if (options.stickToBottom) {
					viewport.scrollTop = spacer.offsetHeight;
				}
				render();
			},
			dispose() {
				viewport.removeEventListener("scroll", schedule);
				if (scheduled) {
					globalWindow.clearTimeout(scheduled);
				}
			},
		};
	}

	function createVirtualDomViewport(viewport) {
		const spacer = viewport.querySelector(".rod-spacer");
		const rowsHost = viewport.querySelector(".rod-virtual-rows");
		let rows = [];
		let scheduled = 0;

		const render = () => {
			scheduled = 0;
			const height = viewport.clientHeight || 260;
			const scrollTop = viewport.scrollTop || 0;
			const start = Math.max(0, Math.floor(scrollTop / DOM_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
			const end = Math.min(rows.length, Math.ceil((scrollTop + height) / DOM_ROW_HEIGHT) + VIRTUAL_OVERSCAN);
			rowsHost.style.transform = `translate3d(0, ${start * DOM_ROW_HEIGHT}px, 0)`;
			F.render(rowsHost, F.html`${rows.slice(start, end).map(renderDomRow)}`);
		};

		const schedule = () => {
			if (scheduled) {
				return;
			}
			scheduled = globalWindow.setTimeout(render, RENDER_DEBOUNCE_MS);
		};

		viewport.addEventListener("scroll", schedule, { passive: true });

		return {
			setRows(nextRows, options = {}) {
				rows = nextRows;
				spacer.style.height = `${Math.max(DOM_ROW_HEIGHT, rows.length * DOM_ROW_HEIGHT)}px`;
				if (options.scrollToSelected) {
					const index = rows.findIndex((row) => row.id === app.selectedNodeId.value);
					if (index >= 0) {
						viewport.scrollTop = Math.max(0, index * DOM_ROW_HEIGHT - DOM_ROW_HEIGHT * 4);
					}
				}
				render();
			},
			dispose() {
				viewport.removeEventListener("scroll", schedule);
				if (scheduled) {
					globalWindow.clearTimeout(scheduled);
				}
			},
		};
	}

	function updateConsoleViewport(options = {}) {
		if (!currentConsoleViewport) {
			return;
		}

		const flattened = flattenLogs(logs.value, app.consoleFilter.value, app.consoleSearch.value);
		currentConsoleViewport.setRows(flattened, options);
	}

	function updateDomViewport(options = {}) {
		if (!currentDomViewport) {
			return;
		}

		const rows = flattenDom(globalDocument.documentElement, app.domSearch.value).slice(0, MAX_ROOT_DOM_ROWS);
		currentDomViewport.setRows(rows, options);
	}

	function renderLogRow(row) {
		const entry = row.entry;
		const expandable = entry.children.length > 0 || entry.values.some(isInspectableValue);
		const expanded = expandedLogIds.has(entry.id);
		const meta = getLogMeta(entry.type);

		return F.html`
      <div class=${`rod-log-row ${meta.className}`} style=${`padding-left:${8 + row.depth * 14}px`}>
        <button class=${`rod-toggle ${expandable ? "" : "is-hidden"}`} type="button" @click=${() => toggleLog(entry.id)}>
          ${icon(expanded ? "chevronDown" : "chevronRight")}
        </button>

        <div class="rod-log-message">
          <span class="rod-log-meta">
            <span class="rod-badge">${icon(meta.icon)} ${meta.label}</span>
            <span>${formatTime(entry.time)}</span>
          </span>
          ${entry.values.map((value, index) => renderValue(value, `${entry.id}:${index}`, 0))}
          ${expanded ? renderLogDetails(entry) : ""}
        </div>

        <span class="rod-log-meta">${row.index + 1}</span>
      </div>
    `;
	}

	function renderLogDetails(entry) {
		return F.html`
      <div class="rod-log-children">
        ${entry.children.length ? F.html`
          <div class="rod-prop-row"><span class="rod-prop-key">children</span><span>${entry.children.length} log entries</span></div>
        ` : ""}
        ${entry.values.map((value, index) => renderValueDetails(value, `${entry.id}:${index}`, 0))}
      </div>
    `;
	}

	function renderValue(value, id, depth) {
		const type = detectValueType(value);
		const meta = getValueMeta(type);
		const expandable = isInspectableValue(value) && depth < MAX_VALUE_DEPTH;
		const expanded = expandedValueIds.has(id);

		return F.html`
      <span class=${`rod-value ${meta.className}`}>
        ${expandable ? F.html`
          <button class="rod-toggle" type="button" @click=${() => toggleValue(id)}>${icon(expanded ? "chevronDown" : "chevronRight")}</button>
        ` : ""}
        <span>${previewValue(value, type)}</span>
      </span>
    `;
	}

	function renderValueDetails(value, id, depth) {
		if (!expandedValueIds.has(id) || depth >= MAX_VALUE_DEPTH || !isInspectableValue(value)) {
			return "";
		}

		const entries = getInspectableEntries(value).slice(0, MAX_OBJECT_KEYS);

		return F.html`
      ${entries.map((entry) => {
        const childId = `${id}.${entry.key}`;
        return F.html`
          <div class="rod-prop-row">
            <span class="rod-prop-key">${entry.key}</span>
            <span class="rod-prop-value">
              ${renderValue(entry.value, childId, depth + 1)}
              ${renderValueDetails(entry.value, childId, depth + 1)}
            </span>
          </div>
        `;
      })}
    `;
	}

	function renderDomRow(row) {
		const selected = app.selectedNodeId.value === row.id;
		const expanded = expandedDomNodeIds.has(row.id);
		const hasChildren = row.childCount > 0;

		return F.html`
      <div
        class=${`rod-dom-row ${selected ? "is-selected" : ""}`}
        style=${`padding-left:${6 + row.depth * 14}px`}
        @click=${() => selectNode(row.node, { focus: true, activateDom: false })}
      >
        <button
          class=${`rod-toggle ${hasChildren ? "" : "is-hidden"}`}
          type="button"
          @click.stop=${() => toggleDomNode(row.id)}
        >${icon(expanded ? "chevronDown" : "chevronRight")}</button>

        <span class="rod-dom-code">${renderNodeSyntax(row.node, expanded)}</span>

        <span class="rod-dom-badges">${renderNodeBadges(row.node)}</span>
      </div>
    `;
	}

	function renderNodeSyntax(node, expanded) {
		if (node.nodeType === Node.ELEMENT_NODE) {
			const element = node;
			const tag = element.tagName.toLowerCase();
			const attrs = Array.from(element.attributes || []).slice(0, MAX_DOM_ATTRIBUTES);
			return F.html`
        <span class="tok-punct">&lt;</span><span class="tok-tag">${tag}</span>${attrs.map((attr) => F.html`
          <span> </span><span class="tok-attr">${attr.name}</span><span class="tok-equals">=</span><span class="tok-string">"${trim(attr.value, 90)}"</span>
        `)}<span class="tok-punct">${expanded ? "&gt;" : "&gt;"}</span>${!expanded ? collapsedNodeTail(element) : ""}
      `;
		}

		if (node.nodeType === Node.TEXT_NODE) {
			return F.html`<span class="tok-text">${JSON.stringify(trim(node.textContent || "", MAX_DOM_TEXT_PREVIEW))}</span>`;
		}

		if (node.nodeType === Node.COMMENT_NODE) {
			return F.html`<span class="tok-comment">&lt;!--${trim(node.textContent || "", MAX_DOM_TEXT_PREVIEW)}--&gt;</span>`;
		}

		if (node.nodeType === Node.DOCUMENT_TYPE_NODE) {
			return F.html`<span class="tok-doctype">&lt;!doctype ${(node).name || "html"}&gt;</span>`;
		}

		return F.html`<span class="tok-text">${node.nodeName}</span>`;
	}

	function collapsedNodeTail(element) {
		const text = directTextPreview(element);
		const tag = element.tagName.toLowerCase();
		return F.html`${text ? F.html`<span class="tok-text">${trim(text, 44)}</span>` : ""}<span class="tok-punct">&lt;/</span><span class="tok-tag">${tag}</span><span class="tok-punct">&gt;</span>`;
	}

	function renderNodeBadges(node) {
		if (!(node instanceof Element)) {
			return "";
		}

		const styles = globalWindow.getComputedStyle(node);
		const badges = [];

		if (styles.display === "flex" || styles.display === "inline-flex") {
			badges.push("flex");
		}
		if (styles.display === "grid" || styles.display === "inline-grid") {
			badges.push("grid");
		}
		if (node === globalDocument.activeElement) {
			badges.push("active");
		}
		if (node.shadowRoot) {
			badges.push("shadow-root");
		}

		return F.html`${badges.map((badge) => F.html`<span class="rod-mini-badge">${badge}</span>`)}`;
	}

	function flattenDom(rootNode, search) {
		const rows = [];
		const normalized = String(search || "").trim().toLowerCase();

		const visit = (node, depth) => {
			if (!node || depth > MAX_DOM_DEPTH || isOwnNode(node)) {
				return;
			}

			const id = getNodeId(node);
			const childNodes = getInspectableChildNodes(node);
			const matches = !normalized || getNodeSearchText(node).includes(normalized);

			if (matches) {
				rows.push({ id, node, depth, childCount: childNodes.length });
			}

			if (!expandedDomNodeIds.has(id) && !normalized) {
				return;
			}

			for (const child of childNodes) {
				visit(child, depth + 1);
			}
		};

		visit(rootNode, 0);
		return rows;
	}

	function flattenLogs(entries, filter, search) {
		const rows = [];
		const normalized = String(search || "").trim().toLowerCase();
		let index = 0;

		const visit = (entry, depth) => {
			const matchesFilter = filter === "all" || entry.type === filter;
			const matchesSearch = !normalized || entry.values.map(searchTextForValue).join(" ").toLowerCase().includes(normalized);

			if (matchesFilter && matchesSearch) {
				rows.push({ entry, depth, index: index++ });
			}

			if (entry.children.length && expandedLogIds.has(entry.id)) {
				for (const child of entry.children) {
					visit(child, depth + 1);
				}
			}
		};

		for (const entry of entries) {
			visit(entry, 0);
		}

		return rows;
	}

	function mountRepl(host) {
		host.replaceChildren();

		const fallback = globalDocument.createElement("textarea");
		fallback.className = "rod-repl-input";
		fallback.placeholder = "Run JavaScript in the page context...";
		fallback.autocomplete = "off";
		fallback.spellcheck = false;
		fallback.addEventListener("keydown", onFallbackReplKeyDown);
		fallback.addEventListener("input", () => showSuggestionsFromText(fallback.value, fallback.selectionStart, getFallbackCaretRect(fallback)));
		fallback.addEventListener("click", () => showSuggestionsFromText(fallback.value, fallback.selectionStart, getFallbackCaretRect(fallback)));
		host.append(fallback);
		replFallbackInput = fallback;

		loadCodeMirror().then((modules) => {
			if (!host.isConnected || !modules) {
				return;
			}

			fallback.remove();
			replFallbackInput = null;
			createCodeMirrorEditor(host, modules);
		}).catch(() => {
			addConsoleEntry("warn", ["CodeMirror 6 @require global was not found. Textarea REPL fallback is active. Make sure rod-panel-codemirror6.iife.js is hosted and listed before this userscript."]);
		});
	}

	/**
	 * Reads the userscript @require-provided CodeMirror 6 IIFE bundle.
	 *
	 * CodeMirror 6 is ESM-first, so the userscript-safe path is a prebuilt IIFE
	 * that exposes `window.RodPanelCodeMirror6`. This avoids dynamic import, page
	 * CSP surprises, and Safari module timing traps.
	 */
	async function loadCodeMirror() {
		if (globalWindow.__RodPanelCodeMirrorModules) {
			return globalWindow.__RodPanelCodeMirrorModules;
		}

		const modules = globalWindow.RodPanelCodeMirror6 || globalWindow.CodeMirror6 || null;

		if (!modules || !hasRequiredCodeMirrorGlobals(modules)) {
			return null;
		}

		globalWindow.__RodPanelCodeMirrorModules = modules;
		return modules;
	}

	function hasRequiredCodeMirrorGlobals(modules) {
		return REQUIRED_CODEMIRROR_GLOBALS.every((key) => modules && modules[key]);
	}

	function createCodeMirrorEditor(host, modules) {
		const { EditorState, EditorView, basicSetup, javascript, keymap } = modules;

		replEditor = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: "",
				extensions: [
					basicSetup,
					javascript ? javascript() : [],
					keymap.of([
						{ key: "Enter", run: () => { runCurrentRepl(); return true; } },
						{ key: "Shift-Enter", run: () => false },
						{ key: "ArrowUp", run: () => navigateReplHistory(-1) },
						{ key: "ArrowDown", run: () => navigateReplHistory(1) },
					]),
					EditorView.updateListener.of((update) => {
						if (!update.docChanged && !update.selectionSet) {
							return;
						}
						const position = update.state.selection.main.head;
						const rect = replEditor.coordsAtPos(position) || host.getBoundingClientRect();
						showSuggestionsFromText(update.state.doc.toString(), position, rect);
					}),
				],
			}),
		});
	}

	function runCurrentRepl() {
		const source = getReplSource().trim();
		if (!source) {
			return;
		}

		replHistory.push(source);
		evaluateRepl(source);
	}

	function getReplSource() {
		if (replEditor) {
			return replEditor.state.doc.toString();
		}
		return replFallbackInput?.value || "";
	}

	function setReplSource(source) {
		if (replEditor) {
			replEditor.dispatch({ changes: { from: 0, to: replEditor.state.doc.length, insert: source } });
			replEditor.focus();
			return;
		}
		if (replFallbackInput) {
			replFallbackInput.value = source;
			replFallbackInput.focus();
		}
	}

	async function evaluateRepl(source) {
		addConsoleEntry("log", [">", source]);

		try {
			const result = await evaluateAsExpressionOrProgram(source);
			lastReplResult = result;
			globalWindow.$_ = result;
			addConsoleEntry("log", [result]);
		} catch (error) {
			addConsoleEntry("error", [error]);
		}
	}

	async function evaluateAsExpressionOrProgram(source) {
		const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
		const scopeNames = ["$0", "$_", "$", "$$", "window", "document", "console"];
		const scopeValues = [selectedNode, lastReplResult, pageQueryOne, pageQueryAll, globalWindow, globalDocument, console];

		try {
			const expression = new AsyncFunction(...scopeNames, `"use strict"; return await (${source});`);
			return await expression(...scopeValues);
		} catch (expressionError) {
			const program = new AsyncFunction(...scopeNames, `"use strict"; ${source}`);
			return await program(...scopeValues);
		}
	}

	function showSuggestionsFromText(text, position, rect) {
		const context = getCompletionContext(text, position);
		if (!context || context.prefix.length < AUTOCOMPLETE_MIN_CHARS) {
			closeSuggestions();
			return;
		}

		const suggestions = getContextualSuggestions(context).slice(0, AUTOCOMPLETE_LIMIT);
		if (!suggestions.length) {
			closeSuggestions();
			return;
		}

		openSuggestions({ suggestions, context, rect });
	}

	/** Builds contextual completions from window globals, selected nodes and nested object paths. */
	function getContextualSuggestions(context) {
		const target = resolveCompletionTarget(context.basePath);
		if (!target.resolved) {
			return [];
		}

		const seen = new Set();
		const suggestions = [];
		let current = target.value;
		let depth = 0;

		while (current != null && depth < 5) {
			for (const key of safeOwnKeys(current)) {
				if (seen.has(key) || !key.startsWith(context.prefix)) {
					continue;
				}
				seen.add(key);
				suggestions.push({ label: key, kind: detectCompletionKind(safeRead(current, key)) });
			}
			current = Object.getPrototypeOf(current);
			depth += 1;
		}

		return suggestions.sort((left, right) => left.label.localeCompare(right.label));
	}

	function openSuggestions({ suggestions, context, rect }) {
		closeSuggestions();

		const popover = globalDocument.createElement("div");
		popover.id = SUGGESTION_ID;
		popover.className = "rod-suggest-popover";
		applyThemeVarsToElement(popover);

		F.render(popover, F.html`
      <div class="rod-suggest-head">
        <span>${icon("sparkle")} ${context.basePath.length ? context.basePath.join(".") : "window"}</span>
        <button class="rod-toggle" type="button" title="Close suggestions" @click=${closeSuggestions}>${icon("close")}</button>
      </div>
      <div class="rod-suggest-list">
        ${suggestions.map((suggestion, index) => F.html`
          <button
            class=${`rod-suggest-item ${index === 0 ? "is-active" : ""}`}
            type="button"
            @click=${() => applySuggestion(context, suggestion)}
          >
            <span>${suggestion.label}</span>
            <span class="rod-suggest-kind">${suggestion.kind}</span>
          </button>
        `)}
      </div>
    `);

		globalDocument.documentElement.append(popover);
		positionPopover(popover, rect);
		currentSuggestionController = { popover, context, suggestions };
	}

	function closeSuggestions() {
		globalDocument.getElementById(SUGGESTION_ID)?.remove();
		currentSuggestionController = null;
	}

	function applySuggestion(context, suggestion) {
		const source = getReplSource();
		const start = context.replaceFrom;
		const end = context.replaceTo;
		const next = `${source.slice(0, start)}${suggestion.label}${source.slice(end)}`;
		setReplSource(next);
		closeSuggestions();
	}

	function getCompletionContext(text, position) {
		const before = text.slice(0, position);
		const match = before.match(/(?:[$A-Za-z_][\w$]*|\$0|\$\$|\$)(?:\.(?:[$A-Za-z_][\w$]*)?)*$/);
		if (!match) {
			return null;
		}

		const token = match[0];
		const parts = token.split(".");
		const prefix = parts.pop() || "";

		return {
			token,
			basePath: parts,
			prefix,
			replaceFrom: position - prefix.length,
			replaceTo: position,
		};
	}

	function resolveCompletionTarget(basePath) {
		if (!basePath.length) {
			return { resolved: true, value: globalWindow };
		}

		const first = basePath[0];
		let current;

		if (first === "$0") current = selectedNode;
		else if (first === "$_") current = lastReplResult;
		else if (first === "$") current = pageQueryOne;
		else if (first === "$$") current = pageQueryAll;
		else current = globalWindow[first];

		for (let index = 1; index < basePath.length; index += 1) {
			current = safeRead(current, basePath[index]);
			if (current == null) {
				return { resolved: false, value: null };
			}
		}

		return { resolved: true, value: current };
	}

	function interceptConsole() {
		if (console.__rodPanelShellV2Patched) {
			return;
		}

		Object.defineProperty(console, "__rodPanelShellV2Patched", { value: true, configurable: false });

		for (const method of LOG_METHODS) {
			originalConsole[method] = console[method].bind(console);
			console[method] = (...values) => {
				originalConsole[method](...values);
				if (!suppressConsoleCapture) {
					addConsoleEntry(method, values);
				}
			};
		}

		patchConsoleGroups();
		patchConsoleUtilities();
	}

	function patchConsoleGroups() {
		originalConsole.group = console.group?.bind(console) || originalConsole.log;
		originalConsole.groupCollapsed = console.groupCollapsed?.bind(console) || originalConsole.group;
		originalConsole.groupEnd = console.groupEnd?.bind(console) || originalConsole.log;

		console.group = (...values) => {
			originalConsole.group(...values);
			groupStack.push(addConsoleEntry("group", values.length ? values : ["Group"], { expanded: true, children: [] }));
		};

		console.groupCollapsed = (...values) => {
			originalConsole.groupCollapsed(...values);
			groupStack.push(addConsoleEntry("group", values.length ? values : ["Group"], { expanded: false, children: [] }));
		};

		console.groupEnd = (...values) => {
			originalConsole.groupEnd(...values);
			groupStack.pop();
		};
	}

	function patchConsoleUtilities() {
		originalConsole.clear = console.clear.bind(console);
		originalConsole.count = console.count?.bind(console) || originalConsole.log;
		originalConsole.countReset = console.countReset?.bind(console) || originalConsole.log;
		originalConsole.time = console.time?.bind(console) || originalConsole.log;
		originalConsole.timeEnd = console.timeEnd?.bind(console) || originalConsole.log;
		originalConsole.assert = console.assert?.bind(console) || originalConsole.error;
		originalConsole.table = console.table?.bind(console) || originalConsole.log;

		console.clear = (...values) => {
			originalConsole.clear(...values);
			clearConsole();
		};

		console.count = (label = "default") => {
			originalConsole.count(label);
			const key = String(label);
			const next = (counters.get(key) || 0) + 1;
			counters.set(key, next);
			addConsoleEntry("count", [`${key}: ${next}`]);
		};

		console.countReset = (label = "default") => {
			originalConsole.countReset(label);
			counters.delete(String(label));
			addConsoleEntry("count", [`${String(label)}: 0`]);
		};

		console.time = (label = "default") => {
			originalConsole.time(label);
			timers.set(String(label), performance.now());
		};

		console.timeEnd = (label = "default") => {
			originalConsole.timeEnd(label);
			const key = String(label);
			const started = timers.get(key);
			timers.delete(key);
			addConsoleEntry("time", [started == null ? `${key}: timer missing` : `${key}: ${(performance.now() - started).toFixed(2)}ms`]);
		};

		console.assert = (condition, ...values) => {
			originalConsole.assert(condition, ...values);
			if (!condition) {
				addConsoleEntry("error", values.length ? values : ["Assertion failed"]);
			}
		};

		console.table = (value, columns) => {
			originalConsole.table(value, columns);
			addConsoleEntry("log", ["table", value, columns].filter((entry) => entry !== undefined));
		};
	}

	function addConsoleEntry(type, values, options = {}) {
		const entry = {
			id: `log-${nextLogId++}`,
			type,
			values,
			time: Date.now(),
			children: options.children || [],
		};

		if (options.expanded !== false) {
			expandedLogIds.add(entry.id);
		}

		const parent = groupStack[groupStack.length - 1];
		if (parent && parent !== entry) {
			parent.children.push(entry);
			logs.become(logs.value.slice()).because(`console:${type}`);
			return entry;
		}

		const next = logs.value.concat(entry);
		if (next.length > MAX_LOGS) {
			next.splice(0, next.length - MAX_LOGS);
		}
		logs.because(`console:${type}`).become(next);
		return entry;
	}

	function clearConsole() {
		logs.because("console:clear").become([]);
		expandedLogIds.clear();
		expandedValueIds.clear();
		groupStack.length = 0;
	}

	function selectNode(node, options = {}) {
		if (!node || isOwnNode(node)) {
			return;
		}

		selectedNode = node;
		const id = getNodeId(node);
		app.selectedNodeId.become(id);
		globalWindow.$0 = node;

		if (options.focus) {
			focusNode(node);
		}

		if (options.activateDom) {
			app.activeTab.become("dom");
		}

		expandAncestors(node);
		updateDomViewport({ scrollToSelected: true });
	}

	function focusSelectedNode() {
		if (selectedNode) {
			focusNode(selectedNode);
		}
	}

	function focusNode(node) {
		if (!(node instanceof HTMLElement || node instanceof SVGElement)) {
			return;
		}

		const hadTabIndex = node.hasAttribute("tabindex");
		const previousTabIndex = node.getAttribute("tabindex");

		if (!hadTabIndex && node instanceof HTMLElement) {
			node.setAttribute("tabindex", "-1");
		}

		try {
			node.focus({ preventScroll: true });
		} catch {
			try { node.focus(); } catch {}
		}

		if (!hadTabIndex && node instanceof HTMLElement) {
			globalWindow.setTimeout(() => {
				if (previousTabIndex == null) node.removeAttribute("tabindex");
				else node.setAttribute("tabindex", previousTabIndex);
			}, 1000);
		}
	}

	function toggleInspector() {
		inspectorEnabled = !inspectorEnabled;

		if (inspectorEnabled) {
			globalDocument.addEventListener("pointermove", onInspectMove, true);
			globalDocument.addEventListener("click", onInspectClick, true);
		} else {
			globalDocument.removeEventListener("pointermove", onInspectMove, true);
			globalDocument.removeEventListener("click", onInspectClick, true);
			hideInspectOverlay();
		}

		scheduleShellRender();
	}

	function onInspectMove(event) {
		const target = event.target;
		if (!(target instanceof Element) || isOwnNode(target)) {
			return;
		}
		showInspectOverlay(target);
	}

	function onInspectClick(event) {
		const target = event.target;
		if (!(target instanceof Element) || isOwnNode(target)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		inspectorEnabled = false;
		globalDocument.removeEventListener("pointermove", onInspectMove, true);
		globalDocument.removeEventListener("click", onInspectClick, true);
		hideInspectOverlay();
		selectNode(target, { focus: true, activateDom: true });
	}

	function showInspectOverlay(element) {
		const rect = element.getBoundingClientRect();
		applyThemeVarsToElement(overlay);
		Object.assign(overlay.style, {
			display: "block",
			left: `${rect.left}px`,
			top: `${rect.top}px`,
			width: `${rect.width}px`,
			height: `${rect.height}px`,
		});
	}

	function hideInspectOverlay() {
		if (overlay) {
			overlay.style.display = "none";
		}
	}

	function onFloatingPointerDown(event) {
		dragRuntime.floating = beginDrag(event, {
			x: app.floatingX.value,
			y: app.floatingY.value,
			width: DEFAULT_FLOAT_SIZE,
			height: DEFAULT_FLOAT_SIZE,
		});
		floatingButton?.setPointerCapture?.(event.pointerId);
	}

	function onFloatingPointerMove(event) {
		const drag = dragRuntime.floating;
		if (!drag) return;
		const next = updateDrag(event, drag);
		app.story("floating-drag", () => {
			app.floatingX.become(clamp(next.x, SAFE_MARGIN, globalWindow.innerWidth - DEFAULT_FLOAT_SIZE - SAFE_MARGIN));
			app.floatingY.become(clamp(next.y, SAFE_MARGIN, globalWindow.innerHeight - DEFAULT_FLOAT_SIZE - SAFE_MARGIN));
		});
	}

	function onFloatingPointerUp(event) {
		const drag = dragRuntime.floating;
		dragRuntime.floating = null;
		try { floatingButton?.releasePointerCapture?.(event.pointerId); } catch {}
		if (!drag || drag.distance <= DRAG_CLICK_THRESHOLD_PX) {
			app.open.become(!app.open.value);
		}
		saveState();
	}

	function onFloatingPointerCancel() {
		dragRuntime.floating = null;
	}

	function onPanelHeaderPointerDown(event) {
		if (event.target.closest("button,input,select,textarea")) return;
		dragRuntime.panel = beginDrag(event, {
			x: app.panelX.value,
			y: app.panelY.value,
			width: app.panelWidth.value,
			height: app.panelHeight.value,
		});
		globalDocument.addEventListener("pointermove", onPanelHeaderPointerMove, true);
		globalDocument.addEventListener("pointerup", onPanelHeaderPointerUp, true);
	}

	function onPanelHeaderPointerMove(event) {
		const drag = dragRuntime.panel;
		if (!drag) return;
		const next = updateDrag(event, drag);
		app.story("panel-drag", () => {
			app.panelX.become(clamp(next.x, SAFE_MARGIN, globalWindow.innerWidth - app.panelWidth.value - SAFE_MARGIN));
			app.panelY.become(clamp(next.y, SAFE_MARGIN, globalWindow.innerHeight - app.panelHeight.value - SAFE_MARGIN));
		});
	}

	function onPanelHeaderPointerUp() {
		dragRuntime.panel = null;
		globalDocument.removeEventListener("pointermove", onPanelHeaderPointerMove, true);
		globalDocument.removeEventListener("pointerup", onPanelHeaderPointerUp, true);
		saveState();
	}

	function onPanelResizePointerDown(event) {
		event.preventDefault();
		event.stopPropagation();
		dragRuntime.resize = beginDrag(event, {
			x: app.panelX.value,
			y: app.panelY.value,
			width: app.panelWidth.value,
			height: app.panelHeight.value,
		});
		globalDocument.addEventListener("pointermove", onPanelResizePointerMove, true);
		globalDocument.addEventListener("pointerup", onPanelResizePointerUp, true);
	}

	function onPanelResizePointerMove(event) {
		const drag = dragRuntime.resize;
		if (!drag) return;
		const dx = event.clientX - drag.startX;
		const dy = event.clientY - drag.startY;
		app.story("panel-resize", () => {
			app.panelWidth.become(clamp(drag.width + dx, MIN_WIDTH, globalWindow.innerWidth - app.panelX.value - SAFE_MARGIN));
			app.panelHeight.become(clamp(drag.height + dy, MIN_HEIGHT, globalWindow.innerHeight - app.panelY.value - SAFE_MARGIN));
		});
	}

	function onPanelResizePointerUp() {
		dragRuntime.resize = null;
		globalDocument.removeEventListener("pointermove", onPanelResizePointerMove, true);
		globalDocument.removeEventListener("pointerup", onPanelResizePointerUp, true);
		saveState();
	}

	function onReplResizePointerDown(event) {
		event.preventDefault();
		event.stopPropagation();
		dragRuntime.repl = { startY: event.clientY, height: app.replHeight.value };
		globalDocument.addEventListener("pointermove", onReplResizePointerMove, true);
		globalDocument.addEventListener("pointerup", onReplResizePointerUp, true);
	}

	function onReplResizePointerMove(event) {
		const drag = dragRuntime.repl;
		if (!drag) return;
		const delta = drag.startY - event.clientY;
		app.replHeight.become(clamp(drag.height + delta, REPL_MIN_HEIGHT, REPL_MAX_HEIGHT));
	}

	function onReplResizePointerUp() {
		dragRuntime.repl = null;
		globalDocument.removeEventListener("pointermove", onReplResizePointerMove, true);
		globalDocument.removeEventListener("pointerup", onReplResizePointerUp, true);
		saveState();
	}

	function onFallbackReplKeyDown(event) {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			runCurrentRepl();
			return;
		}
		if (event.key === "ArrowUp") {
			if (navigateReplHistory(-1)) event.preventDefault();
			return;
		}
		if (event.key === "ArrowDown") {
			if (navigateReplHistory(1)) event.preventDefault();
		}
	}

	function navigateReplHistory(direction) {
		if (!replHistory.length) {
			return false;
		}
		const source = direction < 0 ? replHistory[replHistory.length - 1] : "";
		setReplSource(source);
		return true;
	}

	function onWindowResize() {
		app.story("viewport-resize", () => {
			app.floatingX.become(clamp(app.floatingX.value, SAFE_MARGIN, globalWindow.innerWidth - DEFAULT_FLOAT_SIZE - SAFE_MARGIN));
			app.floatingY.become(clamp(app.floatingY.value, SAFE_MARGIN, globalWindow.innerHeight - DEFAULT_FLOAT_SIZE - SAFE_MARGIN));
			app.panelWidth.become(clamp(app.panelWidth.value, MIN_WIDTH, globalWindow.innerWidth - SAFE_MARGIN * 2));
			app.panelHeight.become(clamp(app.panelHeight.value, MIN_HEIGHT, globalWindow.innerHeight - SAFE_MARGIN * 2));
			app.panelX.become(clamp(app.panelX.value, SAFE_MARGIN, globalWindow.innerWidth - app.panelWidth.value - SAFE_MARGIN));
			app.panelY.become(clamp(app.panelY.value, SAFE_MARGIN, globalWindow.innerHeight - app.panelHeight.value - SAFE_MARGIN));
		});
		saveState();
	}

	function exposeApi() {
		globalWindow.RodPanel = Object.freeze({
			version: VERSION,
			open: () => app.open.become(true),
			close: () => app.open.become(false),
			toggle: () => app.open.become(!app.open.value),
			select: (node) => selectNode(node, { focus: true, activateDom: true }),
			clear: clearConsole,
			getState: () => serializeState(),
			getSelected: () => selectedNode,
			getLogs: () => logs.value.slice(),
		});
	}

	function installSafariZoomGuard() {
		const stopGesture = (event) => {
			if (root && event.target instanceof Node && root.contains(event.target)) {
				event.preventDefault();
			}
		};

		globalDocument.addEventListener("gesturestart", stopGesture, { passive: false, capture: true });
		globalDocument.addEventListener("gesturechange", stopGesture, { passive: false, capture: true });
		globalDocument.addEventListener("gestureend", stopGesture, { passive: false, capture: true });
	}

	function applyRootThemeVars() {
		applyThemeVarsToElement(root);
		root.style.setProperty("--rod-panel-floating-opacity", String(clamp(app.floatingOpacity.value, 0.25, 1)));
	}

	function applyThemeVarsToElement(element) {
		if (!element) return;
		const theme = THEMES[app.theme.value] || THEMES.graphite;
		element.style.setProperty("--rod-panel-bg", alphaReplace(theme.bg, app.opacity.value));
		element.style.setProperty("--rod-panel-bg-soft", alphaReplace(theme.bgSoft, Math.min(1, app.opacity.value + 0.02)));
		element.style.setProperty("--rod-panel-bg-softer", theme.bgSofter);
		element.style.setProperty("--rod-panel-border", theme.border);
		element.style.setProperty("--rod-panel-border-strong", theme.borderStrong);
		element.style.setProperty("--rod-panel-text", theme.text);
		element.style.setProperty("--rod-panel-muted", theme.muted);
		element.style.setProperty("--rod-panel-subtle", theme.subtle);
		element.style.setProperty("--rod-panel-accent", theme.accent);
		element.style.setProperty("--rod-panel-accent-2", theme.accent2);
		element.style.setProperty("--rod-panel-danger", theme.danger);
		element.style.setProperty("--rod-panel-warn", theme.warn);
		element.style.setProperty("--rod-panel-success", theme.success);
		element.style.setProperty("--rod-panel-info", theme.info);
		element.style.setProperty("--rod-panel-shadow", theme.shadow);
	}

	function floatingStyle() {
		return `left:${app.floatingX.value}px;top:${app.floatingY.value}px;`;
	}

	function panelStyle() {
		return `left:${app.panelX.value}px;top:${app.panelY.value}px;width:${app.panelWidth.value}px;height:${app.panelHeight.value}px;`;
	}

	function saveState() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
		} catch {}
	}

	function readState() {
		try {
			return { ...DEFAULT_STATE, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
		} catch {
			return { ...DEFAULT_STATE };
		}
	}

	function serializeState() {
		return {
			open: app.open.value,
			activeTab: app.activeTab.value,
			theme: app.theme.value,
			opacity: app.opacity.value,
			floatingOpacity: app.floatingOpacity.value,
			floatingIcon: app.floatingIcon.value,
			consoleFilter: app.consoleFilter.value,
			consoleSearch: app.consoleSearch.value,
			consoleWrap: app.consoleWrap.value,
			replHeight: app.replHeight.value,
			domSearch: app.domSearch.value,
			selectedNodeId: app.selectedNodeId.value,
			floatingPosition: { x: app.floatingX.value, y: app.floatingY.value },
			panelRect: { x: app.panelX.value, y: app.panelY.value, width: app.panelWidth.value, height: app.panelHeight.value },
		};
	}

	function resolveBundlerRuntime() {
		const candidates = [
			globalWindow.RodBundler,
			globalWindow.Bundler,
			globalWindow.bundler,
			globalWindow.Bundle,
			globalWindow.RodK,
			globalWindow.Cipo,
			globalWindow,
		];

		for (const candidate of candidates) {
			const resolved = normalizeRuntimeCandidate(candidate);
			if (resolved) {
				return resolved;
			}
		}

		for (const key of Object.keys(globalWindow)) {
			const value = globalWindow[key];
			const resolved = normalizeRuntimeCandidate(value);
			if (resolved) {
				return resolved;
			}
		}

		throw new Error(`[${SCRIPT_NAME}] Could not find Seiva, Cipó and Fabrica. Check the bundler IIFE @require URL.`);
	}

	function normalizeRuntimeCandidate(candidate) {
		if (!candidate || typeof candidate !== "object") {
			return null;
		}

		const CipoApi = candidate.Cipo || (candidate.css && candidate.injectGlobal ? candidate : globalWindow.Cipo || globalWindow.RodK);
		const SeivaApi = candidate.Seiva || globalWindow.Seiva;
		const FabricaApi = candidate.Fabrica || globalWindow.Fabrica;

		const cipoOk = CipoApi && (CipoApi.css || CipoApi.cipo?.css) && (CipoApi.injectGlobal || CipoApi.cipo?.injectGlobal);
		const seivaOk = SeivaApi && typeof SeivaApi.world === "function" && typeof SeivaApi.cell === "function";
		const fabricaOk = FabricaApi && typeof FabricaApi.html === "function" && typeof FabricaApi.render === "function";

		if (!cipoOk || !seivaOk || !fabricaOk) {
			return null;
		}

		return { Cipo: CipoApi, Seiva: SeivaApi, Fabrica: FabricaApi };
	}

	function icon(name) {
		const span = globalDocument.createElement("span");
		span.className = "rod-icon";
		span.setAttribute("aria-hidden", "true");
		const lucideName = ICONS[name] || name;
		const svg = createLucideIcon(lucideName);
		if (svg) span.append(svg);
		else span.textContent = name;
		return span;
	}

	function createLucideIcon(name) {
		try {
			const icons = globalWindow.lucide?.icons || globalWindow.lucide;
			const createElement = globalWindow.lucide?.createElement;
			if (!icons || typeof createElement !== "function" || !icons[name]) return null;
			return createElement(icons[name]);
		} catch {
			return null;
		}
	}

	function getNodeId(node) {
		let id = nodeIds.get(node);
		if (!id) {
			id = `dom-${nextNodeId++}`;
			nodeIds.set(node, id);
			nodesById.set(id, node);
		}
		return id;
	}

	function toggleDomNode(id) {
		if (expandedDomNodeIds.has(id)) expandedDomNodeIds.delete(id);
		else expandedDomNodeIds.add(id);
		updateDomViewport();
	}

	function toggleLog(id) {
		if (expandedLogIds.has(id)) expandedLogIds.delete(id);
		else expandedLogIds.add(id);
		updateConsoleViewport();
	}

	function toggleValue(id) {
		if (expandedValueIds.has(id)) expandedValueIds.delete(id);
		else expandedValueIds.add(id);
		updateConsoleViewport();
	}

	function expandAncestors(node) {
		let current = node;
		while (current && current !== globalDocument) {
			expandedDomNodeIds.add(getNodeId(current));
			current = current.parentNode || current.host || null;
		}
	}

	function getInspectableChildNodes(node) {
		const children = [];

		if (node instanceof Element && node.shadowRoot) {
			children.push(node.shadowRoot);
		}

		for (const child of Array.from(node.childNodes || [])) {
			if (isIgnorableText(child) || isOwnNode(child)) continue;
			children.push(child);
		}

		return children;
	}

	function isIgnorableText(node) {
		return node.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim();
	}

	function getNodeSearchText(node) {
		if (node.nodeType === Node.ELEMENT_NODE) {
			const element = node;
			return `${element.tagName} ${element.id} ${element.className} ${Array.from(element.attributes || []).map((attr) => `${attr.name}=${attr.value}`).join(" ")}`.toLowerCase();
		}
		return `${node.nodeName} ${node.textContent || ""}`.toLowerCase();
	}

	function directTextPreview(element) {
		let text = "";
		for (const child of Array.from(element.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) text += child.textContent || "";
		}
		return text.trim().replace(/\s+/g, " ");
	}

	function formatNodeLabel(node) {
		if (!node) return "No element selected";
		if (node instanceof Element) {
			const id = node.id ? `#${node.id}` : "";
			const classes = Array.from(node.classList || []).slice(0, 4).map((item) => `.${item}`).join("");
			return `<${node.tagName.toLowerCase()}${id}${classes}>`;
		}
		return node.nodeName;
	}

	function pageQueryOne(selector) {
		return globalDocument.querySelector(selector);
	}

	function pageQueryAll(selector) {
		return Array.from(globalDocument.querySelectorAll(selector));
	}

	function isOwnNode(node) {
		return Boolean(root && node instanceof Node && (root === node || root.contains(node))) || Boolean(overlay && node instanceof Node && (overlay === node || overlay.contains(node)));
	}

	function getLogMeta(type) {
		if (type === "error" || type === "assert") return { label: "Error", icon: "error", className: "is-error" };
		if (type === "warn") return { label: "Warn", icon: "warning", className: "is-warn" };
		if (type === "info") return { label: "Info", icon: "info", className: "is-info" };
		if (type === "debug") return { label: "Debug", icon: "bug", className: "is-debug" };
		if (type === "trace") return { label: "Trace", icon: "bug", className: "is-debug" };
		if (type === "group") return { label: "Group", icon: "box", className: "is-group" };
		if (type === "time") return { label: "Time", icon: "play", className: "is-info" };
		if (type === "count") return { label: "Count", icon: "box", className: "is-log" };
		return { label: "Log", icon: "terminal", className: "is-log" };
	}

	function detectValueType(value) {
		if (value === null) return "null";
		const primitive = typeof value;
		if (primitive !== "object") return primitive;
		if (value instanceof Error) return "error";
		if (value instanceof Element) return "element";
		if (value instanceof Node) return "node";
		if (Array.isArray(value)) return "array";
		if (value instanceof Date) return "date";
		if (value instanceof RegExp) return "regexp";
		if (value instanceof Map) return "map";
		if (value instanceof Set) return "set";
		if (value instanceof Promise) return "promise";
		if (ArrayBuffer.isView(value)) return "typedarray";
		return "object";
	}

	function getValueMeta(type) {
		if (type === "string") return { className: "is-string" };
		if (type === "number" || type === "bigint") return { className: "is-number" };
		if (type === "boolean") return { className: "is-boolean" };
		if (type === "null" || type === "undefined") return { className: "is-nullish" };
		if (type === "function") return { className: "is-function" };
		if (type === "element" || type === "node") return { className: "is-element" };
		if (type === "error") return { className: "is-error-value" };
		return { className: "is-object" };
	}

	function previewValue(value, type = detectValueType(value)) {
		try {
			if (type === "string") return JSON.stringify(trim(value, 420));
			if (type === "number" || type === "bigint" || type === "boolean" || type === "undefined" || type === "symbol") return String(value);
			if (type === "null") return "null";
			if (type === "function") return `ƒ ${value.name || "anonymous"}(${value.length})`;
			if (type === "error") return `${value.name}: ${value.message}`;
			if (type === "element" || type === "node") return formatNodeLabel(value);
			if (type === "array") return `Array(${value.length})`;
			if (type === "date") return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
			if (type === "regexp") return String(value);
			if (type === "map") return `Map(${value.size})`;
			if (type === "set") return `Set(${value.size})`;
			if (type === "promise") return "Promise";
			if (type === "typedarray") return `${value.constructor?.name || "TypedArray"}(${value.length})`;
			return objectPreview(value);
		} catch {
			return Object.prototype.toString.call(value);
		}
	}

	function objectPreview(value) {
		const name = value?.constructor?.name && value.constructor.name !== "Object" ? `${value.constructor.name} ` : "";
		const keys = Object.keys(value || {}).slice(0, 4);
		return `${name}{ ${keys.map((key) => `${key}: ${previewValue(value[key])}`).join(", ")}${Object.keys(value || {}).length > 4 ? ", …" : ""} }`;
	}

	function isInspectableValue(value) {
		if (value == null) return false;
		return typeof value === "object" || typeof value === "function";
	}

	function getInspectableEntries(value) {
		if (value == null) return [];
		if (value instanceof Error) return [{ key: "name", value: value.name }, { key: "message", value: value.message }, { key: "stack", value: value.stack || "" }];
		if (value instanceof Element) return [{ key: "node", value: formatNodeLabel(value) }, { key: "textContent", value: trim(value.textContent || "", 300) }, ...Array.from(value.attributes || []).map((attr) => ({ key: `@${attr.name}`, value: attr.value }))];
		if (value instanceof Map) return Array.from(value.entries()).map(([key, entry]) => ({ key: previewValue(key), value: entry }));
		if (value instanceof Set) return Array.from(value.values()).map((entry, index) => ({ key: String(index), value: entry }));
		if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value).map((entry, index) => ({ key: String(index), value: entry }));
		if (typeof value === "function") return [{ key: "name", value: value.name || "anonymous" }, { key: "length", value: value.length }, { key: "source", value: trim(Function.prototype.toString.call(value), 900) }];
		return Object.keys(value).map((key) => ({ key, value: safeRead(value, key) }));
	}

	function searchTextForValue(value) {
		return `${previewValue(value)} ${getInspectableEntries(value).slice(0, 12).map((entry) => `${entry.key} ${previewValue(entry.value)}`).join(" ")}`;
	}

	function getFallbackCaretRect(input) {
		const rect = input.getBoundingClientRect();
		return { left: rect.left + 18, right: rect.left + 18, top: rect.bottom - 24, bottom: rect.bottom - 8 };
	}

	function positionPopover(popover, rect) {
		const width = Math.min(360, globalWindow.innerWidth - 20);
		const height = Math.min(290, globalWindow.innerHeight - 32);
		let left = rect.left;
		let top = rect.bottom + 8;

		if (left + width > globalWindow.innerWidth - SAFE_MARGIN) {
			left = globalWindow.innerWidth - width - SAFE_MARGIN;
		}
		if (top + height > globalWindow.innerHeight - SAFE_MARGIN) {
			top = Math.max(SAFE_MARGIN, rect.top - height - 8);
		}

		popover.style.left = `${Math.max(SAFE_MARGIN, left)}px`;
		popover.style.top = `${Math.max(SAFE_MARGIN, top)}px`;
	}

	function safeOwnKeys(value) {
		try { return Reflect.ownKeys(value).filter((key) => typeof key === "string"); } catch { return []; }
	}

	function safeRead(value, key) {
		try { return value?.[key]; } catch (error) { return error; }
	}

	function detectCompletionKind(value) {
		if (typeof value === "function") return "method";
		if (Array.isArray(value)) return "array";
		if (value instanceof Element) return "element";
		if (value && typeof value === "object") return value.constructor?.name || "object";
		return typeof value;
	}

	function beginDrag(event, rect) {
		return { startX: event.clientX, startY: event.clientY, x: rect.x, y: rect.y, width: rect.width, height: rect.height, distance: 0 };
	}

	function updateDrag(event, drag) {
		const dx = event.clientX - drag.startX;
		const dy = event.clientY - drag.startY;
		drag.distance = Math.max(drag.distance, Math.hypot(dx, dy));
		return { x: drag.x + dx, y: drag.y + dy };
	}

	function createDragRuntime() {
		return { floating: null, panel: null, resize: null, repl: null };
	}

	function scheduleFrame(key, callback) {
		const property = `__rodScheduled_${key}`;
		if (scheduleFrame[property]) return;
		scheduleFrame[property] = true;
		globalWindow.requestAnimationFrame(() => {
			scheduleFrame[property] = false;
			callback();
			saveState();
		});
	}

	function alphaReplace(color, alpha) {
		return String(color).replace(/rgba\(([^,]+),([^,]+),([^,]+),\s*[^)]+\)/, `rgba($1,$2,$3,${clamp(alpha, 0.25, 1)})`);
	}

	function formatTime(time) {
		const date = new Date(time);
		return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
	}

	function trim(value, max) {
		const text = String(value);
		return text.length > max ? `${text.slice(0, max)}…` : text;
	}

	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}
})(window, document);