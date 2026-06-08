// ==UserScript==
// @name         Rod / DevTools / Source IDE
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile source viewer with CodeMirror, viewport-first highlighting, and async formatting.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @weight       860
// @grant        none
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// @require      https://unpkg.com/prettier@2.8.4/standalone.js
// @require      https://unpkg.com/prettier@2.8.4/parser-postcss.js
// @require      https://unpkg.com/prettier@2.8.4/parser-html.js
// @require      https://unpkg.com/prettier@2.8.4/parser-babel.js
// @require      https://unpkg.com/prettier@2.8.4/parser-typescript.js
// @require      https://unpkg.com/prettier@2.8.4/parser-markdown.js
// @require      https://unpkg.com/prettier@2.8.4/parser-yaml.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/acorn/8.11.3/acorn.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/acorn-walk/8.3.2/walk.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/javascript/javascript.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/css/css.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/xml/xml.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/htmlmixed/htmlmixed.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/markdown/markdown.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/yaml/yaml.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/dialog/dialog.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/search/searchcursor.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/search/search.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/fold/foldcode.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/fold/foldgutter.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/fold/brace-fold.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/fold/xml-fold.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/fold/indent-fold.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/addon/edit/matchbrackets.min.js
// @require      https://unpkg.com/lucide@0.468.0/dist/umd/lucide.js
// ==/UserScript==

/* global prettier, prettierPlugins, CodeMirror, acorn, acornWalk, lucide */

