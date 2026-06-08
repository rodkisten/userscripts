// ==UserScript==
// @name         Rod / GitHub / Import Links
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Adds clickable import links in GitHub and GitHub.dev editors with tsconfig-aware resolution.
// @author       Rod
// @match        https://github.com/*
// @match        https://github.dev/*
// @match        https://*.github.dev/*
// @match        https://*.github.com/*
// @run-at       document-idle
// @weight       700
// @grant        GM_xmlhttpRequest
// @noframes
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @connect      npmjs.com
// ==/UserScript==

((window) => {
  "use strict";

  const { lockZoom } = use("utils");
  const unlock = lockZoom();
  
  alertify("1", use, lockZoom, unlock)

  /***************************************************************************
   * Constants
   ***************************************************************************/

  const DEBUG = true;
  const APP_ID = "migos-github-import-links";
  const SCAN_INTERVAL_MS = 900;
  const OVERLAY_Z_INDEX = 2147483646;

  const SOURCE_EXTENSIONS = [
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".css",
    ".scss",
    ".sass",
    ".less",
  ];

  const IMPORT_PATTERN =
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/g;

  /***************************************************************************
   * Debug
   ***************************************************************************/

  /**
   * Prints debug logs when DEBUG is enabled.
   *
   * @param {...unknown} args Values to log.
   * @returns {void}
   */
  function debug(...args) {
    if (DEBUG) alertify(`[${APP_ID}]`, ...args);
  }

  /***************************************************************************
   * URL / repo parsing
   ***************************************************************************/

  /**
   * Gets the current GitHub repository context from the URL.
   *
   * @returns {{
   *   owner: string;
   *   repo: string;
   *   branch: string;
   *   filePath: string;
   *   githubBaseUrl: string;
   * } | null}
   */
  function getRepoContext() {
    const host = location.hostname;
    const parts = location.pathname.split("/").filter(Boolean);

    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];

    let branch = "main";
    let filePath = "";

    const blobIndex = parts.indexOf("blob");
    const editIndex = parts.indexOf("edit");

    const modeIndex = blobIndex >= 0 ? blobIndex : editIndex;

    if (modeIndex >= 0 && parts[modeIndex + 1]) {
      branch = parts[modeIndex + 1];
      filePath = parts.slice(modeIndex + 2).join("/");
    } else if (host.endsWith("github.dev") && parts.length >= 4) {
      branch = parts[2] || "main";
      filePath = parts.slice(3).join("/");
    }

    return {
      owner,
      repo,
      branch,
      filePath,
      githubBaseUrl: `https://github.com/${owner}/${repo}`,
    };
  }

  /**
   * Builds a GitHub blob URL.
   *
   * @param {ReturnType<typeof getRepoContext>} context Current repo context.
   * @param {string} path Repository-relative path.
   * @returns {string}
   */
  function toGithubBlobUrl(context, path) {
    return `${context.githubBaseUrl}/blob/${encodeURIComponent(context.branch)}/${path}`;
  }

  /**
   * Builds a raw GitHub URL.
   *
   * @param {ReturnType<typeof getRepoContext>} context Current repo context.
   * @param {string} path Repository-relative path.
   * @returns {string}
   */
  function toRawUrl(context, path) {
    return `https://raw.githubusercontent.com/${context.owner}/${context.repo}/${encodeURIComponent(
      context.branch,
    )}/${path}`;
  }

  /***************************************************************************
   * Fetch helpers
   ***************************************************************************/

  /**
   * Fetches text using GM_xmlhttpRequest when available, falling back to fetch.
   *
   * @param {string} url URL to fetch.
   * @returns {Promise<string | null>}
   */
  function fetchText(url) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          onload: (response) => {
            resolve(
              response.status >= 200 && response.status < 300
                ? response.responseText
                : null,
            );
          },
          onerror: () => resolve(null),
        });
        return;
      }

      fetch(url)
        .then((response) => (response.ok ? response.text() : null))
        .then(resolve)
        .catch(() => resolve(null));
    });
  }

  /**
   * Fetches JSON safely.
   *
   * @template TValue
   * @param {string} url URL to fetch.
   * @returns {Promise<TValue | null>}
   */
  async function fetchJson(url) {
    const text = await fetchText(url);
    if (!text) return null;

    try {
      return JSON.parse(stripJsonComments(text));
    } catch {
      return null;
    }
  }

  /**
   * Removes JSON comments and trailing commas for tsconfig/jsconfig parsing.
   *
   * @param {string} text Raw JSON-ish text.
   * @returns {string}
   */
  function stripJsonComments(text) {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/,\s*([}\]])/g, "$1");
  }

  /***************************************************************************
   * Path helpers
   ***************************************************************************/

  /**
   * Normalizes repository paths.
   *
   * @param {string} path Path to normalize.
   * @returns {string}
   */
  function normalizePath(path) {
    const output = [];

    for (const part of path.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") output.pop();
      else output.push(part);
    }

    return output.join("/");
  }

  /**
   * Gets the directory of a file path.
   *
   * @param {string} filePath File path.
   * @returns {string}
   */
  function dirname(filePath) {
    const parts = filePath.split("/");
    parts.pop();
    return parts.join("/");
  }

  /**
   * Checks whether a specifier is relative.
   *
   * @param {string} specifier Import specifier.
   * @returns {boolean}
   */
  function isRelativeSpecifier(specifier) {
    return specifier.startsWith("./") || specifier.startsWith("../");
  }

  /**
   * Extracts the npm package name from a specifier.
   *
   * @param {string} specifier Import specifier.
   * @returns {string}
   */
  function getPackageName(specifier) {
    if (specifier.startsWith("@")) {
      const [scope, name] = specifier.split("/");
      return `${scope}/${name}`;
    }

    return specifier.split("/")[0];
  }

  /**
   * Gets candidate files for a path that may omit extension or index.
   *
   * @param {string} basePath Repository-relative base path.
   * @returns {string[]}
   */
  function getCandidatePaths(basePath) {
    const hasExtension = /\.[a-z0-9]+$/i.test(basePath);

    if (hasExtension) {
      return [basePath];
    }

    return [
      ...SOURCE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
      ...SOURCE_EXTENSIONS.map((extension) => `${basePath}/index${extension}`),
    ];
  }

  /***************************************************************************
   * Project config cache
   ***************************************************************************/

  const projectCache = new Map();

  /**
   * Loads package.json and tsconfig/jsconfig files.
   *
   * @param {ReturnType<typeof getRepoContext>} context Current repo context.
   * @returns {Promise<{
   *   packageJson: Record<string, unknown> | null;
   *   tsconfig: Record<string, unknown> | null;
   * }>}
   */
  async function loadProjectConfig(context) {
    const key = `${context.owner}/${context.repo}/${context.branch}`;

    if (projectCache.has(key)) {
      return projectCache.get(key);
    }

    const value = {
      packageJson: await fetchJson(toRawUrl(context, "package.json")),
      tsconfig:
        (await fetchJson(toRawUrl(context, "tsconfig.json"))) ||
        (await fetchJson(toRawUrl(context, "jsconfig.json"))),
    };

    projectCache.set(key, value);
    return value;
  }

  /**
   * Resolves tsconfig path aliases.
   *
   * @param {string} specifier Import specifier.
   * @param {Record<string, unknown> | null} tsconfig Parsed tsconfig.
   * @returns {string | null}
   */
  function resolveAlias(specifier, tsconfig) {
    const compilerOptions =
      tsconfig &&
      typeof tsconfig.compilerOptions === "object" &&
      tsconfig.compilerOptions
        ? tsconfig.compilerOptions
        : null;

    if (!compilerOptions) return null;

    const baseUrl =
      typeof compilerOptions.baseUrl === "string"
        ? compilerOptions.baseUrl
        : ".";

    const paths =
      compilerOptions.paths &&
      typeof compilerOptions.paths === "object"
        ? compilerOptions.paths
        : null;

    if (!paths) return null;

    for (const [aliasPattern, targets] of Object.entries(paths)) {
      if (!Array.isArray(targets) || targets.length === 0) continue;

      const wildcardIndex = aliasPattern.indexOf("*");

      if (wildcardIndex < 0) {
        if (aliasPattern === specifier && typeof targets[0] === "string") {
          return normalizePath(`${baseUrl}/${targets[0]}`);
        }

        continue;
      }

      const prefix = aliasPattern.slice(0, wildcardIndex);
      const suffix = aliasPattern.slice(wildcardIndex + 1);

      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
        continue;
      }

      const middle = specifier.slice(
        prefix.length,
        specifier.length - suffix.length,
      );

      const target = String(targets[0]).replace("*", middle);
      return normalizePath(`${baseUrl}/${target}`);
    }

    return null;
  }

  /**
   * Resolves an import specifier into a URL.
   *
   * @param {string} specifier Import specifier.
   * @param {ReturnType<typeof getRepoContext>} context Current repo context.
   * @returns {Promise<string>}
   */
  async function resolveImportUrl(specifier, context) {
    const config = await loadProjectConfig(context);

    if (isRelativeSpecifier(specifier)) {
      const currentDir = dirname(context.filePath);
      const basePath = normalizePath(`${currentDir}/${specifier}`);
      return toGithubBlobUrl(context, getCandidatePaths(basePath)[0]);
    }

    const aliasPath = resolveAlias(specifier, config.tsconfig);

    if (aliasPath) {
      return toGithubBlobUrl(context, getCandidatePaths(aliasPath)[0]);
    }

    const packageName = getPackageName(specifier);
    return `https://www.npmjs.com/package/${packageName}`;
  }

  /***************************************************************************
   * Import parsing
   ***************************************************************************/

  /**
   * Extracts import specifiers from a line.
   *
   * @param {string} lineText Line text.
   * @returns {{ specifier: string; start: number; end: number }[]}
   */
  function extractImports(lineText) {
    const matches = [];
    IMPORT_PATTERN.lastIndex = 0;

    let match;

    while ((match = IMPORT_PATTERN.exec(lineText))) {
      const specifier = match[1] || match[2] || match[3];

      if (!specifier) continue;

      const quoteIndex = match[0].lastIndexOf(specifier);
      const start = match.index + quoteIndex;
      const end = start + specifier.length;

      matches.push({ specifier, start, end });
    }

    return matches;
  }

  /***************************************************************************
   * DOM range helpers
   ***************************************************************************/

  /**
   * Finds text nodes inside an element.
   *
   * @param {Element} root Root element.
   * @returns {Text[]}
   */
  function getTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;

    while ((node = walker.nextNode())) {
      nodes.push(node);
    }

    return nodes;
  }

  /**
   * Creates a DOM Range for a character span inside an element.
   *
   * @param {Element} root Root element.
   * @param {number} start Start offset.
   * @param {number} end End offset.
   * @returns {Range | null}
   */
  function createRangeForOffsets(root, start, end) {
    const nodes = getTextNodes(root);
    let offset = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;

    for (const node of nodes) {
      const length = node.nodeValue.length;
      const nextOffset = offset + length;

      if (!startNode && start >= offset && start <= nextOffset) {
        startNode = node;
        startOffset = start - offset;
      }

      if (!endNode && end >= offset && end <= nextOffset) {
        endNode = node;
        endOffset = end - offset;
        break;
      }

      offset = nextOffset;
    }

    if (!startNode || !endNode) return null;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  /***************************************************************************
   * Overlay
   ***************************************************************************/

  let overlay = null;

  /**
   * Gets or creates the overlay layer.
   *
   * @returns {HTMLDivElement}
   */
  function getOverlay() {
    if (overlay && overlay.isConnected) return overlay;

    overlay = document.createElement("div");
    overlay.id = APP_ID;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = String(OVERLAY_Z_INDEX);

    document.documentElement.appendChild(overlay);
    return overlay;
  }

  /**
   * Clears all overlay links.
   *
   * @returns {void}
   */
  function clearOverlay() {
    getOverlay().replaceChildren();
  }

  /**
   * Adds a clickable transparent link over an import token.
   *
   * @param {DOMRect} rect Token rectangle.
   * @param {string} href Destination URL.
   * @param {string} title Tooltip.
   * @returns {void}
   */
  function addOverlayLink(rect, href, title) {
    const anchor = document.createElement("a");

    anchor.href = href;
    anchor.title = title;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = "↗";

    anchor.style.position = "fixed";
    anchor.style.left = `${rect.left}px`;
    anchor.style.top = `${rect.top}px`;
    anchor.style.width = `${Math.max(rect.width, 12)}px`;
    anchor.style.height = `${Math.max(rect.height, 12)}px`;
    anchor.style.pointerEvents = "auto";
    anchor.style.color = "transparent";
    anchor.style.textDecoration = "none";
    anchor.style.cursor = "pointer";
    anchor.style.borderBottom = "1px dotted rgba(125, 211, 252, 0.9)";
    anchor.style.background = "rgba(56, 189, 248, 0.08)";
    anchor.style.borderRadius = "3px";

    getOverlay().appendChild(anchor);
  }

  /***************************************************************************
   * CodeMirror scanning
   ***************************************************************************/

  /**
   * Finds visible CodeMirror lines on GitHub/GitHub.dev.
   *
   * @returns {Element[]}
   */
  function findCodeLines() {
    return [
      ...document.querySelectorAll(
        [
          ".cm-line",
          ".view-line",
          "[class*='cm-line']",
          "[data-testid='codemirror-line']",
          "td.blob-code",
        ].join(","),
      ),
    ].filter((line) => {
      const text = line.textContent || "";
      return text.includes("import") || text.includes("export") || text.includes("require");
    });
  }

  /**
   * Scans visible editor lines and draws import links.
   *
   * @returns {Promise<void>}
   */
  async function scan() {
    const context = getRepoContext();

    if (!context || !context.owner || !context.repo) {
      clearOverlay();
      return;
    }

    clearOverlay();

    const lines = findCodeLines();

    for (const line of lines) {
      const text = line.textContent || "";
      const imports = extractImports(text);

      for (const item of imports) {
        const range = createRangeForOffsets(line, item.start, item.end);
        if (!range) continue;

        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;

        const href = await resolveImportUrl(item.specifier, context);

        addOverlayLink(rect, href, item.specifier);
      }
    }
  }

  /**
   * Starts the import-link engine.
   *
   * @returns {void}
   */
  function start() {
    let timeout = 0;

    const schedule = () => {
      clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        scan().catch((error) => debug("scan failed", error));
      }, 80);
    };

    const observer = new MutationObserver(schedule);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    setInterval(schedule, SCAN_INTERVAL_MS);
    schedule();
  }

  start();
})(window);