// ==UserScript==
// @name         005 / CDN Test
// @namespace    https://rod.dev/userscripts
// @version      2026.06.04
// @description  Exhaustive console.* API showcase with formatting, groups, timers, counters, tables, stack traces, CSS logs, assertions, profiling helpers and browser quirks.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// @require      https://code.migos.club/api/cdn?preset=html&bundle=iife&global=RodCDN&preset=highlight&pkg=lucide
// ==/UserScript==

(function CDNTest() {
  "use strict";
  
  console.log({RodCDN: window?.RodCDN});
})();