// ==UserScript==
// @name         Rod / npmjs Modern Dark Mode
// @namespace    https://rod.dev/userscripts
// @version      2026.06.02
// @description  Modern npmx.dev-inspired dark mode for npmjs.com with gradients, glass surfaces, noise, and polished package pages.
// @author       Rod
// @match        https://www.npmjs.com/*
// @match        https://npmjs.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function rodNpmModernDarkMode() {
  'use strict';

  const STYLE_ID = 'rod-npm-modern-dark-mode-style';
  const ROOT_CLASS = 'rod-npm-modern-dark-mode';

  /**
   * Installs the global theme class as early as possible.
   *
   * @returns {void}
   */
  function installRootClass() {
    document.documentElement.classList.add(ROOT_CLASS);
    document.documentElement.dataset.rodNpmTheme = 'modern-dark';
  }

  /**
   * Injects the complete visual skin.
   *
   * @returns {void}
   */
  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
:root.${ROOT_CLASS} {
  color-scheme: dark;

  --rod-npm-bg-0: #050711;
  --rod-npm-bg-1: #080b18;
  --rod-npm-bg-2: #0d1224;
  --rod-npm-bg-3: #121936;

  --rod-npm-surface-0: rgb(255 255 255 / 0.045);
  --rod-npm-surface-1: rgb(255 255 255 / 0.07);
  --rod-npm-surface-2: rgb(255 255 255 / 0.105);
  --rod-npm-surface-hover: rgb(255 255 255 / 0.13);

  --rod-npm-border-0: rgb(255 255 255 / 0.09);
  --rod-npm-border-1: rgb(255 255 255 / 0.14);
  --rod-npm-border-2: rgb(255 255 255 / 0.22);

  --rod-npm-text-0: #f8fafc;
  --rod-npm-text-1: #dbeafe;
  --rod-npm-text-2: #a8b3cf;
  --rod-npm-text-3: #73809d;

  --rod-npm-accent-0: #a78bfa;
  --rod-npm-accent-1: #22d3ee;
  --rod-npm-accent-2: #f472b6;
  --rod-npm-accent-3: #34d399;
  --rod-npm-danger: #fb7185;
  --rod-npm-warning: #fbbf24;

  --rod-npm-shadow-0: 0 18px 70px rgb(0 0 0 / 0.38);
  --rod-npm-shadow-1: 0 12px 38px rgb(0 0 0 / 0.28);
  --rod-npm-glow-0: 0 0 0 1px rgb(167 139 250 / 0.18), 0 0 46px rgb(34 211 238 / 0.08);

  --rod-npm-radius-xs: 8px;
  --rod-npm-radius-sm: 12px;
  --rod-npm-radius-md: 16px;
  --rod-npm-radius-lg: 22px;
  --rod-npm-radius-xl: 30px;

  --rod-npm-blur: 20px;
  --rod-npm-transition-fast: 140ms ease;
  --rod-npm-transition: 220ms cubic-bezier(.2,.8,.2,1);

  --rod-npm-font:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
  --rod-npm-mono:
    "SF Mono", "Cascadia Code", "JetBrains Mono", ui-monospace,
    Menlo, Consolas, monospace;
}

:root.${ROOT_CLASS},
:root.${ROOT_CLASS} body {
  background:
    radial-gradient(circle at 16% -10%, rgb(167 139 250 / 0.24), transparent 34rem),
    radial-gradient(circle at 88% 5%, rgb(34 211 238 / 0.18), transparent 31rem),
    radial-gradient(circle at 52% 105%, rgb(244 114 182 / 0.12), transparent 34rem),
    linear-gradient(180deg, var(--rod-npm-bg-0), var(--rod-npm-bg-1) 42%, #050714) !important;
  color: var(--rod-npm-text-1) !important;
  font-family: var(--rod-npm-font) !important;
}

:root.${ROOT_CLASS} body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 2147483640;
  pointer-events: none;
  opacity: 0.34;
  background-image:
    linear-gradient(rgb(255 255 255 / 0.028) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.022) 1px, transparent 1px);
  background-size: 38px 38px;
  mask-image: radial-gradient(circle at top, black, transparent 74%);
}

