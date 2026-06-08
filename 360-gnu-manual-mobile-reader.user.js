// ==UserScript==
// @name         Rod / Docs / GNU Manual
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile-first GNU manual reader with clean navigation and calm typography.
// @author       Rod
// @match        https://www.gnu.org/software/*
// @run-at       document-idle
// @weight       440
// @grant        none
// @noframes
// ==/UserScript==

(() => {
	"use strict";

	const IDS = {
		root: "migos-gawk-root",
		style: "migos-gawk-style",
		toc: "migos-gawk-toc",
	};

	const STORAGE = {
		accent: "migos:gawk:v2:accent",
		font: "migos:gawk:v2:font",
		scale: "migos:gawk:v2:scale",
	};

	const DEFAULTS = {
		accent: "#c7d2fe",
		font: "system",
		scale: 1,
	};

	const FONTS = {
		system: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
		mono: `"SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace`,
		serif: `ui-serif, Georgia, Cambria, "Times New Roman", serif`,
	};

	const AWK_KEYWORDS = [
		"BEGIN", "END", "BEGINFILE", "ENDFILE", "if", "else", "while", "do", "for",
		"break", "continue", "next", "nextfile", "delete", "function", "return", "print",
		"printf", "getline", "in", "split", "match", "sub", "gsub", "gensub", "length",
		"index", "substr", "sprintf", "system", "close", "tolower", "toupper",
	];

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	function getSettings() {
		return {
			accent: localStorage.getItem(STORAGE.accent) || DEFAULTS.accent,
			font: localStorage.getItem(STORAGE.font) || DEFAULTS.font,
			scale: Number(localStorage.getItem(STORAGE.scale) || DEFAULTS.scale),
		};
	}

	function safePastel(hex) {
		const raw = hex.replace("#", "").trim();

		if (!/^[0-9a-f]{6}$/i.test(raw)) {
			return DEFAULTS.accent;
		}

		const r = Number.parseInt(raw.slice(0, 2), 16);
		const g = Number.parseInt(raw.slice(2, 4), 16);
		const b = Number.parseInt(raw.slice(4, 6), 16);

		return `#${[
			Math.round(r * 0.42 + 235 * 0.58),
			Math.round(g * 0.42 + 235 * 0.58),
			Math.round(b * 0.42 + 245 * 0.58),
		].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
	}

	function applySettings() {
		const settings = getSettings();

		document.documentElement.style.setProperty("--gawk-accent", safePastel(settings.accent));
		document.documentElement.style.setProperty("--gawk-font", FONTS[settings.font] || FONTS.system);
		document.documentElement.style.setProperty("--gawk-scale", String(clamp(settings.scale, 0.9, 1.12)));
	}

	function installStyles() {
		if (document.getElementById(IDS.style)) return;

		const style = document.createElement("style");
		style.id = IDS.style;
		style.textContent = `
			:root {
				color-scheme: dark;
				--gawk-bg: #0f1320;
				--gawk-surface: #151b2b;
				--gawk-surface-2: #1a2133;
				--gawk-code: #090d16;
				--gawk-code-2: #0d1321;
				--gawk-text: #eef2fb;
				--gawk-muted: #b8c0d4;
				--gawk-faint: #7f8aa3;
				--gawk-border: rgba(220, 225, 245, .12);
				--gawk-pill: color-mix(in srgb, var(--gawk-accent) 13%, transparent);
				--gawk-link: color-mix(in srgb, var(--gawk-accent) 74%, #eef2fb);
				-webkit-text-size-adjust: 100%;
			}

			html,
			body {
				margin: 0 !important;
				padding: 0 !important;
				width: 100% !important;
				max-width: 100% !important;
				overflow-x: hidden !important;
				background: var(--gawk-bg) !important;
				color: var(--gawk-text) !important;
				font-family: var(--gawk-font) !important;
				font-size: calc(16.5px * var(--gawk-scale)) !important;
				line-height: 1.6 !important;
			}

			body > *:not(#${IDS.root}):not(#${IDS.toc}):not(.gawk-floating) {
				display: none !important;
			}

			#${IDS.root},
			#${IDS.root} * {
				box-sizing: border-box;
				max-width: 100%;
			}

			#${IDS.root} {
				width: 100%;
				margin: 0 auto;
				padding: max(4.5rem, env(safe-area-inset-top)) .85rem 6.6rem;
				overflow-x: hidden;
			}

			.gawk-layout {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				gap: .85rem;
			}

			.gawk-topbar {
				position: sticky;
				top: max(.55rem, env(safe-area-inset-top));
				z-index: 20;
				display: grid;
				gap: .5rem;
				margin-bottom: .8rem;
				padding: .6rem;
				border: 1px solid var(--gawk-border);
				border-radius: .9rem;
				background: rgba(21, 27, 43, .92);
				backdrop-filter: blur(18px) saturate(1.08);
				-webkit-backdrop-filter: blur(18px) saturate(1.08);
				box-shadow: 0 .8rem 1.8rem rgba(0, 0, 0, .22);
			}

			.gawk-search {
				width: 100%;
				height: 2.3rem;
				border: 1px solid var(--gawk-border);
				border-radius: .7rem;
				background: #0d1220;
				color: var(--gawk-text);
				padding: 0 .78rem;
				font: 640 .86rem var(--gawk-font);
				outline: none;
			}

			.gawk-controls {
				display: grid;
				grid-template-columns: 2.3rem minmax(0, 1fr) auto auto auto;
				gap: .38rem;
				align-items: center;
			}

			.gawk-button,
			.gawk-select,
			.gawk-color {
				height: 2.25rem;
				border: 1px solid var(--gawk-border);
				border-radius: .68rem;
				background: var(--gawk-surface-2);
				color: var(--gawk-text);
				font: 690 .78rem var(--gawk-font);
			}

			.gawk-button {
				padding: 0 .62rem;
			}

			.gawk-select {
				min-width: 0;
				padding: 0 .55rem;
			}

			.gawk-color {
				width: 2.3rem;
				padding: .22rem;
			}

			.gawk-hero {
				padding: .65rem 0 .85rem;
				margin-bottom: .7rem;
				border-bottom: 1px solid var(--gawk-border);
			}

			.gawk-kicker {
				color: var(--gawk-faint);
				font-size: .64rem;
				font-weight: 760;
				letter-spacing: .12em;
				text-transform: uppercase;
			}

			.gawk-title {
				margin: .36rem 0 .28rem;
				color: var(--gawk-text);
				font-size: clamp(1.65rem, 8vw, 2.75rem);
				line-height: 1.04;
				letter-spacing: -.045em;
				font-weight: 830;
				overflow-wrap: anywhere;
			}

			.gawk-subtitle {
				color: var(--gawk-muted);
				font-size: .93rem;
				line-height: 1.45;
			}

			.gawk-content {
				width: 100%;
				max-width: 48rem;
				margin: 0 auto;
				overflow-x: hidden;
			}

			.gawk-content .contents,
			.gawk-content .shortcontents,
			.gawk-content div.contents,
			.gawk-content div.shortcontents,
			.gawk-content h1:has(+ .contents),
			.gawk-content h2:has(+ .contents) {
				display: none !important;
			}

			.gawk-content .node,
			.gawk-content .chapter,
			.gawk-content .section,
			.gawk-content .subsection,
			.gawk-content .subsubsection,
			.gawk-content .unnumbered,
			.gawk-content .appendix,
			.gawk-content .top {
				width: 100%;
				margin: .75rem 0;
				padding: .8rem;
				border: 1px solid var(--gawk-border);
				border-radius: .9rem;
				background: var(--gawk-surface);
				overflow: hidden;
			}

			.gawk-content h1,
			.gawk-content h2,
			.gawk-content h3,
			.gawk-content h4 {
				margin: 0 0 .58rem !important;
				color: color-mix(in srgb, var(--gawk-accent) 60%, var(--gawk-text)) !important;
				font-weight: 760 !important;
				line-height: 1.15 !important;
				letter-spacing: -.028em;
				scroll-margin-top: 6rem;
				overflow-wrap: anywhere;
			}

			.gawk-content h1 { font-size: clamp(1.45rem, 6.6vw, 2rem) !important; }
			.gawk-content h2 { font-size: clamp(1.25rem, 5.2vw, 1.62rem) !important; }
			.gawk-content h3 { font-size: clamp(1.08rem, 4.3vw, 1.32rem) !important; }
			.gawk-content h4 { font-size: 1rem !important; }

			.gawk-content p,
			.gawk-content li,
			.gawk-content dd,
			.gawk-content dt {
				color: var(--gawk-text) !important;
				font-weight: 405 !important;
				line-height: 1.58 !important;
				overflow-wrap: anywhere;
			}

			.gawk-content p {
				margin: .48rem 0 !important;
			}

			.gawk-content ol,
			.gawk-content ul {
				padding-left: 1.08rem !important;
				margin: .48rem 0 !important;
			}

			.gawk-content li {
				margin: .28rem 0 !important;
			}

			.gawk-content dl {
				display: grid;
				gap: .42rem;
				margin: .5rem 0 !important;
			}

			.gawk-content dt {
				color: color-mix(in srgb, var(--gawk-accent) 62%, var(--gawk-text)) !important;
				font-weight: 670 !important;
			}

			.gawk-content dd {
				margin-left: 0 !important;
				padding-left: .72rem;
				border-left: 1px solid var(--gawk-border);
			}

			.gawk-content a {
				color: var(--gawk-link) !important;
				text-decoration: none !important;
				border-bottom: 1px solid color-mix(in srgb, var(--gawk-accent) 24%, transparent);
				font-weight: 530 !important;
				overflow-wrap: anywhere;
			}

			.gawk-content code,
			.gawk-content kbd,
			.gawk-content samp,
			.gawk-content tt,
			.gawk-content .code,
			.gawk-content .command,
			.gawk-content .file,
			.gawk-content .option,
			.gawk-content .env,
			.gawk-content .var {
				padding: .06rem .28rem;
				border: 1px solid color-mix(in srgb, var(--gawk-accent) 14%, transparent);
				border-radius: .35rem;
				background: color-mix(in srgb, var(--gawk-accent) 8%, var(--gawk-surface-2));
				color: color-mix(in srgb, var(--gawk-accent) 62%, var(--gawk-text)) !important;
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace !important;
				font-size: .86em;
				font-weight: 570;
				white-space: normal;
				overflow-wrap: anywhere;
			}

			.gawk-content pre,
			.gawk-content .example,
			.gawk-content .smallexample,
			.gawk-content .display,
			.gawk-content .format,
			.gawk-content .lisp {
				width: 100% !important;
				max-width: 100% !important;
				overflow-x: auto !important;
				-webkit-overflow-scrolling: touch;
				margin: .52rem 0 !important;
				padding: .7rem !important;
				border: 1px solid var(--gawk-border);
				border-radius: .72rem;
				background: var(--gawk-code) !important;
				color: #eaf0fb !important;
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace !important;
				font-size: .78rem !important;
				line-height: 1.48 !important;
				tab-size: 2 !important;
				white-space: pre !important;
				overflow-wrap: normal !important;
			}

			.gawk-content pre *,
			.gawk-content .example *,
			.gawk-content .smallexample * {
				font-family: inherit !important;
				font-size: inherit !important;
				line-height: inherit !important;
				white-space: inherit !important;
			}

			.gawk-nav-strip {
				display: grid;
				gap: .42rem;
				margin: .65rem 0;
				padding: .58rem;
				border: 1px solid var(--gawk-border);
				border-radius: .78rem;
				background: color-mix(in srgb, var(--gawk-surface-2) 78%, transparent);
			}

			.gawk-nav-row {
				display: flex;
				gap: .4rem;
				align-items: baseline;
				flex-wrap: wrap;
				font-size: .86rem;
				color: var(--gawk-muted);
			}

			.gawk-nav-label {
				color: var(--gawk-faint);
				font-size: .72rem;
				font-weight: 800;
				letter-spacing: .08em;
				text-transform: uppercase;
			}

			.gawk-token-keyword { color: #c7d2fe; font-weight: 700; }
			.gawk-token-string { color: #bbf7d0; }
			.gawk-token-number { color: #fde68a; }
			.gawk-token-comment { color: #94a3b8; font-style: italic; }
			.gawk-token-var { color: #bfdbfe; }
			.gawk-token-regex { color: #fecdd3; }
			.gawk-token-option { color: #fed7aa; font-weight: 650; }

			#${IDS.toc} {
				position: fixed;
				inset: 0 auto 0 0;
				z-index: 50;
				width: min(21.5rem, calc(100vw - 3.2rem));
				box-sizing: border-box;
				padding: max(1rem, env(safe-area-inset-top)) .9rem max(1rem, env(safe-area-inset-bottom));
				border-right: 1px solid var(--gawk-border);
				background: rgba(16, 22, 35, .97);
				backdrop-filter: blur(18px) saturate(1.08);
				-webkit-backdrop-filter: blur(18px) saturate(1.08);
				transform: translateX(-105%);
				transition: transform .2s ease;
				overflow: auto;
			}

			html.gawk-toc-open #${IDS.toc} {
				transform: translateX(0);
			}

			.gawk-toc-title {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: .75rem;
				margin-bottom: .7rem;
				color: var(--gawk-text);
				font-weight: 760;
			}

			.gawk-toc-search {
				width: 100%;
				height: 2.28rem;
				margin-bottom: .65rem;
				border: 1px solid var(--gawk-border);
				border-radius: .68rem;
				background: #0d1220;
				color: var(--gawk-text);
				padding: 0 .7rem;
				font: 610 .84rem var(--gawk-font);
				outline: none;
			}

			.gawk-toc-list {
				display: grid;
				gap: .06rem;
				padding: 0;
				margin: 0;
				list-style: none;
			}

			.gawk-toc-link {
				display: block;
				padding: .33rem .44rem;
				border: 0 !important;
				border-radius: .5rem;
				color: var(--gawk-muted) !important;
				text-decoration: none !important;
				font-size: .82rem;
				line-height: 1.25;
				font-weight: 500 !important;
				overflow-wrap: anywhere;
			}

			.gawk-toc-link:hover,
			.gawk-toc-link.is-active {
				background: var(--gawk-pill);
				color: var(--gawk-text) !important;
			}

			.gawk-toc-level-1 { padding-left: .1rem; font-weight: 660 !important; }
			.gawk-toc-level-2 { padding-left: .55rem; }
			.gawk-toc-level-3 { padding-left: .95rem; font-size: .77rem; color: var(--gawk-faint) !important; }
			.gawk-toc-level-4 { padding-left: 1.25rem; font-size: .73rem; color: var(--gawk-faint) !important; }

			.gawk-floating {
				position: fixed;
				right: max(.8rem, env(safe-area-inset-right));
				bottom: max(5.6rem, env(safe-area-inset-bottom));
				z-index: 35;
				display: grid;
				gap: .48rem;
			}

			.gawk-fab {
				width: 2.95rem;
				height: 2.95rem;
				border: 1px solid var(--gawk-border);
				border-radius: 999px;
				background: rgba(21, 27, 43, .9);
				color: var(--gawk-text);
				font-size: 1.1rem;
				font-weight: 740;
				box-shadow: 0 .65rem 1.7rem rgba(0,0,0,.22);
				backdrop-filter: blur(14px);
				-webkit-backdrop-filter: blur(14px);
			}

			.gawk-hidden {
				display: none !important;
			}

			@media (min-width: 1080px) {
				#${IDS.root} {
					width: min(100%, 1160px);
					padding-inline: 1.5rem;
				}

				.gawk-layout {
					grid-template-columns: 18rem minmax(0, 1fr);
					align-items: start;
				}

				#${IDS.toc} {
					position: sticky;
					top: 1rem;
					transform: none !important;
					width: auto;
					height: calc(100vh - 2rem);
					border: 1px solid var(--gawk-border);
					border-radius: .9rem;
				}

				.gawk-floating {
					display: none;
				}

				.gawk-content {
					margin: 0;
				}
			}
		`;

		document.head.appendChild(style);
	}

	function createButton(text) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "gawk-button";
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

		topbar.className = "gawk-topbar";
		search.className = "gawk-search";
		search.type = "search";
		search.placeholder = "Search this manual...";

		controls.className = "gawk-controls";
		color.className = "gawk-color";
		color.type = "color";
		color.value = getSettings().accent;

		font.className = "gawk-select";
		font.innerHTML = `<option value="system">System</option><option value="mono">SF Mono</option><option value="serif">Serif</option>`;
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
			localStorage.setItem(STORAGE.scale, String(clamp(getSettings().scale - 0.05, 0.9, 1.12)));
			applySettings();
		});

		bigger.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getSettings().scale + 0.05, 0.9, 1.12)));
			applySettings();
		});

		menu.addEventListener("click", () => {
			document.documentElement.classList.toggle("gawk-toc-open");
		});

		search.addEventListener("input", () => filterContent(search.value));

		controls.append(color, font, smaller, bigger, menu);
		topbar.append(search, controls);
		return topbar;
	}

	function createHero() {
		const title = document.querySelector("h1")?.textContent?.trim() || document.title.trim();
		const hero = document.createElement("header");

		hero.className = "gawk-hero";
		hero.innerHTML = `
			<div class="gawk-kicker">GNU Gawk Manual</div>
			<h1 class="gawk-title">${escapeHtml(title)}</h1>
			<div class="gawk-subtitle">Mobile reading view with sidebar-only contents, compact sections, clean navigation anchors, and highlighted code.</div>
		`;

		return hero;
	}

	function moveOriginalContent() {
		const root = document.createElement("main");
		const layout = document.createElement("div");
		const content = document.createElement("article");

		root.id = IDS.root;
		layout.className = "gawk-layout";
		content.className = "gawk-content";

		for (const node of [...document.body.childNodes]) {
			content.appendChild(node);
		}

		layout.appendChild(content);
		root.append(createTopbar(), createHero(), layout);
		document.body.appendChild(root);

		return content;
	}

	function cleanChrome(content) {
		for (const selector of ["script", "style", "link[rel='stylesheet']", "meta", "hr", ".contents", ".shortcontents"]) {
			for (const node of [...content.querySelectorAll(selector)]) {
				node.remove();
			}
		}

		for (const element of [...content.querySelectorAll("[style], [width], [height], [align], [bgcolor], [color], [face], [size], [border]")]) {
			for (const attr of ["style", "width", "height", "align", "bgcolor", "color", "face", "size", "border"]) {
				element.removeAttribute(attr);
			}
		}
	}

	function organizeNavigationAnchors(content) {
		const paragraphs = [...content.querySelectorAll("p")];

		for (const paragraph of paragraphs) {
			const text = paragraph.textContent || "";
			const hasNav = /\b(Next|Previous|Prev|Up|Contents|Index):/i.test(text);

			if (!hasNav) continue;

			const links = [...paragraph.querySelectorAll("a")];

			if (links.length === 0) {
				paragraph.remove();
				continue;
			}

			const strip = document.createElement("nav");
			strip.className = "gawk-nav-strip";

			const labels = ["Next", "Previous", "Prev", "Up", "Contents", "Index"];

			for (const label of labels) {
				const regex = new RegExp(`${label}:\\s*([^,\\n]+)`, "i");
				const match = text.match(regex);
				const link = links.find((item) => cleanText(item.textContent || "").includes(cleanText(match?.[1] || "")));

				if (!link) continue;

				const row = document.createElement("div");
				const cloned = link.cloneNode(true);

				row.className = "gawk-nav-row";
				row.innerHTML = `<span class="gawk-nav-label">${label === "Prev" ? "Previous" : label}</span>`;
				row.appendChild(cloned);
				strip.appendChild(row);
			}

			if (strip.children.length > 0) {
				paragraph.replaceWith(strip);
			}
		}
	}

	function enhanceAnchors(content) {
		for (const heading of [...content.querySelectorAll("h1,h2,h3,h4")]) {
			const text = cleanText(heading.textContent || "");

			if (!text) continue;
			if (!heading.id) heading.id = slugify(text);
		}
	}

	function highlightCodeBlocks(content) {
		for (const block of [...content.querySelectorAll("pre, .example, .smallexample")]) {
			if (block.dataset.gawkHighlighted === "true") continue;

			const text = block.textContent || "";

			block.innerHTML = highlightAwk(escapeHtml(text));
			block.dataset.gawkHighlighted = "true";
		}
	}

	function highlightAwk(html) {
		let output = html;

		output = output.replace(/(^|\n)(\s*#.*)/g, `$1<span class="gawk-token-comment">$2</span>`);
		output = output.replace(/("([^"\\\\]|\\\\.)*")/g, `<span class="gawk-token-string">$1</span>`);
		output = output.replace(/(@?\/[^\/\n]+\/)/g, `<span class="gawk-token-regex">$1</span>`);
		output = output.replace(/\b(\d+(?:\.\d+)?)\b/g, `<span class="gawk-token-number">$1</span>`);
		output = output.replace(/(^|\s)(--?[a-zA-Z0-9][a-zA-Z0-9-]*)/g, `$1<span class="gawk-token-option">$2</span>`);
		output = output.replace(/(\$[0-9A-Za-z_]+)/g, `<span class="gawk-token-var">$1</span>`);

		for (const keyword of AWK_KEYWORDS) {
			const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "g");
			output = output.replace(pattern, `<span class="gawk-token-keyword">${keyword}</span>`);
		}

		return output;
	}

	function buildToc(content) {
		const toc = document.createElement("aside");
		const title = document.createElement("div");
		const search = document.createElement("input");
		const list = document.createElement("ol");

		toc.id = IDS.toc;
		title.className = "gawk-toc-title";
		title.innerHTML = `<span>Manual navigation</span><button class="gawk-button" type="button">Close</button>`;

		title.querySelector("button")?.addEventListener("click", () => {
			document.documentElement.classList.remove("gawk-toc-open");
		});

		search.className = "gawk-toc-search";
		search.type = "search";
		search.placeholder = "Filter sections...";
		list.className = "gawk-toc-list";

		for (const heading of [...content.querySelectorAll("h1,h2,h3,h4")].slice(0, 900)) {
			const text = cleanText(heading.textContent || "");

			if (!text) continue;
			if (!heading.id) heading.id = slugify(text);

			const item = document.createElement("li");
			const link = document.createElement("a");
			const level = Number(heading.tagName.slice(1));

			link.href = `#${heading.id}`;
			link.className = `gawk-toc-link gawk-toc-level-${level}`;
			link.textContent = text;
			link.addEventListener("click", () => {
				document.documentElement.classList.remove("gawk-toc-open");
			});

			item.appendChild(link);
			list.appendChild(item);
		}

		search.addEventListener("input", () => {
			const query = search.value.trim().toLowerCase();

			for (const item of [...list.children]) {
				const text = item.textContent?.toLowerCase() || "";
				item.classList.toggle("gawk-hidden", query.length > 0 && !text.includes(query));
			}
		});

		toc.append(title, search, list);
		document.querySelector(".gawk-layout")?.prepend(toc);
	}

	function createFloatingButtons() {
		const wrap = document.createElement("div");
		const menu = document.createElement("button");
		const top = document.createElement("button");

		wrap.className = "gawk-floating";

		menu.className = "gawk-fab";
		menu.type = "button";
		menu.textContent = "☰";
		menu.addEventListener("click", () => {
			document.documentElement.classList.toggle("gawk-toc-open");
		});

		top.className = "gawk-fab";
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
		const sections = [...document.querySelectorAll(".gawk-content .node, .gawk-content .chapter, .gawk-content .section, .gawk-content .subsection, .gawk-content .subsubsection, .gawk-content .unnumbered, .gawk-content .appendix, .gawk-content .top")];

		for (const section of sections) {
			const text = section.textContent?.toLowerCase() || "";
			section.classList.toggle("gawk-hidden", value.length > 0 && !text.includes(value));
		}
	}

	function cleanText(value) {
		return value.replace(/\s+/g, " ").trim();
	}

	function slugify(value) {
		return `gawk-${cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
	}

	function escapeHtml(value) {
		return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
	}

	function escapeRegExp(value) {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	function boot() {
		applySettings();
		installStyles();

		const content = moveOriginalContent();

		cleanChrome(content);
		enhanceAnchors(content);
		organizeNavigationAnchors(content);
		highlightCodeBlocks(content);
		buildToc(content);
		createFloatingButtons();
		applySettings();
	}

	boot();
})();