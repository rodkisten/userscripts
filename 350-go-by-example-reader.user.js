// ==UserScript==
// @name         Rod / Docs / Go by Example
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile-first Go by Example reader with themes and syntax-friendly layout.
// @author       Rod
// @match        https://gobyexample.com/*
// @run-at       document-idle
// @weight       450
// @grant        none
// @noframes
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/go.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/bash.min.js
// ==/UserScript==

(() => {
	"use strict";

	const ID = {
		root: "gbe-mobile-root",
		style: "gbe-mobile-style",
		toc: "gbe-mobile-toc",
	};

	const STORAGE = {
		theme: "gbe-mobile-v3-theme",
		font: "gbe-mobile-v3-font",
		scale: "gbe-mobile-v3-scale",
	};

	const THEMES = {
		aurora: {
			label: "Aurora",
			bg: "#0b1020",
			panel: "#11182a",
			panel2: "#172036",
			code: "#070b14",
			text: "#f2f6ff",
			muted: "#b7c3d9",
			faint: "#7f8ca8",
			accent: "#9fd0ff",
			accent2: "#d6bcff",
			accent3: "#b7f7d3",
			border: "rgba(225,235,255,.13)",
		},
		ember: {
			label: "Ember",
			bg: "#151010",
			panel: "#201716",
			panel2: "#2b1e1a",
			code: "#0f0a09",
			text: "#fff4ec",
			muted: "#d6bfb1",
			faint: "#a38a7c",
			accent: "#ffc49f",
			accent2: "#ffb4c8",
			accent3: "#ffe3a3",
			border: "rgba(255,220,200,.14)",
		},
		forest: {
			label: "Forest",
			bg: "#0b1512",
			panel: "#111f1b",
			panel2: "#182a25",
			code: "#07110e",
			text: "#f0fff9",
			muted: "#b7d5ca",
			faint: "#7ea296",
			accent: "#b8f5df",
			accent2: "#a7d8ff",
			accent3: "#e4f6a8",
			border: "rgba(220,245,236,.13)",
		},
		cream: {
			label: "Cream",
			bg: "#f7f0e3",
			panel: "#fff8ea",
			panel2: "#efe3cf",
			code: "#f0e7d6",
			text: "#2a251f",
			muted: "#6f6659",
			faint: "#938777",
			accent: "#6d7fb8",
			accent2: "#b7796f",
			accent3: "#5f8f7a",
			border: "rgba(60,45,30,.15)",
		},
	};

	const FONTS = {
		system: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
		serif: `ui-serif, Georgia, Cambria, "Times New Roman", serif`,
		mono: `"SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace`,
	};

	function getTheme() {
		return localStorage.getItem(STORAGE.theme) || "aurora";
	}

	function getFont() {
		return localStorage.getItem(STORAGE.font) || "system";
	}

	function getScale() {
		return Number(localStorage.getItem(STORAGE.scale) || "1");
	}

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
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
		const theme = THEMES[getTheme()] || THEMES.aurora;

		for (const [key, value] of Object.entries(theme)) {
			document.documentElement.style.setProperty(`--gbe-${key}`, value);
		}

		document.documentElement.style.setProperty("--gbe-font", FONTS[getFont()] || FONTS.system);
		document.documentElement.style.setProperty("--gbe-scale", String(clamp(getScale(), 0.92, 1.12)));
		document.documentElement.dataset.gbeTheme = getTheme();
	}

	function installStyles() {
		document.getElementById(ID.style)?.remove();

		const style = document.createElement("style");
		style.id = ID.style;
		style.textContent = `
			:root {
				color-scheme: dark;
				-webkit-text-size-adjust: 100%;
			}

			:root[data-gbe-theme="cream"] {
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
					radial-gradient(circle at 12% 4%, color-mix(in srgb, var(--gbe-accent) 18%, transparent), transparent 18rem),
					radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--gbe-accent2) 14%, transparent), transparent 16rem),
					linear-gradient(180deg, color-mix(in srgb, var(--gbe-bg) 92%, black), var(--gbe-bg)) !important;
				color: var(--gbe-text) !important;
				font-family: var(--gbe-font) !important;
				font-size: calc(16px * var(--gbe-scale)) !important;
				line-height: 1.56 !important;
			}

			body::before {
				content: "";
				position: fixed;
				inset: 0;
				z-index: -1;
				pointer-events: none;
				opacity: .12;
				background-image:
					linear-gradient(115deg, transparent 0 48%, rgba(255,255,255,.06) 49%, transparent 50%),
					radial-gradient(circle, rgba(255,255,255,.16) 0 1px, transparent 1px);
				background-size: 32px 32px, 9px 9px;
				mix-blend-mode: soft-light;
			}

			body > *:not(#${ID.root}):not(#${ID.toc}):not(.gbe-float) {
				display: none !important;
			}

			#${ID.root},
			#${ID.root} * {
				box-sizing: border-box !important;
				max-width: 100% !important;
			}

			#${ID.root} {
				width: 100% !important;
				max-width: 100% !important;
				margin: 0 !important;
				padding: max(4.4rem, env(safe-area-inset-top)) .75rem 6.5rem !important;
				overflow-x: hidden !important;
			}

			.gbe-topbar {
				position: sticky;
				top: max(.55rem, env(safe-area-inset-top));
				z-index: 20;
				display: grid;
				gap: .45rem;
				margin: 0 0 .8rem;
				padding: .58rem;
				border: 1px solid var(--gbe-border);
				border-radius: 1rem;
				background:
					linear-gradient(135deg, color-mix(in srgb, var(--gbe-panel) 94%, transparent), color-mix(in srgb, var(--gbe-panel2) 88%, transparent));
				backdrop-filter: blur(18px) saturate(1.12);
				-webkit-backdrop-filter: blur(18px) saturate(1.12);
				box-shadow: 0 .8rem 2rem rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.04);
			}

			.gbe-search {
				width: 100%;
				height: 2.25rem;
				border: 1px solid var(--gbe-border);
				border-radius: .72rem;
				background: color-mix(in srgb, var(--gbe-code) 92%, var(--gbe-panel));
				color: var(--gbe-text);
				padding: 0 .75rem;
				font: 650 .84rem var(--gbe-font);
				outline: none;
			}

			.gbe-controls {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto auto;
				gap: .35rem;
			}

			.gbe-button,
			.gbe-select {
				height: 2.15rem;
				min-width: 0;
				border: 1px solid var(--gbe-border);
				border-radius: .68rem;
				background: linear-gradient(180deg, var(--gbe-panel2), color-mix(in srgb, var(--gbe-panel2) 82%, var(--gbe-code)));
				color: var(--gbe-text);
				font: 700 .76rem var(--gbe-font);
			}

			.gbe-button {
				padding: 0 .55rem;
			}

			.gbe-select {
				padding: 0 .5rem;
			}

			.gbe-hero {
				position: relative;
				padding: .65rem 0 .85rem;
				margin-bottom: .7rem;
				border-bottom: 1px solid var(--gbe-border);
			}

			.gbe-hero::after {
				content: "";
				position: absolute;
				left: 0;
				bottom: -1px;
				width: 9rem;
				height: 1px;
				background: linear-gradient(90deg, var(--gbe-accent), var(--gbe-accent2), transparent);
			}

			.gbe-kicker {
				color: var(--gbe-faint);
				font-size: .62rem;
				font-weight: 800;
				letter-spacing: .14em;
				text-transform: uppercase;
			}

			.gbe-title {
				margin: .32rem 0 .24rem;
				background: linear-gradient(90deg, var(--gbe-text), var(--gbe-accent), var(--gbe-accent2));
				-webkit-background-clip: text;
				background-clip: text;
				color: transparent;
				font-size: clamp(1.7rem, 8vw, 2.45rem);
				line-height: 1.02;
				letter-spacing: -.045em;
				font-weight: 900;
			}

			.gbe-subtitle {
				color: var(--gbe-muted);
				font-size: .9rem;
				line-height: 1.42;
			}

			.gbe-content {
				width: 100% !important;
				max-width: 100% !important;
				overflow-x: hidden !important;
			}

			.gbe-content .container,
			.gbe-content .example,
			.gbe-content .target,
			.gbe-content .intro,
			.gbe-content .footer,
			.gbe-content .comments,
			.gbe-content .code {
				display: block !important;
				float: none !important;
				clear: both !important;
				width: 100% !important;
				max-width: 100% !important;
				min-width: 0 !important;
				margin-left: 0 !important;
				margin-right: 0 !important;
				padding-left: 0 !important;
				padding-right: 0 !important;
				background: transparent !important;
			}

			.gbe-content .example {
				margin: .7rem 0 !important;
				padding: .78rem !important;
				border: 1px solid var(--gbe-border) !important;
				border-radius: 1rem !important;
				background:
					linear-gradient(135deg, color-mix(in srgb, var(--gbe-panel) 97%, transparent), color-mix(in srgb, var(--gbe-panel2) 72%, transparent)),
					radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--gbe-accent) 9%, transparent), transparent 14rem) !important;
				overflow: hidden !important;
				box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
			}

			.gbe-content .comments {
				margin: 0 0 .58rem !important;
				padding: 0 !important;
			}

			.gbe-content .code {
				margin: .45rem 0 !important;
				padding: 0 !important;
			}

			.gbe-content h1,
			.gbe-content h2,
			.gbe-content h3 {
				position: relative;
				margin: .85rem 0 .5rem !important;
				color: var(--gbe-text) !important;
				font-weight: 860 !important;
				line-height: 1.12 !important;
				letter-spacing: -.032em;
				text-shadow: 0 0 20px color-mix(in srgb, var(--gbe-accent) 18%, transparent);
			}

			.gbe-content h1 { font-size: clamp(1.45rem, 6.3vw, 2rem) !important; }
			.gbe-content h2 { font-size: clamp(1.22rem, 5vw, 1.58rem) !important; }
			.gbe-content h3 { font-size: 1.05rem !important; }

			.gbe-content h1::after,
			.gbe-content h2::after,
			.gbe-content h3::after {
				content: "";
				display: block;
				width: 4rem;
				height: 2px;
				margin-top: .28rem;
				border-radius: 999px;
				background: linear-gradient(90deg, var(--gbe-accent), var(--gbe-accent2), transparent);
			}

			.gbe-content p,
			.gbe-content li {
				margin: .42rem 0 !important;
				color: var(--gbe-text) !important;
				font-weight: 410 !important;
				line-height: 1.56 !important;
				overflow-wrap: anywhere !important;
			}

			.gbe-content a {
				color: color-mix(in srgb, var(--gbe-accent) 74%, var(--gbe-text)) !important;
				text-decoration: none !important;
				border-bottom: 1px solid color-mix(in srgb, var(--gbe-accent) 24%, transparent) !important;
				font-weight: 600 !important;
			}

			.gbe-content pre {
				display: block !important;
				width: 100% !important;
				max-width: 100% !important;
				min-width: 0 !important;
				overflow-x: auto !important;
				overflow-y: hidden !important;
				-webkit-overflow-scrolling: touch;
				margin: .45rem 0 !important;
				padding: .75rem !important;
				border: 1px solid var(--gbe-border) !important;
				border-radius: .85rem !important;
				background:
					linear-gradient(180deg, color-mix(in srgb, var(--gbe-code) 96%, var(--gbe-panel2)), var(--gbe-code)) !important;
				color: var(--gbe-text) !important;
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace !important;
				font-size: .78rem !important;
				line-height: 1.5 !important;
				tab-size: 2 !important;
				white-space: pre !important;
				overflow-wrap: normal !important;
				word-break: normal !important;
				box-shadow: inset 0 1px 0 rgba(255,255,255,.045), 0 .8rem 2rem rgba(0,0,0,.16);
			}

			.gbe-content pre code,
			.gbe-content pre .hljs {
				display: block !important;
				width: max-content !important;
				min-width: 100% !important;
				padding: 0 !important;
				border: 0 !important;
				background: transparent !important;
				color: inherit;
				font-family: inherit !important;
				font-size: inherit !important;
				line-height: inherit !important;
				white-space: pre !important;
			}

			.gbe-content code:not(pre code) {
				padding: .08rem .28rem !important;
				border: 1px solid color-mix(in srgb, var(--gbe-accent) 18%, transparent) !important;
				border-radius: .36rem !important;
				background: color-mix(in srgb, var(--gbe-accent) 10%, var(--gbe-panel2)) !important;
				color: color-mix(in srgb, var(--gbe-accent) 68%, var(--gbe-text)) !important;
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace !important;
				font-size: .84em !important;
				font-weight: 650 !important;
				white-space: normal !important;
				overflow-wrap: anywhere !important;
			}

			.hljs-comment { color: #8b99b5 !important; font-style: italic; }
			.hljs-keyword,
			.hljs-built_in { color: #c7d2fe !important; font-weight: 750; }
			.hljs-string { color: #bbf7d0 !important; }
			.hljs-number { color: #fde68a !important; }
			.hljs-title,
			.hljs-function { color: #9fd0ff !important; }
			.hljs-type { color: #dbc2ff !important; }
			.hljs-meta,
			.hljs-symbol { color: #ffbfd0 !important; }
			.hljs-attr,
			.hljs-variable { color: #bae6fd !important; }

			:root[data-gbe-theme="cream"] .hljs-comment { color: #8a8173 !important; }
			:root[data-gbe-theme="cream"] .hljs-keyword,
			:root[data-gbe-theme="cream"] .hljs-built_in { color: #4f46e5 !important; }
			:root[data-gbe-theme="cream"] .hljs-string { color: #047857 !important; }
			:root[data-gbe-theme="cream"] .hljs-number { color: #a16207 !important; }
			:root[data-gbe-theme="cream"] .hljs-title,
			:root[data-gbe-theme="cream"] .hljs-function { color: #2563eb !important; }
			:root[data-gbe-theme="cream"] .hljs-type { color: #7c3aed !important; }

			.gbe-anchor-chip {
				display: inline-flex;
				margin-left: .32rem;
				padding: .08rem .3rem;
				border: 1px solid color-mix(in srgb, var(--gbe-accent) 18%, transparent);
				border-radius: 999px;
				background: color-mix(in srgb, var(--gbe-accent) 10%, transparent);
				color: var(--gbe-muted) !important;
				font-size: .68rem;
				font-weight: 700;
				vertical-align: middle;
			}

			#${ID.toc} {
				position: fixed;
				inset: 0 auto 0 0;
				z-index: 50;
				width: min(21rem, calc(100vw - 3.2rem));
				padding: max(1rem, env(safe-area-inset-top)) .85rem max(1rem, env(safe-area-inset-bottom));
				border-right: 1px solid var(--gbe-border);
				background:
					linear-gradient(180deg, color-mix(in srgb, var(--gbe-bg) 98%, transparent), color-mix(in srgb, var(--gbe-panel) 94%, transparent));
				backdrop-filter: blur(18px) saturate(1.08);
				-webkit-backdrop-filter: blur(18px) saturate(1.08);
				transform: translateX(-105%);
				transition: transform .2s ease;
				overflow: auto;
			}

			html.gbe-toc-open #${ID.toc} {
				transform: translateX(0);
			}

			.gbe-toc-title {
				display: flex;
				justify-content: space-between;
				gap: .7rem;
				margin-bottom: .65rem;
				color: var(--gbe-text);
				font-weight: 800;
			}

			.gbe-toc-search {
				width: 100%;
				height: 2.2rem;
				margin-bottom: .6rem;
				border: 1px solid var(--gbe-border);
				border-radius: .62rem;
				background: var(--gbe-code);
				color: var(--gbe-text);
				padding: 0 .65rem;
				font: 600 .82rem var(--gbe-font);
			}

			.gbe-toc-list {
				display: grid;
				gap: .05rem;
				padding: 0;
				margin: 0;
				list-style: none;
			}

			.gbe-toc-link {
				display: block;
				padding: .32rem .42rem;
				border: 0 !important;
				border-radius: .48rem;
				color: var(--gbe-muted) !important;
				text-decoration: none !important;
				font-size: .8rem;
				line-height: 1.22;
				font-weight: 560 !important;
			}

			.gbe-toc-link:hover {
				background: color-mix(in srgb, var(--gbe-accent) 12%, transparent) !important;
				color: var(--gbe-text) !important;
			}

			.gbe-float {
				position: fixed;
				right: max(.72rem, env(safe-area-inset-right));
				bottom: max(5.45rem, env(safe-area-inset-bottom));
				z-index: 35;
				display: grid;
				gap: .44rem;
			}

			.gbe-fab {
				width: 2.82rem;
				height: 2.82rem;
				border: 1px solid var(--gbe-border);
				border-radius: 999px;
				background: color-mix(in srgb, var(--gbe-panel) 92%, transparent);
				color: var(--gbe-text);
				font-size: 1.05rem;
				font-weight: 750;
				backdrop-filter: blur(14px);
				-webkit-backdrop-filter: blur(14px);
				box-shadow: 0 .6rem 1.5rem rgba(0,0,0,.22);
			}

			.gbe-hidden {
				display: none !important;
			}
		`;

		document.head.appendChild(style);
	}

	function createButton(text) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "gbe-button";
		button.textContent = text;
		return button;
	}

	function createTopbar() {
		const topbar = document.createElement("div");
		const search = document.createElement("input");
		const controls = document.createElement("div");
		const theme = document.createElement("select");
		const font = document.createElement("select");
		const smaller = createButton("A−");
		const bigger = createButton("A+");
		const menu = createButton("Menu");

		topbar.className = "gbe-topbar";
		search.className = "gbe-search";
		search.type = "search";
		search.placeholder = "Search this page...";

		controls.className = "gbe-controls";

		theme.className = "gbe-select";
		theme.innerHTML = Object.entries(THEMES).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join("");
		theme.value = getTheme();

		font.className = "gbe-select";
		font.innerHTML = `<option value="system">System</option><option value="serif">Serif</option><option value="mono">Mono</option>`;
		font.value = getFont();

		theme.addEventListener("change", () => {
			localStorage.setItem(STORAGE.theme, theme.value);
			applySettings();
		});

		font.addEventListener("change", () => {
			localStorage.setItem(STORAGE.font, font.value);
			applySettings();
		});

		smaller.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getScale() - 0.05, 0.92, 1.12)));
			applySettings();
		});

		bigger.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getScale() + 0.05, 0.92, 1.12)));
			applySettings();
		});

		menu.addEventListener("click", () => {
			document.documentElement.classList.toggle("gbe-toc-open");
		});

		search.addEventListener("input", () => {
			filterPage(search.value);
		});

		controls.append(theme, font, smaller, bigger, menu);
		topbar.append(search, controls);
		return topbar;
	}

	function getTitle() {
		return document.querySelector("h1")?.textContent?.trim() || document.title.replace("Go by Example: ", "").trim() || "Go by Example";
	}

	function createHero() {
		const hero = document.createElement("header");
		hero.className = "gbe-hero";
		hero.innerHTML = `
			<div class="gbe-kicker">Go by Example</div>
			<h1 class="gbe-title">${escapeHtml(getTitle())}</h1>
			<div class="gbe-subtitle">Mobile-first reading mode with rich themes, subtle gradients, beautiful headings, highlight.js, and searchable navigation.</div>
		`;
		return hero;
	}

	function moveContent() {
		const root = document.createElement("main");
		const content = document.createElement("article");

		root.id = ID.root;
		content.className = "gbe-content";

		for (const node of [...document.body.childNodes]) {
			content.appendChild(node);
		}

		root.append(createTopbar(), createHero(), content);
		document.body.appendChild(root);
		return content;
	}

	function cleanContent(content) {
		for (const selector of ["script", "style", "noscript", "link[rel='stylesheet']"]) {
			for (const node of content.querySelectorAll(selector)) node.remove();
		}

		for (const element of content.querySelectorAll("[style], [width], [height], [align], [bgcolor], [color], [face], [size]")) {
			for (const attr of ["style", "width", "height", "align", "bgcolor", "color", "face", "size"]) {
				element.removeAttribute(attr);
			}
		}
	}

	function enhanceAnchors(content) {
		for (const heading of content.querySelectorAll("h1,h2,h3")) {
			const label = cleanText(heading.textContent || "");

			if (!label) continue;
			if (!heading.id) heading.id = slugify(label);

			if (!heading.querySelector(".gbe-anchor-chip")) {
				const anchor = document.createElement("a");
				anchor.className = "gbe-anchor-chip";
				anchor.href = `#${heading.id}`;
				anchor.textContent = "#";
				heading.appendChild(anchor);
			}
		}
	}

	function detectLanguage(text) {
		if (/^\s*\$|go run|go build|go test|go env|curl |grep |sed |awk |export /.test(text)) {
			return "bash";
		}

		if (/\b(package|func|import|fmt\.|:=|defer|goroutine|chan)\b/.test(text)) {
			return "go";
		}

		return "plaintext";
	}

	function highlightCode(content) {
		if (!window.hljs) return;

		window.hljs.configure({
			ignoreUnescapedHTML: true,
			languages: ["go", "bash", "shell", "plaintext"],
		});

		for (const pre of content.querySelectorAll("pre")) {
			if (pre.dataset.gbeDone === "true") continue;

			const text = pre.textContent || "";
			const language = detectLanguage(text);
			const code = document.createElement("code");

			code.className = `language-${language}`;
			code.textContent = text;

			pre.innerHTML = "";
			pre.appendChild(code);

			window.hljs.highlightElement(code);
			pre.dataset.gbeDone = "true";
		}
	}

	function buildToc(content) {
		const toc = document.createElement("aside");
		const title = document.createElement("div");
		const search = document.createElement("input");
		const list = document.createElement("ol");

		toc.id = ID.toc;
		title.className = "gbe-toc-title";
		title.innerHTML = `<span>Navigation</span><button class="gbe-button" type="button">Close</button>`;
		title.querySelector("button")?.addEventListener("click", () => document.documentElement.classList.remove("gbe-toc-open"));

		search.className = "gbe-toc-search";
		search.type = "search";
		search.placeholder = "Filter...";

		list.className = "gbe-toc-list";

		for (const link of collectLinks(content)) {
			const item = document.createElement("li");
			const anchor = document.createElement("a");

			anchor.className = "gbe-toc-link";
			anchor.href = link.href;
			anchor.textContent = link.label;
			anchor.addEventListener("click", () => document.documentElement.classList.remove("gbe-toc-open"));

			item.appendChild(anchor);
			list.appendChild(item);
		}

		search.addEventListener("input", () => {
			const query = search.value.trim().toLowerCase();

			for (const item of list.children) {
				item.classList.toggle("gbe-hidden", query && !item.textContent.toLowerCase().includes(query));
			}
		});

		toc.append(title, search, list);
		document.body.appendChild(toc);
	}

	function collectLinks(content) {
		const links = [];

		for (const heading of content.querySelectorAll("h1,h2,h3")) {
			const label = cleanText(heading.textContent?.replace("#", "") || "");

			if (!label) continue;
			if (!heading.id) heading.id = slugify(label);

			links.push({ label, href: `#${heading.id}` });
		}

		for (const anchor of content.querySelectorAll("a[href^='/']")) {
			const label = cleanText(anchor.textContent || "");
			const href = anchor.getAttribute("href");

			if (label.length > 1 && href) links.push({ label, href });
		}

		const seen = new Set();

		return links.filter((item) => {
			const key = `${item.href}:${item.label}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		}).slice(0, 180);
	}

	function createFloating() {
		const wrap = document.createElement("div");
		const menu = document.createElement("button");
		const top = document.createElement("button");

		wrap.className = "gbe-float";

		menu.className = "gbe-fab";
		menu.textContent = "☰";
		menu.addEventListener("click", () => document.documentElement.classList.toggle("gbe-toc-open"));

		top.className = "gbe-fab";
		top.textContent = "↑";
		top.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

		wrap.append(menu, top);
		document.body.appendChild(wrap);
	}

	function filterPage(value) {
		const query = value.trim().toLowerCase();

		for (const block of document.querySelectorAll(".gbe-content .example, .gbe-content p, .gbe-content li")) {
			const text = block.textContent.toLowerCase();
			block.classList.toggle("gbe-hidden", query && !text.includes(query));
		}
	}

	function cleanText(value) {
		return value.replace(/\s+/g, " ").trim();
	}

	function slugify(value) {
		return `gbe-${cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
	}

	function escapeHtml(value) {
		return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
	}

	function boot() {
		setViewport();
		applySettings();
		installStyles();

		const content = moveContent();

		cleanContent(content);
		enhanceAnchors(content);
		highlightCode(content);
		buildToc(content);
		createFloating();
		applySettings();
	}

	boot();
})();