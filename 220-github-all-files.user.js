// ==UserScript==
// @name         Rod / GitHub / All Files
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Improves GitHub repository file discovery and browsing.
// @author       Rod
// @match        https://github.com/*
// @run-at       document-idle
// @weight       680
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = {
    debug: true,
    clickedAttr: "data-migos-view-all-files-clicked",
    selectors: [
      'tr[data-testid="view-all-files-row"] button[data-component="Link"]',
      'tr[data-testid="view-all-files-row"] button',
    ],
  };

  /**
   * Logs debug info for this userscript.
   *
   * @param {...unknown} args - Values to log.
   * @returns {void}
   */
  function debug(...args) {
    if (!CONFIG.debug) return;
    console.debug("[GitHub View All Files]", ...args);
  }

  /**
   * Checks whether a button is the exact mobile GitHub "View all files" button.
   *
   * @param {Element} element - Candidate element.
   * @returns {element is HTMLButtonElement}
   */
  function isViewAllFilesButton(element) {
    if (!(element instanceof HTMLButtonElement)) return false;

    const row = element.closest('tr[data-testid="view-all-files-row"]');
    if (!row) return false;

    const text = element.textContent?.trim().toLowerCase();
    return text === "view all files";
  }

  /**
   * Finds the exact GitHub mobile "View all files" button.
   *
   * @returns {HTMLButtonElement | null} Matching button.
   */
  function findViewAllFilesButton() {
    for (const selector of CONFIG.selectors) {
      const candidates = document.querySelectorAll(selector);

      for (const candidate of candidates) {
        if (isViewAllFilesButton(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  }

  /**
   * Clicks the button once per rendered instance.
   *
   * @returns {boolean} True when a click happened.
   */
  function clickViewAllFiles() {
    const button = findViewAllFilesButton();

    if (!button) return false;
    if (button.hasAttribute(CONFIG.clickedAttr)) return false;

    button.setAttribute(CONFIG.clickedAttr, "true");

    debug("Clicking exact View all files button:", button);

    button.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );

    return true;
  }

  /**
   * Starts a small observer for GitHub soft navigation and lazy rendering.
   *
   * @returns {void}
   */
  function boot() {
    clickViewAllFiles();

    const observer = new MutationObserver(() => {
      clickViewAllFiles();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("turbo:render", clickViewAllFiles);
    window.addEventListener("turbo:load", clickViewAllFiles);
    window.addEventListener("popstate", clickViewAllFiles);
  }

  boot();
})();