:root.${ROOT_CLASS} body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 2147483641;
  pointer-events: none;
  opacity: 0.095;
  background-image:
    radial-gradient(circle at 20% 30%, white 0 1px, transparent 1px),
    radial-gradient(circle at 80% 70%, white 0 1px, transparent 1px);
  background-size: 4px 4px, 7px 7px;
  mix-blend-mode: screen;
}

:root.${ROOT_CLASS} * {
  border-color: var(--rod-npm-border-0) !important;
}

:root.${ROOT_CLASS} a {
  color: var(--rod-npm-accent-1) !important;
  text-decoration-color: rgb(34 211 238 / 0.32) !important;
  transition:
    color var(--rod-npm-transition-fast),
    opacity var(--rod-npm-transition-fast),
    background var(--rod-npm-transition-fast),
    border-color var(--rod-npm-transition-fast),
    transform var(--rod-npm-transition-fast) !important;
}

:root.${ROOT_CLASS} a:hover {
  color: #cffafe !important;
}

:root.${ROOT_CLASS} h1,
:root.${ROOT_CLASS} h2,
:root.${ROOT_CLASS} h3,
:root.${ROOT_CLASS} h4,
:root.${ROOT_CLASS} strong {
  color: var(--rod-npm-text-0) !important;
}

:root.${ROOT_CLASS} p,
:root.${ROOT_CLASS} li,
:root.${ROOT_CLASS} dd,
:root.${ROOT_CLASS} dt,
:root.${ROOT_CLASS} span {
  color: inherit;
}

:root.${ROOT_CLASS} code,
:root.${ROOT_CLASS} pre,
:root.${ROOT_CLASS} kbd {
  font-family: var(--rod-npm-mono) !important;
}

:root.${ROOT_CLASS} pre,
:root.${ROOT_CLASS} code {
  background: rgb(2 6 23 / 0.74) !important;
  color: #dbeafe !important;
  border: 1px solid var(--rod-npm-border-0) !important;
  border-radius: var(--rod-npm-radius-sm) !important;
}

:root.${ROOT_CLASS} pre {
  padding: 16px !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04) !important;
}

:root.${ROOT_CLASS} input,
:root.${ROOT_CLASS} textarea,
:root.${ROOT_CLASS} select {
  background: rgb(2 6 23 / 0.72) !important;
  color: var(--rod-npm-text-0) !important;
  border: 1px solid var(--rod-npm-border-1) !important;
  border-radius: var(--rod-npm-radius-md) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04) !important;
}

:root.${ROOT_CLASS} input::placeholder,
:root.${ROOT_CLASS} textarea::placeholder {
  color: var(--rod-npm-text-3) !important;
}

:root.${ROOT_CLASS} button,
:root.${ROOT_CLASS} [role="button"],
:root.${ROOT_CLASS} a[href*="/login"],
:root.${ROOT_CLASS} a[href*="/signup"] {
  border-radius: var(--rod-npm-radius-md) !important;
  transition:
    transform var(--rod-npm-transition-fast),
    background var(--rod-npm-transition-fast),
    border-color var(--rod-npm-transition-fast),
    box-shadow var(--rod-npm-transition-fast) !important;
}

:root.${ROOT_CLASS} button:hover,
:root.${ROOT_CLASS} [role="button"]:hover {
  transform: translateY(-1px);
}

:root.${ROOT_CLASS} header,
:root.${ROOT_CLASS} nav,
:root.${ROOT_CLASS} [class*="header"],
:root.${ROOT_CLASS} [class*="nav"] {
  background: rgb(5 7 17 / 0.74) !important;
  backdrop-filter: blur(var(--rod-npm-blur)) saturate(1.35) !important;
  -webkit-backdrop-filter: blur(var(--rod-npm-blur)) saturate(1.35) !important;
  border-color: var(--rod-npm-border-0) !important;
}

:root.${ROOT_CLASS} main {
  position: relative;
  z-index: 1;
}

:root.${ROOT_CLASS} main > div,
:root.${ROOT_CLASS} article,
:root.${ROOT_CLASS} section,
:root.${ROOT_CLASS} aside {
  color: var(--rod-npm-text-1) !important;
}

:root.${ROOT_CLASS} article,
:root.${ROOT_CLASS} aside,
:root.${ROOT_CLASS} main > div > div,
:root.${ROOT_CLASS} [class*="card"],
:root.${ROOT_CLASS} [class*="package"],
:root.${ROOT_CLASS} [class*="sidebar"] {
  border-color: var(--rod-npm-border-0) !important;
}

