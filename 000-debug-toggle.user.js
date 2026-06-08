// ==UserScript==
// @name         000 - Rod / Core / DEBUG TOGGLE
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Setting global debug options
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       999
// @grant        none
// ==/UserScript==

(async (globalWindow) => {
  "use strict";

const DEBUG = true; 

/**
 * Defines an immutable global variable on window.
 *
 * @template T
 * @param {string} key Global key.
 * @param {T} value Global value.
 * @returns {T} Frozen value.
 */
function defineGlobalConstant(key, value) {
  const frozen =
    value && typeof value === "object"
      ? Object.freeze(value)
      : value;

  Object.defineProperty(globalWindow, key, {
    value: frozen,
    writable: false,
    configurable: false,
    enumerable: true,
  });

  return frozen;
}

/* **************************************** */

defineGlobalConstant("__ROD_DEBUG__", DEBUG);
defineGlobalConstant("__DEBUG_ROD__", DEBUG);

  /**
   * Logs a pretty development loader message.
   *
   * @param {string} title Log title.
   * @param {...unknown} values Extra values.
   * @returns {void}
   */
  function loaderLog(title, ...values) {
    const styles = [
      "background: linear-gradient(135deg, #FC466B, #3F5EFB 45%, #3F5EFB);",
      "color: white;",
      "font-weight: 800;",
      "padding: 4px 10px;",
      "border-radius: 999px;",
      "font-family: Menlo, monospace;",
      "font-size: 12px;",
    ].join(" ");

    try {
      console.groupCollapsed(
        `%c 🦄 GLOBAL DEBUG %c ${title}`,
        styles,
        "color:#86efac;font-weight:700;",
      );

      for (const value of values) {
        if (value && typeof value === "object") {
          console.dir(value);
        } else {
          console.log(value);
        }
      }

      console.groupEnd();
    } catch (error) {
      console.error("GLOBAL DEBUG", title, ...values, error);
    }
  }
  
  
  loaderLog(`GLOBAL DEBUG is ${DEBUG ? "enabled":"disabled"}`)


}(window)