(() => {
	"use strict";

	/***************************************************************************
	 * Constants
	 **************************************************************************/

	const ROOT_ID = "__rod_source_ide_ultra__";
	const STYLE_ID = "__rod_source_ide_ultra_style__";
	const CDN_BASE = "https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7";

	const PRETTIER_STANDALONE_URL = "https://unpkg.com/prettier@2.8.4/standalone.js";
	const PRETTIER_PLUGIN_URLS = [
		"https://unpkg.com/prettier@2.8.4/parser-postcss.js",
		"https://unpkg.com/prettier@2.8.4/parser-html.js",
		"https://unpkg.com/prettier@2.8.4/parser-babel.js",
		"https://unpkg.com/prettier@2.8.4/parser-typescript.js",
		"https://unpkg.com/prettier@2.8.4/parser-markdown.js",
		"https://unpkg.com/prettier@2.8.4/parser-yaml.js",
	];

	const TOAST_MS = 1050;
	const LONG_PRESS_MS = 480;
	const SWIPE_DOWN_CLOSE_DISTANCE = 72;
	const SWIPE_MIN_X = 74;
	const SWIPE_MAX_Y = 56;
	const MAX_USAGE_ROWS = 80;
	const MAX_USAGE_MARKS = 120;
	const MAX_AST_SOURCE_LENGTH = 220_000;
	const MAX_TEXT_USAGE_SCAN_LENGTH = 350_000;
	const MAX_PRETTIER_SYNC_LENGTH = 80_000;
	const MAX_PRETTIER_WORKER_LENGTH = 900_000;
	const VIRTUAL_VIEWPORT_MARGIN = 8;
	const TOOLBAR_HIDE_MS = 1100;
	const HEADER_SCROLL_THRESHOLD = 10;

	const RESERVED_WORDS = new Set([
		"arguments",
		"await",
		"break",
		"case",
		"catch",
		"class",
		"const",
		"continue",
		"debugger",
		"default",
		"delete",
		"do",
		"else",
		"export",
		"extends",
		"false",
		"finally",
		"for",
		"from",
		"function",
		"if",
		"import",
		"in",
		"instanceof",
		"let",
		"new",
		"null",
		"return",
		"static",
		"super",
		"switch",
		"this",
		"throw",
		"true",
		"try",
		"typeof",
		"undefined",
		"var",
		"void",
		"while",
		"with",
		"yield",
	]);

	/***************************************************************************
	 * Guards
	 **************************************************************************/

	const rawPre = document.querySelector("body > pre");

	if (!rawPre) return;
	if (document.body.firstElementChild !== rawPre) return;
	if (document.getElementById(ROOT_ID)) return;
	if (typeof CodeMirror === "undefined") return;

	const contentType = document.contentType || "";
	const pathname = location.pathname || "";

	if (/^application\/(xhtml\+xml|xml|rss\+xml)|text\/(html|xml)$/i.test(contentType)) return;

	/***************************************************************************
	 * Tiny Helpers
	 **************************************************************************/

	/**
	 * Adds a stylesheet once.
	 *
	 * @param {string} href Stylesheet URL.
	 * @returns {void}
	 *
	 * @example
	 * ```js
	 * addStylesheet("https://example.com/editor.css");
	 * ```
	 */
	function addStylesheet(href) {
		if (document.querySelector(`link[href="${href}"]`)) return;

		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = href;
		document.head.appendChild(link);
	}

	/**
	 * Escapes HTML for safe rendering.
	 *
	 * @param {string} value Raw text.
	 * @returns {string} Escaped text.
	 *
	 * @example
	 * ```js
	 * escapeHtml("<script>");
	 * // "&lt;script&gt;"
	 * ```
	 */
	function escapeHtml(value) {
		return String(value)
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;")
			.replaceAll("'", "&#039;");
	}

	/**
	 * Creates a single DOM node from HTML.
	 *
	 * @param {string} html HTML template.
	 * @returns {HTMLElement} Created element.
	 *
	 * @example
	 * ```js
	 * const button = createElement("<button>Save</button>");
	 * ```
	 */
	function createElement(html) {
		const template = document.createElement("template");
		template.innerHTML = html.trim();

		return /** @type {HTMLElement} */ (template.content.firstElementChild);
	}

	/**
	 * Escapes a string for RegExp usage.
	 *
	 * @param {string} value Raw string.
	 * @returns {string} Escaped string.
	 *
	 * @example
	 * ```js
	 * escapeRegExp("foo.bar");
	 * // "foo\\.bar"
	 * ```
	 */
	function escapeRegExp(value) {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	/**
	 * Detects parser and editor mode from the current source URL and content type.
	 *
	 * @returns {{ parser: string | undefined, mode: string | object, label: string, isJavaScriptLike: boolean }}
	 *
	 * @example
	 * ```js
	 * const kind = detectSourceKind();
	 * console.log(kind.label);
	 * ```
	 */
	function detectSourceKind() {
		if (contentType === "text/css" || /\.(css|scss|less)$/i.test(pathname)) {
			return { parser: "css", mode: "css", label: "css", isJavaScriptLike: false };
		}

		if (contentType === "application/json" || /\.(json|map)$/i.test(pathname)) {
			return {
				parser: "json",
				mode: { name: "javascript", json: true },
				label: "json",
				isJavaScriptLike: false,
			};
		}

		if (/\.tsx?$/i.test(pathname)) {
			return {
				parser: "typescript",
				mode: "text/typescript",
				label: "typescript",
				isJavaScriptLike: true,
			};
		}

		if (/\.jsx?$/i.test(pathname) || /^application\/(x-javascript|javascript)$/i.test(contentType)) {
			return { parser: "babel", mode: "javascript", label: "javascript", isJavaScriptLike: true };
		}

		if (/\.(html?|xhtml|xml|vue)$/i.test(pathname)) {
			return { parser: "html", mode: "htmlmixed", label: "html", isJavaScriptLike: false };
		}

		if (/\.(md|markdown)$/i.test(pathname)) {
			return { parser: "markdown", mode: "markdown", label: "markdown", isJavaScriptLike: false };
		}

		if (/\.ya?ml$/i.test(pathname)) {
			return { parser: "yaml", mode: "yaml", label: "yaml", isJavaScriptLike: false };
		}

		return { parser: "babel", mode: "javascript", label: "javascript", isJavaScriptLike: true };
	}

	/**
	 * Copies text with a Safari-safe fallback.
	 *
	 * @param {string} text Text to copy.
	 * @returns {Promise<boolean>} Whether copy probably worked.
	 *
	 * @example
	 * ```js
	 * await copyText("hello");
	 * ```
	 */
	async function copyText(text) {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				return true;
			}
		} catch {}

		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.readOnly = true;
		textarea.style.cssText =
			"position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;font-size:16px;";

		document.body.appendChild(textarea);

		try {
			textarea.focus();
			textarea.select();
			textarea.setSelectionRange(0, textarea.value.length);
			return document.execCommand("copy");
		} catch {
			return false;
		} finally {
			textarea.remove();
		}
	}

	/**
	 * Saves text as a downloadable file.
	 *
	 * @param {string} text Text to save.
	 * @param {string} filename Filename.
	 * @returns {void}
	 *
	 * @example
	 * ```js
	 * saveTextFile("body {}", "style.css");
	 * ```
	 */
	function saveTextFile(text, filename) {
		const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");

		anchor.href = url;
		anchor.download = filename || "source.txt";
		anchor.style.display = "none";

		document.body.appendChild(anchor);
		anchor.click();

		setTimeout(() => {
			URL.revokeObjectURL(url);
			anchor.remove();
		}, 1000);
	}

	/**
	 * Lets the browser breathe before expensive work.
	 *
	 * @returns {Promise<void>} Idle-ish promise.
	 *
	 * @example
	 * ```js
	 * await waitForIdle();
	 * ```
	 */
	function waitForIdle() {
		return new Promise((resolve) => {
			if ("requestIdleCallback" in window) {
				window.requestIdleCallback(() => resolve(), { timeout: 700 });
				return;
			}

			setTimeout(resolve, 16);
		});
	}

	/**
	 * Creates a Prettier worker that imports Prettier directly inside the worker.
	 *
	 * @returns {Worker | null} Worker instance when the page allows it.
	 *
	 * @example
	 * ```js
	 * const worker = createPrettierWorker();
	 * ```
	 */
	function createPrettierWorker() {
		try {
			const workerSource = `
				self.importScripts(${JSON.stringify(PRETTIER_STANDALONE_URL)}, ${PRETTIER_PLUGIN_URLS.map(JSON.stringify).join(", ")});

				self.onmessage = function onMessage(event) {
					const payload = event.data || {};

					try {
						const formatted = self.prettier.format(payload.source || "", {
							parser: payload.parser,
							plugins: self.prettierPlugins,
							printWidth: 100,
							tabWidth: 2,
							useTabs: false,
							semi: true,
							singleQuote: false,
							trailingComma: "all",
							bracketSpacing: true
						});

						self.postMessage({ id: payload.id, ok: true, formatted });
					} catch (error) {
						self.postMessage({
							id: payload.id,
							ok: false,
							message: error && error.message ? error.message : String(error)
						});
					}
				};
			`;

			const blob = new Blob([workerSource], { type: "text/javascript;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const worker = new Worker(url);

			setTimeout(() => URL.revokeObjectURL(url), 250);
			return worker;
		} catch {
			return null;
		}
	}

	let prettierWorker = null;
	let prettierJobId = 0;

	/**
	 * Formats source using a worker when possible, with a sync fallback for smaller files.
	 *
	 * @param {string} source Source text.
	 * @param {string | undefined} parser Prettier parser.
	 * @returns {Promise<string>} Formatted source or original source if formatting fails.
	 *
	 * @example
	 * ```js
	 * const next = await formatSourceAsync("const x=1", "babel");
	 * ```
	 */
	function formatSourceAsync(source, parser) {
		if (!parser || typeof prettier === "undefined") return Promise.resolve(source);

		if (source.length > MAX_PRETTIER_WORKER_LENGTH) {
			return Promise.resolve(source);
		}

		if (source.length <= MAX_PRETTIER_SYNC_LENGTH) {
			try {
				return Promise.resolve(
					prettier.format(source, {
						parser,
						plugins: prettierPlugins,
						printWidth: 100,
						tabWidth: 2,
						useTabs: false,
						semi: true,
						singleQuote: false,
						trailingComma: "all",
						bracketSpacing: true,
					}),
				);
			} catch (error) {
				console.warn("🍉 [Rod Source IDE Ultra] Prettier sync failed.", error);
				return Promise.resolve(source);
			}
		}

		prettierWorker ||= createPrettierWorker();

		if (!prettierWorker) return Promise.resolve(source);

		const id = ++prettierJobId;

		return new Promise((resolve) => {
			const timeout = window.setTimeout(() => {
				resolve(source);
			}, 12_000);

			const handleMessage = (event) => {
				const payload = event.data || {};
				if (payload.id !== id) return;

				window.clearTimeout(timeout);
				prettierWorker.removeEventListener("message", handleMessage);

				if (!payload.ok) {
					console.warn("🍉 [Rod Source IDE Ultra] Prettier worker failed.", payload.message);
					resolve(source);
					return;
				}

				resolve(payload.formatted || source);
			};

			prettierWorker.addEventListener("message", handleMessage);
			prettierWorker.postMessage({ id, source, parser });
		});
	}

	/**
	 * Locks Safari zoom while keeping CodeMirror text readable.
	 *
	 * @returns {void}
	 *
	 * @example
	 * ```js
	 * lockSafariZoom();
	 * ```
	 */
	function lockSafariZoom() {
		const viewport =
			document.querySelector('meta[name="viewport"]') ||
			document.head.appendChild(document.createElement("meta"));

		viewport.setAttribute("name", "viewport");
		viewport.setAttribute(
			"content",
			"width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover",
		);

		let lastTouchEnd = 0;

		const preventGesture = (event) => event.preventDefault();

		const preventMultiTouch = (event) => {
			if (event.touches && event.touches.length > 1) event.preventDefault();
		};

		const preventDoubleTapZoom = (event) => {
			const now = Date.now();

			if (now - lastTouchEnd <= 320) event.preventDefault();

			lastTouchEnd = now;
		};

		document.addEventListener("gesturestart", preventGesture, { passive: false });
		document.addEventListener("gesturechange", preventGesture, { passive: false });
		document.addEventListener("gestureend", preventGesture, { passive: false });
		document.addEventListener("touchstart", preventMultiTouch, { passive: false });
		document.addEventListener("touchmove", preventMultiTouch, { passive: false });
		document.addEventListener("touchend", preventDoubleTapZoom, { passive: false });
	}

	/***************************************************************************
	 * Source
	 **************************************************************************/

	const detected = detectSourceKind();
	const initialSource = (rawPre.textContent || "").trimStart();
	const lineCount = Math.max(1, initialSource.split("\n").length);

	addStylesheet(`${CDN_BASE}/codemirror.min.css`);
	addStylesheet(`${CDN_BASE}/addon/dialog/dialog.min.css`);
	addStylesheet(`${CDN_BASE}/addon/fold/foldgutter.min.css`);
	lockSafariZoom();

	/***************************************************************************
	 * Shell
	 **************************************************************************/

	const root = createElement(`
    <main id="${ROOT_ID}">
      <section class="rod-editor-card">
        <div class="rod-editor-host"></div>
      </section>

      <header class="rod-topbar is-visible">
        <div class="rod-brand">
          <span class="rod-dot">🍉</span>
          <strong>IDE</strong>
          <small>${escapeHtml(detected.label)} · ${lineCount} lines</small>
        </div>

        <div class="rod-actions">
          <button type="button" data-action="search" title="Search"><i data-lucide="search"></i></button>
          <button type="button" data-action="toggle-wrap" title="Soft wrap"><i data-lucide="wrap-text"></i></button>
          <button type="button" data-action="command" title="Commands"><i data-lucide="command"></i></button>
          
          <button type="button" data-action="format" title="Format Editor"><i data-lucide="wand-sparkles"></i></button>
        </div>
      </header>

      <aside class="rod-panel rod-command-menu" hidden>
        <div class="rod-handle"></div>
        <strong class="rod-panel-title">Commands</strong>
        <div class="rod-command-grid"></div>
      </aside>

      <aside class="rod-panel rod-usages-sheet" hidden>
        <div class="rod-handle"></div>
        <div class="rod-panel-head">
          <strong></strong>
          <button type="button" data-action="close-usages"><i data-lucide="x"></i></button>
        </div>
        <div class="rod-usage-body"></div>
      </aside>

      <div class="rod-toast" hidden></div>
    </main>
  `);

	rawPre.replaceWith(root);

	const editorHost = /** @type {HTMLElement} */ (root.querySelector(".rod-editor-host"));
	const topbar = /** @type {HTMLElement} */ (root.querySelector(".rod-topbar"));
	const commandMenu = /** @type {HTMLElement} */ (root.querySelector(".rod-command-menu"));
	const commandGrid = /** @type {HTMLElement} */ (root.querySelector(".rod-command-grid"));
	const usagesSheet = /** @type {HTMLElement} */ (root.querySelector(".rod-usages-sheet"));
	const usageTitle = /** @type {HTMLElement} */ (root.querySelector(".rod-panel-head strong"));
	const usageBody = /** @type {HTMLElement} */ (root.querySelector(".rod-usage-body"));
	const toastBox = /** @type {HTMLElement} */ (root.querySelector(".rod-toast"));

	/***************************************************************************
	 * CSS
	 **************************************************************************/

	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = `
    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      background: #070b12 !important;
      color: #e9edf7 !important;
      -webkit-text-size-adjust: 100% !important;
      overscroll-behavior: none !important;
    }

    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      padding: max(0.18rem, env(safe-area-inset-top)) max(0.16rem, env(safe-area-inset-right)) max(0.16rem, env(safe-area-inset-bottom)) max(0.16rem, env(safe-area-inset-left));
      background: #070b12;
      color: #e9edf7;
      overflow: hidden;
      box-sizing: border-box;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${ROOT_ID} * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent !important;
    }

    #${ROOT_ID} button {
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.075);
      color: #e9edf7;
      font: inherit;
      font-weight: 800;
      touch-action: manipulation;
    }

    #${ROOT_ID} button:active {
      transform: scale(0.985);
      background: rgba(255,255,255,0.13);
    }

    #${ROOT_ID} svg {
      width: 1rem;
      height: 1rem;
      stroke-width: 2.35;
      pointer-events: none;
    }

    #${ROOT_ID} .rod-editor-card {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 0.75rem;
      background: #070b12;
      contain: strict;
    }

    #${ROOT_ID} .rod-editor-host {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    #${ROOT_ID} .rod-topbar {
      position: fixed;
      left: max(0.36rem, env(safe-area-inset-left));
      right: max(0.36rem, env(safe-area-inset-right));
      top: max(0.34rem, env(safe-area-inset-top));
      z-index: 40;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 2.48rem;
      gap: 0.4rem;
      padding: 0.26rem 0.3rem 0.26rem 0.44rem;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 0.72rem;
      background: rgba(9, 14, 24, 0.78);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-125%);
      transition: opacity 120ms ease, transform 120ms ease;
    }

    #${ROOT_ID} .rod-topbar.is-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    #${ROOT_ID} .rod-brand {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 0.32rem;
    }

    #${ROOT_ID} .rod-dot {
      display: grid;
      place-items: center;
      width: 1.66rem;
      height: 1.66rem;
      border-radius: 0.52rem;
      background: rgba(255,95,126,0.15);
    }

    #${ROOT_ID} .rod-brand strong {
      font-size: 0.78rem;
      letter-spacing: -0.03em;
    }

    #${ROOT_ID} .rod-brand small {
      max-width: 7.5rem;
      overflow: hidden;
      color: #aeb8d3;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.64rem;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    #${ROOT_ID} .rod-actions {
      display: flex;
      gap: 0.26rem;
    }

    #${ROOT_ID} .rod-actions button,
    #${ROOT_ID} .rod-panel-head button {
      display: grid;
      place-items: center;
      width: 1.88rem;
      height: 1.88rem;
      border-radius: 0.58rem;
      color: #78f0de;
    }

    #${ROOT_ID} .rod-actions button.is-active {
      color: #061012;
      background: #78f0de;
    }

    #${ROOT_ID} .CodeMirror {
      width: 100% !important;
      height: 100% !important;
      background: #070b12 !important;
      color: #e9edf7 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: 12px !important;
      line-height: 1 !important;
      text-rendering: optimizeSpeed;
      contain: strict;
    }

    #${ROOT_ID} .CodeMirror textarea {
      font-size: 16px !important;
    }

    #${ROOT_ID} .CodeMirror-scroll {
      width: 100% !important;
      height: 100% !important;
      overflow: auto !important;
      -webkit-overflow-scrolling: touch;
    }

    #${ROOT_ID} .CodeMirror-lines {
      padding: 0rem 0 3.2rem !important;
    }

    #${ROOT_ID} .CodeMirror-gutters {
      background: #070b12 !important;
      border-right: 1px solid rgba(255,255,255,0.075) !important;
    }

    #${ROOT_ID} .CodeMirror-linenumber {
      color: rgba(233,237,247,0.48) !important;
      padding-right: 0.5rem !important;
    }

    #${ROOT_ID} .CodeMirror-foldgutter-open,
    #${ROOT_ID} .CodeMirror-foldgutter-folded {
      color: #ff7894;
      font-size: 0.7rem;
    }

    #${ROOT_ID} .CodeMirror pre.CodeMirror-line,
    #${ROOT_ID} .CodeMirror pre.CodeMirror-line-like {
      padding: 0 0.64rem !important;
      word-break: normal !important;
      overflow-wrap: normal !important;
      white-space: pre !important;
    }

    #${ROOT_ID}.is-soft-wrap .CodeMirror pre.CodeMirror-line,
    #${ROOT_ID}.is-soft-wrap .CodeMirror pre.CodeMirror-line-like {
      white-space: pre-wrap !important;
      word-break: break-word !important;
      overflow-wrap: anywhere !important;
    }

    #${ROOT_ID} .CodeMirror-cursor {
      border-left-color: #78f0de !important;
    }

    #${ROOT_ID} .CodeMirror-selected {
      background: rgba(120,240,222,0.24) !important;
    }

    #${ROOT_ID} .CodeMirror-dialog {
      position: absolute;
      left: 0;
      right: 0;
      top: 2.8rem;
      z-index: 55;
      padding: 0.42rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      background: rgba(11,16,26,0.96);
      color: #e9edf7;
    }

    #${ROOT_ID} .CodeMirror-dialog input {
      width: min(74vw, 28rem);
      min-height: 2rem;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 0.62rem;
      background: rgba(255,255,255,0.08);
      color: #e9edf7;
      font-size: 16px !important;
      outline: none;
      padding: 0.25rem 0.55rem;
    }

    #${ROOT_ID} .rod-symbol-mark {
      border-radius: 0.16rem;
      background: rgba(255,95,126,0.2);
      outline: 1px solid rgba(255,95,126,0.34);
    }

    #${ROOT_ID} .rod-symbol-focus {
      border-radius: 0.16rem;
      background: rgba(120,240,222,0.28);
      outline: 2px solid rgba(120,240,222,0.72);
    }

    #${ROOT_ID} .rod-panel {
      position: fixed;
      left: 0.28rem;
      right: 0.28rem;
      bottom: calc(max(0.28rem, env(safe-area-inset-bottom)) + 0.08rem);
      z-index: 2147483646;
      overflow: auto;
      padding: 0.46rem;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 0.82rem;
      background: rgba(8,12,20,0.97);
      color: #e9edf7;
      box-shadow: 0 1rem 3rem rgba(0,0,0,0.45);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    #${ROOT_ID} .rod-command-menu {
      max-height: 45vh;
    }

    #${ROOT_ID} .rod-usages-sheet {
      max-height: 36vh;
    }

    #${ROOT_ID} .rod-handle {
      width: 2.2rem;
      height: 0.2rem;
      margin: 0 auto 0.42rem;
      border-radius: 999px;
      background: rgba(255,255,255,0.22);
    }

    #${ROOT_ID} .rod-panel-title,
    #${ROOT_ID} .rod-panel-head {
      margin: 0 0 0.38rem;
      padding: 0 0.2rem;
      color: #78f0de;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.74rem;
      font-weight: 900;
    }

    #${ROOT_ID} .rod-panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    #${ROOT_ID} .rod-command-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.3rem;
    }

    #${ROOT_ID} .rod-command-button {
      display: grid;
      gap: 0.22rem;
      place-items: center;
      min-height: 3.2rem;
      border-radius: 0.62rem;
      font-size: 0.58rem;
      line-height: 1.05;
    }

    #${ROOT_ID} .rod-command-button svg {
      width: 1rem;
      height: 1rem;
      color: #78f0de;
    }

    #${ROOT_ID} .rod-usage-body {
      display: grid;
      gap: 0.24rem;
    }

    #${ROOT_ID} .rod-usage-row {
      display: grid;
      grid-template-columns: 2.8rem minmax(0, 1fr);
      gap: 0.34rem;
      width: 100%;
      min-height: 0;
      padding: 0.34rem 0.42rem;
      border-radius: 0.58rem;
      text-align: left;
    }

    #${ROOT_ID} .rod-usage-line {
      color: #ff7894;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.66rem;
      font-weight: 900;
    }

    #${ROOT_ID} .rod-usage-code {
      min-width: 0;
      overflow: hidden;
      color: #e9edf7;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.66rem;
      line-height: 1.3;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    #${ROOT_ID} .rod-toast {
      position: fixed;
      left: 50%;
      bottom: calc(max(0.6rem, env(safe-area-inset-bottom)) + 0.2rem);
      z-index: 2147483647;
      transform: translateX(-50%);
      max-width: calc(100vw - 1.2rem);
      padding: 0.55rem 0.76rem;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 999px;
      background: rgba(11,16,26,0.97);
      color: #e9edf7;
      font-size: 0.82rem;
      font-weight: 900;
      white-space: nowrap;
    }

    #${ROOT_ID} .rod-userscript-meta-fold-widget {
      display: inline-flex;
      align-items: center;
      margin-left: 0.3rem;
      padding: 0.03rem 0.38rem;
      border: 1px solid rgba(120,240,222,0.26);
      border-radius: 999px;
      background: rgba(120,240,222,0.1);
      color: #78f0de;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.68rem;
      font-weight: 900;
    }

    #${ROOT_ID} .cm-s-rod-dark .cm-keyword { color: #c678dd; }
    #${ROOT_ID} .cm-s-rod-dark .cm-atom { color: #d19a66; }
    #${ROOT_ID} .cm-s-rod-dark .cm-number { color: #d19a66; }
    #${ROOT_ID} .cm-s-rod-dark .cm-def { color: #61afef; }
    #${ROOT_ID} .cm-s-rod-dark .cm-variable { color: #e9edf7; }
    #${ROOT_ID} .cm-s-rod-dark .cm-variable-2 { color: #56b6c2; }
    #${ROOT_ID} .cm-s-rod-dark .cm-variable-3 { color: #e5c07b; }
    #${ROOT_ID} .cm-s-rod-dark .cm-property { color: #98c379; }
    #${ROOT_ID} .cm-s-rod-dark .cm-operator { color: #ff7894; }
    #${ROOT_ID} .cm-s-rod-dark .cm-comment { color: #7f8ca8; font-style: italic; }
    #${ROOT_ID} .cm-s-rod-dark .cm-string { color: #98c379; }
    #${ROOT_ID} .cm-s-rod-dark .cm-string-2 { color: #e5c07b; }
    #${ROOT_ID} .cm-s-rod-dark .cm-meta { color: #e5c07b; }
    #${ROOT_ID} .cm-s-rod-dark .cm-tag { color: #e06c75; }
    #${ROOT_ID} .cm-s-rod-dark .cm-attribute { color: #d19a66; }
    #${ROOT_ID} .cm-s-rod-dark .cm-builtin { color: #56b6c2; }
    #${ROOT_ID} .cm-s-rod-dark .cm-bracket { color: #abb2bf; }
    #${ROOT_ID} .cm-s-rod-dark .cm-error { color: #ff7894; }
  `;
	document.head.appendChild(style);

	/***************************************************************************
	 * Editor
	 **************************************************************************/

	let isSoftWrap = true;

	const editor = CodeMirror(editorHost, {
		value: initialSource,
		mode: detected.mode,
		theme: "rod-dark",
		lineNumbers: true,
		editable: false,
		lineWrapping: isSoftWrap,
		fixedGutter: true,
		readOnly: true,

		// This is the big memory win: do not render or highlight the whole file.
		viewportMargin: VIRTUAL_VIEWPORT_MARGIN,

		// These knobs keep CodeMirror tokenization incremental instead of making Safari chew glass.
		workTime: 18,
		workDelay: 80,
		flattenSpans: true,
		addModeClass: false,
		maxHighlightLength: 12_000,
		crudeMeasuringFrom: 8_000,
		pollInterval: 500,

		matchBrackets: true,
		foldGutter: true,
		foldOptions: {
			widget: " ⋯ ",
		},
		gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
		extraKeys: {
			"Cmd-F": "findPersistent",
			"Ctrl-F": "findPersistent",
			"Cmd-A": () => selectAllText(),
			"Ctrl-A": () => selectAllText(),
			"Cmd-Shift-C": () => copyAllText(),
			"Ctrl-Shift-C": () => copyAllText(),
			"Alt-U": () => findUsagesAtCursor(),
			"Alt-Left": () => previousUsage(),
			"Alt-Right": () => nextUsage(),
			"Alt-[": () => foldCurrentBlock(),
			"Alt-]": () => unfoldCurrentBlock(),
			Esc: () => closePanels(),
		},
	});

	root.classList.toggle("is-soft-wrap", isSoftWrap);

	/***************************************************************************
	 * State
	 **************************************************************************/

	let astCache = null;
	let astSource = "";
	let symbolMarks = [];
	let usages = [];
	let usageIndex = -1;
	let toastTimer = 0;
	let toolbarHideTimer = 0;
	let lastScrollTop = 0;
	let rafPending = false;
	let bootFormatted = false;

	/***************************************************************************
	 * Layout
	 **************************************************************************/

	/**
	 * Refreshes CodeMirror safely in a single animation frame.
	 *
	 * @returns {void}
	 *
	 * @example
	 * ```js
	 * scheduleRefresh();
	 * ```
	 */
	function scheduleRefresh() {
		if (rafPending) return;

		rafPending = true;

		requestAnimationFrame(() => {
			rafPending = false;
			editor.setSize("100%", "100%");
			editor.refresh();
		});
	}

	/**
	 * Shows the top toolbar temporarily.
	 *
	 * @param {boolean} hold Keep it visible.
	 * @returns {void}
	 *
	 * @example
	 * ```js
	 * showToolbar(true);
	 * ```
	 */
	function showToolbar(hold = false) {
		topbar.classList.add("is-visible");
		window.clearTimeout(toolbarHideTimer);

		if (!hold) {
			toolbarHideTimer = window.setTimeout(() => {
				topbar.classList.remove("is-visible");
			}, TOOLBAR_HIDE_MS);
		}
	}

	/***************************************************************************
	 * Userscript Meta Folding
	 **************************************************************************/

	/**
	 * Finds userscript metadata ranges near the top of the file.
	 *
	 * @param {CodeMirror.Editor} cm CodeMirror instance.
	 * @returns {Array<{ from: CodeMirror.Position, to: CodeMirror.Position }>} Ranges.
	 *
	 * @example
	 * ```js
	 * const ranges = findUserscriptMetaRanges(editor);
	 * ```
	 */
	function findUserscriptMetaRanges(cm) {
		const ranges = [];
		const maxLine = Math.min(cm.lastLine(), 120);

		for (let line = cm.firstLine(); line <= maxLine; line += 1) {
			const text = cm.getLine(line) || "";

			if (!/^\s*\/\/\s*==UserScript==\s*$/.test(text)) continue;

			for (let endLine = line + 1; endLine <= Math.min(cm.lastLine(), line + 80); endLine += 1) {
				const endText = cm.getLine(endLine) || "";

				if (/^\s*\/\/\s*==\/UserScript==\s*$/.test(endText)) {
					ranges.push({
						from: CodeMirror.Pos(line, 0),
						to: CodeMirror.Pos(endLine + 1, 0),
					});

					line = endLine;
					break;
				}
			}
		}

		return ranges;
	}

	/**
	 * Folds metadata blocks without touching global fold behavior.
	 *
	 * @param {CodeMirror.Editor} cm CodeMirror instance.
	 * @returns {void}
	 *
	 * @example
	 * ```js
	 * foldOnlyUserscriptMetaBlocks(editor);
	 * ```
	 */
	function foldOnlyUserscriptMetaBlocks(cm) {
		const ranges = findUserscriptMetaRanges(cm);

		if (!ranges.length) return;

		cm.operation(() => {
			ranges.forEach((range) => {
				const widget = document.createElement("span");
				widget.className = "rod-userscript-meta-fold-widget";
				widget.textContent = " ⋯ userscript meta ";

				cm.markText(range.from, range.to, {
					replacedWith: widget,
					clearOnEnter: true,
				});
			});
		});
	}

	/***************************************************************************
	 * AST and Symbols
	 **************************************************************************/

	function indexToPos(index) {
		return editor.posFromIndex(index);
	}

	function posToIndex(position) {
		return editor.indexFromPos(position);
	}

	function getAst() {
		const source = editor.getValue();

		if (!detected.isJavaScriptLike) return null;
		if (source.length > MAX_AST_SOURCE_LENGTH) return null;
		if (astCache && astSource === source) return astCache;

		try {
			astCache = acorn.parse(source, {
				ecmaVersion: "latest",
				sourceType: "module",
				allowHashBang: true,
				allowReturnOutsideFunction: true,
			});
			astSource = source;
			return astCache;
		} catch {
			try {
				astCache = acorn.parse(source, {
					ecmaVersion: "latest",
					sourceType: "script",
					allowHashBang: true,
					allowReturnOutsideFunction: true,
				});
				astSource = source;
				return astCache;
			} catch {
				astCache = null;
				astSource = source;
				return null;
			}
		}
	}

	function findNodeAtIndex(index) {
		const ast = getAst();
		let best = null;

		if (!ast || typeof acornWalk === "undefined") return null;

		acornWalk.full(ast, (node) => {
			if (typeof node.start !== "number" || typeof node.end !== "number") return;
			if (node.start > index || node.end < index) return;

			if (!best || node.end - node.start <= best.end - best.start) {
				best = node;
			}
		});

		return best;
	}

	function getSymbolAtCursor() {
		const cursor = editor.getCursor();
		const index = posToIndex(cursor);
		const node = findNodeAtIndex(index);

		if (node?.type === "Identifier" && node.name && !RESERVED_WORDS.has(node.name)) {
			return { name: node.name, from: node.start, to: node.end };
		}

		const token = editor.getTokenAt(cursor);
		const value = String(token?.string || "");

		if (!/^[A-Za-z_$][\w$]*$/.test(value)) return null;
		if (RESERVED_WORDS.has(value)) return null;

		return {
			name: value,
			from: posToIndex({ line: cursor.line, ch: token.start }),
			to: posToIndex({ line: cursor.line, ch: token.end }),
		};
	}

	function findSymbolUsages(symbol) {
		const ast = getAst();
		const ranges = [];

		if (ast && typeof acornWalk !== "undefined") {
			acornWalk.full(ast, (node) => {
				if (ranges.length > MAX_USAGE_ROWS) return;
				if (node.type !== "Identifier") return;
				if (node.name !== symbol) return;

				ranges.push({
					from: node.start,
					to: node.end,
					kind: "identifier",
				});
			});

			return ranges;
		}

		const source = editor.getValue();

		if (source.length > MAX_TEXT_USAGE_SCAN_LENGTH) {
			showToast("File too large for full scan");
			return [];
		}

		const expression = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "g");
		let match;

		while ((match = expression.exec(source)) && ranges.length < MAX_USAGE_ROWS) {
			ranges.push({
				from: match.index,
				to: match.index + symbol.length,
				kind: "text",
			});
		}

		return ranges;
	}

	function findNearestRange(kind) {
		const ast = getAst();
		const cursorIndex = posToIndex(editor.getCursor());
		let best = null;

		if (!ast || typeof acornWalk === "undefined") return null;

		acornWalk.full(ast, (node) => {
			if (typeof node.start !== "number" || typeof node.end !== "number") return;
			if (node.start > cursorIndex || node.end < cursorIndex) return;

			const isFunction =
				node.type === "FunctionDeclaration" ||
				node.type === "FunctionExpression" ||
				node.type === "ArrowFunctionExpression" ||
				node.type === "MethodDefinition";

			const isBlock =
				node.type === "BlockStatement" ||
				node.type === "Program" ||
				node.type === "ObjectExpression" ||
				node.type === "ArrayExpression";

			if (kind === "function" && !isFunction) return;
			if (kind === "block" && !isBlock) return;

			if (!best || node.end - node.start <= best.to - best.from) {
				best = {
					from: node.start,
					to: node.end,
					name: node.id?.name || node.key?.name || node.type,
				};
			}
		});

		return best;
	}

	/***************************************************************************
	 * UI
	 **************************************************************************/

	function showToast(message, options = {}) {
		clearTimeout(toastTimer);

		toastBox.textContent = options.loading ? `${message}` : message;
		toastBox.hidden = false;

		const restartTimer = () => {
			clearTimeout(toastTimer);

			toastTimer = window.setTimeout(() => {
				toastBox.hidden = true;
			}, TOAST_MS);
		};

		restartTimer();

		return {
			update(nextMessage) {
				toastBox.textContent = nextMessage;
				restartTimer();
			},

			step(nextMessage) {
				toastBox.textContent = nextMessage;
				restartTimer();
			},

			done(finalMessage = "Done") {
				toastBox.textContent = finalMessage;

				clearTimeout(toastTimer);

				toastTimer = window.setTimeout(() => {
					toastBox.hidden = true;
				}, TOAST_MS);
			},

			hide() {
				clearTimeout(toastTimer);
				toastBox.hidden = true;
			},
		};
	}

	function closePanels() {
		commandMenu.hidden = true;
		usagesSheet.hidden = true;
	}

	function renderHighlightedLine(lineNumber) {
		const line = editor.getLine(lineNumber) || "";
		const tokens = editor.getLineTokens(lineNumber);

		if (!tokens.length) return escapeHtml(line.slice(0, 140));

		let html = "";
		let cursor = 0;

		for (let index = 0; index < tokens.length; index += 1) {
			const token = tokens[index];

			if (token.start > cursor) {
				html += escapeHtml(line.slice(cursor, token.start));
			}

			const text = escapeHtml(line.slice(token.start, token.end));
			const classes = token.type
				? token.type
						.split(" ")
						.map((name) => `cm-${name}`)
						.join(" ")
				: "";

			html += classes ? `<span class="${classes}">${text}</span>` : text;
			cursor = token.end;

			if (html.length > 420) break;
		}

		return html;
	}

	/***************************************************************************
	 * Commands
	 **************************************************************************/

	function toggleSoftWrap(force) {
		isSoftWrap = typeof force === "boolean" ? force : !isSoftWrap;
		editor.setOption("lineWrapping", isSoftWrap);
		root.classList.toggle("is-soft-wrap", isSoftWrap);

		const button = root.querySelector('[data-action="toggle-wrap"]');
		if (button instanceof HTMLElement) button.classList.toggle("is-active", isSoftWrap);

		scheduleRefresh();
		showToast(isSoftWrap ? "Wrap on" : "Wrap off");
	}

	function selectAllText() {
		const lastLine = editor.lastLine();

		editor.setSelection({ line: 0, ch: 0 }, { line: lastLine, ch: editor.getLine(lastLine).length });
		editor.focus();
		showToast("Selected all");
	}

	function copyAllText() {
		void copyText(editor.getValue()).then((ok) => showToast(ok ? "Copied all" : "Copy failed"));
	}

	function copyNearestFunction() {
		const range = findNearestRange("function");

		if (!range) {
			showToast("No function here");
			return;
		}

		void copyText(editor.getValue().slice(range.from, range.to)).then((ok) =>
			showToast(ok ? "Function copied" : "Copy failed"),
		);
	}

	function copyNearestBlock() {
		const range = findNearestRange("block");

		if (!range) {
			showToast("No block here");
			return;
		}

		void copyText(editor.getValue().slice(range.from, range.to)).then((ok) =>
			showToast(ok ? "Block copied" : "Copy failed"),
		);
	}

	async function formatEditor() {
		const value = editor.getValue();

		if (value.length > MAX_PRETTIER_WORKER_LENGTH) {
			showToast("Too large to format safely");
			return;
		}

		const toast = showToast("Formatting", { loading: true });

		await waitForIdle();

		const formatted = (await formatSourceAsync(value, detected.parser)).trimStart();

		if (formatted === value) {
			toast.done("Format skipped");
			return;
		}

		editor.operation(() => {
			const cursor = editor.getCursor();
			const scrollInfo = editor.getScrollInfo();

			editor.setValue(formatted);
			editor.setCursor(cursor);
			editor.scrollTo(scrollInfo.left, scrollInfo.top);
			editor.refresh();
		});

		astCache = null;
		astSource = "";
		toast.done("Formatted");
	}

	function saveCurrentFile() {
		const fallbackName = `source.${detected.label === "typescript" ? "ts" : detected.label || "txt"}`;
		const filename = pathname.split("/").filter(Boolean).pop() || fallbackName;

		saveTextFile(editor.getValue(), filename);
		showToast("Saved");
	}

	function foldCurrentBlock() {
		editor.foldCode(editor.getCursor());
	}

	function unfoldCurrentBlock() {
		editor.foldCode(editor.getCursor(), null, "unfold");
	}

	function clearSymbolMarks() {
		for (let index = 0; index < symbolMarks.length; index += 1) {
			symbolMarks[index].clear();
		}

		symbolMarks = [];
		usages = [];
		usageIndex = -1;
	}

	function findUsagesAtCursor() {
		clearSymbolMarks();

		const symbol = getSymbolAtCursor();

		if (!symbol) {
			showToast("No symbol here");
			return;
		}

		usages = findSymbolUsages(symbol.name);

		if (!usages.length) {
			showToast("No usages");
			return;
		}

		const markCount = Math.min(usages.length, MAX_USAGE_MARKS);

		for (let index = 0; index < markCount; index += 1) {
			const usage = usages[index];

			symbolMarks.push(
				editor.markText(indexToPos(usage.from), indexToPos(usage.to), {
					className: "rod-symbol-mark",
				}),
			);
		}

		usageIndex = Math.max(
			0,
			usages.findIndex((usage) => usage.from === symbol.from),
		);

		openUsageSheet(symbol.name);
		jumpToUsage(usageIndex);
	}

	function openUsageSheet(symbolName) {
		commandMenu.hidden = true;
		usageTitle.textContent = `${symbolName} · ${usages.length}`;
		usageBody.textContent = "";

		const fragment = document.createDocumentFragment();
		const maxRows = Math.min(usages.length, MAX_USAGE_ROWS);

		for (let index = 0; index < maxRows; index += 1) {
			const usage = usages[index];
			const position = indexToPos(usage.from);
			const row = document.createElement("button");

			row.type = "button";
			row.className = "rod-usage-row";
			row.dataset.usageIndex = String(index);
			row.innerHTML = `
        <span class="rod-usage-line">L${position.line + 1}</span>
        <code class="rod-usage-code">${renderHighlightedLine(position.line)}</code>
      `;

			fragment.append(row);
		}

		usageBody.append(fragment);
		usagesSheet.hidden = false;
	}

	function jumpToUsage(nextIndex) {
		if (!usages.length) return;

		usageIndex = (nextIndex + usages.length) % usages.length;

		const usage = usages[usageIndex];
		const from = indexToPos(usage.from);
		const to = indexToPos(usage.to);

		editor.setSelection(from, to);
		editor.scrollIntoView(from, 90);
		editor.focus();
	}

	function nextUsage() {
		if (!usages.length) return;
		jumpToUsage(usageIndex + 1);
	}

	function previousUsage() {
		if (!usages.length) return;
		jumpToUsage(usageIndex - 1);
	}

	function scrollEditorTop() {
		editor.setCursor({ line: 0, ch: 0 });
		editor.scrollTo(0, 0);
	}

	/***************************************************************************
	 * Command Menu
	 **************************************************************************/

	const commands = [
		{ icon: "search", label: "Search", run: () => editor.execCommand("findPersistent") },
		{ icon: "scan-search", label: "Usages", run: findUsagesAtCursor },
		{ icon: "wrap-text", label: "Wrap", run: () => toggleSoftWrap() },
		{ icon: "copy", label: "Copy all", run: copyAllText },
		{ icon: "copy-check", label: "Function", run: copyNearestFunction },
		{ icon: "braces", label: "Block", run: copyNearestBlock },
		{ icon: "text-select", label: "Select", run: selectAllText },
		{ icon: "wand-sparkles", label: "Format", run: () => void formatEditor() },
		{ icon: "save", label: "Save", run: saveCurrentFile },
		{ icon: "fold-horizontal", label: "Fold", run: foldCurrentBlock },
		{ icon: "unfold-horizontal", label: "Unfold", run: unfoldCurrentBlock },
		{ icon: "arrow-up-to-line", label: "Top", run: scrollEditorTop },
		{ icon: "x", label: "Close", run: closePanels },
	];

	function renderCommandMenu() {
		const fragment = document.createDocumentFragment();

		commandGrid.textContent = "";

		for (let index = 0; index < commands.length; index += 1) {
			const command = commands[index];
			const button = document.createElement("button");

			button.type = "button";
			button.className = "rod-command-button";
			button.dataset.commandIndex = String(index);
			button.innerHTML = `<i data-lucide="${command.icon}"></i><span>${escapeHtml(command.label)}</span>`;

			fragment.append(button);
		}

		commandGrid.append(fragment);

		if (typeof lucide !== "undefined") {
			lucide.createIcons({ attrs: { "aria-hidden": "true" } });
		}
	}

	function openCommandMenu() {
		usagesSheet.hidden = true;
		commandMenu.hidden = false;
	}

	renderCommandMenu();

	/***************************************************************************
	 * Events
	 **************************************************************************/

	root.addEventListener("click", (event) => {
		const target = event.target;

		if (!(target instanceof HTMLElement)) return;

		const commandTarget = target.closest("[data-command-index]");
		const usageTarget = target.closest("[data-usage-index]");
		const actionTarget = target.closest("[data-action]");

		if (commandTarget instanceof HTMLElement) {
			const command = commands[Number(commandTarget.dataset.commandIndex || "-1")];

			if (command) command.run();

			return;
		}

		if (usageTarget instanceof HTMLElement) {
			jumpToUsage(Number(usageTarget.dataset.usageIndex || "0"));
			return;
		}

		if (!(actionTarget instanceof HTMLElement)) return;

		const action = actionTarget.dataset.action;

		if (action === "search") editor.execCommand("findPersistent");
		if (action === "toggle-wrap") toggleSoftWrap();
		if (action === "command") openCommandMenu();
    if (action === "format") formatEditor();
		if (action === "close-usages") usagesSheet.hidden = true;
	});

	editor.on("scroll", () => {
		const scrollInfo = editor.getScrollInfo();
		const delta = scrollInfo.top - lastScrollTop;

		if (delta > HEADER_SCROLL_THRESHOLD) topbar.classList.remove("is-visible");
		if (delta < -HEADER_SCROLL_THRESHOLD) showToolbar(false);

		lastScrollTop = scrollInfo.top;
	});

	/***************************************************************************
	 * Touch
	 **************************************************************************/

	let touchStartX = 0;
	let touchStartY = 0;
	let longPressTimer = 0;

	const wrapper = editor.getWrapperElement();

	function handleLongPress(touch) {
		const position = editor.coordsChar({
			left: touch.clientX,
			top: touch.clientY,
		});

		editor.setCursor(position);
		openCommandMenu();
	}

	wrapper.addEventListener(
		"touchstart",
		(event) => {
			const touch = event.changedTouches[0];

			if (!touch) return;

			touchStartX = touch.clientX;
			touchStartY = touch.clientY;

			clearTimeout(longPressTimer);

			longPressTimer = window.setTimeout(() => {
				handleLongPress(touch);
			}, LONG_PRESS_MS);
		},
		{ passive: true },
	);

	wrapper.addEventListener(
		"touchmove",
		(event) => {
			const touch = event.changedTouches[0];

			if (!touch) return;

			if (Math.abs(touch.clientX - touchStartX) > 12 || Math.abs(touch.clientY - touchStartY) > 12) {
				clearTimeout(longPressTimer);
			}
		},
		{ passive: true },
	);

	wrapper.addEventListener(
		"touchend",
		(event) => {
			clearTimeout(longPressTimer);

			const touch = event.changedTouches[0];

			if (!touch) return;

			const dx = touch.clientX - touchStartX;
			const dy = touch.clientY - touchStartY;

			if (Math.abs(dx) > SWIPE_MIN_X && Math.abs(dy) < SWIPE_MAX_Y) {
				if (dx < 0) nextUsage();
				else previousUsage();
			}
		},
		{ passive: true },
	);

	function installSwipeDownClose(panel) {
		let startY = 0;

		panel.addEventListener(
			"touchstart",
			(event) => {
				const touch = event.changedTouches[0];
				if (!touch) return;
				startY = touch.clientY;
			},
			{ passive: true },
		);

		panel.addEventListener(
			"touchend",
			(event) => {
				const touch = event.changedTouches[0];
				if (!touch) return;

				if (touch.clientY - startY > SWIPE_DOWN_CLOSE_DISTANCE) {
					panel.hidden = true;
				}
			},
			{ passive: true },
		);
	}

	installSwipeDownClose(commandMenu);
	installSwipeDownClose(usagesSheet);

	/***************************************************************************
	 * Boot
	 **************************************************************************/

	async function customBoot() {
		showToolbar(true);
		toggleSoftWrap(true);

		const value = editor.getValue();

		if (bootFormatted) return;
		if (value.length > MAX_PRETTIER_SYNC_LENGTH) return;

		bootFormatted = true;

		await waitForIdle();
		await formatEditor();
	}

	requestAnimationFrame(() => {
		editor.setSize("100%", "100%");
		editor.refresh();
		foldOnlyUserscriptMetaBlocks(editor);

		showToolbar(true);

		const wrapButton = root.querySelector('[data-action="toggle-wrap"]');
		if (wrapButton instanceof HTMLElement) wrapButton.classList.toggle("is-active", isSoftWrap);

		if (typeof lucide !== "undefined") {
			lucide.createIcons({ attrs: { "aria-hidden": "true" } });
		}

		void customBoot();
	});

	window.addEventListener("resize", scheduleRefresh);
	window.addEventListener("orientationchange", () => setTimeout(scheduleRefresh, 220));
})();