:root.${ROOT_CLASS} main article,
:root.${ROOT_CLASS} main aside,
:root.${ROOT_CLASS} main section > div,
:root.${ROOT_CLASS} div[class*="package-list-item"],
:root.${ROOT_CLASS} div[class*="search"] article {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.072), rgb(255 255 255 / 0.034)) !important;
  border: 1px solid var(--rod-npm-border-0) !important;
  border-radius: var(--rod-npm-radius-lg) !important;
  box-shadow: var(--rod-npm-shadow-1), inset 0 1px 0 rgb(255 255 255 / 0.055) !important;
  backdrop-filter: blur(18px) saturate(1.18) !important;
  -webkit-backdrop-filter: blur(18px) saturate(1.18) !important;
}

:root.${ROOT_CLASS} main article:hover,
:root.${ROOT_CLASS} div[class*="package-list-item"]:hover,
:root.${ROOT_CLASS} div[class*="search"] article:hover {
  border-color: var(--rod-npm-border-2) !important;
  box-shadow: var(--rod-npm-shadow-0), var(--rod-npm-glow-0) !important;
}

:root.${ROOT_CLASS} h1 {
  letter-spacing: -0.055em !important;
  line-height: 0.95 !important;
  background:
    linear-gradient(90deg, #fff, #dbeafe 36%, #a78bfa 64%, #22d3ee) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  color: transparent !important;
}

:root.${ROOT_CLASS} h2,
:root.${ROOT_CLASS} h3 {
  letter-spacing: -0.035em !important;
}

:root.${ROOT_CLASS} a[href^="/package/"] {
  font-weight: 760 !important;
}

:root.${ROOT_CLASS} a[href^="/package/"]:hover {
  text-shadow: 0 0 22px rgb(34 211 238 / 0.24);
}

:root.${ROOT_CLASS} img {
  border-radius: var(--rod-npm-radius-md) !important;
}

:root.${ROOT_CLASS} table {
  background: rgb(255 255 255 / 0.035) !important;
  border: 1px solid var(--rod-npm-border-0) !important;
  border-radius: var(--rod-npm-radius-md) !important;
  overflow: hidden !important;
}

:root.${ROOT_CLASS} th {
  background: rgb(255 255 255 / 0.07) !important;
  color: var(--rod-npm-text-0) !important;
}

:root.${ROOT_CLASS} td {
  color: var(--rod-npm-text-1) !important;
}

:root.${ROOT_CLASS} hr {
  border-color: var(--rod-npm-border-0) !important;
}

:root.${ROOT_CLASS} [style*="background-color: rgb(255, 255, 255)"],
:root.${ROOT_CLASS} [style*="background: rgb(255, 255, 255)"],
:root.${ROOT_CLASS} [style*="background-color:#fff"],
:root.${ROOT_CLASS} [style*="background:#fff"],
:root.${ROOT_CLASS} [style*="background-color: white"],
:root.${ROOT_CLASS} [style*="background: white"] {
  background: var(--rod-npm-surface-0) !important;
}

:root.${ROOT_CLASS} [style*="color: rgb(0, 0, 0)"],
:root.${ROOT_CLASS} [style*="color:#000"],
:root.${ROOT_CLASS} [style*="color: black"] {
  color: var(--rod-npm-text-1) !important;
}

:root.${ROOT_CLASS} .bg-white,
:root.${ROOT_CLASS} .bg-near-white,
:root.${ROOT_CLASS} .bg-washed-red,
:root.${ROOT_CLASS} .bg-washed-yellow,
:root.${ROOT_CLASS} .bg-light-gray,
:root.${ROOT_CLASS} .bg-near-white {
  background: var(--rod-npm-surface-0) !important;
}

:root.${ROOT_CLASS} .black,
:root.${ROOT_CLASS} .near-black,
:root.${ROOT_CLASS} .dark-gray,
:root.${ROOT_CLASS} .gray {
  color: var(--rod-npm-text-1) !important;
}

:root.${ROOT_CLASS} .mid-gray,
:root.${ROOT_CLASS} .silver {
  color: var(--rod-npm-text-2) !important;
}

:root.${ROOT_CLASS} .red,
:root.${ROOT_CLASS} .dark-red {
  color: var(--rod-npm-danger) !important;
}

:root.${ROOT_CLASS} .green,
:root.${ROOT_CLASS} .dark-green {
  color: var(--rod-npm-accent-3) !important;
}

:root.${ROOT_CLASS} .yellow,
:root.${ROOT_CLASS} .orange {
  color: var(--rod-npm-warning) !important;
}

:root.${ROOT_CLASS} .bt,
:root.${ROOT_CLASS} .bb,
:root.${ROOT_CLASS} .bl,
:root.${ROOT_CLASS} .br,
:root.${ROOT_CLASS} .ba {
  border-color: var(--rod-npm-border-0) !important;
}

:root.${ROOT_CLASS} .shadow-1,
:root.${ROOT_CLASS} .shadow-2,
:root.${ROOT_CLASS} .shadow-3,
:root.${ROOT_CLASS} .shadow-4,
:root.${ROOT_CLASS} .shadow-5 {
  box-shadow: var(--rod-npm-shadow-1) !important;
}

:root.${ROOT_CLASS} .br2,
:root.${ROOT_CLASS} .br3,
:root.${ROOT_CLASS} .br4 {
  border-radius: var(--rod-npm-radius-md) !important;
}

:root.${ROOT_CLASS} .b--black-10,
:root.${ROOT_CLASS} .b--black-20,
:root.${ROOT_CLASS} .b--moon-gray,
:root.${ROOT_CLASS} .b--light-gray {
  border-color: var(--rod-npm-border-0) !important;
}

:root.${ROOT_CLASS} [class*="markdown"] a,
:root.${ROOT_CLASS} article a {
  color: #67e8f9 !important;
}

:root.${ROOT_CLASS} [class*="markdown"] blockquote,
:root.${ROOT_CLASS} blockquote {
  background: rgb(167 139 250 / 0.08) !important;
  border-left: 3px solid var(--rod-npm-accent-0) !important;
  border-radius: 0 var(--rod-npm-radius-md) var(--rod-npm-radius-md) 0 !important;
  color: var(--rod-npm-text-1) !important;
}

:root.${ROOT_CLASS} [aria-label*="Search"],
:root.${ROOT_CLASS} input[type="search"],
:root.${ROOT_CLASS} input[name="q"] {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.105), rgb(255 255 255 / 0.052)) !important;
  border: 1px solid var(--rod-npm-border-1) !important;
  border-radius: 999px !important;
  color: var(--rod-npm-text-0) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.06),
    0 18px 50px rgb(0 0 0 / 0.22) !important;
}

