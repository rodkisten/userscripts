// ==UserScript==
// @name         Rod / Sites / VS Code Marketplace Reader
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile reader for VS Code Marketplace item pages.
// @author       Rod
// @match        https://marketplace.visualstudio.com/items*
// @match        https://marketplace.visualstudio.com/*/items*
// @run-at       document-idle
// @weight       360
// @grant        none
// @noframes
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/typescript.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/bash.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/go.min.js
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = {
    debug: false,
    maxAttempts: 80,
    retryMs: 500,
  };

  let attempts = 0;

  /**
   * Writes debug logs when enabled.
   *
   * @param {...unknown} args Values to log.
   * @returns {void}
   */
  function debug(...args) {
    if (CONFIG.debug) console.debug("[VSMP Reader]", ...args);
  }

  /**
   * Escapes HTML text for safe rendering.
   *
   * @param {string} value Raw text.
   * @returns {string} Escaped text.
   */
  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /**
   * Checks whether a href points to GitHub.
   *
   * @param {string} href Link href.
   * @returns {boolean} Whether the URL is GitHub.
   */
  function isGithub(href) {
    try {
      return new URL(href, location.href).hostname === "github.com";
    } catch {
      return false;
    }
  }

  /**
   * Converts any GitHub URL into a repo root URL when possible.
   *
   * @param {string} href GitHub URL.
   * @returns {string} Repository URL.
   */
  function normalizeGithubRepo(href) {
    try {
      const url = new URL(href, location.href);
      const parts = url.pathname.split("/").filter(Boolean);

      if (url.hostname === "github.com" && parts.length >= 2) {
        return `https://github.com/${parts[0]}/${parts[1]}`;
      }

      return url.href;
    } catch {
      return href;
    }
  }

  /**
   * Creates a short repo label from a GitHub URL.
   *
   * @param {string} href Repository URL.
   * @returns {string} Label.
   */
  function getRepoLabel(href) {
    try {
      const url = new URL(href, location.href);
      const parts = url.pathname.split("/").filter(Boolean);
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "GitHub repository";
    } catch {
      return "GitHub repository";
    }
  }

  /**
   * Finds the best repository link on the page.
   *
   * @returns {{ url: string, label: string } | null} Repository data.
   */
  function findRepository() {
    const links = [...document.querySelectorAll("a[href]")]
      .map((anchor) => {
        const href = anchor.getAttribute("href") || "";
        if (!isGithub(href)) return null;

        const text = anchor.textContent?.trim().toLowerCase() || "";
        const url = normalizeGithubRepo(href);

        let score = 0;
        if (text.includes("repository")) score += 40;
        if (text.includes("github")) score += 30;
        if (text.includes("source")) score += 20;
        if (href.includes("/issues")) score -= 30;
        if (href.includes("/pull")) score -= 30;
        if (href.includes("/releases")) score -= 15;

        return { url, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const best = links[0];
    if (!best) return null;

    return {
      url: best.url,
      label: getRepoLabel(best.url),
    };
  }

  /**
   * Finds the extension title.
   *
   * @returns {string} Extension title.
   */
  function findTitle() {
    const candidates = [
      document.querySelector("h1"),
      document.querySelector(".ux-item-name"),
      document.querySelector("[class*='item-title']"),
      document.querySelector("[class*='ItemTitle']"),
      document.querySelector("title"),
    ];

    for (const item of candidates) {
      const text = item?.textContent?.trim();
      if (text && text.length > 2) return text.replace(" - Visual Studio Marketplace", "");
    }

    return "VS Code Extension";
  }

  /**
   * Finds publisher text.
   *
   * @returns {string} Publisher.
   */
  function findPublisher() {
    const text = document.body.innerText;
    const match = text.match(/Published by\s+([^\n]+)/i);
    if (match?.[1]) return match[1].trim();

    const candidate = document.querySelector("[class*='publisher'], [class*='Publisher']");
    return candidate?.textContent?.trim() || "";
  }

  /**
   * Finds a useful short description.
   *
   * @returns {string} Description.
   */
  function findDescription() {
    const meta = document.querySelector("meta[name='description']");
    const content = meta?.getAttribute("content")?.trim();
    if (content) return content;

    const candidates = [...document.querySelectorAll("p")]
      .map((p) => p.textContent?.trim() || "")
      .filter((text) => text.length > 30 && text.length < 260);

    return candidates[0] || "";
  }

  /**
   * Finds the most likely README container.
   *
   * @returns {HTMLElement | null} README element.
   */
  function findReadme() {
    const selectors = [
      ".markdown",
      ".markdown-body",
      ".readme",
      ".overview",
      "[class*='readme']",
      "[class*='Readme']",
      "[class*='markdown']",
      "[class*='Markdown']",
    ];

    for (const selector of selectors) {
      const elements = [...document.querySelectorAll(selector)];
      const best = elements
        .filter((element) => element.innerText.trim().length > 300)
        .sort((a, b) => b.innerText.length - a.innerText.length)[0];

      if (best) return best;
    }

    const largeBlocks = [...document.querySelectorAll("main, article, section, div")]
      .filter((element) => element.innerText.trim().length > 800)
      .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width);

    return largeBlocks[0] || null;
  }

  /**
   * Cleans cloned README content.
   *
   * @param {HTMLElement} readme README clone.
   * @returns {HTMLElement} Cleaned README clone.
   */
  function cleanReadme(readme) {
    const clone = readme.cloneNode(true);

    clone.querySelectorAll("script, style, iframe").forEach((node) => node.remove());

    clone.querySelectorAll("*").forEach((node) => {
      node.removeAttribute("style");
      node.removeAttribute("width");
      node.removeAttribute("height");
      node.removeAttribute("align");
    });

    clone.querySelectorAll("a[href]").forEach((anchor) => {
      const href = anchor.getAttribute("href") || "";
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";

      if (isGithub(href)) {
        anchor.classList.add("vsmp-github-pill");
      }
    });

    return clone;
  }

  /**
   * Extracts small metadata chips from visible page text.
   *
   * @returns {string[]} Metadata chips.
   */
  function findChips() {
    const text = document.body.innerText;
    const chips = [];

    const installs = text.match(/([\d,.]+\s*(?:K|M)?\s*installs?)/i);
    const rating = text.match(/([\d.]+)\s*(?:\(\d+\))?\s*Rating/i);
    const version = text.match(/Version\s+([^\n]+)/i);
    const updated = text.match(/Last updated\s+([^\n]+)/i);

    if (installs?.[1]) chips.push(installs[1]);
    if (rating?.[1]) chips.push(`${rating[1]} rating`);
    if (version?.[1]) chips.push(`v${version[1].trim()}`);
    if (updated?.[1]) chips.push(`Updated ${updated[1].trim()}`);

    return [...new Set(chips)].slice(0, 6);
  }

  /**
   * Installs the reader CSS.
   *
   * @returns {void}
   */
  function installStyles() {
    const style = document.createElement("style");
    style.id = "vsmp-reader-style";
    style.textContent = `
      :root {
        color-scheme: dark;
        --vsmp-bg: #09090b;
        --vsmp-panel: #111113;
        --vsmp-panel-2: #18181b;
        --vsmp-border: rgba(255,255,255,.12);
        --vsmp-border-2: rgba(255,255,255,.2);
        --vsmp-text: #fafafa;
        --vsmp-muted: #a1a1aa;
        --vsmp-soft: #71717a;
      }

      html.vsmp-reader-on,
      html.vsmp-reader-on body {
        margin: 0 !important;
        width: 100% !important;
        min-width: 0 !important;
        overflow-x: hidden !important;
        background:
          radial-gradient(circle at 20% -10%, rgba(82,82,91,.42), transparent 340px),
          radial-gradient(circle at 100% 10%, rgba(39,39,42,.55), transparent 260px),
          var(--vsmp-bg) !important;
        color: var(--vsmp-text) !important;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      html.vsmp-reader-on body > *:not(#vsmp-reader) {
        display: none !important;
      }

      #vsmp-reader,
      #vsmp-reader * {
        box-sizing: border-box !important;
        max-width: 100% !important;
      }

      #vsmp-reader {
        display: block !important;
        width: 100% !important;
        min-height: 100vh !important;
        padding: 12px 12px 92px !important;
      }

      .vsmp-shell {
        width: min(100%, 760px) !important;
        margin: 0 auto !important;
      }

      .vsmp-topbar {
        position: sticky !important;
        top: 0 !important;
        z-index: 50 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 10px !important;
        margin: -12px -12px 12px !important;
        padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 10px !important;
        background: rgba(9,9,11,.86) !important;
        border-bottom: 1px solid var(--vsmp-border) !important;
        backdrop-filter: blur(18px) saturate(140%) !important;
      }

      .vsmp-brand {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        min-width: 0 !important;
        color: var(--vsmp-text) !important;
        font-size: 13px !important;
        font-weight: 800 !important;
      }

      .vsmp-dot {
        width: 10px !important;
        height: 10px !important;
        border-radius: 999px !important;
        background: #fafafa !important;
        box-shadow: 0 0 24px rgba(255,255,255,.45) !important;
      }

      .vsmp-open-original {
        flex: 0 0 auto !important;
        padding: 8px 10px !important;
        border: 1px solid var(--vsmp-border) !important;
        border-radius: 999px !important;
        color: var(--vsmp-text) !important;
        text-decoration: none !important;
        font-size: 12px !important;
        font-weight: 800 !important;
        background: rgba(255,255,255,.06) !important;
      }

      .vsmp-hero {
        border: 1px solid var(--vsmp-border) !important;
        border-radius: 26px !important;
        padding: 20px !important;
        background:
          linear-gradient(180deg, rgba(39,39,42,.95), rgba(9,9,11,.94)) !important;
        box-shadow: 0 24px 90px rgba(0,0,0,.5) !important;
      }

      .vsmp-kicker {
        color: var(--vsmp-muted) !important;
        text-transform: uppercase !important;
        letter-spacing: .12em !important;
        font-size: 11px !important;
        font-weight: 900 !important;
        margin-bottom: 10px !important;
      }

      .vsmp-title {
        margin: 0 !important;
        color: var(--vsmp-text) !important;
        font-size: clamp(30px, 11vw, 54px) !important;
        line-height: .95 !important;
        letter-spacing: -.06em !important;
        font-weight: 950 !important;
      }

      .vsmp-publisher {
        margin: 12px 0 0 !important;
        color: var(--vsmp-muted) !important;
        font-size: 14px !important;
        font-weight: 700 !important;
      }

      .vsmp-description {
        margin: 16px 0 0 !important;
        color: #e4e4e7 !important;
        font-size: 15px !important;
        line-height: 1.65 !important;
      }

      .vsmp-chip-row {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 8px !important;
        margin-top: 16px !important;
      }

      .vsmp-chip {
        padding: 7px 10px !important;
        border-radius: 999px !important;
        border: 1px solid var(--vsmp-border) !important;
        background: rgba(255,255,255,.06) !important;
        color: #e4e4e7 !important;
        font-size: 12px !important;
        font-weight: 800 !important;
      }

      .vsmp-repo-card {
        margin-top: 12px !important;
        padding: 10px !important;
        border-radius: 22px !important;
        border: 1px solid var(--vsmp-border-2) !important;
        background: rgba(24,24,27,.92) !important;
      }

      .vsmp-repo-card a {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        min-height: 50px !important;
        padding: 0 13px !important;
        border-radius: 15px !important;
        background: #fafafa !important;
        color: #09090b !important;
        text-decoration: none !important;
        font-weight: 950 !important;
      }

      .vsmp-repo-badge {
        flex: 0 0 auto !important;
        padding: 4px 8px !important;
        border-radius: 999px !important;
        background: #09090b !important;
        color: #fafafa !important;
        font-size: 11px !important;
      }

      .vsmp-repo-label {
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      .vsmp-readme {
        margin-top: 14px !important;
        padding: 20px !important;
        border-radius: 26px !important;
        border: 1px solid var(--vsmp-border) !important;
        background: rgba(17,17,19,.97) !important;
        box-shadow: 0 18px 70px rgba(0,0,0,.42) !important;
        overflow: hidden !important;
      }

      .vsmp-readme > *:first-child {
        margin-top: 0 !important;
      }

      .vsmp-readme h1,
      .vsmp-readme h2,
      .vsmp-readme h3,
      .vsmp-readme h4 {
        color: var(--vsmp-text) !important;
        line-height: 1.08 !important;
        letter-spacing: -.045em !important;
        margin: 28px 0 12px !important;
      }

      .vsmp-readme h1 {
        font-size: clamp(28px, 9vw, 44px) !important;
      }

      .vsmp-readme h2 {
        font-size: clamp(23px, 7vw, 34px) !important;
        padding-bottom: 10px !important;
        border-bottom: 1px solid var(--vsmp-border) !important;
      }

      .vsmp-readme h3 {
        font-size: clamp(19px, 5.8vw, 26px) !important;
      }

      .vsmp-readme p,
      .vsmp-readme li,
      .vsmp-readme td,
      .vsmp-readme th {
        color: #e4e4e7 !important;
        font-size: 15.5px !important;
        line-height: 1.75 !important;
      }

      .vsmp-readme ul,
      .vsmp-readme ol {
        padding-left: 22px !important;
      }

      .vsmp-readme a {
        color: #fafafa !important;
        text-underline-offset: 3px !important;
      }

      .vsmp-readme img {
        display: block !important;
        width: auto !important;
        max-width: 100% !important;
        height: auto !important;
        margin: 14px auto !important;
        border-radius: 16px !important;
        border: 1px solid var(--vsmp-border) !important;
      }

      .vsmp-readme pre {
        width: 100% !important;
        overflow-x: auto !important;
        margin: 14px 0 !important;
        padding: 14px !important;
        border-radius: 16px !important;
        border: 1px solid var(--vsmp-border) !important;
        background: #09090b !important;
        color: #fafafa !important;
        white-space: pre !important;
      }

      .vsmp-readme code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
        font-size: 13px !important;
      }

      .vsmp-readme p code,
      .vsmp-readme li code {
        padding: 2px 6px !important;
        border-radius: 8px !important;
        background: rgba(255,255,255,.08) !important;
        color: #fafafa !important;
        word-break: break-word !important;
      }

      .vsmp-readme table {
        display: block !important;
        width: 100% !important;
        overflow-x: auto !important;
        border: 1px solid var(--vsmp-border) !important;
        border-radius: 16px !important;
        border-spacing: 0 !important;
      }

      .vsmp-github-pill {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        width: fit-content !important;
        margin: 3px 4px 3px 0 !important;
        padding: 6px 10px !important;
        border-radius: 999px !important;
        border: 1px solid var(--vsmp-border-2) !important;
        background: rgba(250,250,250,.1) !important;
        color: #fafafa !important;
        font-weight: 850 !important;
        text-decoration: none !important;
      }

      .vsmp-github-pill::before {
        content: "GitHub";
        padding: 2px 7px !important;
        border-radius: 999px !important;
        background: #fafafa !important;
        color: #09090b !important;
        font-size: 11px !important;
        font-weight: 950 !important;
      }

      .vsmp-floating-repo {
        position: fixed !important;
        left: max(10px, env(safe-area-inset-left, 0px)) !important;
        right: max(10px, env(safe-area-inset-right, 0px)) !important;
        bottom: calc(10px + env(safe-area-inset-bottom, 0px)) !important;
        z-index: 2147483647 !important;
        padding: 10px !important;
        border-radius: 20px !important;
        border: 1px solid var(--vsmp-border-2) !important;
        background: rgba(9,9,11,.9) !important;
        box-shadow: 0 24px 70px rgba(0,0,0,.68) !important;
        backdrop-filter: blur(22px) saturate(160%) !important;
      }

      .vsmp-floating-repo a {
        display: flex !important;
        align-items: center !important;
        gap: 9px !important;
        min-height: 48px !important;
        padding: 0 12px !important;
        border-radius: 14px !important;
        background: #fafafa !important;
        color: #09090b !important;
        text-decoration: none !important;
        font-weight: 950 !important;
      }

      @media (min-width: 900px) {
        #vsmp-reader {
          padding-top: 18px !important;
        }

        .vsmp-shell {
          width: min(100%, 900px) !important;
        }

        .vsmp-floating-repo {
          left: auto !important;
          width: 390px !important;
        }
      }
      
      pre code.hljs{display:block;overflow-x:auto;padding:1em}code.hljs{padding:3px 5px}/*!
  Theme: GitHub Dark
  Description: Dark theme as seen on github.com
  Author: github.com
  Maintainer: @Hirse
  Updated: 2021-05-15

  Outdated base version: https://github.com/primer/github-syntax-dark
  Current colors taken from GitHub's CSS
*/.hljs{color:#c9d1d9;background:#0d1117}.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#79c0ff}.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#a5d6ff}.hljs-built_in,.hljs-symbol{color:#ffa657}.hljs-code,.hljs-comment,.hljs-formula{color:#8b949e}.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#7ee787}.hljs-subst{color:#c9d1d9}.hljs-section{color:#1f6feb;font-weight:700}.hljs-bullet{color:#f2cc60}.hljs-emphasis{color:#c9d1d9;font-style:italic}.hljs-strong{color:#c9d1d9;font-weight:700}.hljs-addition{color:#aff5b4;background-color:#033a16}.hljs-deletion{color:#ffdcd7;background-color:#67060c}
    `;

    document.documentElement.appendChild(style);
  }

  /**
   * Builds the replacement reader UI.
   *
   * @returns {void}
   */
  function buildReader() {
    if (document.querySelector("#vsmp-reader")) return;

    const readme = findReadme();
    if (!readme) {
      debug("README not found yet");
      return;
    }

    const repo = findRepository();
    const title = findTitle();
    const publisher = findPublisher();
    const description = findDescription();
    const chips = findChips();
    const cleanedReadme = cleanReadme(readme);

    const root = document.createElement("main");
    root.id = "vsmp-reader";

    root.innerHTML = `
      <div class="vsmp-topbar">
        <div class="vsmp-brand">
          <span class="vsmp-dot"></span>
          <span>VS Marketplace Reader</span>
        </div>
        <a class="vsmp-open-original" href="${location.href}">Original</a>
      </div>

      <div class="vsmp-shell">
        <section class="vsmp-hero">
          <div class="vsmp-kicker">Extension</div>
          <h1 class="vsmp-title">${escapeHtml(title)}</h1>
          ${publisher ? `<p class="vsmp-publisher">${escapeHtml(publisher)}</p>` : ""}
          ${description ? `<p class="vsmp-description">${escapeHtml(description)}</p>` : ""}
          ${
            chips.length
              ? `<div class="vsmp-chip-row">${chips
                  .map((chip) => `<span class="vsmp-chip">${escapeHtml(chip)}</span>`)
                  .join("")}</div>`
              : ""
          }
        </section>

        ${
          repo
            ? `<section class="vsmp-repo-card">
                <a href="${repo.url}" target="_blank" rel="noopener noreferrer">
                  <span class="vsmp-repo-badge">GitHub</span>
                  <span class="vsmp-repo-label">${escapeHtml(repo.label)}</span>
                  <span>↗</span>
                </a>
              </section>`
            : ""
        }

        <article class="vsmp-readme"></article>
      </div>

      ${
        repo
          ? `<aside class="vsmp-floating-repo">
              <a href="${repo.url}" target="_blank" rel="noopener noreferrer">
                <span class="vsmp-repo-badge">GitHub</span>
                <span class="vsmp-repo-label">${escapeHtml(repo.label)}</span>
                <span>↗</span>
              </a>
            </aside>`
          : ""
      }
    `;

    root.querySelector(".vsmp-readme").append(...cleanedReadme.childNodes);

    document.body.appendChild(root);
    document.documentElement.classList.add("vsmp-reader-on");

    debug("Reader mounted");
  }

  /**
   * Retries until Marketplace finishes rendering its React content.
   *
   * @returns {void}
   */
  function tick() {
    attempts += 1;
    buildReader();

    if (document.querySelector("#vsmp-reader") || attempts >= CONFIG.maxAttempts) {
      clearInterval(timer);
    }
  }
  
    function lockViewportZoom() {
    let viewport = document.querySelector("meta[name='viewport']");

    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.name = "viewport";
      document.head.appendChild(viewport);
    }

    viewport.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover",
    );
  }
  
  
  /**
 * Highlights all code blocks using highlight.js auto-detection.
 *
 * @returns {void}
 */
function highlightCodeBlocks() {
  const hljs = window.hljs;
  if (!hljs) return;

  document.querySelectorAll("pre code").forEach((code) => {
    if (code.dataset.vsmHighlighted === "true") return;

    const raw = code.textContent || "";
    const result = hljs.highlightAuto(raw);

    code.innerHTML = result.value;
    code.classList.add("hljs");
    code.dataset.vsmHighlighted = "true";
  });
}
  
  lockViewportZoom()
  installStyles();
  highlightCodeBlocks(); 
  
  const timer = setInterval(tick, CONFIG.retryMs);

  document.addEventListener("DOMContentLoaded", tick, { once: true });
  window.addEventListener("load", tick, { once: true });
})();