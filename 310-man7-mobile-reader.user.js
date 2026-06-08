// ==UserScript==
// @name         Rod / Docs / man7 Reader
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile-first man7.org reading mode that preserves links and improves readability.
// @author       Rod
// @match        https://man7.org/linux/man-pages/*
// @run-at       document-idle
// @weight       490
// @grant        none
// @noframes
// ==/UserScript==

(() => {
	"use strict";

	const IDS = {
		root: "migos-man7-root",
		style: "migos-man7-style",
		toc: "migos-man7-toc",
	};

	const STORAGE = {
		accent: "migos:man7:accent",
		font: "migos:man7:font",
		scale: "migos:man7:scale",
	};

	const DEFAULTS = {
		accent: "#8f9bff",
		font: "system",
		scale: 1,
	};

	const FONTS = {
		system: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
		mono: `"SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace`,
		serif: `ui-serif, Georgia, Cambria, "Times New Roman", serif`,
	};

	const SECTION_NAMES = new Set([
		"NAME",
		"SYNOPSIS",
		"CONFIGURATION",
		"DESCRIPTION",
		"OPTIONS",
		"EXIT STATUS",
		"RETURN VALUE",
		"ERRORS",
		"ENVIRONMENT",
		"FILES",
		"VERSIONS",
		"ATTRIBUTES",
		"STANDARDS",
		"HISTORY",
		"NOTES",
		"BUGS",
		"EXAMPLES",
		"AUTHORS",
		"AUTHOR",
		"REPORTING BUGS",
		"COPYRIGHT",
		"SEE ALSO",
		"COLOPHON",
	]);

	const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

	function getSettings() {
		return {
			accent: localStorage.getItem(STORAGE.accent) || DEFAULTS.accent,
			font: localStorage.getItem(STORAGE.font) || DEFAULTS.font,
			scale: Number(localStorage.getItem(STORAGE.scale) || DEFAULTS.scale),
		};
	}

	function applySettings() {
		const settings = getSettings();
		document.documentElement.style.setProperty("--man7-accent", safeAccent(settings.accent));
		document.documentElement.style.setProperty("--man7-font", FONTS[settings.font] || FONTS.system);
		document.documentElement.style.setProperty("--man7-scale", String(clamp(settings.scale, 0.9, 1.18)));
	}

	function safeAccent(hex) {
		const value = hex.replace("#", "").trim();

		if (!/^[0-9a-f]{6}$/i.test(value)) {
			return DEFAULTS.accent;
		}

		const r = Number.parseInt(value.slice(0, 2), 16);
		const g = Number.parseInt(value.slice(2, 4), 16);
		const b = Number.parseInt(value.slice(4, 6), 16);
		const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

		if (luminance < 0.14) {
			return "#8f9bff";
		}

		if (luminance > 0.86) {
			return "#6977e8";
		}

		return `#${value}`;
	}

	function installStyles() {
		if (document.getElementById(IDS.style)) return;

		const style = document.createElement("style");
		style.id = IDS.style;
		style.textContent = `
			:root {
				color-scheme: dark;
				--man7-bg: #0d111b;
				--man7-surface: #131a2a;
				--man7-surface-soft: #172033;
				--man7-code: #090d16;
				--man7-text: #edf1f8;
				--man7-muted: #aeb7ca;
				--man7-faint: #778197;
				--man7-border: rgba(255,255,255,.09);
				-webkit-text-size-adjust: 100%;
			}

			html,
			body {
				margin: 0 !important;
				padding: 0 !important;
				width: 100% !important;
				max-width: 100% !important;
				overflow-x: hidden !important;
				background: var(--man7-bg) !important;
				color: var(--man7-text) !important;
				font-family: var(--man7-font) !important;
				font-size: calc(17px * var(--man7-scale)) !important;
				line-height: 1.68 !important;
			}

			body > *:not(#${IDS.root}):not(#${IDS.toc}):not(.man7-floating) {
				display: none !important;
			}

			#${IDS.root} {
				box-sizing: border-box;
				width: min(100%, 1120px);
				margin: 0 auto;
				padding: max(4.8rem, env(safe-area-inset-top)) .95rem 6.5rem;
			}

			.man7-layout {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				gap: 1rem;
			}

			.man7-topbar {
				position: sticky;
				top: max(.65rem, env(safe-area-inset-top));
				z-index: 20;
				display: grid;
				gap: .55rem;
				margin-bottom: 1rem;
				padding: .65rem;
				border: 1px solid var(--man7-border);
				border-radius: 1rem;
				background: rgba(18,24,39,.9);
				backdrop-filter: blur(18px) saturate(1.1);
				-webkit-backdrop-filter: blur(18px) saturate(1.1);
				box-shadow: 0 1rem 2.3rem rgba(0,0,0,.23);
			}

			.man7-search {
				width: 100%;
				height: 2.45rem;
				box-sizing: border-box;
				border: 1px solid var(--man7-border);
				border-radius: .8rem;
				background: #0b1020;
				color: var(--man7-text);
				padding: 0 .85rem;
				font: 650 .9rem var(--man7-font);
				outline: none;
			}

			.man7-controls {
				display: grid;
				grid-template-columns: auto 1fr auto auto auto;
				gap: .45rem;
				align-items: center;
			}

			.man7-button,
			.man7-select,
			.man7-color {
				height: 2.35rem;
				min-width: 0;
				border: 1px solid var(--man7-border);
				border-radius: .75rem;
				background: var(--man7-surface-soft);
				color: var(--man7-text);
				font: 720 .82rem var(--man7-font);
			}

			.man7-button {
				padding: 0 .75rem;
			}

			.man7-select {
				padding: 0 .65rem;
			}

			.man7-color {
				width: 2.45rem;
				padding: .22rem;
			}

			.man7-hero {
				padding: .75rem 0 1rem;
				margin-bottom: .85rem;
				border-bottom: 1px solid var(--man7-border);
			}

			.man7-kicker {
				color: var(--man7-faint);
				font-size: .68rem;
				font-weight: 820;
				letter-spacing: .14em;
				text-transform: uppercase;
			}

			.man7-title {
				margin: .42rem 0 .35rem;
				color: var(--man7-text);
				font-size: clamp(2rem, 10vw, 3.35rem);
				line-height: 1.03;
				letter-spacing: -.052em;
				font-weight: 880;
			}

			.man7-subtitle {
				max-width: 45rem;
				color: var(--man7-muted);
				font-size: .98rem;
				line-height: 1.52;
			}

			.man7-content {
				max-width: 47rem;
				margin: 0 auto;
			}

			.man7-content * {
				box-sizing: border-box;
			}

			.man7-man-header,
			.man7-section {
				margin: 1rem 0;
				padding: .95rem;
				border: 1px solid var(--man7-border);
				border-radius: 1rem;
				background: var(--man7-surface);
			}

			.man7-man-header h1,
			.man7-section h2 {
				margin: 0 0 .75rem !important;
				color: var(--man7-text) !important;
				font-weight: 830 !important;
				line-height: 1.15 !important;
				letter-spacing: -.04em;
			}

			.man7-man-header h1 {
				font-size: clamp(1.8rem, 8vw, 2.45rem) !important;
			}

			.man7-section h2 {
				font-size: clamp(1.35rem, 6vw, 1.85rem) !important;
			}

			.man7-section h3 {
				margin: 1rem 0 .35rem !important;
				color: var(--man7-text) !important;
				font-size: 1.08rem !important;
				font-weight: 760 !important;
				line-height: 1.22 !important;
			}

			.man7-section p {
				margin: .55rem 0 !important;
				color: var(--man7-text) !important;
				font-weight: 420 !important;
				line-height: 1.68 !important;
			}

			.man7-line {
				margin: .35rem 0;
				color: var(--man7-text);
				font-weight: 420;
				line-height: 1.66;
			}

			.man7-line.is-indented {
				padding-left: .75rem;
				border-left: 1px solid var(--man7-border);
				color: color-mix(in srgb, var(--man7-text) 92%, var(--man7-muted));
			}

			.man7-line.is-code {
				overflow-x: auto;
				-webkit-overflow-scrolling: touch;
				margin: .55rem 0;
				padding: .72rem .8rem;
				border: 1px solid var(--man7-border);
				border-radius: .78rem;
				background: var(--man7-code);
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace;
				font-size: .86rem;
				line-height: 1.55;
				white-space: pre;
			}

			.man7-line.is-option {
				display: grid;
				gap: .18rem;
				margin: .7rem 0 .45rem;
				color: var(--man7-text);
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace;
				font-size: .9rem;
				font-weight: 650;
			}

			.man7-content a {
				color: color-mix(in srgb, var(--man7-accent) 72%, var(--man7-text)) !important;
				text-decoration: none !important;
				border-bottom: 1px solid color-mix(in srgb, var(--man7-accent) 25%, transparent);
				font-weight: 590 !important;
			}

			.man7-content a:hover {
				border-bottom-color: var(--man7-accent);
			}

			.man7-content b,
			.man7-content strong {
				font-weight: 760;
			}

			.man7-content i,
			.man7-content em {
				color: color-mix(in srgb, var(--man7-accent) 65%, var(--man7-text));
			}

			.man7-section-nav {
				display: flex;
				flex-wrap: wrap;
				gap: .4rem .55rem;
				margin: .75rem 0 0;
			}

			.man7-section-nav a {
				display: inline-flex;
				padding: .22rem .46rem;
				border: 1px solid color-mix(in srgb, var(--man7-accent) 18%, transparent) !important;
				border-radius: .55rem;
				background: color-mix(in srgb, var(--man7-accent) 8%, transparent);
				font-size: .82rem;
				font-weight: 650 !important;
			}

			#${IDS.toc} {
				position: fixed;
				inset: 0 auto 0 0;
				z-index: 50;
				width: min(21rem, calc(100vw - 3.2rem));
				box-sizing: border-box;
				padding: max(1rem, env(safe-area-inset-top)) .9rem max(1rem, env(safe-area-inset-bottom));
				border-right: 1px solid var(--man7-border);
				background: rgba(15,21,34,.97);
				backdrop-filter: blur(18px) saturate(1.1);
				-webkit-backdrop-filter: blur(18px) saturate(1.1);
				transform: translateX(-105%);
				transition: transform .2s ease;
				overflow: auto;
			}

			html.man7-toc-open #${IDS.toc} {
				transform: translateX(0);
			}

			.man7-toc-title {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: .75rem;
				margin-bottom: .75rem;
				font-weight: 820;
				color: var(--man7-text);
			}

			.man7-toc-search {
				width: 100%;
				height: 2.35rem;
				margin-bottom: .7rem;
				border: 1px solid var(--man7-border);
				border-radius: .75rem;
				background: #0b1020;
				color: var(--man7-text);
				padding: 0 .75rem;
				font: 640 .88rem var(--man7-font);
				outline: none;
			}

			.man7-toc-list {
				display: grid;
				gap: .08rem;
				padding: 0;
				margin: 0;
				list-style: none;
			}

			.man7-toc-link {
				display: block;
				padding: .36rem .48rem;
				border: 0 !important;
				border-radius: .55rem;
				color: var(--man7-muted) !important;
				text-decoration: none !important;
				font-size: .88rem;
				line-height: 1.32;
				font-weight: 540 !important;
			}

			.man7-toc-link:hover {
				background: color-mix(in srgb, var(--man7-accent) 12%, transparent);
				color: var(--man7-text) !important;
			}

			.man7-floating {
				position: fixed;
				right: max(1rem, env(safe-area-inset-right));
				bottom: max(5.8rem, env(safe-area-inset-bottom));
				z-index: 35;
				display: grid;
				gap: .55rem;
			}

			.man7-fab {
				width: 3.15rem;
				height: 3.15rem;
				border: 1px solid var(--man7-border);
				border-radius: 999px;
				background: rgba(18,24,39,.9);
				color: var(--man7-text);
				font-size: 1.2rem;
				font-weight: 820;
				box-shadow: 0 .8rem 2rem rgba(0,0,0,.23);
				backdrop-filter: blur(14px);
				-webkit-backdrop-filter: blur(14px);
			}

			.man7-hidden {
				display: none !important;
			}

			@media (min-width: 1080px) {
				#${IDS.root} {
					padding-inline: 1.5rem;
				}

				.man7-layout {
					grid-template-columns: 17rem minmax(0, 1fr);
					align-items: start;
				}

				#${IDS.toc} {
					position: sticky;
					top: 1rem;
					transform: none !important;
					width: auto;
					height: calc(100vh - 2rem);
					border: 1px solid var(--man7-border);
					border-radius: 1rem;
				}

				.man7-content {
					margin: 0;
				}

				.man7-floating {
					display: none;
				}
			}
		`;

		document.head.appendChild(style);
	}

	function createButton(text) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "man7-button";
		button.textContent = text;
		return button;
	}

	function createTopbar() {
		const topbar = document.createElement("div");
		const search = document.createElement("input");
		const controls = document.createElement("div");
		const color = document.createElement("input");
		const font = document.createElement("select");
		const smaller = createButton("A−");
		const bigger = createButton("A+");
		const menu = createButton("Menu");

		topbar.className = "man7-topbar";
		search.className = "man7-search";
		search.type = "search";
		search.placeholder = "Search this page...";

		controls.className = "man7-controls";

		color.className = "man7-color";
		color.type = "color";
		color.value = getSettings().accent;

		font.className = "man7-select";
		font.innerHTML = `
			<option value="system">System</option>
			<option value="mono">SF Mono</option>
			<option value="serif">Serif</option>
		`;
		font.value = getSettings().font;

		color.addEventListener("input", () => {
			localStorage.setItem(STORAGE.accent, color.value);
			applySettings();
		});

		font.addEventListener("change", () => {
			localStorage.setItem(STORAGE.font, font.value);
			applySettings();
		});

		smaller.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getSettings().scale - 0.05, 0.9, 1.18)));
			applySettings();
		});

		bigger.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getSettings().scale + 0.05, 0.9, 1.18)));
			applySettings();
		});

		menu.addEventListener("click", () => {
			document.documentElement.classList.toggle("man7-toc-open");
		});

		search.addEventListener("input", () => filterContent(search.value));

		controls.append(color, font, smaller, bigger, menu);
		topbar.append(search, controls);

		return topbar;
	}

	function getPageTitle() {
		return document.querySelector("h1")?.textContent?.trim() || document.title.replace(/\s+-\s+Linux manual page.*$/i, "");
	}

	function createHero() {
		const hero = document.createElement("header");
		hero.className = "man7-hero";
		hero.innerHTML = `
			<div class="man7-kicker">Linux Manual Pages</div>
			<h1 class="man7-title">${escapeHtml(getPageTitle())}</h1>
			<div class="man7-subtitle">Readable mobile view with preserved command links, clean sections, gentle colors, and searchable navigation.</div>
		`;
		return hero;
	}

	function moveOriginalContent() {
		const originalNodes = [...document.body.childNodes];
		const root = document.createElement("main");
		const layout = document.createElement("div");
		const content = document.createElement("article");

		root.id = IDS.root;
		layout.className = "man7-layout";
		content.className = "man7-content";

		for (const node of originalNodes) {
			content.appendChild(node);
		}

		layout.appendChild(content);
		root.append(createTopbar(), createHero(), layout);
		document.body.appendChild(root);

		return content;
	}

	function cleanChrome(content) {
		const selectors = [
			"form",
			"address",
			"center",
			"img",
			"script",
			"style",
			"table.C2",
			"table.navbar",
			"div.navbar",
			".navbar",
			"hr",
		];

		for (const selector of selectors) {
			for (const node of [...content.querySelectorAll(selector)]) {
				node.remove();
			}
		}

		for (const table of [...content.querySelectorAll("table")]) {
			const text = cleanText(table.textContent || "").toLowerCase();

			if (
				text.includes("man7.org") ||
				text.includes("linux/unix system programming training") ||
				text.includes("the linux programming interface")
			) {
				table.remove();
			}
		}

		for (const link of [...content.querySelectorAll("a")]) {
			if (cleanText(link.textContent || "").toLowerCase() === "top") {
				link.remove();
			}
		}

		for (const element of [...content.querySelectorAll("[style], [align], [bgcolor], [color], [face], [size]")]) {
			element.removeAttribute("style");
			element.removeAttribute("align");
			element.removeAttribute("bgcolor");
			element.removeAttribute("color");
			element.removeAttribute("face");
			element.removeAttribute("size");
		}
	}

	function convertPrePages(content) {
		const preBlocks = [...content.querySelectorAll("pre")];

		for (const pre of preBlocks) {
			const replacement = document.createDocumentFragment();
			const lines = htmlLines(pre);

			let currentSection = null;

			for (const lineHtml of lines) {
				const lineText = cleanText(htmlToText(lineHtml));

				if (!lineText) continue;

				if (isHeaderLine(lineText)) {
					currentSection = document.createElement("section");
					currentSection.className = "man7-section";

					const heading = document.createElement("h2");
					heading.textContent = lineText;
					heading.id = slugify(lineText);

					currentSection.appendChild(heading);
					replacement.appendChild(currentSection);
					continue;
				}

				if (!currentSection) {
					currentSection = document.createElement("section");
					currentSection.className = "man7-man-header";
					replacement.appendChild(currentSection);
				}

				currentSection.appendChild(createLine(lineHtml, lineText));
			}

			pre.replaceWith(replacement);
		}
	}

	function htmlLines(pre) {
		return pre.innerHTML
			.replaceAll("\r\n", "\n")
			.replaceAll("\r", "\n")
			.split("\n");
	}

	function htmlToText(html) {
		const tmp = document.createElement("div");
		tmp.innerHTML = html;
		return tmp.textContent || "";
	}

	function isHeaderLine(text) {
		const normalized = text.trim();
		return SECTION_NAMES.has(normalized) || /^[A-Z][A-Z0-9 _-]{2,}$/.test(normalized);
	}

	function createLine(lineHtml, lineText) {
		const line = document.createElement("div");
		const leadingSpaces = (htmlToText(lineHtml).match(/^ */)?.[0].length || 0);
		const trimmed = lineText.trim();

		line.className = "man7-line";

		if (leadingSpaces >= 8) {
			line.classList.add("is-indented");
		}

		if (isCodeLike(trimmed)) {
			line.classList.add("is-code");
		}

		if (isOptionLike(trimmed)) {
			line.classList.add("is-option");
		}

		line.innerHTML = lineHtml.trimStart();

		return line;
	}

	function isCodeLike(text) {
		if (/^\w+\s+\[/.test(text)) return true;
		if (/^\$ /.test(text)) return true;
		if (/^#include/.test(text)) return true;
		if (/^\w+\(.*\);?$/.test(text)) return true;
		return false;
	}

	function isOptionLike(text) {
		return /^-{1,2}[a-zA-Z0-9]/.test(text) || /^-\w,\s+--/.test(text);
	}

	function createHeaderNav(content) {
		const firstSection = content.querySelector(".man7-man-header");
		const firstHeadingText = getPageTitle();

		if (!firstSection) return;

		const title = document.createElement("h1");
		title.textContent = firstHeadingText;

		const links = [...content.querySelectorAll(".man7-section h2")]
			.slice(0, 12)
			.map((heading) => {
				const link = document.createElement("a");
				link.href = `#${heading.id}`;
				link.textContent = heading.textContent || "";
				return link;
			});

		const nav = document.createElement("nav");
		nav.className = "man7-section-nav";
		nav.append(...links);

		firstSection.prepend(title, nav);
	}

	function buildToc(content) {
		const toc = document.createElement("aside");
		const title = document.createElement("div");
		const search = document.createElement("input");
		const list = document.createElement("ol");

		toc.id = IDS.toc;
		title.className = "man7-toc-title";
		title.innerHTML = `<span>On this page</span><button class="man7-button" type="button">Close</button>`;

		title.querySelector("button")?.addEventListener("click", () => {
			document.documentElement.classList.remove("man7-toc-open");
		});

		search.className = "man7-toc-search";
		search.type = "search";
		search.placeholder = "Filter sections...";

		list.className = "man7-toc-list";

		for (const heading of [...content.querySelectorAll("h1,h2,h3")]) {
			const text = cleanText(heading.textContent || "");

			if (!text) continue;
			if (!heading.id) heading.id = slugify(text);

			const item = document.createElement("li");
			const link = document.createElement("a");

			link.href = `#${heading.id}`;
			link.className = "man7-toc-link";
			link.textContent = text;
			link.addEventListener("click", () => {
				document.documentElement.classList.remove("man7-toc-open");
			});

			item.appendChild(link);
			list.appendChild(item);
		}

		search.addEventListener("input", () => {
			const query = search.value.trim().toLowerCase();

			for (const item of [...list.children]) {
				const text = item.textContent?.toLowerCase() || "";
				item.classList.toggle("man7-hidden", query.length > 0 && !text.includes(query));
			}
		});

		toc.append(title, search, list);
		document.querySelector(".man7-layout")?.prepend(toc);
	}

	function createFloatingButtons() {
		const wrap = document.createElement("div");
		const menu = document.createElement("button");
		const top = document.createElement("button");

		wrap.className = "man7-floating";

		menu.className = "man7-fab";
		menu.type = "button";
		menu.textContent = "☰";
		menu.addEventListener("click", () => {
			document.documentElement.classList.toggle("man7-toc-open");
		});

		top.className = "man7-fab";
		top.type = "button";
		top.textContent = "↑";
		top.addEventListener("click", () => {
			window.scrollTo({ top: 0, behavior: "smooth" });
		});

		wrap.append(menu, top);
		document.body.appendChild(wrap);
	}

	function filterContent(query) {
		const value = query.trim().toLowerCase();

		for (const section of [...document.querySelectorAll(".man7-section, .man7-man-header")]) {
			const text = section.textContent?.toLowerCase() || "";
			section.classList.toggle("man7-hidden", value.length > 0 && !text.includes(value));
		}
	}

	function cleanText(value) {
		return value.replace(/\s+/g, " ").trim();
	}

	function slugify(value) {
		return `man7-${cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
	}

	function escapeHtml(value) {
		return value
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;")
			.replaceAll("'", "&#039;");
	}

	function boot() {
		applySettings();
		installStyles();

		const content = moveOriginalContent();

		cleanChrome(content);
		convertPrePages(content);
		createHeaderNav(content);
		buildToc(content);
		createFloatingButtons();
		applySettings();
	}

	boot();
})();