// ==UserScript==
// @name         Rod / GitHub / Navigation Imports
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Navigation helpers for imports and repository browsing.
// @author       Rod
// @match        https://github.com/*
// @run-at       document-idle
// @weight       650
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = {
    debug: true,
    scanMs: 1000,
    styleId: "rod-github-local-import-navigator-style",
    linkedClass: "rod-local-import-link",
    unresolvedClass: "rod-local-import-unresolved",
    processedAttr: "data-rod-local-import-processed",
    importAttr: "data-rod-local-import",
    resolvedAttr: "data-rod-local-import-resolved",
    urlAttr: "data-rod-local-import-url",
    cachePrefix: "rod:github-local-import-navigator:",
    cacheTtlMs: 1000 * 60 * 20,
    lineSelectors: [
      ".react-code-text",
      ".blob-code-inner",
      ".cm-line",
      ".view-line",
      "td.blob-code",
    ],
    tsconfigNames: [
      "tsconfig.json",
      "tsconfig.base.json",
      "tsconfig.app.json",
      "jsconfig.json",
    ],
  };

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
  ];

  const JS_EXTENSION_FALLBACKS = {
    ".js": [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
    ".jsx": [".tsx", ".jsx", ".ts", ".js"],
    ".mjs": [".mts", ".mjs", ".ts", ".js"],
    ".cjs": [".cts", ".cjs", ".ts", ".js"],
  };

  const IMPORT_RE =
    /\b(?:import\s+type\s+[^"'`]*?\s+from\s+|import\s+[^"'`]*?\s+from\s+|export\s+[^"'`]*?\s+from\s+|import\s*\(\s*|require\s*\(\s*)(["'`])([^"'`]+)\1/gi;

  const state = {
    contextKey: "",
    context: null,
    files: new Set(),
    aliases: [],
    ready: false,
    loading: false,
  };

  /**
   * Prints debug logs when enabled.
   *
   * @param {...unknown} args Values to print.
   * @returns {void}
   */
  function debug(...args) {
    if (!CONFIG.debug) return;
    console.debug("[local-import-nav]", ...args);
  }

  /**
   * Reads the current GitHub blob context from the URL.
   *
   * @returns {{ owner: string, repo: string, branch: string, path: string } | null} GitHub file context.
   */
  function getCurrentContext() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const blobIndex = parts.indexOf("blob");

    if (parts.length < 5 || blobIndex !== 2) return null;

    const owner = parts[0];
    const repo = parts[1];
    const afterBlob = parts.slice(blobIndex + 1);

    for (let branchParts = 1; branchParts <= afterBlob.length - 1; branchParts += 1) {
      const branch = afterBlob.slice(0, branchParts).join("/");
      const path = afterBlob.slice(branchParts).join("/");

      if (path && looksLikeSourceFile(path)) {
        return { owner, repo, branch, path };
      }
    }

    return {
      owner,
      repo,
      branch: afterBlob[0],
      path: afterBlob.slice(1).join("/"),
    };
  }

  /**
   * Checks whether a path looks like a source file.
   *
   * @param {string} path File path.
   * @returns {boolean} True when it has a known extension.
   */
  function looksLikeSourceFile(path) {
    return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));
  }

  /**
   * Builds a stable cache key.
   *
   * @param {{ owner: string, repo: string, branch: string }} context GitHub context.
   * @returns {string} Cache key.
   */
  function getCacheKey(context) {
    return `${CONFIG.cachePrefix}${context.owner}/${context.repo}/${context.branch}`;
  }

  /**
   * Reads JSON cache safely.
   *
   * @param {string} key Storage key.
   * @returns {unknown | null} Cached value.
   */
  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - parsed.createdAt > CONFIG.cacheTtlMs) return null;

      return parsed.value;
    } catch {
      return null;
    }
  }

  /**
   * Writes JSON cache safely.
   *
   * @param {string} key Storage key.
   * @param {unknown} value Value to cache.
   * @returns {void}
   */
  function writeCache(key, value) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          createdAt: Date.now(),
          value,
        }),
      );
    } catch {
      debug("Cache write failed.");
    }
  }

  /**
   * Fetches JSON with GitHub-friendly headers.
   *
   * @param {string} url URL to fetch.
   * @returns {Promise<any>} Parsed JSON.
   */
  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed ${response.status}: ${url}`);
    }

    return response.json();
  }

  /**
   * Fetches text from a GitHub raw file URL.
   *
   * @param {{ owner: string, repo: string, branch: string }} context GitHub context.
   * @param {string} path File path.
   * @returns {Promise<string | null>} Text content or null.
   */
  async function fetchRawFile(context, path) {
    const url = `https://raw.githubusercontent.com/${context.owner}/${context.repo}/${encodeURIComponentPath(context.branch)}/${path}`;

    const response = await fetch(url, {
      credentials: "omit",
    });

    if (!response.ok) return null;
    return response.text();
  }

  /**
   * Encodes branch paths without breaking slashes.
   *
   * @param {string} value Path value.
   * @returns {string} Encoded path.
   */
  function encodeURIComponentPath(value) {
    return value.split("/").map(encodeURIComponent).join("/");
  }

  /**
   * Loads repository files and tsconfig aliases.
   *
   * @param {{ owner: string, repo: string, branch: string, path: string }} context GitHub context.
   * @returns {Promise<void>}
   */
  async function loadRepoContext(context) {
    const cacheKey = getCacheKey(context);
    const cached = readCache(cacheKey);

    if (cached && Array.isArray(cached.files) && Array.isArray(cached.aliases)) {
      state.files = new Set(cached.files);
      state.aliases = cached.aliases;
      state.ready = true;
      debug("Loaded from cache", cached.files.length, "files");
      return;
    }

    const treeUrl = `https://api.github.com/repos/${context.owner}/${context.repo}/git/trees/${encodeURIComponentPath(context.branch)}?recursive=1`;
    const tree = await fetchJson(treeUrl);

    const files = Array.isArray(tree.tree)
      ? tree.tree
          .filter((item) => item && item.type === "blob" && typeof item.path === "string")
          .map((item) => item.path)
      : [];

    const aliases = await loadAliases(context, files);

    state.files = new Set(files);
    state.aliases = aliases;
    state.ready = true;

    writeCache(cacheKey, {
      files,
      aliases,
    });

    debug("Loaded repo context", {
      files: files.length,
      aliases,
    });
  }

  /**
   * Loads aliases from tsconfig/jsconfig files.
   *
   * @param {{ owner: string, repo: string, branch: string }} context GitHub context.
   * @param {string[]} files Repository files.
   * @returns {Promise<Array<{ prefix: string, targetPrefix: string }>>} Alias rules.
   */
  async function loadAliases(context, files) {
    const configPaths = findTsconfigCandidates(files);
    const aliases = [];

    for (const configPath of configPaths) {
      const text = await fetchRawFile(context, configPath);
      if (!text) continue;

      const parsed = parseJsonWithComments(text);
      if (!parsed) continue;

      const configDir = dirname(configPath);
      const compilerOptions = parsed.compilerOptions || {};
      const baseUrl = normalizePath(joinPath(configDir, compilerOptions.baseUrl || "."));
      const paths = compilerOptions.paths || {};

      for (const [key, values] of Object.entries(paths)) {
        if (!Array.isArray(values)) continue;

        const keyPrefix = key.replace(/\*.*$/, "");
        const firstTarget = String(values[0] || "");
        const targetPrefix = firstTarget.replace(/\*.*$/, "");

        aliases.push({
          prefix: keyPrefix,
          targetPrefix: normalizePath(joinPath(baseUrl, targetPrefix)),
        });
      }
    }

    return dedupeAliases(aliases);
  }

  /**
   * Finds likely tsconfig/jsconfig files.
   *
   * @param {string[]} files Repository files.
   * @returns {string[]} Candidate config paths.
   */
  function findTsconfigCandidates(files) {
    const exact = [];
    const nested = [];

    for (const file of files) {
      const name = basename(file);

      if (CONFIG.tsconfigNames.includes(file)) {
        exact.push(file);
        continue;
      }

      if (CONFIG.tsconfigNames.includes(name)) {
        nested.push(file);
      }
    }

    return [...exact, ...nested].slice(0, 20);
  }

  /**
   * Deduplicates alias rules.
   *
   * @param {Array<{ prefix: string, targetPrefix: string }>} aliases Alias rules.
   * @returns {Array<{ prefix: string, targetPrefix: string }>} Deduped rules.
   */
  function dedupeAliases(aliases) {
    const seen = new Set();
    const result = [];

    for (const alias of aliases) {
      const key = `${alias.prefix}->${alias.targetPrefix}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(alias);
    }

    return result.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  /**
   * Parses JSON with comments and trailing commas.
   *
   * @param {string} text JSONC text.
   * @returns {any | null} Parsed object.
   */
  function parseJsonWithComments(text) {
    try {
      const withoutComments = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1")
        .replace(/,\s*([}\]])/g, "$1");

      return JSON.parse(withoutComments);
    } catch {
      return null;
    }
  }

  /**
   * Checks whether an import path is local or alias-based.
   *
   * @param {string} importPath Import value.
   * @returns {boolean} True when this script should handle it.
   */
  function isLocalLikeImport(importPath) {
    if (!importPath) return false;
    if (importPath.startsWith(".") || importPath.startsWith("/")) return true;

    return state.aliases.some((alias) => importPath.startsWith(alias.prefix));
  }

  /**
   * Resolves an import path to a repository file.
   *
   * @param {string} importPath Raw import value.
   * @param {{ path: string }} context GitHub context.
   * @returns {string | null} Resolved file path.
   */
  function resolveImport(importPath, context) {
    const normalizedImport = stripQueryAndHash(importPath);
    const basePath = resolveBasePath(normalizedImport, context);

    if (!basePath) return null;

    for (const candidate of buildCandidatePaths(basePath)) {
      if (state.files.has(candidate)) return candidate;
    }

    return null;
  }

  /**
   * Resolves import path into a base repository path without extension fallbacks.
   *
   * @param {string} importPath Raw import path.
   * @param {{ path: string }} context GitHub context.
   * @returns {string | null} Base repository path.
   */
  function resolveBasePath(importPath, context) {
    if (importPath.startsWith(".")) {
      return normalizePath(joinPath(dirname(context.path), importPath));
    }

    if (importPath.startsWith("/")) {
      return normalizePath(importPath.slice(1));
    }

    for (const alias of state.aliases) {
      if (!importPath.startsWith(alias.prefix)) continue;

      const rest = importPath.slice(alias.prefix.length);
      return normalizePath(joinPath(alias.targetPrefix, rest));
    }

    return null;
  }

  /**
   * Builds file candidates, including JS import to TS source fallbacks.
   *
   * @param {string} basePath Base repository path.
   * @returns {string[]} Candidate paths.
   */
  function buildCandidatePaths(basePath) {
    const extension = getKnownExtension(basePath);

    if (extension && JS_EXTENSION_FALLBACKS[extension]) {
      const withoutExtension = basePath.slice(0, -extension.length);
      return JS_EXTENSION_FALLBACKS[extension].map((fallback) => `${withoutExtension}${fallback}`);
    }

    if (extension) {
      return [basePath];
    }

    const candidates = [];

    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${basePath}${sourceExtension}`);
    }

    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${basePath}/index${sourceExtension}`);
    }

    return candidates;
  }

  /**
   * Gets a known source extension.
   *
   * @param {string} path File path.
   * @returns {string} Extension or empty string.
   */
  function getKnownExtension(path) {
    for (const extension of SOURCE_EXTENSIONS) {
      if (path.endsWith(extension)) return extension;
    }

    return "";
  }

  /**
   * Removes query/hash suffixes from imports.
   *
   * @param {string} value Import path.
   * @returns {string} Clean import path.
   */
  function stripQueryAndHash(value) {
    return value.split("?")[0].split("#")[0];
  }

  /**
   * Scans the current page and marks resolvable local imports.
   *
   * @returns {void}
   */
  function scan() {
    injectStyle();

    if (!state.ready || !state.context) return;

    const selector = CONFIG.lineSelectors.join(",");

    for (const line of document.querySelectorAll(selector)) {
      if (!(line instanceof HTMLElement)) continue;

      const text = line.textContent || "";
      if (!text.includes("import") && !text.includes("from") && !text.includes("require")) continue;

      linkifyLine(line, text);
    }
  }

  /**
   * Marks local imports in one GitHub code line.
   *
   * @param {HTMLElement} line Code line element.
   * @param {string} text Line text.
   * @returns {void}
   */
  function linkifyLine(line, text) {
    IMPORT_RE.lastIndex = 0;

    let match;

    while ((match = IMPORT_RE.exec(text))) {
      const importPath = match[2];
      if (!isLocalLikeImport(importPath)) continue;

      const span = findImportSpan(line, importPath);
      if (!span || span.getAttribute(CONFIG.processedAttr) === importPath) continue;

      const resolvedPath = resolveImport(importPath, state.context);

      span.setAttribute(CONFIG.processedAttr, importPath);
      span.setAttribute(CONFIG.importAttr, importPath);
      span.classList.add(CONFIG.linkedClass);

      if (!resolvedPath) {
        span.classList.add(CONFIG.unresolvedClass);
        span.setAttribute("title", `Could not resolve ${importPath}`);
        continue;
      }

      const url = buildBlobUrl(state.context, resolvedPath);
      span.classList.remove(CONFIG.unresolvedClass);
      span.setAttribute(CONFIG.resolvedAttr, resolvedPath);
      span.setAttribute(CONFIG.urlAttr, url);
      span.setAttribute("role", "link");
      span.setAttribute("tabindex", "0");
      span.setAttribute("title", `${importPath} → ${resolvedPath}`);
    }
  }

  /**
   * Finds the syntax-highlighted span containing the import value.
   *
   * @param {HTMLElement} line Code line element.
   * @param {string} importPath Import value.
   * @returns {HTMLElement | null} Matching span.
   */
  function findImportSpan(line, importPath) {
    const spans = line.querySelectorAll(".pl-s");

    for (const span of spans) {
      if (!(span instanceof HTMLElement)) continue;

      const text = span.textContent || "";
      debug("findImportSpan", {text})
      
      if (text.includes(importPath)) return span;
    }

    return null;
  }

  /**
   * Builds a GitHub blob URL for the resolved file.
   *
   * @param {{ owner: string, repo: string, branch: string }} context GitHub context.
   * @param {string} path File path.
   * @returns {string} GitHub URL.
   */
  function buildBlobUrl(context, path) {
    return `https://github.com/${context.owner}/${context.repo}/blob/${encodeURIComponentPath(context.branch)}/${path}`;
  }

  /**
   * Opens a resolved import from click or keyboard event.
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
    if (target.classList.contains(CONFIG.unresolvedClass)) return;

    const url = target.getAttribute(CONFIG.urlAttr);
    if (!url) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    window.location.href = url;
  }

  /**
   * Copies resolved path on long press menu fallback.
   *
   * @param {PointerEvent} event Pointer event.
   * @returns {void}
   */
  function handlePointerDown(event) {
    const target =
      event.target instanceof Element
        ? event.target.closest(`.${CONFIG.linkedClass}`)
        : null;

    if (!(target instanceof HTMLElement)) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;

      const resolvedPath = target.getAttribute(CONFIG.resolvedAttr);
      if (!resolvedPath) return;

      try {
        await navigator.clipboard.writeText(resolvedPath);
        target.setAttribute("title", `Copied: ${resolvedPath}`);
        debug("Copied resolved path", resolvedPath);
      } catch {
        debug("Could not copy resolved path", resolvedPath);
      }
    }, 650);

    const cancel = () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("pointerup", cancel, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("scroll", cancel, true);
    };

    window.addEventListener("pointerup", cancel, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("scroll", cancel, true);
  }

  /**
   * Injects visual styles.
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
        text-decoration-style: dotted !important;
        text-decoration-thickness: 1.5px !important;
        text-underline-offset: 3px !important;
        text-decoration-color: #60a5fa !important;
        background:
          linear-gradient(
            rgba(96, 165, 250, 0.12),
            rgba(96, 165, 250, 0.12)
          ) !important;
        -webkit-tap-highlight-color: rgba(96, 165, 250, 0.28) !important;
      }

      .${CONFIG.linkedClass}::after {
        content: "" !important;
        position: absolute !important;
        inset: -1px !important;
        border-radius: 5px !important;
        pointer-events: none !important;
        box-shadow: inset 0 -1px 0 rgba(96, 165, 250, 0.85) !important;
      }

      .${CONFIG.linkedClass}:active,
      .${CONFIG.linkedClass}:hover {
        background:
          linear-gradient(
            rgba(96, 165, 250, 0.24),
            rgba(96, 165, 250, 0.24)
          ) !important;
      }

      .${CONFIG.unresolvedClass} {
        cursor: help !important;
        text-decoration-color: #64748b !important;
        background:
          linear-gradient(
            rgba(100, 116, 139, 0.12),
            rgba(100, 116, 139, 0.12)
          ) !important;
      }

      .${CONFIG.unresolvedClass}::after {
        box-shadow: inset 0 -1px 0 rgba(100, 116, 139, 0.7) !important;
      }
    `;

    document.documentElement.appendChild(style);
  }

  /**
   * Debounces noisy DOM updates.
   *
   * @param {() => void} fn Callback.
   * @param {number} wait Delay in milliseconds.
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
   * Normalizes path separators and dot segments.
   *
   * @param {string} path Input path.
   * @returns {string} Normalized path.
   */
  function normalizePath(path) {
    const parts = [];

    for (const part of path.replace(/\\/g, "/").split("/")) {
      if (!part || part === ".") continue;

      if (part === "..") {
        parts.pop();
        continue;
      }

      parts.push(part);
    }

    return parts.join("/");
  }

  /**
   * Joins path segments.
   *
   * @param {...string} parts Path segments.
   * @returns {string} Joined path.
   */
  function joinPath(...parts) {
    return normalizePath(parts.join("/"));
  }

  /**
   * Gets directory name from a path.
   *
   * @param {string} path File path.
   * @returns {string} Directory path.
   */
  function dirname(path) {
    const normalized = normalizePath(path);
    const index = normalized.lastIndexOf("/");
    return index === -1 ? "" : normalized.slice(0, index);
  }

  /**
   * Gets basename from a path.
   *
   * @param {string} path File path.
   * @returns {string} File name.
   */
  function basename(path) {
    const normalized = normalizePath(path);
    const index = normalized.lastIndexOf("/");
    return index === -1 ? normalized : normalized.slice(index + 1);
  }

  /**
   * Boots or refreshes the script for GitHub soft navigation.
   *
   * @returns {Promise<void>}
   */
  async function refreshContext() {
    const context = getCurrentContext();
    if (!context) return;

    const contextKey = `${context.owner}/${context.repo}/${context.branch}/${context.path}`;
    if (state.contextKey === contextKey && state.ready) {
      scan();
      return;
    }

    state.contextKey = contextKey;
    state.context = context;
    state.ready = false;

    if (state.loading) return;
    state.loading = true;

    try {
      await loadRepoContext(context);
      scan();
    } catch (error) {
      debug("Failed to load repository context", error);
    } finally {
      state.loading = false;
    }
  }

  /**
   * Starts observers and event delegation.
   *
   * @returns {void}
   */
  function boot() {
    injectStyle();

    const scheduleRefresh = debounce(() => {
      void refreshContext();
    }, 160);

    void refreshContext();

    new MutationObserver(scheduleRefresh).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("popstate", scheduleRefresh, { passive: true });
    window.addEventListener("hashchange", scheduleRefresh, { passive: true });
    window.setInterval(scheduleRefresh, CONFIG.scanMs);

    document.addEventListener("click", openFromEvent, true);
    document.addEventListener("pointerdown", handlePointerDown, true);

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