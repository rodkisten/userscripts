// ==UserScript==
// @name         Rod / Docs / Arch Man Pages
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile reader for Arch Linux man pages with themes, sidebar, and safer layout.
// @author       Rod
// @match        https://man.archlinux.org/man/*
// @run-at       document-idle
// @weight       500
// @grant        none
// @noframes
// ==/UserScript==

(() => {
	"use strict";

	const IDS = {
		style: "migos-arch-man-style",
		toc: "migos-arch-man-toc",
		toolbar: "migos-arch-man-toolbar",
		menu: "migos-arch-man-menu",
		top: "migos-arch-man-top",
		search: "migos-arch-man-search",
	};

	const STORAGE = {
		accent: "migos:arch-man:accent",
		scale: "migos:arch-man:scale",
		theme: "migos:arch-man:theme",
	};

	const DEFAULTS = {
		accent: "#7b74d8",
		scale: 1,
		theme: "midnight",
	};

	const THEMES = {
		midnight: {
			bg: "#101321",
			panel: "#151929",
			panelSoft: "#1a1f33",
			code: "#080b13",
			text: "#eef0f7",
			muted: "#aeb4c6",
			faint: "#788197",
			border: "rgba(255,255,255,.08)",
		},
		ink: {
			bg: "#0d1117",
			panel: "#111827",
			panelSoft: "#182235",
			code: "#05080d",
			text: "#f1f5f9",
			muted: "#b7c0d1",
			faint: "#7d8799",
			border: "rgba(255,255,255,.085)",
		},
		cream: {
			bg: "#f4f0f4",
			panel: "#fffafd",
			panelSoft: "#f2eaf3",
			code: "#17111d",
			text: "#1d1b24",
			muted: "#625d6d",
			faint: "#8a8297",
			border: "rgba(20,18,28,.12)",
		},
	};

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	function getThemeName() {
		const value = localStorage.getItem(STORAGE.theme) || DEFAULTS.theme;

		return THEMES[value] ? value : DEFAULTS.theme;
	}

	function getTheme() {
		return THEMES[getThemeName()];
	}

	function getAccent() {
		const value = localStorage.getItem(STORAGE.accent) || DEFAULTS.accent;
		const normalized = value.toLowerCase();

		if (normalized === "#000000" || normalized === "#ffffff" || normalized === "#000" || normalized === "#fff") {
			return DEFAULTS.accent;
		}

		return value;
	}

	function getScale() {
		const value = Number(localStorage.getItem(STORAGE.scale) || DEFAULTS.scale);

		return clamp(Number.isFinite(value) ? value : DEFAULTS.scale, 0.88, 1.16);
	}

	function removeOldVersions() {
		document.querySelectorAll([
			"#migos-arch-man-root",
			"#migos-arch-man-safe-style",
			"#migos-arch-man-safe-toc",
			"#migos-arch-man-safe-menu",
			"#migos-arch-man-safe-top",
			"#migos-arch-man-style",
			"#migos-arch-man-toc",
			"#migos-arch-man-toolbar",
			"#migos-arch-man-menu",
			"#migos-arch-man-top",
		].join(",")).forEach((node) => node.remove());

		document.documentElement.classList.remove("arch-man-toc-open", "migos-man-toc-open");
	}

	function installStyles() {
		document.getElementById(IDS.style)?.remove();

		const theme = getTheme();
		const style = document.createElement("style");

		style.id = IDS.style;
		style.textContent = `
			:root {
				color-scheme: ${getThemeName() === "cream" ? "light" : "dark"};
				--man-accent: ${getAccent()};
				--man-bg: ${theme.bg};
				--man-panel: ${theme.panel};
				--man-panel-soft: ${theme.panelSoft};
				--man-code: ${theme.code};
				--man-text: ${theme.text};
				--man-muted: ${theme.muted};
				--man-faint: ${theme.faint};
				--man-border: ${theme.border};
				--man-scale: ${getScale()};
				--man-page-pad: .82rem;
				-webkit-text-size-adjust: 100%;
			}

			html,
			body {
				margin: 0 !important;
				padding: 0 !important;
				background: var(--man-bg) !important;
				color: var(--man-text) !important;
				font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
				font-size: calc(16px * var(--man-scale)) !important;
				line-height: 1.56 !important;
				overflow-x: hidden !important;
			}

			body {
				padding-top: max(5.55rem, env(safe-area-inset-top)) !important;
				padding-bottom: 6rem !important;
			}

			main,
			article,
			#content,
			.content,
			body > div:not(#${IDS.toolbar}):not(#${IDS.toc}) {
				max-width: 48rem !important;
				box-sizing: border-box !important;
				margin-inline: auto !important;
				padding-inline: var(--man-page-pad) !important;
			}

			#${IDS.toolbar} {
				position: fixed;
				top: max(.58rem, env(safe-area-inset-top));
				left: max(.65rem, env(safe-area-inset-left));
				right: max(.65rem, env(safe-area-inset-right));
				z-index: 999999;
				display: grid;
				grid-template-columns: 1fr auto auto auto auto;
				gap: .36rem;
				align-items: center;
				padding: .45rem;
				border: 1px solid var(--man-border);
				border-radius: 1rem;
				background: color-mix(in srgb, var(--man-panel) 90%, transparent);
				backdrop-filter: blur(16px);
				-webkit-backdrop-filter: blur(16px);
				box-shadow: 0 .8rem 2.4rem rgba(0,0,0,.22);
			}

			#${IDS.search},
			.migos-man-control {
				height: 2.35rem;
				min-width: 0;
				box-sizing: border-box;
				border: 1px solid var(--man-border);
				border-radius: .78rem;
				background: color-mix(in srgb, var(--man-panel-soft) 88%, transparent);
				color: var(--man-text);
				font: 720 .82rem ui-sans-serif, system-ui;
				outline: none;
			}

			#${IDS.search} {
				width: 100%;
				padding: 0 .72rem;
			}

			.migos-man-control {
				padding: 0 .62rem;
			}

			.migos-man-color {
				width: 2.35rem;
				padding: .2rem;
			}

			#${IDS.search}:focus,
			.migos-man-toc-search:focus {
				border-color: color-mix(in srgb, var(--man-accent) 48%, var(--man-border));
				box-shadow: 0 0 0 .16rem color-mix(in srgb, var(--man-accent) 14%, transparent);
			}

			header,
			footer,
			nav {
				background: transparent !important;
			}

			h1,
			h2,
			h3,
			h4 {
				color: var(--man-text) !important;
				font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
				font-weight: 820 !important;
				letter-spacing: -.03em !important;
				line-height: 1.16 !important;
				scroll-margin-top: 6rem !important;
			}

			h1 {
				font-size: clamp(1.75rem, 8vw, 2.8rem) !important;
				margin: 1.1rem 0 .75rem !important;
			}

			h2 {
				font-size: 1.34rem !important;
				margin: 1.45rem 0 .65rem !important;
				padding-top: .25rem !important;
				border-top: 1px solid var(--man-border) !important;
			}

			h3 {
				font-size: 1.12rem !important;
				margin: 1.25rem 0 .55rem !important;
			}

			p,
			li,
			dd,
			dt {
				color: var(--man-text) !important;
				font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
				font-weight: 420 !important;
				line-height: 1.58 !important;
			}

			a {
				color: color-mix(in srgb, var(--man-accent) 54%, var(--man-text)) !important;
				font-weight: 560 !important;
				text-decoration: none !important;
				border-bottom: 1px solid color-mix(in srgb, var(--man-accent) 22%, transparent) !important;
			}

			dl,
			ul,
			ol {
				padding-left: 1rem !important;
			}

			dt {
				margin-top: .88rem !important;
				color: color-mix(in srgb, var(--man-accent) 48%, var(--man-text)) !important;
				font-weight: 720 !important;
			}

			dd {
				margin-left: 0 !important;
				padding-left: .72rem !important;
				border-left: 1px solid var(--man-border) !important;
				color: var(--man-muted) !important;
			}

			code,
			kbd,
			tt,
			var,
			samp,
			.migos-man-flag,
			.migos-man-env {
				padding: .07rem .28rem !important;
				border: 1px solid color-mix(in srgb, var(--man-accent) 13%, transparent) !important;
				border-radius: .34rem !important;
				background: color-mix(in srgb, var(--man-accent) 7%, transparent) !important;
				color: color-mix(in srgb, var(--man-accent) 36%, var(--man-text)) !important;
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace !important;
				font-size: .82em !important;
				font-weight: 640 !important;
			}

			.migos-man-env {
				color: color-mix(in srgb, #8db8ff 40%, var(--man-text)) !important;
			}

			pre {
				box-sizing: border-box !important;
				max-width: 100% !important;
				overflow-x: auto !important;
				margin: .9rem 0 !important;
				padding: .72rem !important;
				border: 1px solid rgba(255,255,255,.07) !important;
				border-radius: .82rem !important;
				background: var(--man-code) !important;
				color: #f3eefb !important;
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace !important;
				font-size: .73rem !important;
				line-height: 1.48 !important;
				tab-size: 2 !important;
				white-space: pre !important;
				-webkit-overflow-scrolling: touch !important;
			}

			pre * {
				padding: 0 !important;
				border: 0 !important;
				background: transparent !important;
				color: inherit !important;
				font: inherit !important;
				white-space: pre !important;
			}

			.migos-man-code-label {
				display: block;
				margin: -.15rem 0 .5rem;
				color: rgba(245,239,255,.46);
				font: 820 .64rem ui-sans-serif, system-ui;
				letter-spacing: .13em;
				text-transform: uppercase;
			}

			.migos-man-token-comment {
				color: #777f95 !important;
			}

			.migos-man-token-command {
				color: #d9a6c7 !important;
				font-weight: 680 !important;
			}

			.migos-man-token-flag {
				color: #d7c36d !important;
				font-weight: 720 !important;
			}

			.migos-man-token-env {
				color: #99b8e8 !important;
				font-weight: 680 !important;
			}

			table {
				display: block !important;
				max-width: 100% !important;
				overflow-x: auto !important;
				border-collapse: collapse !important;
			}

			td,
			th {
				padding: .42rem .48rem !important;
				border-bottom: 1px solid var(--man-border) !important;
			}

			#${IDS.toc} {
				position: fixed;
				inset: 0 auto 0 0;
				z-index: 1000000;
				width: min(21rem, calc(100vw - 3rem));
				padding: max(1rem, env(safe-area-inset-top)) .8rem max(1rem, env(safe-area-inset-bottom));
				box-sizing: border-box;
				background: color-mix(in srgb, var(--man-panel) 98%, transparent);
				border-right: 1px solid var(--man-border);
				transform: translateX(-105%);
				transition: transform .2s ease;
				overflow-y: auto;
			}

			html.migos-arch-man-toc-open #${IDS.toc} {
				transform: translateX(0);
			}

			.migos-man-toc-head {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: .65rem;
				font-weight: 820;
			}

			.migos-man-toc-search {
				width: 100%;
				height: 2.3rem;
				box-sizing: border-box;
				margin-bottom: .65rem;
				border: 1px solid var(--man-border);
				border-radius: .75rem;
				background: color-mix(in srgb, var(--man-panel-soft) 88%, transparent);
				color: var(--man-text);
				padding: 0 .7rem;
				font: 650 .86rem ui-sans-serif, system-ui;
			}

			.migos-man-toc-list {
				list-style: none;
				padding: 0;
				margin: 0;
				display: grid;
				gap: .08rem;
			}

			.migos-man-toc-link {
				display: block;
				padding: .34rem .46rem;
				border-radius: .58rem;
				color: var(--man-muted) !important;
				border: 0 !important;
				font-size: .84rem;
				line-height: 1.28;
				font-weight: 550 !important;
			}

			.migos-man-toc-link:hover,
			.migos-man-toc-link.is-active {
				background: color-mix(in srgb, var(--man-accent) 10%, transparent);
				color: var(--man-text) !important;
			}

			.migos-man-hidden {
				display: none !important;
			}

			#${IDS.menu},
			#${IDS.top} {
				position: fixed;
				bottom: max(5.55rem, env(safe-area-inset-bottom));
				z-index: 999998;
				width: 3.05rem;
				height: 3.05rem;
				border: 1px solid var(--man-border);
				border-radius: 999px;
				background: color-mix(in srgb, var(--man-panel) 90%, transparent);
				color: var(--man-text);
				font-size: 1.12rem;
				font-weight: 850;
				backdrop-filter: blur(12px);
				-webkit-backdrop-filter: blur(12px);
			}

			#${IDS.menu} {
				right: max(4.25rem, env(safe-area-inset-right));
			}

			#${IDS.top} {
				right: max(.82rem, env(safe-area-inset-right));
			}

			@media (max-width: 430px) {
				:root {
					--man-page-pad: .72rem;
				}

				#${IDS.toolbar} {
					grid-template-columns: 1fr auto auto auto;
				}

				.migos-man-color {
					display: none;
				}

				.migos-man-theme {
					max-width: 4.9rem;
				}

				pre {
					margin-inline: -.05rem !important;
					padding: .66rem !important;
					font-size: .7rem !important;
				}
			}

			@media (min-width: 1080px) {
				body {
					padding-top: 1rem !important;
				}

				#${IDS.toolbar} {
					left: calc(50% - 24rem);
					right: calc(50% - 24rem);
				}
			}
		`;

		document.head.appendChild(style);
	}

	function createToolbar() {
		document.getElementById(IDS.toolbar)?.remove();

		const toolbar = document.createElement("div");
		const search = document.createElement("input");
		const color = document.createElement("input");
		const theme = document.createElement("select");
		const minus = document.createElement("button");
		const plus = document.createElement("button");

		toolbar.id = IDS.toolbar;

		search.id = IDS.search;
		search.type = "search";
		search.placeholder = "Search page...";

		color.className = "migos-man-control migos-man-color";
		color.type = "color";
		color.value = getAccent();

		theme.className = "migos-man-control migos-man-theme";
		theme.innerHTML = `
			<option value="midnight">Midnight</option>
			<option value="ink">Ink</option>
			<option value="cream">Cream</option>
		`;
		theme.value = getThemeName();

		minus.className = "migos-man-control";
		minus.type = "button";
		minus.textContent = "A−";

		plus.className = "migos-man-control";
		plus.type = "button";
		plus.textContent = "A+";

		search.addEventListener("input", () => filterPage(search.value));

		color.addEventListener("input", () => {
			localStorage.setItem(STORAGE.accent, color.value);
			installStyles();
		});

		theme.addEventListener("change", () => {
			localStorage.setItem(STORAGE.theme, theme.value);
			installStyles();
		});

		minus.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getScale() - 0.04, 0.88, 1.16)));
			installStyles();
		});

		plus.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getScale() + 0.04, 0.88, 1.16)));
			installStyles();
		});

		toolbar.append(search, color, theme, minus, plus);
		document.body.append(toolbar);
	}

	function buildToc() {
		document.getElementById(IDS.toc)?.remove();

		const headings = [...document.querySelectorAll("h1,h2,h3,h4")]
			.filter((heading) => heading.textContent?.trim())
			.filter((heading) => !heading.closest(`#${IDS.toc}, #${IDS.toolbar}`));

		const toc = document.createElement("aside");
		const search = document.createElement("input");
		const list = document.createElement("ol");

		toc.id = IDS.toc;
		toc.innerHTML = `
			<div class="migos-man-toc-head">
				<span>Sections</span>
				<button class="migos-man-control" type="button">Close</button>
			</div>
		`;

		toc.querySelector("button")?.addEventListener("click", () => {
			document.documentElement.classList.remove("migos-arch-man-toc-open");
		});

		search.className = "migos-man-toc-search";
		search.type = "search";
		search.placeholder = "Filter sections...";

		list.className = "migos-man-toc-list";

		headings.forEach((heading, index) => {
			if (!heading.id) {
				heading.id = `migos-man-section-${index + 1}`;
			}

			const level = Number(heading.tagName.slice(1));
			const item = document.createElement("li");
			const link = document.createElement("a");

			link.href = `#${heading.id}`;
			link.className = "migos-man-toc-link";
			link.style.paddingLeft = `${Math.max(0, level - 1) * 0.45 + 0.45}rem`;
			link.textContent = cleanText(heading.textContent || "");

			link.addEventListener("click", () => {
				document.documentElement.classList.remove("migos-arch-man-toc-open");
			});

			item.append(link);
			list.append(item);
		});

		search.addEventListener("input", () => {
			const query = search.value.trim().toLowerCase();

			[...list.children].forEach((item) => {
				item.classList.toggle("migos-man-hidden", query.length > 0 && !item.textContent.toLowerCase().includes(query));
			});
		});

		toc.append(search, list);
		document.body.append(toc);
	}

	function createButtons() {
		document.getElementById(IDS.menu)?.remove();
		document.getElementById(IDS.top)?.remove();

		const menu = document.createElement("button");
		const top = document.createElement("button");

		menu.id = IDS.menu;
		menu.type = "button";
		menu.textContent = "☰";
		menu.addEventListener("click", () => {
			document.documentElement.classList.toggle("migos-arch-man-toc-open");
		});

		top.id = IDS.top;
		top.type = "button";
		top.textContent = "↑";
		top.addEventListener("click", () => {
			window.scrollTo({ top: 0, behavior: "smooth" });
		});

		document.body.append(menu, top);
	}

	function enhanceCodeBlocks() {
		document.querySelectorAll("pre").forEach((pre) => {
			if (pre.dataset.migosEnhanced === "true") {
				return;
			}

			const text = dedent(pre.textContent || "").trimEnd();

			pre.dataset.migosEnhanced = "true";
			pre.textContent = "";

			const label = document.createElement("span");
			const code = document.createElement("code");

			label.className = "migos-man-code-label";
			label.textContent = "terminal";
			code.innerHTML = highlightCode(text);

			pre.append(label, code);
		});
	}

	function enhanceInlineTokens() {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const parent = node.parentElement;

				if (!parent || parent.closest("pre, code, tt, kbd, samp, script, style, a, #migos-arch-man-toolbar, #migos-arch-man-toc")) {
					return NodeFilter.FILTER_REJECT;
				}

				const text = node.nodeValue || "";

				if (/(^|\s)-{1,2}[a-zA-Z0-9][a-zA-Z0-9-]*/.test(text) || /\b[A-Z][A-Z0-9_]{2,}\b/.test(text)) {
					return NodeFilter.FILTER_ACCEPT;
				}

				return NodeFilter.FILTER_SKIP;
			},
		});

		const nodes = [];

		while (walker.nextNode()) {
			nodes.push(walker.currentNode);
		}

		for (const node of nodes) {
			const text = node.nodeValue || "";
			const fragment = document.createDocumentFragment();
			const regex = /(\s|^)(-{1,2}[a-zA-Z0-9][a-zA-Z0-9-]*|\b[A-Z][A-Z0-9_]{2,}\b)/g;
			let last = 0;
			let match;

			while ((match = regex.exec(text))) {
				const start = match.index;
				const full = match[0];
				const token = match[2];
				const prefix = full.slice(0, full.length - token.length);

				fragment.append(document.createTextNode(text.slice(last, start)));
				fragment.append(document.createTextNode(prefix));

				const span = document.createElement("span");
				span.className = token.startsWith("-") ? "migos-man-flag" : "migos-man-env";
				span.textContent = token;
				fragment.append(span);

				last = start + full.length;
			}

			fragment.append(document.createTextNode(text.slice(last)));
			node.parentNode?.replaceChild(fragment, node);
		}
	}

	function highlightCode(text) {
		return escapeHtml(text)
			.replace(/(^|\n)(\s*#.*)/g, '$1<span class="migos-man-token-comment">$2</span>')
			.replace(/\b([A-Z][A-Z0-9_]{2,})\b/g, '<span class="migos-man-token-env">$1</span>')
			.replace(/(^|\s)(-{1,2}[a-zA-Z0-9][a-zA-Z0-9-]*(?:=[^\\s'"]+)?|\+[a-zA-Z0-9-]+)/g, '$1<span class="migos-man-token-flag">$2</span>')
			.replace(/(^|\s)(fzf|git|rg|seq|echo|cat|export|eval|source|curl|kubectl|printf|find|tail|grep|jq|bat|fd|awk|sed|xargs|vim|nvim|less|man)\b/g, '$1<span class="migos-man-token-command">$2</span>');
	}

	function filterPage(query) {
		const normalized = query.trim().toLowerCase();
		const blocks = [...document.body.querySelectorAll("h1,h2,h3,h4,p,pre,dl,ul,ol,table")]
			.filter((block) => !block.closest(`#${IDS.toolbar}, #${IDS.toc}`));

		blocks.forEach((block) => {
			const text = block.textContent?.toLowerCase() || "";
			block.classList.toggle("migos-man-hidden", normalized.length > 0 && !text.includes(normalized));
		});
	}

	function dedent(value) {
		const lines = value.replaceAll("\t", "  ").split("\n");
		const nonEmpty = lines.filter((line) => line.trim().length > 0);

		if (nonEmpty.length === 0) {
			return value;
		}

		const minIndent = Math.min(...nonEmpty.map((line) => line.match(/^ */)?.[0].length || 0));

		if (!Number.isFinite(minIndent) || minIndent <= 0) {
			return value;
		}

		return lines.map((line) => line.slice(minIndent)).join("\n");
	}

	function cleanText(value) {
		return value.replace(/\s+/g, " ").trim();
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
		removeOldVersions();
		installStyles();
		createToolbar();
		buildToc();
		createButtons();
		enhanceCodeBlocks();
		enhanceInlineTokens();
	}

	boot();
})();