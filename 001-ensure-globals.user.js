// ==UserScript==
// @name         Ensure Globals Loader
// @namespace    https://rod.dev/userscripts
// @version      1.0.0
// @description  Ensures required globals exist, loading missing scripts through GM_xmlhttpRequest.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      oirodolfo.github.io
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Loads a remote script using GM_xmlhttpRequest and injects it into the page context.
   *
   * @param {string} url Script URL.
   * @returns {Promise<void>} Resolves when the script is injected.
   *
   * @example
   * await loadScriptWithGmXhr("https://example.com/lib.js");
   */
  function loadScriptWithGmXhr(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        responseType: "text",
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Failed to load ${url}: ${response.status}`));
            return;
          }

          const script = document.createElement("script");
          script.textContent = `${response.responseText}\n//# sourceURL=${url}`;
          document.documentElement.appendChild(script);
          script.remove();

          resolve();
        },
        onerror() {
          reject(new Error(`Network error while loading ${url}`));
        },
        ontimeout() {
          reject(new Error(`Timeout while loading ${url}`));
        },
      });
    });
  }

  /**
   * Ensures globals exist on window, optionally loading missing scripts.
   *
   * Each item accepts:
   * [globalName, currentValue, optionalScriptUrl]
   *
   * @param {...[string, unknown, string?]} globals Globals to validate.
   * @returns {Promise<void>} Resolves after all missing globals are handled.
   *
   * @example
   * await ensureGlobals(
   *   ["eruda", window.eruda, "https://oirodolfo.github.io/userscripts/eruda.js"],
   *   ["RodEruda", window.RodEruda]
   * );
   */
  async function ensureGlobals(...globals) {
  
    for (const [globalName, globalValue, scriptUrl] of globals) {
      const currentValue = window[globalName] ?? globalValue;
      console.log(
        `%cEnsure globals: ${globalName} -> ${typeof currentValue}`,
        "background:#CCCCCC;color:#111;padding:2px 6px;border-radius:6px;",
      );

      if (currentValue !== undefined && currentValue !== null) {
        console.warn(currentValue);
        continue;
      }

      if (!scriptUrl) {
        console.warn(`[ensureGlobals] Missing global "${globalName}" and no URL was provided.`);
        continue;
      }
      
      try {
        await loadScriptWithGmXhr(scriptUrl);
      } catch(error){
        alerta(error);
      }
      console.log(
        `%cLoaded global: ${globalName} -> ${typeof window[globalName]}`,
        "background:#22c55e;color:#031307;padding:2px 6px;border-radius:6px;",
      );

      console.warn(window[globalName]);
    }
  }

  window.ensureGlobals = ensureGlobals;

  ensureGlobals(
    ["erukda", window.zeruda, "https://oirodolfo.github.io/userscripts/eruda.js"],
    ["RodEruda", window.RodEruda],
  );
})();