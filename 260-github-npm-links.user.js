// ==UserScript==
// @name         Rod / GitHub / npm Links
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Adds npm/package navigation helpers on GitHub.
// @author       Rod
// @match        https://github.com/*
// @run-at       document-idle
// @weight       640
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = {
    debug: true,
    scanMs: 900,
    styleId: "rod-npm-import-links-style",
    linkedAttr: "data-rod-npm-linked",
    packageAttr: "data-rod-npm-package",
    urlAttr: "data-rod-npm-url",
    linkedClass: "rod-npm-import-link",
    lineSelectors: [
      ".react-code-text",
      ".blob-code-inner",
      ".cm-line",
      ".view-line",
      "td.blob-code",
    ],
  };

  const PACKAGE_RE =
    /\b(?:from\s+|require\s*\(\s*|import\s*\(\s*|export\s+.*?\s+from\s+)(["'`])((?:@[a-z0-9._-]+\/[a-z0-9._-]+)|(?:[a-z0-9._-]+))(?:\/[^"'`]*)?\1/gi;

  /**
   * Prints debug logs when enabled.
   *
   * @param {...unknown} args Values to print.
   * @returns {void}
   */
  function debug(...args) {
    if (!CONFIG.debug) return;
    console.debug("[github-npm-links]", ...args);
  }

  /**
   * Checks whether an import target is an npm package.
   *
   * @param {string} packageName Package name.
   * @returns {boolean} True when it looks like an npm package.
   */
  function isNpmPackage(packageName) {
    return (
      Boolean(packageName) &&
      !packageName.startsWith(".") &&
      !packageName.startsWith("/") &&
      !packageName.startsWith("#") &&
      !packageName.includes(":")
    );
  }

  /**
   * Builds the package URL.
   *
   * @param {string} packageName Package name.
   * @returns {string} Public package URL.
   */
  function toPackageUrl(packageName) {
    return `https://npmx.dev/${encodeURIComponent(packageName)}`;
  }

  /**
   * Gets the first npm package found in a line.
   *
   * @param {string} text Code line text.
   * @returns {string | null} Package name or null.
   */
  function getPackageFromLine(text) {
    PACKAGE_RE.lastIndex = 0;

    const match = PACKAGE_RE.exec(text);
    if (!match) return null;

    const packageName = match[2];
    return isNpmPackage(packageName) ? packageName : null;
  }

  /**
   * Finds the highlighted string span that contains the import package.
   *
   * @param {HTMLElement} line Code line element.
   * @param {string} packageName Package name.
   * @returns {HTMLElement | null} Matching .pl-s span.
   */
  function findPackageSpan(line, packageName) {
    for (const span of line.querySelectorAll(".pl-s")) {
      if (!(span instanceof HTMLElement)) continue;

      const text = span.textContent || "";
      if (text.includes(packageName)) return span;
    }

    return null;
  }

  /**
   * Marks the existing GitHub highlight span instead of replacing its HTML.
   *
   * @param {HTMLElement} span Highlighted package span.
   * @param {string} packageName Package name.
   * @returns {void}
   */
  function markPackageSpan(span, packageName) {
    span.classList.add(CONFIG.linkedClass);
    span.setAttribute(CONFIG.linkedAttr, "true");
    span.setAttribute(CONFIG.packageAttr, packageName);
    span.setAttribute(CONFIG.urlAttr, toPackageUrl(packageName));
    span.setAttribute("role", "link");
    span.setAttribute("tabindex", "0");
    span.setAttribute("title", `Open ${packageName} on npmx.dev`);
  }

  /**
   * Scans visible GitHub code lines.
   *
   * @returns {void}
   */
  function scan() {
    injectStyle();

    const selector = CONFIG.lineSelectors.join(",");

    for (const line of document.querySelectorAll(selector)) {
      if (!(line instanceof HTMLElement)) continue;

      const text = line.textContent || "";
      if (!text.includes("from") && !text.includes("require") && !text.includes("import")) continue;

      const packageName = getPackageFromLine(text);
      if (!packageName) continue;

      const span = findPackageSpan(line, packageName);
      if (!span) continue;

      markPackageSpan(span, packageName);
    }
  }

  /**
   * Opens a marked package span without attaching click listeners to each element.
   *
   * @param {Event} event Browser event.
   * @returns {void}
   */
  function openFromEvent(event) {
    const target =
      event.target instanceof Element
        ? event.target.closest(`.${CONFIG.linkedClass}`)
        : null;

    if (!(target instanceof HTMLElement)) return;

    const url = target.getAttribute(CONFIG.urlAttr);
    const packageName = target.getAttribute(CONFIG.packageAttr);

    if (!url) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    debug("Opening package:", packageName);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  /**
   * Injects styles using inline pseudo overlay behavior.
   *
   * @returns {void}
   */
  function injectStyle() {
    if (document.getElementById(CONFIG.styleId)) return;

    const style = document.createElement("style");
    style.id = CONFIG.styleId;
    style.textContent = `
      .${CONFIG.linkedClass} {
        position: relative !important;
        cursor: pointer !important;
        border-radius: 4px !important;
        text-decoration-line: underline !important;
        text-decoration-style: wavy !important;
        text-decoration-thickness: 1.5px !important;
        text-underline-offset: 3px !important;
        text-decoration-color: #f97316 !important;
        background:
          linear-gradient(
            rgba(249, 115, 22, 0.12),
            rgba(249, 115, 22, 0.12)
          ) !important;
        -webkit-tap-highlight-color: rgba(249, 115, 22, 0.28) !important;
      }

      .${CONFIG.linkedClass}::after {
        content: "" !important;
        position: absolute !important;
        inset: -1px !important;
        border-radius: 5px !important;
        pointer-events: none !important;
        box-shadow: inset 0 -1px 0 rgba(249, 115, 22, 0.75) !important;
      }

      .${CONFIG.linkedClass}:active,
      .${CONFIG.linkedClass}:hover {
        background:
          linear-gradient(
            rgba(249, 115, 22, 0.24),
            rgba(249, 115, 22, 0.24)
          ) !important;
      }
    `;

    document.documentElement.appendChild(style);
  }

  /**
   * Debounces noisy GitHub redraws.
   *
   * @param {() => void} fn Callback.
   * @param {number} wait Delay.
   * @returns {() => void} Debounced callback.
   */
  function debounce(fn, wait) {
    let timer = 0;

    return () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, wait);
    };
  }

  /**
   * Boots the script.
   *
   * @returns {void}
   */
  function boot() {
    const scheduleScan = debounce(scan, 120);

    scan();

    new MutationObserver(scheduleScan).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.setInterval(scan, CONFIG.scanMs);

    document.addEventListener("click", openFromEvent, true);
    document.addEventListener("pointerup", openFromEvent, true);

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        openFromEvent(event);
      },
      true,
    );
  }

  boot();
})();