:root.${ROOT_CLASS} input[name="q"]:focus,
:root.${ROOT_CLASS} input[type="search"]:focus {
  outline: none !important;
  border-color: rgb(34 211 238 / 0.55) !important;
  box-shadow:
    0 0 0 4px rgb(34 211 238 / 0.13),
    0 18px 50px rgb(0 0 0 / 0.22) !important;
}

:root.${ROOT_CLASS} a[href*="/package/"] + p,
:root.${ROOT_CLASS} p[class*="description"] {
  color: var(--rod-npm-text-2) !important;
}

:root.${ROOT_CLASS} [class*="versions"],
:root.${ROOT_CLASS} [class*="downloads"],
:root.${ROOT_CLASS} [class*="dependencies"],
:root.${ROOT_CLASS} [class*="maintainers"] {
  background: rgb(255 255 255 / 0.045) !important;
  border-radius: var(--rod-npm-radius-md) !important;
}

:root.${ROOT_CLASS} svg {
  color: currentColor !important;
  fill: currentColor;
}

:root.${ROOT_CLASS} ::selection {
  background: rgb(34 211 238 / 0.34) !important;
  color: white !important;
}

@media (max-width: 720px) {
  :root.${ROOT_CLASS} main article,
  :root.${ROOT_CLASS} main aside,
  :root.${ROOT_CLASS} main section > div {
    border-radius: var(--rod-npm-radius-md) !important;
  }

  :root.${ROOT_CLASS} h1 {
    letter-spacing: -0.045em !important;
  }
}
`;

    const target = document.head || document.documentElement;
    target.appendChild(style);
  }

  installRootClass();

  if (document.head) {
    installStyle();
  } else {
    document.addEventListener('DOMContentLoaded', installStyle, { once: true });
  }
})();