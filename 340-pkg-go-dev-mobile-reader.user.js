// ==UserScript==
// @name         Rod / Docs / pkg.go.dev
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile-first pkg.go.dev reader with clean layout and code improvements.
// @author       Rod
// @match        https://pkg.go.dev/*
// @run-at       document-idle
// @weight       460
// @grant        none
// @noframes
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/go.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/bash.min.js
// ==/UserScript==

(() => {
	"use strict";

	const IDS = {
		style: "migos-pkggo-style",
		toc: "migos-pkggo-toc",
		floating: "migos-pkggo-floating",
	};

	const STORAGE = {
		theme: "migos:pkggo:v1:theme",
		font: "migos:pkggo:v1:font",
		scale: "migos:pkggo:v1:scale",
	};

	const THEMES = {
		dark: {
			label: "Go Dark",
			bg: "#07131f",
			panel: "#0d1b2a",
			panel2: "#112438",
			panel3: "#163149",
			code: "#06101a",
			text: "#eef7ff",
			muted: "#b7cad8",
			faint: "#7894a8",
			accent: "#7dd3fc",
			accent2: "#67e8f9",
			accent3: "#a7f3d0",
			border: "rgba(180, 220, 245, .16)",
		},
		cream: {
			label: "Go Cream",
			bg: "#f6f0e5",
			panel: "#fffaf0",
			panel2: "#efe7d8",
			panel3: "#e6dccb",
			code: "#f1eadf",
			text: "#23201b",
			muted: "#665f54",
			faint: "#8b8173",
			accent: "#047ea3",
			accent2: "#0ea5b7",
			accent3: "#4f9f7a",
			border: "rgba(50, 40, 25, .15)",
		},
	};

	const FONTS = {
		system: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
		serif: `ui-serif, Georgia, Cambria, "Times New Roman", serif`,
		mono: `"SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace`,
	};

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	function getThemeName() {
		return localStorage.getItem(STORAGE.theme) || "dark";
	}

	function getFontName() {
		return localStorage.getItem(STORAGE.font) || "system";
	}

	function getScale() {
		return Number(localStorage.getItem(STORAGE.scale) || "1");
	}

	function setViewport() {
		let viewport = document.querySelector("meta[name='viewport']");

		if (!viewport) {
			viewport = document.createElement("meta");
			viewport.name = "viewport";
			document.head.appendChild(viewport);
		}

		viewport.content = "width=device-width, initial-scale=1, viewport-fit=cover";
	}

	function applySettings() {
		const theme = THEMES[getThemeName()] || THEMES.dark;

		for (const [key, value] of Object.entries(theme)) {
			document.documentElement.style.setProperty(`--pkggo-${key}`, value);
		}

		document.documentElement.style.setProperty("--pkggo-font", FONTS[getFontName()] || FONTS.system);
		document.documentElement.style.setProperty("--pkggo-scale", String(clamp(getScale(), 0.9, 1.12)));
		document.documentElement.dataset.pkggoTheme = getThemeName();
	}

	function installStyles() {
		document.getElementById(IDS.style)?.remove();

		const style = document.createElement("style");
		style.id = IDS.style;
		style.textContent = `
			:root {
				color-scheme: dark;
				scroll-behavior: smooth;
				-webkit-text-size-adjust: 100%;
			}

			:root[data-pkggo-theme="cream"] {
				color-scheme: light;
			}

			html,
			body {
				margin: 0 !important;
				padding: 0 !important;
				width: 100% !important;
				max-width: 100% !important;
				min-width: 0 !important;
				overflow-x: hidden !important;
				background:
					radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--pkggo-accent) 22%, transparent), transparent 18rem),
					radial-gradient(circle at 92% 12%, color-mix(in srgb, var(--pkggo-accent2) 16%, transparent), transparent 16rem),
					linear-gradient(180deg, color-mix(in srgb, var(--pkggo-bg) 90%, black), var(--pkggo-bg)) !important;
				color: var(--pkggo-text) !important;
				font-family: var(--pkggo-font) !important;
				font-size: calc(16px * var(--pkggo-scale)) !important;
				line-height: 1.58 !important;
			}

			body::before {
				content: "";
				position: fixed;
				inset: 0;
				z-index: -1;
				pointer-events: none;
				opacity: .11;
				background-image:
					radial-gradient(circle, rgba(255,255,255,.22) 0 1px, transparent 1px),
					linear-gradient(115deg, transparent 0 48%, rgba(255,255,255,.07) 49%, transparent 50%);
				background-size: 10px 10px, 34px 34px;
				mix-blend-mode: soft-light;
			}

			body {
				padding-top: 0 !important;
			}

			body > header,
			body > footer,
			.Site-header,
			.go-Header,
			.go-Footer,
			.Footer,
			.Header,
			.Breadcrumb,
			.UnitHeader-breadcrumb,
			.Search,
			.JumpDialog,
			.js-jumpDialog {
				display: none !important;
			}

			main,
			.Main,
			.go-Main,
			.Container,
			.UnitDetails,
			.UnitDetails-content,
			.Documentation,
			.Documentation-content,
			.Doc,
			.Overview {
				width: 100% !important;
				max-width: 100% !important;
				min-width: 0 !important;
				margin: 0 !important;
				padding-left: .72rem !important;
				padding-right: .72rem !important;
				box-sizing: border-box !important;
				background: transparent !important;
				color: var(--pkggo-text) !important;
			}

			.UnitHeader,
			.UnitHeader-content,
			.UnitHeader-title,
			.UnitMeta,
			.UnitDirectories,
			.UnitReadme,
			.Documentation-overview,
			.Documentation-index,
			.Documentation-constants,
			.Documentation-variables,
			.Documentation-functions,
			.Documentation-types,
			.Documentation-source,
			.Documentation-examples,
			.Overview-readmeContent {
				width: 100% !important;
				max-width: 100% !important;
				min-width: 0 !important;
				margin-left: 0 !important;
				margin-right: 0 !important;
				box-sizing: border-box !important;
			}

			main {
				padding-top: max(1rem, env(safe-area-inset-top)) !important;
				padding-bottom: 7rem !important;
			}

			.pkggo-toolbar {
				position: sticky;
				top: max(.55rem, env(safe-area-inset-top));
				z-index: 9999;
				display: grid;
				gap: .45rem;
				margin: 0 0 .8rem !important;
				padding: .58rem !important;
				border: 1px solid var(--pkggo-border);
				border-radius: 1rem;
				background:
					linear-gradient(135deg, color-mix(in srgb, var(--pkggo-panel) 94%, transparent), color-mix(in srgb, var(--pkggo-panel2) 88%, transparent));
				backdrop-filter: blur(18px) saturate(1.12);
				-webkit-backdrop-filter: blur(18px) saturate(1.12);
				box-shadow: 0 .8rem 2rem rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.05);
			}

			.pkggo-search {
				width: 100%;
				height: 2.25rem;
				border: 1px solid var(--pkggo-border);
				border-radius: .72rem;
				background: var(--pkggo-code);
				color: var(--pkggo-text);
				padding: 0 .75rem;
				font: 650 .84rem var(--pkggo-font);
				outline: none;
			}

			.pkggo-controls {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto auto;
				gap: .35rem;
			}

			.pkggo-button,
			.pkggo-select {
				height: 2.15rem;
				min-width: 0;
				border: 1px solid var(--pkggo-border);
				border-radius: .68rem;
				background: var(--pkggo-panel2);
				color: var(--pkggo-text);
				font: 700 .76rem var(--pkggo-font);
			}

			.pkggo-button {
				padding: 0 .55rem;
			}

			.pkggo-select {
				padding: 0 .5rem;
			}

			.UnitHeader {
				margin: .7rem 0 !important;
				padding: .9rem !important;
				border: 1px solid var(--pkggo-border) !important;
				border-radius: 1.05rem !important;
				background:
					radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--pkggo-accent) 14%, transparent), transparent 14rem),
					linear-gradient(135deg, color-mix(in srgb, var(--pkggo-panel) 95%, transparent), color-mix(in srgb, var(--pkggo-panel2) 74%, transparent)) !important;
				overflow: hidden !important;
			}

			.UnitHeader-title,
			h1 {
				color: var(--pkggo-text) !important;
				font-weight: 900 !important;
				letter-spacing: -.045em !important;
				line-height: 1.04 !important;
				font-size: clamp(1.75rem, 8vw, 2.55rem) !important;
				overflow-wrap: anywhere !important;
			}

			h2,
			h3,
			h4 {
				color: color-mix(in srgb, var(--pkggo-accent) 62%, var(--pkggo-text)) !important;
				font-weight: 820 !important;
				letter-spacing: -.025em !important;
				line-height: 1.15 !important;
				scroll-margin-top: 6rem !important;
				overflow-wrap: anywhere !important;
			}

			h2 { font-size: clamp(1.35rem, 5.5vw, 1.8rem) !important; }
			h3 { font-size: clamp(1.1rem, 4.4vw, 1.35rem) !important; }
			h4 { font-size: 1rem !important; }

			h2::after,
			h3::after {
				content: "";
				display: block;
				width: 4.2rem;
				height: 2px;
				margin-top: .3rem;
				border-radius: 999px;
				background: linear-gradient(90deg, var(--pkggo-accent), var(--pkggo-accent2), transparent);
			}

			p,
			li,
			dd,
			dt,
			summary {
				color: var(--pkggo-text) !important;
				line-height: 1.58 !important;
				overflow-wrap: anywhere !important;
			}

			a {
				color: color-mix(in srgb, var(--pkggo-accent) 78%, var(--pkggo-text)) !important;
				text-decoration: none !important;
				border-bottom: 1px solid color-mix(in srgb, var(--pkggo-accent) 24%, transparent) !important;
				font-weight: 560 !important;
			}

			.Documentation,
			.Doc,
			.UnitMeta,
			.UnitDirectories,
			.UnitReadme,
			.Documentation-overview,
			.Documentation-functions,
			.Documentation-types,
			.Documentation-constants,
			.Documentation-variables,
			.Documentation-source,
			.Documentation-examples,
			.Overview-readmeContent,
			.Documentation-function,
			.Documentation-type,
			.Documentation-variable,
			.Documentation-constant {
				margin: .72rem 0 !important;
				padding: .82rem !important;
				border: 1px solid var(--pkggo-border) !important;
				border-radius: 1rem !important;
				background:
					linear-gradient(135deg, color-mix(in srgb, var(--pkggo-panel) 96%, transparent), color-mix(in srgb, var(--pkggo-panel2) 68%, transparent)) !important;
				overflow: hidden !important;
				box-shadow: inset 0 1px 0 rgba(255,255,255,.045);
			}

			.Documentation-index,
			.Documentation-indexList,
			.Documentation-indexSection,
			.DocNav,
			.DocNavMobile,
			.JumpTo,
			.UnitOutline,
			.Documentation-sidebar {
				display: none !important;
			}

			.Documentation-declaration,
			.Documentation-declaration pre,
			.Documentation-declaration code,
			.Documentation-source pre,
			pre {
				display: block !important;
				width: 100% !important;
				max-width: 100% !important;
				/**min-width: 100% !important;**/
				overflow-x: auto !important;
				overflow-y: hidden !important;
				-webkit-overflow-scrolling: touch;
				margin: .1rem 0 !important;
				padding: .22rem !important;
				border: 1px solid var(--pkggo-border) !important;
				border-radius: .82rem !important;
				background:
					linear-gradient(180deg, color-mix(in srgb, var(--pkggo-code) 96%, var(--pkggo-panel2)), var(--pkggo-code)) !important;
				color: var(--pkggo-text) !important;
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace !important;
				font-size: .78rem !important;
				line-height: 1.48 !important;
				tab-size: 2 !important;
				white-space: pre !important;
				overflow-wrap: normal !important;
				word-break: normal !important;
				box-shadow: inset 0 1px 0 rgba(255,255,255,.045);
			}

			pre *,
			.Documentation-declaration pre *,
			.Documentation-source pre * {
				background: transparent !important;
				font-family: inherit !important;
				font-size: inherit !important;
				line-height: inherit !important;
				white-space: pre-wrap !important;
			}

			pre code,
			pre .hljs {
				display: block !important;
				width: max(100%, max-content) !important;
				min-width: 100% !important;
				padding: 0 !important;
				border: 0 !important;
				background: transparent !important;
				
				 white-space: pre-wrap !important;       
				 /* Standard CSS3 */
  				overflow-wrap: break-word !important;   
  
  				/* Breaks long words if necessary */

			}

			code:not(pre code),
			kbd,
			samp,
			.Ident {
				padding: .07rem .28rem !important;
				border: 1px solid color-mix(in srgb, var(--pkggo-accent) 16%, transparent) !important;
				border-radius: .36rem !important;
				background: color-mix(in srgb, var(--pkggo-accent) 9%, var(--pkggo-panel2)) !important;
				color: color-mix(in srgb, var(--pkggo-accent) 68%, var(--pkggo-text)) !important;
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace !important;
				font-size: .84em !important;
				font-weight: 650 !important;
				white-space: normal !important;
			}

			.Playground,
			.Playground-inputContainer,
			.Playground-outputContainer,
			.Documentation-example,
			.Documentation-exampleDetails,
			.Documentation-exampleDetailsBody {
				width: 100% !important;
				max-width: 100% !important;
				min-width: 0 !important;
				margin-left: 0 !important;
				margin-right: 0 !important;
				padding-left: 0 !important;
				padding-right: 0 !important;
				background: transparent !important;
				overflow: hidden !important;
			}

			.Playground-actions,
			.Playground-buttons,
			.Documentation-exampleButtons {
				display: flex !important;
				flex-wrap: wrap !important;
				gap: .45rem !important;
				justify-content: flex-start !important;
				margin-top: .55rem !important;
				padding: 0 !important;
				background: transparent !important;
			}

			.Playground-actions button,
			.Playground-buttons button,
			.Documentation-exampleButtons button,
			button {
				max-width: 100% !important;
				border-radius: .7rem !important;
				border: 1px solid var(--pkggo-border) !important;
				background: color-mix(in srgb, var(--pkggo-accent) 16%, var(--pkggo-panel2)) !important;
				color: var(--pkggo-text) !important;
				font-weight: 720 !important;
				box-shadow: none !important;
			}

			.hljs-comment { color: #8aa0b8 !important; font-style: italic; }
			.hljs-keyword,
			.hljs-built_in { color: #8bd3ff !important; font-weight: 750; }
			.hljs-string { color: #a7f3d0 !important; }
			.hljs-number { color: #fde68a !important; }
			.hljs-title,
			.hljs-function { color: #bfdbfe !important; }
			.hljs-type { color: #ddd6fe !important; }
			.hljs-meta,
			.hljs-symbol { color: #f9a8d4 !important; }

			:root[data-pkggo-theme="cream"] .hljs-comment { color: #7f786c !important; }
			:root[data-pkggo-theme="cream"] .hljs-keyword,
			:root[data-pkggo-theme="cream"] .hljs-built_in { color: #0369a1 !important; }
			:root[data-pkggo-theme="cream"] .hljs-string { color: #047857 !important; }
			:root[data-pkggo-theme="cream"] .hljs-number { color: #a16207 !important; }
			:root[data-pkggo-theme="cream"] .hljs-title,
			:root[data-pkggo-theme="cream"] .hljs-function { color: #2563eb !important; }
			:root[data-pkggo-theme="cream"] .hljs-type { color: #7c3aed !important; }

			#${IDS.toc} {
				position: fixed;
				inset: 0 auto 0 0;
				z-index: 10000;
				width: min(21.5rem, calc(100vw - 3.2rem));
				box-sizing: border-box;
				padding: max(1rem, env(safe-area-inset-top)) .85rem max(1rem, env(safe-area-inset-bottom));
				border-right: 1px solid var(--pkggo-border);
				background:
					linear-gradient(180deg, color-mix(in srgb, var(--pkggo-bg) 98%, transparent), color-mix(in srgb, var(--pkggo-panel) 94%, transparent));
				backdrop-filter: blur(18px) saturate(1.08);
				-webkit-backdrop-filter: blur(18px) saturate(1.08);
				transform: translateX(-105%);
				transition: transform .2s ease;
				overflow: auto;
			}

			html.pkggo-toc-open #${IDS.toc} {
				transform: translateX(0);
			}

			.pkggo-toc-title {
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: .7rem;
				margin-bottom: .65rem;
				color: var(--pkggo-text);
				font-weight: 820;
			}

			.pkggo-toc-search {
				width: 100%;
				height: 2.2rem;
				margin-bottom: .6rem;
				border: 1px solid var(--pkggo-border);
				border-radius: .62rem;
				background: var(--pkggo-code);
				color: var(--pkggo-text);
				padding: 0 .65rem;
				font: 600 .82rem var(--pkggo-font);
				outline: none;
			}

			.pkggo-toc-list {
				display: grid;
				gap: .06rem;
				padding: 0;
				margin: 0;
				list-style: none;
			}

			.pkggo-toc-link {
				display: block;
				padding: .32rem .42rem;
				border: 0 !important;
				border-radius: .48rem;
				color: var(--pkggo-muted) !important;
				text-decoration: none !important;
				font-size: .8rem;
				line-height: 1.24;
				font-weight: 560 !important;
			}

			.pkggo-toc-link:hover,
			.pkggo-toc-link.is-active {
				background: color-mix(in srgb, var(--pkggo-accent) 12%, transparent) !important;
				color: var(--pkggo-text) !important;
			}

			.pkggo-toc-level-1 { padding-left: .08rem; font-weight: 720 !important; }
			.pkggo-toc-level-2 { padding-left: .5rem; }
			.pkggo-toc-level-3 { padding-left: .9rem; font-size: .75rem; color: var(--pkggo-faint) !important; }
			.pkggo-toc-level-4 { padding-left: 1.15rem; font-size: .72rem; color: var(--pkggo-faint) !important; }

			#${IDS.floating} {
				position: fixed;
				right: max(.72rem, env(safe-area-inset-right));
				bottom: max(5.45rem, env(safe-area-inset-bottom));
				z-index: 9999;
				display: grid;
				gap: .44rem;
			}

			.pkggo-fab {
				width: 2.82rem;
				height: 2.82rem;
				border: 1px solid var(--pkggo-border);
				border-radius: 999px;
				background: color-mix(in srgb, var(--pkggo-panel) 92%, transparent);
				color: var(--pkggo-text);
				font-size: 1.05rem;
				font-weight: 760;
				backdrop-filter: blur(14px);
				-webkit-backdrop-filter: blur(14px);
				box-shadow: 0 .6rem 1.5rem rgba(0,0,0,.22);
			}

			.pkggo-hidden {
				display: none !important;
			}
		`;

		document.head.appendChild(style);
	}

	function createButton(text) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "pkggo-button";
		button.textContent = text;
		return button;
	}

	function createToolbar() {
		if (document.querySelector(".pkggo-toolbar")) return;

		const toolbar = document.createElement("div");
		const search = document.createElement("input");
		const controls = document.createElement("div");
		const theme = document.createElement("select");
		const font = document.createElement("select");
		const smaller = createButton("A−");
		const bigger = createButton("A+");
		const menu = createButton("Menu");

		toolbar.className = "pkggo-toolbar";

		search.className = "pkggo-search";
		search.type = "search";
		search.placeholder = "Search this package...";

		controls.className = "pkggo-controls";

		theme.className = "pkggo-select";
		theme.innerHTML = Object.entries(THEMES)
			.map(([value, item]) => `<option value="${value}">${item.label}</option>`)
			.join("");
		theme.value = getThemeName();

		font.className = "pkggo-select";
		font.innerHTML = `<option value="system">System</option><option value="serif">Serif</option><option value="mono">Mono</option>`;
		font.value = getFontName();

		theme.addEventListener("change", () => {
			localStorage.setItem(STORAGE.theme, theme.value);
			applySettings();
		});

		font.addEventListener("change", () => {
			localStorage.setItem(STORAGE.font, font.value);
			applySettings();
		});

		smaller.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getScale() - 0.05, 0.9, 1.12)));
			applySettings();
		});

		bigger.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getScale() + 0.05, 0.9, 1.12)));
			applySettings();
		});

		menu.addEventListener("click", () => {
			document.documentElement.classList.toggle("pkggo-toc-open");
		});

		search.addEventListener("input", () => {
			filterPage(search.value);
		});

		controls.append(theme, font, smaller, bigger, menu);
		toolbar.append(search, controls);

		document.querySelector("main")?.prepend(toolbar);
	}

	function cleanBrokenTokens(value) {
		return value
			.replace(/go-token-[a-z-]+">/g, "")
			.replace(/go-token-[a-z-]+&quot;&gt;/g, "")
			.replace(/&quot;/g, "\"")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&");
	}

	function detectLanguage(text) {
		if (/^\s*\$|go run|go test|go build|curl |grep |sed |awk |export /.test(text)) return "bash";
		if (/\b(package|func|import|fmt\.|:=|defer|chan|type|struct|interface)\b/.test(text)) return "go";
		return "go";
	}

	function highlightCodeBlocks() {
		if (!window.hljs) return;

		window.hljs.configure({
			ignoreUnescapedHTML: true,
			languages: ["go", "bash", "shell", "plaintext"],
		});

		const blocks = [...document.querySelectorAll("pre")];

		for (const pre of blocks) {
			if (pre.dataset.pkggoHighlighted === "true") continue;

			const text = cleanBrokenTokens(pre.textContent || "");
			const language = detectLanguage(text);
			const code = document.createElement("code");

			code.className = `language-${language}`;
			code.textContent = text;

			pre.innerHTML = "";
			pre.appendChild(code);

			window.hljs.highlightElement(code);
			pre.dataset.pkggoHighlighted = "true";
		}
	}

	function enhanceHeadings() {
		for (const heading of [...document.querySelectorAll("h1,h2,h3,h4")]) {
			const text = cleanText(heading.textContent || "");

			if (!text) continue;
			if (!heading.id) heading.id = slugify(text);

			if (!heading.querySelector(".pkggo-anchor")) {
				const anchor = document.createElement("a");
				anchor.className = "pkggo-anchor";
				anchor.href = `#${heading.id}`;
				anchor.textContent = " #";
				anchor.addEventListener("click", (event) => {
					event.preventDefault();
					scrollToId(heading.id);
					history.replaceState(null, "", `#${heading.id}`);
				});
				heading.appendChild(anchor);
			}
		}
	}

	function buildToc() {
		document.getElementById(IDS.toc)?.remove();

		const toc = document.createElement("aside");
		const title = document.createElement("div");
		const search = document.createElement("input");
		const list = document.createElement("ol");

		toc.id = IDS.toc;

		title.className = "pkggo-toc-title";
		title.innerHTML = `<span>Package index</span><button class="pkggo-button" type="button">Close</button>`;
		title.querySelector("button")?.addEventListener("click", () => {
			document.documentElement.classList.remove("pkggo-toc-open");
		});

		search.className = "pkggo-toc-search";
		search.type = "search";
		search.placeholder = "Filter symbols...";

		list.className = "pkggo-toc-list";

		const headings = [...document.querySelectorAll("main h1, main h2, main h3, main h4")]
			.filter((heading) => cleanText(heading.textContent || "").length > 0)
			.slice(0, 900);

		for (const heading of headings) {
			const text = cleanText((heading.textContent || "").replace("#", ""));

			if (!text) continue;
			if (!heading.id) heading.id = slugify(text);

			const item = document.createElement("li");
			const link = document.createElement("a");
			const level = Number(heading.tagName.slice(1));

			link.href = `#${heading.id}`;
			link.className = `pkggo-toc-link pkggo-toc-level-${level}`;
			link.textContent = text;

			link.addEventListener("click", (event) => {
				event.preventDefault();
				document.documentElement.classList.remove("pkggo-toc-open");
				scrollToId(heading.id);
				history.replaceState(null, "", `#${heading.id}`);
			});

			item.appendChild(link);
			list.appendChild(item);
		}

		search.addEventListener("input", () => {
			const query = search.value.trim().toLowerCase();

			for (const item of [...list.children]) {
				const text = item.textContent?.toLowerCase() || "";
				item.classList.toggle("pkggo-hidden", query.length > 0 && !text.includes(query));
			}
		});

		toc.append(title, search, list);
		document.body.appendChild(toc);
	}

	function createFloating() {
		document.getElementById(IDS.floating)?.remove();

		const wrap = document.createElement("div");
		const menu = document.createElement("button");
		const top = document.createElement("button");

		wrap.id = IDS.floating;

		menu.className = "pkggo-fab";
		menu.type = "button";
		menu.textContent = "☰";
		menu.addEventListener("click", () => {
			document.documentElement.classList.toggle("pkggo-toc-open");
		});

		top.className = "pkggo-fab";
		top.type = "button";
		top.textContent = "↑";
		top.addEventListener("click", () => {
			window.scrollTo({ top: 0, behavior: "smooth" });
		});

		wrap.append(menu, top);
		document.body.appendChild(wrap);
	}

	function scrollToId(id) {
		const element = document.getElementById(id);

		if (!element) return;

		const top = element.getBoundingClientRect().top + window.scrollY - 88;

		window.scrollTo({
			top: Math.max(0, top),
			behavior: "smooth",
		});
	}

	function filterPage(value) {
		const query = value.trim().toLowerCase();
		const blocks = [...document.querySelectorAll(".Documentation-function, .Documentation-type, .Documentation-variable, .Documentation-constant, .Documentation-overview, .Documentation-example")];

		for (const block of blocks) {
			const text = block.textContent?.toLowerCase() || "";
			block.classList.toggle("pkggo-hidden", query.length > 0 && !text.includes(query));
		}
	}

	function cleanText(value) {
		return value.replace(/\s+/g, " ").trim();
	}

	function slugify(value) {
		return `pkggo-${cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
	}

	function boot() {
		setViewport();
		applySettings();
		installStyles();

		requestAnimationFrame(() => {
			createToolbar();
			enhanceHeadings();
			highlightCodeBlocks();
			buildToc();
			createFloating();
			applySettings();
		});
	}

	boot();
})();