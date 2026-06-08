// ==UserScript==
// @name         Rod / Docs / Zsh Manual
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile-first Zsh manual reader with resilient parsing, TOC, and clean typography.
// @author       Rod
// @match        https://zsh.sourceforge.io/Doc/**/*
// @run-at       document-idle
// @weight       470
// @grant        none
// @noframes
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/bash.min.js
// ==/UserScript==

(() => {
	"use strict";

	const IDS = {
		root: "migos-zsh-root",
		style: "migos-zsh-style",
		toc: "migos-zsh-toc",
		hljs: "migos-zsh-hljs",
	};

	const STORAGE = {
		accent: "migos:zsh:accent",
		scale: "migos:zsh:scale",
	};

	const DEFAULT_ACCENT = "#7b73d8";
	const HLJS_URL = "https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/lib/common.min.js";

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	function getScale() {
		return clamp(Number(localStorage.getItem(STORAGE.scale) || "1"), 0.88, 1.12);
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

	function getAccent() {
		const value = localStorage.getItem(STORAGE.accent) || DEFAULT_ACCENT;
		return value === "#000000" || value === "#ffffff" ? DEFAULT_ACCENT : value;
	}

	function installStyles() {
		document.getElementById(IDS.style)?.remove();

		const style = document.createElement("style");
		style.id = IDS.style;
		style.textContent = `
			:root {
				color-scheme: dark;
				--zsh-accent: ${getAccent()};
				--zsh-bg: #0f1220;
				--zsh-page: #121626;
				--zsh-code: #070a12;
				--zsh-text: #eef0f7;
				--zsh-muted: #aeb4c6;
				--zsh-faint: #747d94;
				--zsh-border: rgba(255,255,255,.08);
				--zsh-scale: ${getScale()};
				--zsh-top-offset: max(5.7rem, env(safe-area-inset-top));
			}

			html,
			body {
				margin: 0 !important;
				padding: 0 !important;
				background: var(--zsh-bg) !important;
				color: var(--zsh-text) !important;
				font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
				font-size: calc(16px * var(--zsh-scale)) !important;
				line-height: 1.56 !important;
				-webkit-text-size-adjust: 100% !important;
				overflow-x: hidden !important;
			}

			body > *:not(#${IDS.root}):not(#${IDS.toc}) {
				display: none !important;
			}

			#${IDS.root} {
				box-sizing: border-box;
				width: 100%;
				padding: var(--zsh-top-offset) .82rem 6.5rem;
				background: radial-gradient(circle at top, rgba(123,115,216,.08), transparent 28rem), var(--zsh-bg);
				
				top: 0;
				position: sticky 
			}

			.zsh-shell {
				max-width: 46rem;
				margin: 0 auto;
			}

			.zsh-toolbar {
				position: sticky;
				top: max(.65rem, env(safe-area-inset-top));
				z-index: 40;
				display: grid;
				grid-template-columns: 1fr auto auto auto;
				gap: .38rem;
				align-items: center;
				padding: .48rem;
				margin-bottom: 1rem;
				border: 1px solid var(--zsh-border);
				border-radius: 1rem;
				background: rgba(18,22,38,.88);
				backdrop-filter: blur(16px);
				-webkit-backdrop-filter: blur(16px);
			}

			.zsh-search,
			.zsh-btn,
			.zsh-color {
				height: 2.3rem;
				border: 1px solid var(--zsh-border);
				border-radius: .78rem;
				background: rgba(255,255,255,.035);
				color: var(--zsh-text);
				font: 700 .82rem ui-sans-serif, system-ui;
			}

			.zsh-search {
				min-width: 0;
				padding: 0 .72rem;
				outline: none;
			}

			.zsh-btn {
				padding: 0 .66rem;
			}

			.zsh-color {
				width: 2.3rem;
				padding: .18rem;
			}

			.zsh-hero {
				margin-bottom: 1rem;
				padding-bottom: .85rem;
				border-bottom: 1px solid var(--zsh-border);
			}

			.zsh-kicker {
				color: var(--zsh-faint);
				font-size: .66rem;
				font-weight: 850;
				letter-spacing: .15em;
				text-transform: uppercase;
			}

			.zsh-title {
				margin: .25rem 0 0;
				color: var(--zsh-text);
				font-size: clamp(1.85rem, 9.5vw, 3.05rem);
				line-height: 1;
				letter-spacing: -.055em;
				font-weight: 900;
			}

			.zsh-content h1,
			.zsh-content h2,
			.zsh-content h3,
			.zsh-content h4 {
				margin: 1.45rem 0 .65rem !important;
				color: var(--zsh-text) !important;
				font-weight: 820 !important;
				line-height: 1.14 !important;
				letter-spacing: -.03em !important;
				scroll-margin-top: calc(var(--zsh-top-offset) + 1rem) !important;
			}

			.zsh-content h1 { font-size: 1.58rem !important; }
			.zsh-content h2 { font-size: 1.34rem !important; }
			.zsh-content h3 { font-size: 1.12rem !important; }
			.zsh-content h4 { font-size: 1rem !important; }

			.zsh-content p,
			.zsh-content li,
			.zsh-content dd,
			.zsh-content dt {
				margin: .72rem 0 !important;
				color: var(--zsh-text) !important;
				font-weight: 420 !important;
				line-height: 1.56 !important;
			}

			.zsh-content ul,
			.zsh-content ol {
				padding-left: 1.05rem !important;
				margin: .65rem 0 !important;
			}

			.zsh-content dt {
				color: color-mix(in srgb, var(--zsh-accent) 52%, var(--zsh-text)) !important;
				font-weight: 720 !important;
			}

			.zsh-content dd {
				margin-left: 0 !important;
				padding-left: .72rem !important;
				border-left: 1px solid var(--zsh-border);
				color: var(--zsh-muted) !important;
			}

			.zsh-content a {
				color: color-mix(in srgb, var(--zsh-accent) 58%, var(--zsh-text)) !important;
				text-decoration: none !important;
				border-bottom: 1px solid color-mix(in srgb, var(--zsh-accent) 24%, transparent);
				font-weight: 570 !important;
			}

			.zsh-content code,
			.zsh-content tt,
			.zsh-content kbd {
				padding: .07rem .28rem !important;
				border: 1px solid color-mix(in srgb, var(--zsh-accent) 14%, transparent) !important;
				border-radius: .34rem !important;
				background: color-mix(in srgb, var(--zsh-accent) 8%, transparent) !important;
				color: color-mix(in srgb, var(--zsh-accent) 44%, var(--zsh-text)) !important;
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace !important;
				font-size: .82em !important;
				font-weight: 640 !important;
			}

			.zsh-codebox {
				width: calc(100vw - 1.64rem) !important;
				max-width: calc(100vw - 1.64rem) !important;
				margin: 1rem 50% !important;
				transform: translateX(-50%);
				box-sizing: border-box !important;
				border: 1px solid rgba(255,255,255,.075);
				border-radius: .9rem;
				background: var(--zsh-code);
				overflow: hidden;
			}

			.zsh-codebar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: .7rem;
				height: 2.15rem;
				padding: 0 .78rem;
				border-bottom: 1px solid rgba(255,255,255,.06);
				background: rgba(255,255,255,.035);
				color: var(--zsh-faint);
				font: 850 .68rem ui-sans-serif, system-ui;
				letter-spacing: .12em;
				text-transform: uppercase;
			}

			.zsh-copy {
				border: 0;
				background: transparent;
				color: var(--zsh-muted);
				font: inherit;
			}

			.zsh-content pre {
				width: 100% !important;
				max-width: 100% !important;
				box-sizing: border-box !important;
				overflow-x: hidden !important;
				margin: 0 !important;
				padding: .78rem !important;
				border: 0 !important;
				border-radius: 0 !important;
				background: transparent !important;
				box-shadow: none !important;
				white-space: pre-wrap !important;
				word-break: break-word !important;
				overflow-wrap: anywhere !important;
			}

			.zsh-content pre code {
				display: block !important;
				padding: 0 !important;
				border: 0 !important;
				background: transparent !important;
				color: #edf0fb !important;
				font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace !important;
				font-size: .76rem !important;
				line-height: 1.48 !important;
				font-weight: 500 !important;
				white-space: pre-wrap !important;
				word-break: break-word !important;
				overflow-wrap: anywhere !important;
				tab-size: 2 !important;
			}
			div.example {
			margin: 0 auto !important;
			max-width: 95vw;
			}
			
			
			      .zmb-top {
        position: fixed;
        right: max(18px, env(safe-area-inset-right));
        bottom: max(18px, env(safe-area-inset-bottom));
        z-index: 99999;
        width: 54px;
        height: 54px;
        display: grid;
        place-items: center;
        border: 1px solid var(--zmb-border);
        border-radius: 999px;
        background: var(--zmb-panel-2);
        color: var(--zmb-text);
        box-shadow: 0 18px 55px rgba(0,0,0,.36);
        opacity: 0;
        transform: translateY(12px) scale(.94);
        pointer-events: none;
        transition: .16s ease;
      }

      .zmb-top[data-visible="true"] {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

			.zsh-dotted-separated {
	position: relative;
	display: flex !important;
	align-items: center;
	gap: .55rem;
	width: 100%;
}

.zsh-dotted-separated::after {
	content: "";
	flex: 1 1 auto;
	height: 1px;
	min-width: 2rem;
	margin-top: .08rem;
	background-image: linear-gradient(
		90deg,
		color-mix(in srgb, var(--zsh-accent) 34%, transparent) 40%,
		transparent 0
	);
	background-size: .42rem 1px;
	background-repeat: repeat-x;
	opacity: .72;
}

.zsh-dotted-separated code:first-child,
.zsh-dotted-separated tt:first-child,
.zsh-dotted-separated kbd:first-child {
	flex: 0 0 auto;
}

			.hljs-keyword,
			.hljs-built_in,
			.hljs-name {
				color: #d29bf0 !important;
				font-weight: 720;
			}

			.hljs-string {
				color: #f0b7cf !important;
			}

			.hljs-number,
			.hljs-literal {
				color: #9ddfbd !important;
			}

			.hljs-comment {
				color: #68728a !important;
				font-style: italic;
			}

			.hljs-variable,
			.hljs-template-variable {
				color: #b6a6f6 !important;
			}

			.hljs-operator,
			.hljs-punctuation {
				color: #e5e7f2 !important;
			}

			.zsh-content table {
				display: block !important;
				width: 100% !important;
				max-width: 100% !important;
				overflow-x: auto !important;
				border-collapse: collapse !important;
				font-size: .9rem !important;
			}

			.zsh-content td,
			.zsh-content th {
				padding: .42rem .48rem !important;
				border-bottom: 1px solid var(--zsh-border) !important;
			}

			.zsh-nav-noise,
			.zsh-empty-link-grid {
				display: none !important;
			}

			#${IDS.toc} {
				position: fixed;
				inset: 0 auto 0 0;
				z-index: 60;
				width: min(21rem, calc(100vw - 3rem));
				box-sizing: border-box;
				padding: max(1rem, env(safe-area-inset-top)) .8rem max(1rem, env(safe-area-inset-bottom));
				background: rgba(15,18,31,.98);
				border-right: 1px solid var(--zsh-border);
				transform: translateX(-105%);
				transition: transform .2s ease;
				overflow-y: auto;
			}

			html.zsh-toc-open #${IDS.toc} {
				transform: translateX(0);
			}

			.zsh-toc-head {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: .65rem;
				color: var(--zsh-text);
				font-weight: 820;
			}

			.zsh-toc-search {
				width: 100%;
				box-sizing: border-box;
				height: 2.3rem;
				margin-bottom: .65rem;
				border: 1px solid var(--zsh-border);
				border-radius: .75rem;
				background: rgba(255,255,255,.04);
				color: var(--zsh-text);
				padding: 0 .7rem;
				font: 650 .86rem ui-sans-serif, system-ui;
			}

			.zsh-toc-list {
				list-style: none;
				padding: 0;
				margin: 0;
				display: grid;
				gap: .08rem;
			}

			.zsh-toc-link {
				display: block;
				padding: .34rem .46rem;
				border-radius: .58rem;
				color: var(--zsh-muted) !important;
				border: 0 !important;
				text-decoration: none !important;
				font-size: .84rem;
				line-height: 1.28;
				font-weight: 560 !important;
			}

			.zsh-toc-link:hover,
			.zsh-toc-link.is-active {
				background: rgba(255,255,255,.045);
				color: var(--zsh-text) !important;
			}

			.zsh-l1 { padding-left: .1rem; font-weight: 760 !important; }
			.zsh-l2 { padding-left: .45rem; }
			.zsh-l3 { padding-left: .75rem; font-size: .8rem; }
			.zsh-l4 { padding-left: 1rem; font-size: .76rem; color: var(--zsh-faint) !important; }

			.zsh-fab {
				position: fixed;
				right: max(.85rem, env(safe-area-inset-right));
				bottom: max(5.6rem, env(safe-area-inset-bottom));
				z-index: 45;
				width: 3.1rem;
				height: 3.1rem;
				border: 1px solid var(--zsh-border);
				border-radius: 999px;
				background: rgba(21,25,41,.88);
				color: var(--zsh-text);
				font-size: 1.15rem;
				font-weight: 850;
				backdrop-filter: blur(12px);
				-webkit-backdrop-filter: blur(12px);
			}

			.zsh-menu {
				right: max(4.35rem, env(safe-area-inset-right));
			}

			.zsh-hidden {
				display: none !important;
			}
			
			.zsh-section-divider {
					position: relative;
					height: 1px;
					margin: 1.35rem 0 .85rem;
					background:
						linear-gradient(
							90deg,
							transparent,
							color-mix(in srgb, var(--zsh-accent) 28%, transparent),
							rgba(255,255,255,.16),
							color-mix(in srgb, var(--zsh-accent) 18%, transparent),
							transparent
						);
				}

				.zsh-section-divider::before {
					content: "";
					position: absolute;
					left: 50%;
					top: 50%;
					width: .48rem;
					height: .48rem;
					border-radius: 999px;
					background: color-mix(in srgb, var(--zsh-accent) 58%, white);
					box-shadow:
						0 0 0 .28rem color-mix(in srgb, var(--zsh-accent) 10%, transparent),
						0 0 1.2rem color-mix(in srgb, var(--zsh-accent) 28%, transparent);
					transform: translate(-50%, -50%);
				}

				.zsh-modern-section-nav {
					display: flex;
					gap: .42rem;
					align-items: center;
					overflow-x: auto;
					margin: 0 0 1.15rem;
					padding: .4rem;
					border: 1px solid var(--zsh-border);
					border-radius: 999px;
					background: rgba(255,255,255,.025);
					scrollbar-width: none;
					-webkit-overflow-scrolling: touch;
				}

				.zsh-modern-section-nav::-webkit-scrollbar {
					display: none;
				}

				.zsh-section-nav-button {
					flex: 0 0 auto;
					display: inline-flex;
					align-items: center;
					justify-content: center;
					min-height: 2rem;
					padding: 0 .72rem;
					border: 1px solid rgba(255,255,255,.08) !important;
					border-radius: 999px;
					background: rgba(255,255,255,.045);
					color: var(--zsh-muted) !important;
					text-decoration: none !important;
					font: 760 .78rem ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
					letter-spacing: -.01em;
					white-space: nowrap;
				}

				.zsh-section-nav-button.is-prev::before {
					content: "‹";
					margin-right: .28rem;
				}

				.zsh-section-nav-button.is-next::after {
					content: "›";
					margin-left: .28rem;
				}

				.zsh-section-nav-button.is-top::before {
					content: "↑";
					margin-right: .32rem;
				}

				.zsh-section-nav-button.is-contents::before {
					content: "☰";
					margin-right: .32rem;
				}

				.zsh-section-nav-button.is-index::before {
					content: "#";
					margin-right: .32rem;
				}

				.zsh-section-nav-button.is-help::before {
					content: "?";
					margin-right: .32rem;
				}

				.zsh-section-nav-button:hover,
				.zsh-section-nav-button:active {
					background: color-mix(in srgb, var(--zsh-accent) 12%, transparent);
					color: var(--zsh-text) !important;
								}				

			@media (max-width: 430px) {
				#${IDS.root} {
					padding-inline: .72rem;
				}

				.zsh-toolbar {
					grid-template-columns: 1fr auto auto;
				}

				.zsh-color {
					display: none;
				}

				.zsh-codebox {
					width: 100vw !important;
					max-width: 90vw !important;
					border-radius: 0;
					border-left: 0;
					border-right: 0;
					margin: 0;
					padding: 0;
				}

				.zsh-content pre {
					padding: .72rem !important;
				}

				.zsh-content pre code {
					font-size: .73rem !important;
				}
			}
		`;

		document.head.appendChild(style);
	}

	function wrapPage() {
		if (document.getElementById(IDS.root)) return;

		const nodes = [...document.body.childNodes];
		const root = document.createElement("main");
		const shell = document.createElement("div");
		const content = document.createElement("article");

		root.id = IDS.root;
		shell.className = "zsh-shell";
		content.className = "zsh-content";

		for (const node of nodes) {
			content.appendChild(node);
		}

		shell.append(createToolbar(), createHero(), content);
		root.append(shell);
		document.body.append(root);
	}

	function createToolbar() {
		const toolbar = document.createElement("div");
		const search = document.createElement("input");
		const color = document.createElement("input");
		const minus = document.createElement("button");
		const plus = document.createElement("button");

		toolbar.className = "zsh-toolbar";

		search.className = "zsh-search";
		search.type = "search";
		search.placeholder = "Search page...";

		color.className = "zsh-color";
		color.type = "color";
		color.value = getAccent();

		minus.className = "zsh-btn";
		minus.textContent = "A−";

		plus.className = "zsh-btn";
		plus.textContent = "A+";

		search.addEventListener("input", () => filterPage(search.value));

		color.addEventListener("input", () => {
			localStorage.setItem(STORAGE.accent, color.value);
			installStyles();
		});

		minus.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getScale() - 0.04, 0.88, 1.12)));
			installStyles();
		});

		plus.addEventListener("click", () => {
			localStorage.setItem(STORAGE.scale, String(clamp(getScale() + 0.04, 0.88, 1.12)));
			installStyles();
		});

		toolbar.append(search, color, minus, plus);

		return toolbar;
	}

	function createHero() {
		const hero = document.createElement("header");
		const title = document.querySelector("h1,h2")?.textContent?.trim() || document.title || "Zsh Manual";

		hero.className = "zsh-hero";
		hero.innerHTML = `
			<div class="zsh-kicker">Zsh Reference Manual</div>
			<h1 class="zsh-title">${escapeHtml(title)}</h1>
		`;

		return hero;
	}

	function installHljs() {
		return new Promise((resolve) => {
			if (window.hljs) {
				resolve(window.hljs);
				return;
			}

			if (document.getElementById(IDS.hljs)) {
				document.getElementById(IDS.hljs).addEventListener("load", () => resolve(window.hljs));
				return;
			}

			const script = document.createElement("script");
			script.id = IDS.hljs;
			script.src = HLJS_URL;
			script.onload = () => resolve(window.hljs);
			script.onerror = (error) => {
			console.log(error)
			resolve(null); }
			document.head.appendChild(script);
		});
	}

	function normalizeCodeBlocks() {
		const candidates = [
			...document.querySelectorAll(".zsh-content pre"),
			...document.querySelectorAll(".zsh-content table pre"),
		];

		for (const pre of candidates) {
			if (pre.closest(".zsh-codebox")) continue;

			const raw = pre.textContent || "";
			const cleaned = dedent(raw)
				.replace(/\n{3,}/g, "\n\n")
				.trim();

			const box = document.createElement("figure");
			const bar = document.createElement("figcaption");
			const copy = document.createElement("button");
			const nextPre = document.createElement("pre");
			const code = document.createElement("code");

			box.className = "zsh-codebox";
			bar.className = "zsh-codebar";
			copy.className = "zsh-copy";
			copy.type = "button";
			copy.textContent = "Copy";

			code.className = "language-bash";
			code.textContent = cleaned;

			copy.addEventListener("click", async () => {
				await navigator.clipboard?.writeText(cleaned);
				copy.textContent = "Copied";
				setTimeout(() => {
					copy.textContent = "Copy";
				}, 1200);
			});

			bar.append(document.createTextNode("zsh"), copy);
			nextPre.append(code);
			box.append(bar, nextPre);
			pre.replaceWith(box);
		}
	}

	function fixDefinitionNoise() {
		const content = document.querySelector(".zsh-content");
		if (!content) return;

		const walkers = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);

		for (let node = walkers.nextNode(); node; node = walkers.nextNode()) {
			node.nodeValue = node.nodeValue
				.replace(/\bsee\s+The\s+zsh\/([^.\s]+)\s+Module\b/gi, "see $1 module")
				.replace(/\bSee\s+The\s+zsh\/([^.\s]+)\s+Module\b/g, "See $1 module")
				.replace(/\bThe\s+zsh\/([^.\s]+)\s+Module\b/g, "$1 module");
		}

		document.querySelectorAll(".zsh-content a").forEach((link) => {
			const text = link.textContent?.trim() || "";

			link.textContent = text
				.replace(/^The zsh\/(.+) Module$/i, "$1")
				.replace(/^zsh\/(.+) Module$/i, "$1")
				.replace(/^See The zsh\/(.+) Module$/i, "see $1");
		});
	}

	function removeBrokenNavNoise() {
		document.querySelectorAll(".zsh-content p, .zsh-content div, .zsh-content table").forEach((node) => {
			const text = node.textContent?.replace(/\s+/g, " ").trim() || "";

			if (
				text.includes("<<< Up >>>") ||
				text === "[ [ [ [ ] ] ] ]" ||
				/^\[\s*\[\s*\[\s*\[/.test(text)
			) {
				node.classList.add("zsh-nav-noise");
			}
		});
	}

	function fixAnchors() {
		document.querySelectorAll(".zsh-content [id], .zsh-content a[name]").forEach((node, index) => {
			const id = node.id || node.getAttribute("name");

			if (!id) {
				node.id = `zsh-anchor-${index + 1}`;
				return;
			}

			node.id = safeId(id);
		});

		document.querySelectorAll("a[href^='#']").forEach((link) => {
			const raw = decodeURIComponent(link.getAttribute("href") || "").slice(1);
			const id = safeId(raw);

			link.setAttribute("href", `#${id}`);
			link.addEventListener("click", (event) => {
				const target = document.getElementById(id);

				if (!target) return;

				event.preventDefault();
				document.documentElement.classList.remove("zsh-toc-open");

				const top = target.getBoundingClientRect().top + window.scrollY - 110;
				window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
				history.replaceState(null, "", `#${id}`);
			});
		});
	}

	function buildToc() {
		document.getElementById(IDS.toc)?.remove();

		const toc = document.createElement("aside");
		const search = document.createElement("input");
		const list = document.createElement("ol");
		const headings = [...document.querySelectorAll(".zsh-content h1, .zsh-content h2, .zsh-content h3, .zsh-content h4")]
			.filter((heading) => heading.textContent?.trim());

		toc.id = IDS.toc;
		toc.innerHTML = `
			<div class="zsh-toc-head">
				<span>Sections</span>
				<button class="zsh-btn" type="button">Close</button>
			</div>
		`;

		toc.querySelector("button")?.addEventListener("click", () => {
			document.documentElement.classList.remove("zsh-toc-open");
		});

		search.className = "zsh-toc-search";
		search.type = "search";
		search.placeholder = "Filter sections...";

		list.className = "zsh-toc-list";

		headings.forEach((heading, index) => {
			if (!heading.id) heading.id = `zsh-heading-${index + 1}`;

			const level = heading.tagName.slice(1);
			const item = document.createElement("li");
			const link = document.createElement("a");

			link.href = `#${heading.id}`;
			link.className = `zsh-toc-link zsh-l${level}`;
			link.textContent = cleanText(heading.textContent || "");

			link.addEventListener("click", (event) => {
				event.preventDefault();
				document.documentElement.classList.remove("zsh-toc-open");

				const top = heading.getBoundingClientRect().top + window.scrollY - 110;
				window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
				history.replaceState(null, "", `#${heading.id}`);
			});

			item.append(link);
			list.append(item);
		});

		search.addEventListener("input", () => {
			const query = search.value.trim().toLowerCase();

			[...list.children].forEach((item) => {
				item.classList.toggle("zsh-hidden", query && !item.textContent.toLowerCase().includes(query));
			});
		});

		toc.append(search, list);
		document.body.append(toc);
	}

	function createButtons() {
		if (document.querySelector(".zsh-fab")) return;

		const menu = document.createElement("button");
		const top = document.createElement("button");

		menu.className = "zsh-fab zsh-menu";
		menu.textContent = "☰";
		menu.addEventListener("click", () => {
			document.documentElement.classList.toggle("zsh-toc-open");
		});

		top.className = "zsh-fab";
		top.textContent = "↑";
		top.addEventListener("click", () => {
			window.scrollTo({ top: 0, behavior: "smooth" });
		});

		document.body.append(menu, top);
	}

	function highlightCodeBlocks() {
		if (!window.hljs) return;

		document.querySelectorAll(".zsh-codebox code").forEach((code) => {
			try {
				window.hljs.highlightElement(code);
			} catch {
				// Keep plain code if Highlight.js cannot classify the block.
			}
		});
	}

	function filterPage(query) {
		const normalized = query.trim().toLowerCase();
		const content = document.querySelector(".zsh-content");

		if (!content) return;

		[...content.children].forEach((block) => {
			const text = block.textContent?.toLowerCase() || "";
			block.classList.toggle("zsh-hidden", normalized && !text.includes(normalized));
		});
	}

	function dedent(value) {
		const lines = value.replace(/\t/g, "  ").split("\n");
		const nonEmpty = lines.filter((line) => line.trim().length > 0);

		if (nonEmpty.length === 0) return "";

		const minIndent = Math.min(...nonEmpty.map((line) => line.match(/^ */)?.[0].length || 0));

		return lines.map((line) => line.slice(minIndent)).join("\n");
	}

	function safeId(value) {
		return value
			.trim()
			.replace(/^#/, "")
			.replace(/[^\w\-:.]/g, "-")
			.replace(/-+/g, "-");
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
	
	function beautifyZshNavLinks() {

		document.querySelectorAll(".zsh-content p, .zsh-content div, .zsh-content table").forEach((node) => {
		const text = node.textContent?.replace(/\s+/g, " ").trim() || "";

		if (!/(<<|<|Up|Top|Contents|Index|\?)/i.test(text)) {
			return;
		}

		const links = [...node.querySelectorAll("a")];

		if (links.length < 3) {
			return;
		}

		const nav = document.createElement("nav");
		nav.className = "zsh-modern-section-nav";
		nav.setAttribute("aria-label", "Section navigation");

		for (const link of links) {
			const button = document.createElement("a");
			const label = normalizeZshNavLabel(link.textContent || "");

			button.href = link.href;
			button.className = `zsh-section-nav-button ${getZshNavButtonClass(label)}`;
			button.textContent = label;

			nav.append(button);
		}

		const divider = document.createElement("div");
		divider.className = "zsh-section-divider";

		node.replaceWith(divider, nav);
	});
}

function normalizeZshNavLabel(value) {
	const text = value.replace(/\[|\]/g, "").replace(/\s+/g, " ").trim();

	if (/^<<$|^<<<$|up/i.test(text)) return "Previous";
	if (/^<$|^←$/.test(text)) return "Back";
	if (/^>$|^→$/.test(text)) return "Next";
	if (/^>>$|^>>>$/.test(text)) return "Forward";
	if (/top/i.test(text)) return "Top";
	if (/contents/i.test(text)) return "Contents";
	if (/index/i.test(text)) return "Index";
	if (/\?/.test(text)) return "Help";

	return text || "Link";
}

function getZshNavButtonClass(label) {
	const key = label.toLowerCase();

	if (["previous", "back"].includes(key)) return "is-prev";
	if (["next", "forward"].includes(key)) return "is-next";
	if (key === "top") return "is-top";
	if (key === "contents") return "is-contents";
	if (key === "index") return "is-index";
	if (key === "help") return "is-help";

	return "";
}


function addElegantDottedSeparators() {
document.querySelectorAll("hr").forEach(hr => hr?.remove());

	document.querySelectorAll(".zsh-content p, .zsh-content dt").forEach((node) => {
		if (node.classList.contains("zsh-dotted-separated")) return;

		const firstChip = node.querySelector("code, tt, kbd");

		if (!firstChip) return;

		const text = node.textContent?.trim() || "";
		const looksLikeOptionTitle = /^[A-Z0-9_:-]+|\-[A-Za-z]/.test(text);

		if (!looksLikeOptionTitle) return;

		node.classList.add("zsh-dotted-separated");
	});
}

  function createTopButton() {
    const button = document.createElement("button");

    button.className = "zmb-top";
    button.type = "button";
    button.innerHTML = "↑";
    button.setAttribute("aria-label", "Back to top");
    button.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));

    return button;
  }

  function bindTopButton(button) {
    let ticking = false;

    const update = () => {
      button.dataset.visible = String(scrollY > 520);
      ticking = false;
    };

    addEventListener(
      "scroll",
      () => {
        if (ticking) return;

        ticking = true;
        requestAnimationFrame(update);
      },
      { passive: true },
    );

    update();
  }

	async function boot() {
		installStyles();
		wrapPage();
		fixDefinitionNoise();
		removeBrokenNavNoise();
		normalizeCodeBlocks();
		fixAnchors();
		buildToc();
		createButtons();
		setViewport();
		createTopButton();
		beautifyZshNavLinks();
		//addElegantDottedSeparators();

		await installHljs();
		highlightCodeBlocks();

		if (location.hash) {
			const target = document.getElementById(safeId(decodeURIComponent(location.hash.slice(1))));
			if (target) {
				setTimeout(() => {
					const top = target.getBoundingClientRect().top + window.scrollY - 110;
					window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
				}, 120);
			}
		}
	}

	boot();
})();