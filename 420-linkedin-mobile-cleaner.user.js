// ==UserScript==
// @name         Rod / Sites / LinkedIn Cleaner
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Cleaner LinkedIn mobile experience with safer post expansion and less noise.
// @author       Rod
// @match        https://www.linkedin.com/*
// @match        https://linkedin.com/*
// @run-at       document-idle
// @weight       370
// @grant        none
// @noframes
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js
// ==/UserScript==

(() => {
  "use strict";

  const DEBUG = false;

  const processed = {
    links: new WeakSet(),
    code: new WeakSet(),
    nodes: new WeakSet(),
  };

  const SELECTORS = {
    postText: [
      ".feed-shared-text",
      ".update-components-text",
      ".comments-comment-item__main-content",
      ".feed-shared-inline-show-more-text",
    ].join(","),

    postContainer: [
      ".feed-shared-update-v2",
      ".occludable-update",
      "[data-urn^='urn:li:activity']",
    ].join(","),

    seeMoreButton: [
      "button.feed-shared-inline-show-more-text__see-more-less-toggle",
      "button[aria-label*='see more' i]",
      "button[aria-label*='show more' i]",
      "button[aria-label*='ver mais' i]",
      "button[aria-label*='mais' i]",
    ].join(","),

    clutter: [
      ".msg-overlay-list-bubble",
      ".msg-overlay-conversation-bubble",
      ".feed-shared-news-module",
      ".ad-banner-container",
      ".premium-upsell-link",
      ".global-footer",
      ".feed-identity-module",
      ".right-rail",
      ".scaffold-layout__aside",
      ".scaffold-layout__sidebar",
      "[data-test-id*='premium']",
      "[class*='app-promo']",
      "[class*='app-banner']",
      "[class*='mobile-app']",
      "a[href^='linkedin://']",
      "a[href^='intent://']",
      "a[href*='apps.apple.com']",
      "a[href*='itunes.apple.com']",
      "a[href*='play.google.com']",
    ].join(","),

    jobCard: [
      ".job-card-container",
      ".jobs-search-results__list-item",
      ".jobs-job-board-list__item",
      ".scaffold-layout__list-item",
    ].join(","),
  };

  /**
   * Writes debug messages only when DEBUG is enabled.
   *
   * @param {...unknown} args Debug values.
   * @returns {void}
   */
  function log(...args) {
    if (DEBUG) console.debug("[LinkedIn Cleaner V2]", ...args);
  }

  /**
   * Runs a task without allowing LinkedIn DOM changes to break the whole script.
   *
   * @param {string} label Debug label.
   * @param {() => void} task Task to execute.
   * @returns {void}
   */
  function safe(label, task) {
    try {
      task();
    } catch (error) {
      log(label, error);
    }
  }

  /**
   * Waits until document.body exists.
   *
   * @param {() => void} callback Work to run.
   * @returns {void}
   */
  function onBody(callback) {
    if (document.body) {
      callback();
      return;
    }

    const timer = window.setInterval(() => {
      if (!document.body) return;
      window.clearInterval(timer);
      callback();
    }, 30);
  }

  /**
   * Adds a stylesheet once.
   *
   * @param {string} id Style id.
   * @param {string} css CSS text.
   * @returns {void}
   */
  function addStyle(id, css) {
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  /**
   * Loads a CSS file once.
   *
   * @param {string} id Link id.
   * @param {string} href CSS URL.
   * @returns {void}
   */
  function addCssLink(id, href) {
    if (document.getElementById(id)) return;

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.documentElement.appendChild(link);
  }

  /**
   * Installs the visual layer.
   *
   * @returns {void}
   */
  function installStyles() {
    addCssLink(
      "lc-hljs-theme",
      "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css",
    );

    addStyle(
      "lc-style-v2",
      `
      :root {
        --lc-bg: #0b0d10;
        --lc-card: #15181d;
        --lc-card-soft: #191d23;
        --lc-border: rgba(255, 255, 255, 0.09);
        --lc-text: #e7eaf0;
        --lc-muted: #a4abb6;
        --lc-link: #8ab4f8;
        --lc-code-bg: #0d1117;
      }

      html,
      body {
        background: var(--lc-bg) !important;
      }

      body {
        color: var(--lc-text) !important;
      }

      .lc-hide {
        display: none !important;
      }

      .lc-code-card {
        margin: 10px 0 !important;
        padding: 0 !important;
        border: 1px solid var(--lc-border) !important;
        border-radius: 12px !important;
        background: var(--lc-code-bg) !important;
        overflow: hidden !important;
      }

      .lc-code-card::before {
        content: "code";
        display: block;
        padding: 7px 10px;
        color: var(--lc-muted);
        background: rgba(255,255,255,0.035);
        border-bottom: 1px solid var(--lc-border);
        font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: .04em;
        text-transform: uppercase;
      }

      .lc-code-card code,
      .lc-code-card pre {
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
      }

      .lc-code-card pre {
        margin: 0 !important;
        padding: 12px !important;
        overflow-x: auto !important;
        background: transparent !important;
      }

      .lc-code-card code {
        font-size: 12.5px !important;
        line-height: 1.55 !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      }

      .lc-real-url {
        display: block !important;
        width: fit-content !important;
        max-width: 100% !important;
        margin-top: 4px !important;
        padding: 3px 7px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(138, 180, 248, 0.28) !important;
        background: rgba(138, 180, 248, 0.08) !important;
        color: var(--lc-link) !important;
        font-size: 11px !important;
        line-height: 1.35 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      .feed-shared-update-v2,
      .occludable-update,
      .jobs-search-results__list-item,
      .job-card-container {
        background: var(--lc-card) !important;
        border: 1px solid var(--lc-border) !important;
        border-radius: 14px !important;
        box-shadow: none !important;
      }

      .feed-shared-update-v2:hover,
      .jobs-search-results__list-item:hover,
      .job-card-container:hover {
        background: var(--lc-card-soft) !important;
      }

      .global-nav,
      .global-nav__content {
        background: #101318 !important;
        border-bottom: 1px solid var(--lc-border) !important;
        box-shadow: none !important;
      }

      main,
      .scaffold-layout__main,
      .scaffold-layout__content {
        max-width: 820px !important;
        margin-inline: auto !important;
      }

      aside,
      .right-rail,
      .feed-left-rail,
      .feed-identity-module,
      .global-footer {
        display: none !important;
      }

      @media (max-width: 760px) {
        main,
        .scaffold-layout__main,
        .scaffold-layout__content {
          width: 100% !important;
          max-width: 100% !important;
          padding-inline: 6px !important;
        }

        .feed-shared-update-v2,
        .occludable-update,
        .jobs-search-results__list-item,
        .job-card-container {
          border-radius: 12px !important;
          margin-inline: 0 !important;
        }
      }
      `,
    );
  }

  /**
   * Blocks LinkedIn app and store redirects.
   *
   * @returns {void}
   */
  function installNavigationGuards() {
    document.addEventListener(
      "click",
      event => {
        const target = event.target instanceof Element ? event.target : null;
        const link = target?.closest("a[href]");

        if (!link) return;

        const href = link.getAttribute("href") || "";

        if (!isAppUrl(href)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      },
      true,
    );

    const originalOpen = window.open;

    window.open = function patchedOpen(url, target, features) {
      const href = String(url || "");

      if (isAppUrl(href)) return null;

      return originalOpen.call(window, url, "_self", features);
    };
  }

  /**
   * Checks whether a URL points to the app or app stores.
   *
   * @param {string} href URL.
   * @returns {boolean} True when it should be blocked.
   */
  function isAppUrl(href) {
    return (
      href.startsWith("linkedin://") ||
      href.startsWith("intent://") ||
      href.includes("apps.apple.com") ||
      href.includes("itunes.apple.com") ||
      href.includes("play.google.com")
    );
  }

  /**
   * Removes noisy LinkedIn elements.
   *
   * @param {ParentNode} root DOM root.
   * @returns {void}
   */
  function removeClutter(root) {
    for (const node of root.querySelectorAll?.(SELECTORS.clutter) || []) {
      node.classList.add("lc-hide");
    }
  }

  /**
   * Expands posts safely.
   *
   * @param {ParentNode} root DOM root.
   * @returns {void}
   */
  function expandPosts(root) {
    for (const button of root.querySelectorAll?.(SELECTORS.seeMoreButton) || []) {
      if (!(button instanceof HTMLButtonElement)) continue;
      if (button.dataset.lcClicked === "true") continue;

      const label = `${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`;

      if (!/see more|show more|ver mais|mais/i.test(label)) continue;

      button.dataset.lcClicked = "true";
      button.click();
    }
  }

  /**
   * Hides jobs that are already applied.
   *
   * @param {ParentNode} root DOM root.
   * @returns {void}
   */
  function hideAppliedJobs(root) {
    for (const card of root.querySelectorAll?.(SELECTORS.jobCard) || []) {
      const text = normalizeText(card.textContent || "");

      if (
        /\bapplied\b/i.test(text) ||
        /candidatura enviada/i.test(text) ||
        /candidatou-se/i.test(text) ||
        /\baplicado\b/i.test(text)
      ) {
        card.classList.add("lc-hide");
      }
    }
  }

  /**
   * Normalizes whitespace.
   *
   * @param {string} text Input text.
   * @returns {string} Normalized text.
   */
  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  /**
   * Reveals real external links only inside post text, never nav/buttons/profile chrome.
   *
   * @param {ParentNode} root DOM root.
   * @returns {void}
   */
  function revealSafePostLinks(root) {
    const textBlocks = root.querySelectorAll?.(SELECTORS.postText) || [];

    for (const block of textBlocks) {
      for (const link of block.querySelectorAll("a[href]")) {
        if (processed.links.has(link)) continue;
        processed.links.add(link);

        if (!shouldRevealLink(link)) continue;

        const realUrl = resolveLinkedInRedirect(link.href);

        if (!realUrl) continue;

        link.href = realUrl;
        link.target = "_self";
        link.rel = "noopener noreferrer";

        const label = document.createElement("span");
        label.className = "lc-real-url";
        label.textContent = compactUrl(realUrl);

        link.insertAdjacentElement("afterend", label);
      }
    }
  }

  /**
   * Decides whether a link is safe to annotate.
   *
   * @param {HTMLAnchorElement} link Link element.
   * @returns {boolean} True when link can receive a visible URL label.
   */
  function shouldRevealLink(link) {
    const href = link.getAttribute("href") || "";

    if (isAppUrl(href)) return false;
    if (link.closest("button")) return false;
    if (link.closest("nav, header, footer")) return false;
    if (link.closest(".global-nav")) return false;
    if (link.closest(".comments-comment-social-bar")) return false;
    if (link.closest(".feed-shared-social-action-bar")) return false;
    if (link.querySelector(".lc-real-url")) return false;

    const realUrl = resolveLinkedInRedirect(link.href);

    if (!realUrl) return false;

    try {
      const url = new URL(realUrl);

      if (url.hostname.includes("linkedin.com")) return false;
      if (!/^https?:$/.test(url.protocol)) return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves common LinkedIn redirect links.
   *
   * @param {string} href Link URL.
   * @returns {string | null} Real URL.
   */
  function resolveLinkedInRedirect(href) {
    try {
      const url = new URL(href, location.href);

      const nested =
        url.searchParams.get("url") ||
        url.searchParams.get("target") ||
        url.searchParams.get("redirect");

      if (nested && /^https?:\/\//i.test(nested)) {
        return decodeURIComponent(nested);
      }

      if (!url.hostname.includes("linkedin.com")) {
        return url.href;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Makes URLs compact for display.
   *
   * @param {string} href URL.
   * @returns {string} Display URL.
   */
  function compactUrl(href) {
    try {
      const url = new URL(href);
      const text = `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
      return text.length > 64 ? `${text.slice(0, 61)}…` : text;
    } catch {
      return href.length > 64 ? `${href.slice(0, 61)}…` : href;
    }
  }

  /**
   * Detects and highlights code blocks inside posts.
   *
   * @param {ParentNode} root DOM root.
   * @returns {void}
   */
  function highlightPostCode(root) {
    for (const block of root.querySelectorAll?.(SELECTORS.postText) || []) {
      if (!(block instanceof HTMLElement)) continue;
      if (processed.code.has(block)) continue;

      const text = block.innerText || block.textContent || "";

      if (!looksLikeCode(text)) continue;

      processed.code.add(block);

      const codeText = extractCode(text);

      if (!codeText || codeText.length < 24) continue;

      const card = document.createElement("div");
      card.className = "lc-code-card";

      const pre = document.createElement("pre");
      const code = document.createElement("code");

      code.textContent = codeText;
      pre.appendChild(code);
      card.appendChild(pre);

      block.appendChild(card);

      if (window.hljs?.highlightElement) {
        window.hljs.highlightElement(code);
      }
    }

    for (const code of root.querySelectorAll?.("pre code, code") || []) {
      if (!(code instanceof HTMLElement)) continue;
      if (processed.code.has(code)) continue;

      processed.code.add(code);

      const pre = code.closest("pre");

      if (pre && !pre.closest(".lc-code-card")) {
        const wrapper = document.createElement("div");
        wrapper.className = "lc-code-card";
        pre.replaceWith(wrapper);
        wrapper.appendChild(pre);
      }

      if (window.hljs?.highlightElement) {
        window.hljs.highlightElement(code);
      }
    }
  }

  /**
   * Detects whether text probably contains code.
   *
   * @param {string} text Text content.
   * @returns {boolean} True when code-like.
   */
  function looksLikeCode(text) {
    const value = text.trim();

    if (value.length < 32) return false;

    return [
      /```[\s\S]+```/,
      /\b(import|export|const|let|var|function|class|return|async|await)\b/,
      /\b(interface|type|enum|implements|extends|private|public|protected)\b/,
      /=>/,
      /\{[\s\S]*[:=][\s\S]*\}/,
      /<\/?[a-z][\s\S]*>/i,
      /\bSELECT\b[\s\S]+\bFROM\b/i,
      /\bpnpm\b|\bnpm\b|\byarn\b|\bbun\b|\bgit\b|\bcurl\b/,
    ].some(pattern => pattern.test(value));
  }

  /**
   * Extracts code from fenced or code-like text.
   *
   * @param {string} text Raw text.
   * @returns {string} Code text.
   */
  function extractCode(text) {
    const fenced = text.match(/```[a-z0-9_-]*\s*([\s\S]*?)```/i);

    if (fenced?.[1]) {
      return fenced[1].trim();
    }

    const lines = text
      .split("\n")
      .map(line => line.trimEnd())
      .filter(Boolean);

    const codeLines = lines.filter(line =>
      /[{}();=<>]/.test(line) ||
      /^\s*(import|export|const|let|var|function|class|return|if|for|while|type|interface)\b/.test(line) ||
      /^\s*(pnpm|npm|yarn|bun|git|curl)\b/.test(line),
    );

    if (codeLines.length < 2) return "";

    return codeLines.join("\n");
  }

  /**
   * Processes a DOM root.
   *
   * @param {ParentNode} root DOM root.
   * @returns {void}
   */
  function process(root) {
    safe("removeClutter", () => removeClutter(root));
    safe("expandPosts", () => expandPosts(root));
    safe("hideAppliedJobs", () => hideAppliedJobs(root));
    safe("revealSafePostLinks", () => revealSafePostLinks(root));
    safe("highlightPostCode", () => highlightPostCode(root));
  }

  /**
   * Starts observing LinkedIn route and DOM changes.
   *
   * @returns {void}
   */
  function observe() {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (processed.nodes.has(node)) continue;

          processed.nodes.add(node);
          process(node);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Boots the script.
   *
   * @returns {void}
   */
  function boot() {
  
    try {
      installStyles();
    } catch {
    
    }
    installNavigationGuards();

    onBody(() => {
      process(document);
      observe();

      window.setInterval(() => {
        process(document);
      }, 2500);
    });
  }

  boot();
})();