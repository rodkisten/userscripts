  // ==UserScript==
// @name         Rod / Sites / VS Code Marketplace Home
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Modern mobile-first redesign for VS Code Marketplace home pages.
// @author       Rod
// @match        https://marketplace.visualstudio.com/
// @match        https://marketplace.visualstudio.com
// @match        https://marketplace.visualstudio.com/vscode
// @match        https://marketplace.visualstudio.com/VSCode
// @match        https://marketplace.visualstudio.com/search
// @run-at       document-idle
// @weight       350
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    "use strict";

    const CONFIG = {
      debug: true,
      maxAttempts: 60,
      retryMs: 500,
    };

    let attempts = 0;

    /**
     * Logs internal script activity when debug mode is enabled.
     *
     * @param {...unknown} args Values to print.
     * @returns {void}
     */
    function debug(...args) {
      if (!CONFIG.debug) return;
      console.debug("[VSMP Home]", ...args);
    }

    /**
     * Escapes plain text before injecting it into HTML.
     *
     * @param {string} value Raw text.
     * @returns {string} Safe HTML text.
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
     * Converts a possibly relative URL into a Marketplace-safe absolute URL.
     *
     * @param {string} href Original href.
     * @returns {string} Absolute URL.
     */
    function normalizeUrl(href) {
      try {
        return new URL(href, location.href).href;
      } catch {
        return href;
      }
    }

    /**
     * Extracts extension-like cards from the original Marketplace homepage.
     *
     * @returns {Array<{ title: string, description: string, href: string, image: string, publisher: string }>} Cards.
     */
    function extractCards() {
      const anchors = [...document.querySelectorAll("a[href*='/items?itemName=']")];

      const cards = anchors
        .map((anchor) => {
          const href = normalizeUrl(anchor.getAttribute("href") || "");
          const root =
            anchor.closest("li, .item, .card, .gallery-item, [class*='item'], [class*='card']") ||
            anchor;

          const image = root.querySelector("img")?.src || "";
          const textParts = [...root.querySelectorAll("h1,h2,h3,h4,p,span,div")]
            .map((node) => node.textContent?.trim() || "")
            .filter(Boolean);

          const uniqueText = [...new Set(textParts)];
          const title =
            anchor.textContent?.trim() ||
            root.querySelector("h1,h2,h3,h4")?.textContent?.trim() ||
            uniqueText[0] ||
            "VS Code Extension";

          const description =
            uniqueText.find((text) => text.length > 28 && text.length < 180 && text !== title) ||
            "Explore this extension in the Visual Studio Marketplace.";

          const publisher =
            uniqueText.find((text) => text.length > 2 && text.length < 40 && text !== title) || "";

          return {
            title,
            description,
            href,
            image,
            publisher,
          };
        })
        .filter((card) => card.href.includes("/items?itemName="));

      const seen = new Set();

      return cards.filter((card) => {
        if (seen.has(card.href)) return false;
        seen.add(card.href);
        return true;
      });
    }

    /**
     * Creates fallback showcase cards when the page has not exposed enough cards yet.
     *
     * @returns {Array<{ title: string, description: string, href: string, image: string, publisher: string }>} Fallback cards.
     */
    function createFallbackCards() {
      return [
        {
          title: "Themes",
          publisher: "Marketplace",
          description: "Discover polished color themes, icons, and editor aesthetics.",
          href: "https://marketplace.visualstudio.com/search?target=VSCode&category=Themes&sortBy=Installs",
          image: "",
        },
        {
          title: "AI Tools",
          publisher: "Marketplace",
          description: "Find coding assistants, workflow helpers, and intelligent editor tools.",
          href: "https://marketplace.visualstudio.com/search?target=VSCode&term=AI&sortBy=Installs",
          image: "",
        },
        {
          title: "Formatters",
          publisher: "Marketplace",
          description: "Keep code tidy with formatters, linters, and quality automation.",
          href: "https://marketplace.visualstudio.com/search?target=VSCode&term=formatter&sortBy=Installs",
          image: "",
        },
        {
          title: "GitHub",
          publisher: "Marketplace",
          description: "Extensions for pull requests, issues, repositories, and reviews.",
          href: "https://marketplace.visualstudio.com/search?target=VSCode&term=github&sortBy=Installs",
          image: "",
        },
      ];
    }

    /**
     * Splits cards into thematic carousel groups.
     *
     * @param {Array<{ title: string, description: string, href: string, image: string, publisher: string }>} cards Cards.
     * @returns {Array<{ title: string, eyebrow: string, cards: Array<{ title: string, description: string, href: string, image: string, publisher: string }> }>} Sections.
     */
    function createSections(cards) {
      const source = cards.length >= 6 ? cards : [...cards, ...createFallbackCards()];
      const lower = (value) => value.toLowerCase();

      const themeCards = source.filter((card) =>
        ["theme", "icon", "color", "dark", "material"].some((term) =>
          lower(`${card.title} ${card.description}`).includes(term),
        ),
      );

      const aiCards = source.filter((card) =>
        ["ai", "copilot", "assistant", "chat", "agent"].some((term) =>
          lower(`${card.title} ${card.description}`).includes(term),
        ),
      );

      const devCards = source.filter((card) =>
        ["git", "lint", "format", "docker", "test", "debug", "typescript", "python"].some((term) =>
          lower(`${card.title} ${card.description}`).includes(term),
        ),
      );

      return [
        {
          eyebrow: "Featured",
          title: "Curated extensions",
          cards: source.slice(0, 12),
        },
        {
          eyebrow: "Atmosphere",
          title: "Themes and visual polish",
          cards: themeCards.length ? themeCards.slice(0, 12) : source.slice(0, 8),
        },
        {
          eyebrow: "Velocity",
          title: "AI and productivity",
          cards: aiCards.length ? aiCards.slice(0, 12) : source.slice(2, 10),
        },
        {
          eyebrow: "Craft",
          title: "Developer workflow",
          cards: devCards.length ? devCards.slice(0, 12) : source.slice(4, 12),
        },
      ];
    }

    /**
     * Renders one extension card.
     *
     * @param {{ title: string, description: string, href: string, image: string, publisher: string }} card Card.
     * @param {number} index Card index.
     * @returns {string} HTML.
     */
    function renderCard(card, index) {
      const initials = card.title
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("");

      return `
        <a class="vsmph-card" href="${escapeHtml(card.href)}">
          <div class="vsmph-card-glow vsmph-glow-${index % 5}"></div>
          <div class="vsmph-icon">
            ${
              card.image
                ? `<img src="${escapeHtml(card.image)}" alt="">`
                : `<span>${escapeHtml(initials || "VS")}</span>`
            }
          </div>
          <div class="vsmph-card-body">
            <div class="vsmph-card-title">${escapeHtml(card.title)}</div>
            ${card.publisher ? `<div class="vsmph-card-publisher">${escapeHtml(card.publisher)}</div>` : ""}
            <p>${escapeHtml(card.description)}</p>
          </div>
          <div class="vsmph-card-footer">
            <span>View extension</span>
            <span>↗</span>
          </div>
        </a>
      `;
    }

    /**
     * Renders a carousel section.
     *
     * @param {{ title: string, eyebrow: string, cards: Array<{ title: string, description: string, href: string, image: string, publisher: string }> }} section Section.
     * @param {number} index Section index.
     * @returns {string} HTML.
     */
    function renderSection(section, index) {
      return `
        <section class="vsmph-section">
          <div class="vsmph-section-head">
            <div>
              <div class="vsmph-eyebrow">${escapeHtml(section.eyebrow)}</div>
              <h2>${escapeHtml(section.title)}</h2>
            </div>
            <a class="vsmph-section-link" href="https://marketplace.visualstudio.com/search?target=VSCode&sortBy=Installs">
              Explore
            </a>
          </div>
          <div class="vsmph-carousel" data-carousel="${index}">
            ${section.cards.map(renderCard).join("")}
          </div>
        </section>
      `;
    }

    /**
     * Installs the modern homepage CSS.
     *
     * @returns {void}
     */
    function installStyles() {
      if (document.querySelector("#vsmp-home-style")) return;

      const style = document.createElement("style");
      style.id = "vsmp-home-style";
      style.textContent = `
        :root {
          color-scheme: dark;
          --vsmph-bg: #07070a;
          --vsmph-panel: rgba(18,18,22,.78);
          --vsmph-panel-strong: rgba(26,26,32,.9);
          --vsmph-text: #fafafa;
          --vsmph-muted: #a1a1aa;
          --vsmph-soft: #71717a;
          --vsmph-border: rgba(255,255,255,.12);
          --vsmph-border-strong: rgba(255,255,255,.22);
          --vsmph-radius: 24px;
        }

        html.vsmph-on,
        html.vsmph-on body {
          margin: 0 !important;
          min-width: 0 !important;
          width: 100% !important;
          overflow-x: hidden !important;
          background: var(--vsmph-bg) !important;
          color: var(--vsmph-text) !important;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }

        html.vsmph-on body > *:not(#vsmp-home) {
          display: none !important;
        }

        #vsmp-home,
        #vsmp-home * {
          box-sizing: border-box !important;
        }

        #vsmp-home {
          position: relative !important;
          isolation: isolate !important;
          min-height: 100vh !important;
          padding: 14px 14px 80px !important;
          background:
            radial-gradient(circle at 8% 2%, rgba(96,165,250,.34), transparent 340px),
            radial-gradient(circle at 92% 0%, rgba(168,85,247,.28), transparent 320px),
            radial-gradient(circle at 50% 42%, rgba(34,197,94,.12), transparent 460px),
            linear-gradient(180deg, #09090b 0%, #07070a 44%, #050506 100%) !important;
        }

        #vsmp-home::before {
          content: "" !important;
          position: fixed !important;
          inset: 0 !important;
          pointer-events: none !important;
          z-index: -1 !important;
          opacity: .42 !important;
          background-image:
            linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px) !important;
          background-size: 38px 38px !important;
          mask-image: radial-gradient(circle at top, black, transparent 76%) !important;
        }

        #vsmp-home::after {
          content: "" !important;
          position: fixed !important;
          inset: 0 !important;
          pointer-events: none !important;
          z-index: -1 !important;
          opacity: .16 !important;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E") !important;
        }

        .vsmph-shell {
          width: min(100%, 1180px) !important;
          margin: 0 auto !important;
        }

        .vsmph-nav {
          position: sticky !important;
          top: 0 !important;
          z-index: 20 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 12px !important;
          margin: -14px -14px 16px !important;
          padding: calc(12px + env(safe-area-inset-top, 0px)) 14px 12px !important;
          border-bottom: 1px solid var(--vsmph-border) !important;
          background: rgba(7,7,10,.74) !important;
          backdrop-filter: blur(22px) saturate(150%) !important;
        }

        .vsmph-brand {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          min-width: 0 !important;
          color: var(--vsmph-text) !important;
          font-weight: 900 !important;
          letter-spacing: -.03em !important;
        }

        .vsmph-brand-mark {
          width: 34px !important;
          height: 34px !important;
          display: grid !important;
          place-items: center !important;
          border-radius: 12px !important;
          background:
            linear-gradient(135deg, rgba(255,255,255,.95), rgba(255,255,255,.68)) !important;
          color: #09090b !important;
          font-weight: 950 !important;
          box-shadow: 0 18px 40px rgba(0,0,0,.35) !important;
        }

        .vsmph-nav-actions {
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
        }

        .vsmph-nav-link {
          padding: 9px 11px !important;
          border-radius: 999px !important;
          border: 1px solid var(--vsmph-border) !important;
          color: var(--vsmph-text) !important;
          background: rgba(255,255,255,.06) !important;
          text-decoration: none !important;
          font-size: 12px !important;
          font-weight: 850 !important;
        }

        .vsmph-hero {
          position: relative !important;
          overflow: hidden !important;
          border: 1px solid var(--vsmph-border-strong) !important;
          border-radius: 32px !important;
          padding: clamp(24px, 7vw, 72px) !important;
          background:
            linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.04) 40%, rgba(255,255,255,.08)),
            radial-gradient(circle at 10% 20%, rgba(59,130,246,.36), transparent 260px),
            radial-gradient(circle at 86% 12%, rgba(168,85,247,.3), transparent 300px),
            rgba(18,18,22,.78) !important;
          box-shadow: 0 34px 110px rgba(0,0,0,.58) !important;
          backdrop-filter: blur(24px) saturate(160%) !important;
        }

        .vsmph-hero::before {
          content: "" !important;
          position: absolute !important;
          inset: -1px !important;
          pointer-events: none !important;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent) !important;
          transform: translateX(-70%) rotate(8deg) !important;
        }

        .vsmph-kicker {
          display: inline-flex !important;
          align-items: center !important;
          gap: 8px !important;
          margin-bottom: 18px !important;
          padding: 7px 10px !important;
          border-radius: 999px !important;
          border: 1px solid var(--vsmph-border) !important;
          background: rgba(255,255,255,.07) !important;
          color: #e4e4e7 !important;
          font-size: 12px !important;
          font-weight: 850 !important;
        }

        .vsmph-kicker-dot {
          width: 8px !important;
          height: 8px !important;
          border-radius: 999px !important;
          background: #fafafa !important;
          box-shadow: 0 0 24px rgba(255,255,255,.7) !important;
        }

        .vsmph-title {
          max-width: 880px !important;
          margin: 0 !important;
          color: var(--vsmph-text) !important;
          font-size: clamp(42px, 14vw, 104px) !important;
          line-height: .86 !important;
          letter-spacing: -.085em !important;
          font-weight: 950 !important;
        }

        .vsmph-title span {
          display: inline-block !important;
          color: transparent !important;
          background: linear-gradient(90deg, #fafafa, #a1a1aa, #f4f4f5) !important;
          -webkit-background-clip: text !important;
          background-clip: text !important;
        }

        .vsmph-subtitle {
          max-width: 680px !important;
          margin: 20px 0 0 !important;
          color: #d4d4d8 !important;
          font-size: clamp(15px, 4vw, 20px) !important;
          line-height: 1.65 !important;
        }

        .vsmph-search {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          width: min(100%, 680px) !important;
          margin-top: 24px !important;
          padding: 10px !important;
          border-radius: 22px !important;
          border: 1px solid var(--vsmph-border-strong) !important;
          background: rgba(9,9,11,.72) !important;
        }

        .vsmph-search input {
          flex: 1 !important;
          min-width: 0 !important;
          height: 46px !important;
          border: 0 !important;
          outline: 0 !important;
          background: transparent !important;
          color: var(--vsmph-text) !important;
          font-size: 15px !important;
        }

        .vsmph-search button {
          flex: 0 0 auto !important;
          height: 46px !important;
          padding: 0 16px !important;
          border: 0 !important;
          border-radius: 16px !important;
          background: #fafafa !important;
          color: #09090b !important;
          font-weight: 950 !important;
        }

        .vsmph-quick {
          display: flex !important;
          gap: 8px !important;
          overflow-x: auto !important;
          margin: 14px -4px 0 !important;
          padding: 0 4px 6px !important;
          scrollbar-width: none !important;
        }

        .vsmph-quick a {
          flex: 0 0 auto !important;
          padding: 8px 11px !important;
          border-radius: 999px !important;
          border: 1px solid var(--vsmph-border) !important;
          background: rgba(255,255,255,.06) !important;
          color: #e4e4e7 !important;
          text-decoration: none !important;
          font-size: 12px !important;
          font-weight: 850 !important;
        }

        .vsmph-section {
          margin-top: 28px !important;
        }

        .vsmph-section-head {
          display: flex !important;
          align-items: end !important;
          justify-content: space-between !important;
          gap: 16px !important;
          margin-bottom: 12px !important;
        }

        .vsmph-eyebrow {
          color: var(--vsmph-muted) !important;
          text-transform: uppercase !important;
          letter-spacing: .13em !important;
          font-size: 11px !important;
          font-weight: 950 !important;
          margin-bottom: 6px !important;
        }

        .vsmph-section h2 {
          margin: 0 !important;
          color: var(--vsmph-text) !important;
          font-size: clamp(25px, 7vw, 44px) !important;
          line-height: .96 !important;
          letter-spacing: -.055em !important;
          font-weight: 950 !important;
        }

        .vsmph-section-link {
          flex: 0 0 auto !important;
          padding: 9px 12px !important;
          border-radius: 999px !important;
          border: 1px solid var(--vsmph-border) !important;
          background: rgba(255,255,255,.06) !important;
          color: #fafafa !important;
          text-decoration: none !important;
          font-size: 12px !important;
          font-weight: 900 !important;
        }

        .vsmph-carousel {
          display: grid !important;
          grid-auto-flow: column !important;
          grid-auto-columns: minmax(250px, 31%) !important;
          gap: 14px !important;
          overflow-x: auto !important;
          overscroll-behavior-x: contain !important;
          scroll-snap-type: x mandatory !important;
          padding: 3px 2px 18px !important;
          scrollbar-width: none !important;
        }

        .vsmph-carousel::-webkit-scrollbar,
        .vsmph-quick::-webkit-scrollbar {
          display: none !important;
        }

        .vsmph-card {
          position: relative !important;
          scroll-snap-align: start !important;
          min-height: 270px !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          padding: 16px !important;
          border-radius: 26px !important;
          border: 1px solid var(--vsmph-border) !important;
          background:
            linear-gradient(180deg, rgba(255,255,255,.095), rgba(255,255,255,.035)),
            rgba(18,18,22,.88) !important;
          color: var(--vsmph-text) !important;
          text-decoration: none !important;
          box-shadow: 0 24px 70px rgba(0,0,0,.38) !important;
          backdrop-filter: blur(18px) saturate(145%) !important;
        }

        .vsmph-card-glow {
          position: absolute !important;
          inset: auto -40px -70px auto !important;
          width: 160px !important;
          height: 160px !important;
          border-radius: 999px !important;
          filter: blur(8px) !important;
          opacity: .34 !important;
          pointer-events: none !important;
        }

        .vsmph-glow-0 { background: #60a5fa !important; }
        .vsmph-glow-1 { background: #a78bfa !important; }
        .vsmph-glow-2 { background: #34d399 !important; }
        .vsmph-glow-3 { background: #f472b6 !important; }
        .vsmph-glow-4 { background: #fbbf24 !important; }

        .vsmph-icon {
          width: 58px !important;
          height: 58px !important;
          display: grid !important;
          place-items: center !important;
          overflow: hidden !important;
          border-radius: 18px !important;
          border: 1px solid var(--vsmph-border-strong) !important;
          background:
            linear-gradient(135deg, rgba(255,255,255,.95), rgba(255,255,255,.64)) !important;
          color: #09090b !important;
          font-weight: 950 !important;
          box-shadow: 0 14px 34px rgba(0,0,0,.35) !important;
        }

        .vsmph-icon img {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }

        .vsmph-card-body {
          position: relative !important;
          z-index: 1 !important;
          margin-top: 18px !important;
        }

        .vsmph-card-title {
          color: var(--vsmph-text) !important;
          font-size: 22px !important;
          line-height: 1.02 !important;
          letter-spacing: -.045em !important;
          font-weight: 950 !important;
        }

        .vsmph-card-publisher {
          margin-top: 6px !important;
          color: var(--vsmph-muted) !important;
          font-size: 12px !important;
          font-weight: 800 !important;
        }

        .vsmph-card p {
          margin: 12px 0 0 !important;
          color: #d4d4d8 !important;
          font-size: 13.5px !important;
          line-height: 1.55 !important;
        }

        .vsmph-card-footer {
          position: relative !important;
          z-index: 1 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 12px !important;
          margin-top: 22px !important;
          padding-top: 14px !important;
          border-top: 1px solid var(--vsmph-border) !important;
          color: #fafafa !important;
          font-size: 12px !important;
          font-weight: 900 !important;
        }

        .vsmph-footer {
          margin-top: 34px !important;
          padding: 20px !important;
          border: 1px solid var(--vsmph-border) !important;
          border-radius: 28px !important;
          background: rgba(255,255,255,.045) !important;
          color: var(--vsmph-muted) !important;
          font-size: 13px !important;
          line-height: 1.6 !important;
        }

        @media (max-width: 640px) {
          #vsmp-home {
            padding-inline: 12px !important;
          }

          .vsmph-carousel {
            grid-auto-columns: minmax(78vw, 78vw) !important;
          }

          .vsmph-hero {
            border-radius: 28px !important;
            padding: 24px !important;
          }

          .vsmph-search {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .vsmph-search button {
            width: 100% !important;
          }
        }
      `;

      document.documentElement.appendChild(style);
    }

    /**
     * Executes a Marketplace search from the custom hero form.
     *
     * @param {Event} event Submit event.
     * @returns {void}
     */
    function handleSearch(event) {
      event.preventDefault();

      const input = document.querySelector("#vsmph-search-input");
      const query = input?.value?.trim();

      if (!query) return;

      location.href = `https://marketplace.visualstudio.com/search?target=VSCode&term=${encodeURIComponent(
        query,
      )}&sortBy=Installs`;
    }

    /**
     * Builds the replacement homepage.
     *
     * @returns {void}
     */
    function buildHome() {
      if (document.querySelector("#vsmp-home")) return;

      const cards = extractCards();
      const sections = createSections(cards);

      const root = document.createElement("main");
      root.id = "vsmp-home";

      root.innerHTML = `
        <nav class="vsmph-nav">
          <div class="vsmph-brand">
            <div class="vsmph-brand-mark">VS</div>
            <span>Marketplace</span>
          </div>
          <div class="vsmph-nav-actions">
            <a class="vsmph-nav-link" href="https://marketplace.visualstudio.com/search?target=VSCode&sortBy=Installs">Popular</a>
            <a class="vsmph-nav-link" href="https://marketplace.visualstudio.com/search?target=VSCode&category=Themes&sortBy=Installs">Themes</a>
          </div>
        </nav>

        <div class="vsmph-shell">
          <section class="vsmph-hero">
            <div class="vsmph-kicker">
              <span class="vsmph-kicker-dot"></span>
              <span>Visual Studio Marketplace</span>
            </div>

            <h1 class="vsmph-title">
              Build your editor into a <span>studio.</span>
            </h1>

            <p class="vsmph-subtitle">
              Discover extensions, themes, AI tools, formatters and workflow upgrades in a cleaner, cinematic Marketplace homepage.
            </p>

            <form class="vsmph-search" id="vsmph-search-form">
              <input id="vsmph-search-input" type="search" placeholder="Search extensions, themes, GitHub tools..." autocomplete="off">
              <button type="submit">Search</button>
            </form>

            <div class="vsmph-quick">
              <a href="https://marketplace.visualstudio.com/search?target=VSCode&term=github&sortBy=Installs">GitHub</a>
              <a href="https://marketplace.visualstudio.com/search?target=VSCode&term=typescript&sortBy=Installs">TypeScript</a>
              <a href="https://marketplace.visualstudio.com/search?target=VSCode&term=python&sortBy=Installs">Python</a>
              <a href="https://marketplace.visualstudio.com/search?target=VSCode&term=formatter&sortBy=Installs">Formatters</a>
              <a href="https://marketplace.visualstudio.com/search?target=VSCode&term=AI&sortBy=Installs">AI</a>
              <a href="https://marketplace.visualstudio.com/search?target=VSCode&category=Themes&sortBy=Installs">Themes</a>
            </div>
          </section>

          ${sections.map(renderSection).join("")}

          <footer class="vsmph-footer">
            Premium mobile-first Marketplace skin. Original content remains untouched, only visually rebuilt in this page.
          </footer>
        </div>
      `;

      document.body.appendChild(root);
      document.documentElement.classList.add("vsmph-on");

      document.querySelector("#vsmph-search-form")?.addEventListener("submit", handleSearch);

      debug("Homepage mounted", { cards: cards.length });
    }

    /**
     * Retries until the Marketplace homepage has rendered enough content.
     *
     * @returns {void}
     */
    function tick() {
      attempts += 1;
      buildHome();

      if (document.querySelector("#vsmp-home") || attempts >= CONFIG.maxAttempts) {
        clearInterval(timer);
      }
    }

    installStyles();

    const timer = setInterval(tick, CONFIG.retryMs);

    document.addEventListener("DOMContentLoaded", tick, { once: true });
    window.addEventListener("load", tick, { once: true });
  })();