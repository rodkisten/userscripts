// ==UserScript==
// @name         004 / Console Kitchen Sink
// @namespace    https://rod.dev/userscripts
// @version      2026.06.04
// @description  Exhaustive console.* API showcase with formatting, groups, timers, counters, tables, stack traces, CSS logs, assertions, profiling helpers and browser quirks.
// @author       Rod
// @match        *://*/*
// @weight       200
// @run-at       document-end
// @grant        none
// @noframes
// ==/UserScript==

(function ConsoleKitchenSink() {
  "use strict";

  /**const alertaApi = window.alerta || null;

  typeof alertaApi?.setUserscript === "function" && alertaApi.setUserscript(window.GM_info?.script?.name || "004 / Console Kitchen")
  
  
  alertaApi?.setUserscript?(window.GM_info?.script?.name)
**/

function line(text, symbol = "•", size = 60, logger = console.warn) {
  const label = ` ${text} `;
  const available = Math.max(0, size - label.length);

  const left = Math.floor(available / 2);
  const right = available - left;

  logger(
    `${symbol.repeat(left)}${label}${symbol.repeat(right)}`,
  );
}

line("START - console kitchen sink");

/*
••••••••••••••••••••••• Summary •••••••••••••••••••••••
*/


  console.log(document.querySelectorAll("script"))
  console.log(document.querySelectorAll("link"))
  console.log(document.querySelectorAll("style"))


  /* ==========================================================================
   * Constants
   * ========================================================================== */

  const SCRIPT_NAME = "ConsoleKitchenSink";
  const ENABLE_HEAVY_SPAM = false;

  const users = [
    {
      id: 1,
      name: "Rod",
      role: "Frontend Engineer",
      skills: ["TypeScript", "React", "Performance"],
      active: true,
    },
    {
      id: 2,
      name: "Maria",
      role: "Designer",
      skills: ["Figma", "Motion"],
      active: false,
    },
  ];

  const complexObject = {
    app: "Fabrica",
    version: "7.0.0",
    features: {
      reactive: true,
      signals: true,
      html: true,
    },
    nested: {
      deep: {
        evenDeeper: {
          wow: "🌌",
        },
      },
    },
    createdAt: new Date(),
    map: new Map([
      ["theme", "dark"],
      ["accent", "#ff7b00"],
    ]),
    set: new Set(["a", "b", "c"]),
  };

  /* ==========================================================================
   * Helpers
   * ========================================================================== */

  /**
   * Pretty section divider.
   *
   * @param {string} title
   * @returns {void}
   */
  function section(title) {
    console.log(
      `%c${title}`,
      [
        "background:#111827",
        "color:#f9fafb",
        "padding:8px 12px",
        "border-radius:10px",
        "font-weight:700",
        "font-size:13px",
      ].join(";"),
    );
  }

  /**
   * Sleep helper.
   *
   * @param {number} milliseconds
   * @returns {Promise<void>}
   */
  function wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  /* ==========================================================================
   * Basic Logs
   * ========================================================================== */

  section("Basic console methods");

  console.log("Classic log");
  console.info("Info message ℹ️");
  console.warn("Warning message ⚠️");
  console.error("Error message 💥");
  console.debug("Debug message 🧪");

  console.log(
    "Multiple values:",
    123,
    true,
    null,
    undefined,
    [1, 2, 3],
    { hello: "world" },
  );
  /* ==========================================================================
   * Formatting Tokens
   * ========================================================================== */
  section("Formatting tokens");

  console.log("String: %s", "Rod");
  console.log("Integer: %d", 42.9);
  console.log("Float: %f", Math.PI);
  console.log("Object: %o", complexObject);
  console.log("DOM-like object: %O", document.body);
  console.log("JSON-ish: %j", {
    hello: "world",
    cool: true,
  });

  console.log(
    "%cOrange title%c and regular text",
    [
      "background:#ff7b00",
      "color:white",
      "padding:4px 8px",
      "border-radius:999px",
      "font-weight:bold",
    ].join(";"),
    "color:inherit",
  );

  console.log(
    "%cTokyo%c Night%c Vibes",
    "color:#7aa2f7;font-size:18px;font-weight:bold;",
    "color:#bb9af7;font-size:18px;font-weight:bold;",
    "color:#9ece6a;font-size:18px;font-weight:bold;",
  );


  /* ==========================================================================
   * Tables
   * ========================================================================== */

  section("console.table");

  console.table(users);

  console.table(users, ["id", "name", "active"]);

  /* ==========================================================================
   * Groups
   * ========================================================================== */

  section("Groups");

  console.group("📦 App Bootstrap");

  console.log("Loading config...");
  console.log("Loading runtime...");
  console.log("Loading plugins...");

  console.groupCollapsed("⚙️ Hidden details");

  console.log("Theme:", "dark");
  console.log("Accent:", "#ff7b00");

  console.groupEnd();

  console.group("🌲 Nested Group");

  console.log("Branch A");
  console.log("Branch B");

  console.groupEnd();
  console.groupEnd();

  /* ==========================================================================
   * Assertions
   * ========================================================================== */

  section("Assertions");

  console.assert(true, "This should not appear");

  console.assert(false, "Assertion failed: expected truthy value");

  /* ==========================================================================
   * Counters
   * ========================================================================== */

  section("Counters");

  console.count("render");
  console.count("render");
  console.count("render");

  console.count("fetch");

  console.countReset("render");

  console.count("render");
  
  return  
  

  /* ==========================================================================
   * Timers
   * ========================================================================== */

  /*section("Timers");

  console.time("fake-request");

  wait(120).then(() => {
    console.timeLog("fake-request", "Halfway there 🚀");
  });

  wait(240).then(() => {
    console.timeEnd("fake-request");
  });
  */
  /* ==========================================================================
   * Stack Traces
   * ========================================================================== */

  section("Stack traces");

  function levelOne() {
    levelTwo();
  }

  function levelTwo() {
    levelThree();
  }

  function levelThree() {
    console.trace("Trace generated 👣");
  }

  levelOne();

  /* ==========================================================================
   * Dir / DirXML
   * ========================================================================== */

  section("dir / dirxml");

  console.dir(complexObject);

  console.dirxml(document.body);

  /* ==========================================================================
   * Clear
   * ========================================================================== */

  /*section("console.clear");

  console.log("Console will clear in 1 second...");

  setTimeout(() => {
    console.clear();

    console.log(
      "%cConsole cleared ✨",
      [
        "background:#0f172a",
        "color:#38bdf8",
        "padding:6px 10px",
        "border-radius:8px",
        "font-weight:bold",
      ].join(";"),
    );
  }, 1000);*/

  /* ==========================================================================
   * Conditional Logging
   * ========================================================================== */

  section("Conditional logging");

  const isDebugEnabled = true;

  if (isDebugEnabled) {
    console.debug("Debug mode enabled");
  }

  /* ==========================================================================
   * Error Objects
   * ========================================================================== */

  section("Error objects");

  try {
    throw new Error("Kaboom 💣");
  } catch (error) {
    console.error("Caught error:", error);
  }

  /* ==========================================================================
   * Promise Logging
   * ========================================================================== */

  /*section("Promises");

  const asyncTask = wait(500).then(() => ({
    success: true,
    data: [1, 2, 3],
  }));

  console.log("Promise:", asyncTask);

  asyncTask.then((result) => {
    console.log("Resolved promise:", result);
  });
  */

  /* ==========================================================================
   * Styled Badges
   * ========================================================================== */

  section("Styled badges");

  console.log(
    "%c API %c GET %c /users ",
    [
      "background:#111827",
      "color:#fff",
      "padding:4px 6px",
      "border-radius:6px 0 0 6px",
    ].join(";"),
    [
      "background:#10b981",
      "color:white",
      "padding:4px 6px",
    ].join(";"),
    [
      "background:#1f2937",
      "color:#e5e7eb",
      "padding:4px 8px",
      "border-radius:0 6px 6px 0",
    ].join(";"),
  );

  /* ==========================================================================
   * Large Objects
   * ========================================================================== */

  section("Complex objects");

  console.log(complexObject);

  console.log("Map:", complexObject.map);

  console.log("Set:", complexObject.set);

  console.log("Date:", complexObject.createdAt);

  /* ==========================================================================
   * Arrays
   * ========================================================================== */

  section("Arrays");

  console.log(
    Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      value: Math.random(),
    })),
  );

  /* ==========================================================================
   * DOM Nodes
   * ========================================================================== */

  section("DOM nodes");

  console.log(document.documentElement);
  console.log(document.head);
  console.log(document.body);

  /* ==========================================================================
   * Performance-ish Logging
   * ========================================================================== */

  section("Performance-ish logging");

  const start = performance.now();

  let total = 0;

  for (let index = 0; index < 100_000; index += 1) {
    total += index;
  }

  const end = performance.now();

  console.log("Total:", total);

  console.log(
    `%cLoop took ${(end - start).toFixed(2)}ms`,
    "color:#22c55e;font-weight:bold;",
  );

  /* ==========================================================================
   * Memory Snapshot
   * ========================================================================== */

  section("Memory");

  if ("memory" in performance) {
    console.log("performance.memory:", performance.memory);
  } else {
    console.warn("performance.memory unsupported in this browser");
  }

  /* ==========================================================================
   * Copy Helper
   * ========================================================================== */

  section("copy() helper");

  if (typeof copy === "function") {
    copy({
      copiedAt: new Date().toISOString(),
      message: "Hello clipboard 📋",
    });

    console.log("Data copied to clipboard using copy()");
  } else {
    console.warn("copy() is unavailable in this environment");
  }

  /* ==========================================================================
   * monitorEvents / unmonitorEvents
   * ========================================================================== */

  section("monitorEvents");

  if (typeof monitorEvents === "function") {
    monitorEvents(window, "resize");

    console.log("Resize events are being monitored");

    setTimeout(() => {
      unmonitorEvents(window, "resize");

      console.log("Resize monitoring stopped");
    }, 5000);
  } else {
    console.warn("monitorEvents() unavailable");
  }

  /* ==========================================================================
   * Profiles
   * ========================================================================== */

  section("Profiles");

  if (typeof console.profile === "function") {
    console.profile("KitchenSinkProfile");

    for (let index = 0; index < 10000; index += 1) {
      Math.sqrt(index * Math.random());
    }

    console.profileEnd("KitchenSinkProfile");

    console.log("Profile recorded 🎛️");
  } else {
    console.warn("console.profile unsupported");
  }

  /* ==========================================================================
   * Timeline
   * ========================================================================== */

  section("Timeline");

  if (typeof console.timeline === "function") {
    console.timeline("Custom Timeline");

    console.timelineEnd("Custom Timeline");
  } else {
    console.warn("console.timeline unsupported");
  }

  /* ==========================================================================
   * Console Context Tricks
   * ========================================================================== */

  section("Context tricks");

  console.log.call(window.console, "Using .call()");
  console.info.apply(window.console, [
    "Using .apply()",
    {
      fancy: true,
    },
  ]);

  /* ==========================================================================
   * Massive Spam Test
   * ========================================================================== */

  section("Heavy spam");

  if (ENABLE_HEAVY_SPAM) {
    for (let index = 0; index < 1000; index += 1) {
      console.log(
        `%cSPAM ${index}`,
        "color:#f97316;font-weight:bold;",
      );
    }
  } else {
    console.log("Heavy spam disabled");
  }

  /* ==========================================================================
   * Finale
   * ========================================================================== */

  section("Finished");

  console.log(
    `%c${SCRIPT_NAME} loaded successfully 🚀`,
    [
      "background:linear-gradient(90deg,#111827,#1f2937)",
      "color:#f9fafb",
      "padding:10px 14px",
      "border-radius:12px",
      "font-size:14px",
      "font-weight:bold",
    ].join(";"),
  );
  
  line("END - console kitchen sink");
  
})();