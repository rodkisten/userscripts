// ==UserScript==
// @name         Rod / Docs / Zsh Guide
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Modern graphite reader for the Zsh Guide.
// @author       Rod
// @match        https://zsh.sourceforge.io/Guide/*
// @run-at       document-idle
// @weight       420
// @grant        none
// @noframes
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = {
    sidebarId: "zsg-sidebar",
    appClass: "zsg-modernized",
    headingSelector: "h1, h2, h3",
    contentMaxWidth: "980px",
    activeOffset: 120,
    topButtonOffset: 700,
    hljsThemeUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css",
  };

  /**
   * Injects a stylesheet into the current page.
   *
   * @param {string} css - CSS text to inject.
   * @returns {HTMLStyleElement} The injected style element.
   */
  function injectStyle(css) {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    return style;
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



  /**
   * Injects an external stylesheet.
   *
   * @param {string} href - Stylesheet URL.
   * @returns {HTMLLinkElement} The injected link element.
   */
  function injectStylesheet(href) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
    return link;
  }

  /**
   * Creates a stable slug from heading text.
   *
   * @param {string} value - Raw heading text.
   * @returns {string} URL-safe slug.
   */
  function slugify(value) {
    return value
      .toLowerCase()
      .replace(/[`'"’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  /**
   * Ensures every heading has an id for navigation.
   *
   * @param {HTMLElement[]} headings - Heading elements.
   * @returns {HTMLElement[]} Headings with stable ids.
   */
  function ensureHeadingIds(headings) {
    const used = new Map();

    for (const heading of headings) {
      const base = heading.id || slugify(heading.textContent || "section");
      const count = used.get(base) || 0;
      used.set(base, count + 1);
      heading.id = count === 0 ? base : `${base}-${count + 1}`;
    }

    return headings;
  }

  /**
   * Wraps the original page content in a modern shell.
   *
   * @returns {HTMLElement} The main content wrapper.
   */
  function wrapContent() {
    const oldNodes = [...document.body.childNodes];
    const app = document.createElement("div");
    const main = document.createElement("main");

    app.className = "zsg-app";
    main.className = "zsg-content";
    main.id = "zsg-content";

    for (const node of oldNodes) {
      main.append(node);
    }

    app.append(main);
    document.body.append(app);

    return main;
  }

  /**
   * Converts plain pre blocks into highlight.js shell blocks.
   *
   * @param {HTMLElement} root - Root element to scan.
   * @returns {void}
   */
  function highlightCode(root) {
    const blocks = [...root.querySelectorAll("pre")];

    for (const pre of blocks) {
      if (pre.querySelector("code")) continue;

      const code = document.createElement("code");
      code.className = "language-bash";
      pre.textContent = (pre.textContent ?? "").replace(/^%/gm, '$ ');
      code.textContent = pre.textContent || "";
      pre.textContent = "";
      pre.append(code);
    }

    if (window.hljs) {
      root.querySelectorAll("pre code").forEach((block) => {
        window.hljs.highlightElement(block);
      });
    }else {
    alert("nao tem hljs")
    }
  }

  /**
   * Builds the sidebar from page headings.
   *
   * @param {HTMLElement[]} headings - Page headings.
   * @returns {HTMLElement} Sidebar element.
   */
  function buildSidebar(headings) {
    const aside = document.createElement("aside");
    aside.id = CONFIG.sidebarId;
    aside.className = "zsg-sidebar";

    const navItems = headings
      .filter((heading) => heading.id && heading.textContent?.trim())
      .map((heading) => {
        const level = Number(heading.tagName.slice(1));
        const text = heading.textContent.trim();
        return `
          <a class="zsg-nav-link zsg-level-${level}" href="#${heading.id}" data-target="${heading.id}">
            <span>${text}</span>
          </a>
        `;
      })
      .join("");

    aside.innerHTML = `
      <div class="zsg-sidebar-head">
        <div>
          <strong>Zsh Guide</strong>
          <small>modern reader</small>
        </div>
        <button class="zsg-icon-button" type="button" data-zsg-close>×</button>
      </div>

      <label class="zsg-search">
        <span>Search sections</span>
        <input type="search" placeholder="history, completion, arrays..." autocomplete="off" data-zsg-search />
      </label>

      <nav class="zsg-nav" aria-label="Zsh guide sections">
        ${navItems}
      </nav>
    `;

    return aside;
  }

  /**
   * Creates floating controls for mobile navigation and scroll-to-top.
   *
   * @returns {HTMLElement} Controls wrapper.
   */
  function buildControls() {
    const controls = document.createElement("div");
    controls.className = "zsg-controls";
    controls.innerHTML = `
      <button class="zsg-fab zsg-menu-fab" type="button" data-zsg-open>☰</button>
      <button class="zsg-fab zsg-top-fab" type="button" data-zsg-top>↑</button>
    `;
    return controls;
  }

  /**
   * Creates the top reading progress bar.
   *
   * @returns {HTMLElement} Progress bar element.
   */
  function buildProgress() {
    const progress = document.createElement("div");
    progress.className = "zsg-progress";
    progress.innerHTML = `<span data-zsg-progress></span>`;
    return progress;
  }

  /**
   * Wires sidebar search, drawer toggle, active heading and progress.
   *
   * @param {HTMLElement[]} headings - Heading elements.
   * @returns {void}
   */
  function wireInteractions(headings) {
    const sidebar = document.querySelector(".zsg-sidebar");
    const search = document.querySelector("[data-zsg-search]");
    const progress = document.querySelector("[data-zsg-progress]");
    const topButton = document.querySelector("[data-zsg-top]");

    document.querySelector("[data-zsg-open]")?.addEventListener("click", () => {
      document.documentElement.classList.add("zsg-sidebar-open");
    });

    document.querySelector("[data-zsg-close]")?.addEventListener("click", () => {
      document.documentElement.classList.remove("zsg-sidebar-open");
    });

    topButton?.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    sidebar?.addEventListener("click", (event) => {
      const link = event.target.closest("a[href^='#']");
      if (!link) return;
      document.documentElement.classList.remove("zsg-sidebar-open");
    });

    search?.addEventListener("input", () => {
      const term = search.value.trim().toLowerCase();

      document.querySelectorAll(".zsg-nav-link").forEach((link) => {
        const text = link.textContent.toLowerCase();
        link.hidden = term.length > 0 && !text.includes(term);
      });
    });

    const updateScrollUi = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      const percent = maxScroll > 0 ? Math.min(100, (scrollTop / maxScroll) * 100) : 0;

      if (progress) progress.style.width = `${percent}%`;
      topButton?.classList.toggle("is-visible", scrollTop > CONFIG.topButtonOffset);

      let active = headings[0]?.id;

      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= CONFIG.activeOffset) {
          active = heading.id;
        } else {
          break;
        }
      }

      document.querySelectorAll(".zsg-nav-link").forEach((link) => {
        link.classList.toggle("is-active", link.dataset.target === active);
      });
    };

    window.addEventListener("scroll", updateScrollUi, { passive: true });
    window.addEventListener("resize", updateScrollUi, { passive: true });
    updateScrollUi();
  }

  /**
   * Adds copy buttons to code blocks.
   *
   * @param {HTMLElement} root - Root element to scan.
   * @returns {void}
   */
  function addCodeCopyButtons(root) {
    root.querySelectorAll("pre").forEach((pre) => {
      const button = document.createElement("button");
      button.className = "zsg-copy";
      button.type = "button";
      button.textContent = "Copy";

      button.addEventListener("click", async () => {
        const text = pre.textContent.replace(/^Copy\s*/, "");
        await navigator.clipboard.writeText(text);
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1200);
      });

      pre.append(button);
    });
  }

  injectStylesheet(CONFIG.hljsThemeUrl);

  injectStyle(`
  
  :root {

  /*

   * Base fluida principal
   * min: 2.4rem
   * preferred: cresce com viewport
   * max: 5rem

   */

  --h1-fluid: clamp(2rem, 1.2rem + 4vw, 4rem);

  /*

   * Escala tipográfica

   * 1.2 → suave

   * 1.25 → clássica

   * 1.333 → editorial

   * 1.414 → dramática

   */

  --heading-ratio: 1.25;

  /*
   * Derived scale
   */

  --h2-fluid: calc(var(--h1-fluid) / var(--heading-ratio));
  --h3-fluid: calc(var(--h2-fluid) / var(--heading-ratio));
  --h4-fluid: calc(var(--h3-fluid) / var(--heading-ratio));
  --h5-fluid: calc(var(--h4-fluid) / var(--heading-ratio));
  --h6-fluid: calc(var(--h5-fluid) / var(--heading-ratio));

  /*
   * Rhythm
   */

  --heading-line-height: 0.95;
  --heading-spacing: -0.1;
  
  }
    :root {
      color-scheme: dark;


  /*

   * Seed

   * Change ONLY this color.

   */

  --zsg-brand: oklch(72% 0.16 100);

  /*

   * Backgrounds

   */

  --zsg-bg: color-mix(in oklch, black 94%, var(--zsg-brand));

  --zsg-bg-soft: color-mix(in oklch, black 90%, var(--zsg-brand));

  /*
   * Panels
   */

  --zsg-panel-solid: color-mix(in oklch, black 86%, var(--zsg-brand));

  --zsg-panel: color-mix(in oklch, transparent 18%, var(--zsg-panel-solid));

  /*
   * Borders
   */ 
  --zsg-border: color-mix(in oklch, white 10%, transparent);

  --zsg-border-strong: color-mix(in oklch, white 18%, transparent);

  /*
   * Text
   */
  --zsg-text:  color-mix(in oklch, white 92%, var(--zsg-brand));

  --zsg-muted: color-mix(in oklch, white 58%, var(--zsg-brand));

  --zsg-faint: color-mix(in oklch, white 36%, var(--zsg-brand));

  /* 
   * Accents
   */

  --zsg-accent: color-mix(in oklch, white 8%, var(--zsg-brand));

  --zsg-accent-2: oklch(74% 0.14 calc(from var(--zsg-brand) h + 28));

  --zsg-accent-3: oklch(76% 0.12 calc(from var(--zsg-brand) h - 34));

  /*

   * Fancy extras

   */

  --zsg-glow: color-mix(in oklch, transparent 38%, var(--zsg-brand));

  --zsg-gradient: linear-gradient(135deg, color-mix(in oklch, white 10%, var(--zsg-brand)),color-mix(in oklch, black 24%, var(--zsg-brand)));

  --zsg-noise-opacity: 0.035;

  /*
   * Shadows
   */

  --zsg-shadow: 0 2px 12px color-mix(in oklch, black 82%, var(--zsg-brand));

  --zsg-shadow-md: 0 10px 40px color-mix(in oklch, black 72%, var(--zsg-brand));

  --zsg-shadow-lg: 0 24px 80px color-mix(in oklch, black 58%, var(--zsg-brand));




      --zsg-radius-xl: 28px;
      --zsg-radius-lg: 18px;
      --zsg-radius-md: 12px;
      --zsg-font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif;
      --zsg-mono: ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace;




  --zsg-grid-size: 24px;
  --zsg-grid-line: color-mix(in oklch, var(--zsg-text) 4.5%, transparent);
  --zsg-grid-line-soft: color-mix(in oklch, var(--zsg-accent) 6%, transparent);
}

    html.${CONFIG.appClass},
    html.${CONFIG.appClass} body {
      min-height: 100%;
      background:
        radial-gradient(circle at 18% 0%, rgba(147, 197, 253, 0.16), transparent 30rem),
        radial-gradient(circle at 80% 10%, rgba(167, 243, 208, 0.12), transparent 26rem),
        linear-gradient(135deg, #07080b 0%, #11131a 45%, #090a0d 100%) !important;
      color: var(--zsg-text) !important;
      font-family: var(--zsg-font) !important;
      line-height: 1.72 !important;
    }

    html.${CONFIG.appClass} body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.18;
  background-image:
    linear-gradient(var(--zsg-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--zsg-grid-line-soft) 1px, transparent 1px);
  background-size: var(--zsg-grid-size) var(--zsg-grid-size);
  mask-image: linear-gradient(to bottom, black, transparent 72%);
      z-index: 0;
    }

    .zsg-progress {
      position: fixed;
      inset: 0 0 auto 0;
      z-index: 999999;
      height: 3px;
      background: rgba(255,255,255,.08);
    }

    .zsg-progress span {
      display: block;
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, var(--zsg-accent), var(--zsg-accent-2), var(--zsg-accent-3));
      box-shadow: 0 0 24px rgba(147,197,253,.55);
    }

    .zsg-app {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: clamp(20px, 4vw, 56px);
      width: min(1480px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0 70px;
    }

    .zsg-content {
      max-width: ${CONFIG.contentMaxWidth};
      min-width: 0;
      margin: 0 auto;
      padding: clamp(22px, 5vw, 64px);
      border: 1px solid var(--zsg-border);
      border-radius: var(--zsg-radius-xl);
      background:
        linear-gradient(180deg, rgba(255,255,255,.045), transparent 220px),
        rgba(11, 13, 18, 0.74);
      box-shadow: var(--zsg-shadow);
      backdrop-filter: blur(18px);
    }

    .zsg-content h1,
    .zsg-content h2,
    .zsg-content h3 {
      letter-spacing: var(--heading-spacing);
      line-height: var(--heading-line-height);
      color: #f8fafc;
      scroll-margin-top: 34px;
    }

    .zsg-content h1 {
      font-size: var(--h1-fluid);
      margin: 0 0 1.4rem;
      background: linear-gradient(135deg, #fff, #cbd5e1 44%, #a7f3d0);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .zsg-content h2 {
      font-size: var(--h2-fluid);
      margin-top: 3.2rem;
      padding-top: 1.3rem;
      border-top: 1px solid var(--zsg-border);
      color: var(--zsg-accent);
    }

    .zsg-content h3 {
      font-size: var(--h3-fluid);
      margin-top: 2.25rem;
      color: var(--zsg-accent-2);
    }

    .zsg-content p,
    .zsg-content li,
    .zsg-content dd,
    .zsg-content dt {
      color: var(--zsg-text);
      font-size: clamp(1rem, 2.8vw, 1.08rem);
    }

    .zsg-content a {
      color: var(--zsg-accent);
      text-decoration-thickness: 1px;
      text-underline-offset: 4px;
    }

    .zsg-content a:hover {
      color: #bfdbfe;
    }

    .zsg-content code,
    .zsg-content tt {
      font-family: var(--zsg-mono);
      color: #d9f99d;
      background: rgba(163, 230, 53, 0.08);
      border: 1px solid rgba(163, 230, 53, 0.16);
      border-radius: 8px;
      padding: 0.1em 0.35em;
      font-size: 0.92em;
      /**outline: 1px dotted red;**/
    }

    .zsg-content pre {
      position: relative;
      overflow: auto;
      max-width: 100%;
      margin: 0.3rem 0;

      border: 1px solid var(--zsg-border-strong);
      border-radius: var(--zsg-radius-lg);
      background: #080a0f !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
      -webkit-overflow-scrolling: touch;
    }

    .zsg-content pre code {
      display: block;
      background: transparent;
      border: 0;
      padding: 0;
      color: inherit;
      white-space: pre;
      font-size: 0.92rem;
      line-height: 1.65;
    }
    
    .zsg-content pre code.wrap {
      white-space: pre-wrap;
      overflow-wrap: break-word;
      word-break: normal;
      hyphens: auto;
     }

    .zsg-copy {
      position: absolute;
      left: 100%;
      top: 0;
      float: right;
      margin: -0.55rem -0.55rem 0.5rem 0.5rem;
      border: 1px solid var(--zsg-border);
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      color: var(--zsg-text);
      font: 600 0.76rem var(--zsg-font);
      padding: 0.42rem 0.66rem;
    }

    .zsg-sidebar {
      position: sticky;
      top: 20px;
      align-self: start;
      max-height: calc(100vh - 40px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--zsg-border);
      border-radius: var(--zsg-radius-xl);
      background: var(--zsg-panel);
      box-shadow: var(--zsg-shadow);
      backdrop-filter: blur(18px);
    }

    .zsg-sidebar-head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      padding: 1rem;
      border-bottom: 1px solid var(--zsg-border);
    }

    .zsg-sidebar-head strong {
      display: block;
      color: #fff;
      letter-spacing: -0.04em;
      font-size: 1.1rem;
    }

    .zsg-sidebar-head small,
    .zsg-search span {
      display: block;
      color: var(--zsg-muted);
      font-size: 0.78rem;
    }

    .zsg-icon-button {
      display: none;
      width: 38px;
      height: 38px;
      border: 1px solid var(--zsg-border);
      border-radius: 999px;
      background: rgba(255,255,255,.06);
      color: var(--zsg-text);
      font-size: 1.4rem;
    }

    .zsg-search {
      display: grid;
      gap: 0.45rem;
      padding: 1rem;
      border-bottom: 1px solid var(--zsg-border);
    }

    .zsg-search input {
      width: 100%;
      border: 1px solid var(--zsg-border);
      border-radius: 999px;
      background: rgba(0,0,0,.26);
      color: var(--zsg-text);
      outline: none;
      padding: 0.72rem 0.9rem;
      font: 500 0.95rem var(--zsg-font);
    }

    .zsg-search input:focus {
      border-color: rgba(167,243,208,.65);
      box-shadow: 0 0 0 4px rgba(167,243,208,.08);
    }

    .zsg-nav {
      overflow: auto;
      padding: 0.7rem;
      -webkit-overflow-scrolling: touch;
    }

    .zsg-nav-link {
      display: block;
      border-radius: 12px;
      color: var(--zsg-muted);
      text-decoration: none;
      padding: 0.52rem 0.65rem;
      font-size: 0.9rem;
      line-height: 1.28;
      border: 1px solid transparent;
    }

    .zsg-nav-link:hover {
      color: #fff;
      background: rgba(255,255,255,.055);
    }

    .zsg-nav-link.is-active {
      color: #ecfeff;
      background: linear-gradient(135deg, rgba(167,243,208,.14), rgba(147,197,253,.1));
      border-color: rgba(167,243,208,.18);
    }

    .zsg-level-1 { font-weight: 800; }
    .zsg-level-2 { padding-left: 1rem; }
    .zsg-level-3 { padding-left: 1.7rem; font-size: 0.84rem; color: var(--zsg-faint); }

    .zsg-controls {
      position: fixed;
      right: max(16px, env(safe-area-inset-right));
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 999998;
      display: grid;
      gap: 10px;
    }

    .zsg-fab {
      width: 48px;
      height: 48px;
      border: 1px solid var(--zsg-border-strong);
      border-radius: 999px;
      background: rgba(18,20,27,.82);
      color: #fff;
      box-shadow: 0 16px 40px rgba(0,0,0,.42);
      backdrop-filter: blur(16px);
      font: 800 1.1rem var(--zsg-font);
    }

    .zsg-top-fab {
      opacity: 0;
      transform: translateY(10px);
      pointer-events: none;
      transition: 180ms ease;
    }

    .zsg-top-fab.is-visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    hr {
      border: 0 !important;
      height: 1px !important;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent) !important;
      margin: 2rem 0 !important;
    }

    @media (max-width: 980px) {
      .zsg-app {
        display: block;
        width: min(100% - 20px, 760px);
        padding-top: 14px;
      }

      .zsg-content {
        padding: 24px 18px 72px;
        border-radius: 22px;
      }

      .zsg-sidebar {
        position: fixed;
        inset: 10px 10px 10px auto;
        width: min(88vw, 390px);
        max-height: none;
        z-index: 999999;
        transform: translateX(calc(100% + 22px));
        transition: transform 220ms ease;
      }

      .zsg-sidebar-open .zsg-sidebar {
        transform: translateX(0);
      }

      .zsg-icon-button {
        display: inline-grid;
        place-items: center;
      }

      .zsg-content h1 {
        font-size: clamp(2.1rem, 13vw, 3.4rem);
      }
    }

    @media (min-width: 981px) {
      .zsg-menu-fab {
        display: none;
      }
    }
  `);

  document.documentElement.classList.add(CONFIG.appClass);

  setViewport()
  const main = wrapContent();
  const headings = ensureHeadingIds([...main.querySelectorAll(CONFIG.headingSelector)]);
  const sidebar = buildSidebar(headings);
  const controls = buildControls();
  const progress = buildProgress();

  document.body.prepend(progress);
  document.querySelector(".zsg-app").prepend(sidebar);
  document.body.append(controls);

  highlightCode(main);
  addCodeCopyButtons(main);
  wireInteractions(headings);
})();