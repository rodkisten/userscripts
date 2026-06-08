// ==UserScript==
// @name         003 / Alerta / Elements Plugin
// @namespace    https://rod.dev/userscripts
// @version      2.6.0
// @description  Preact Signals Elements plugin for Rod Docked Inspector with external source preview, box model, editable styles, DOM props, picker, $0, and lazy tree rendering.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @weight       997
// @grant        none
// @noframes
// ==/UserScript==

(async function RodDockedInspectorElementsPlugin() {
  "use strict";

  /***************/
  /* Constants   */
  /***************/

  const GLOBAL_NAME = "RodDockedInspector";
  const ROOT_ID = "__rod_docked_inspector_root__";
  const PLUGIN_ID = "elements";
  const MOUNT_ID = "__rod_elements_plugin_preact_mount__";
  const STORAGE_KEY = "rod.docked.inspector.elements.plugin.v2.6.0";
  const STYLE_ID = "rod-docked-inspector-elements-plugin-style-v2-6-0";

  const READY_TIMEOUT_MS = 15_000;
  const READY_INTERVAL_MS = 80;
  const LONG_PRESS_MS = 360;
  const FLASH_MS = 1600;

  const DEFAULT_VISIBLE_CHILDREN = 80;
  const CHILDREN_STEP = 80;
  const MAX_CHILDREN_PER_NODE = 260;
  const MAX_RENDER_DEPTH = 18;
  const MAX_ATTRS_PER_NODE = 18;
  const MAX_ATTR_VALUE_LENGTH = 180;
  const MAX_TEXT_LENGTH = 220;
  const AUTO_PRETTY_THRESHOLD = 90_000;
  const EXTERNAL_SOURCE_PRETTY_THRESHOLD = 160_000;

  const MENU_WIDTH = 188;
  const MENU_ITEM_HEIGHT = 30;
  const MENU_PADDING = 6;
  const EDGE_GAP = 8;

  const EDITABLE_STYLE_PROPERTIES = [
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "zIndex",
    "width",
    "height",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    "margin",
    "padding",
    "border",
    "borderRadius",
    "background",
    "backgroundColor",
    "color",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "textAlign",
    "opacity",
    "transform",
    "overflow",
    "boxShadow",
    "outline",
  ];

  const EDITABLE_DOM_FIELDS = [
    { key: "id", label: "id", type: "text" },
    { key: "className", label: "class", type: "text" },
    { key: "title", label: "title", type: "text" },
    { key: "hidden", label: "hidden", type: "checkbox" },
    { key: "contentEditable", label: "contentEditable", type: "select", options: ["inherit", "true", "false", "plaintext-only"] },
    { key: "dir", label: "dir", type: "select", options: ["", "auto", "ltr", "rtl"] },
    { key: "lang", label: "lang", type: "text" },
    { key: "tabIndex", label: "tabIndex", type: "number" },
    { key: "draggable", label: "draggable", type: "checkbox" },
    { key: "innerText", label: "innerText", type: "textarea" },
  ];

  /***************/
  /* Runtime     */
  /***************/

  const [{ h, render }, signals] = await Promise.all([
    import("https://esm.sh/preact@10.26.4?bundle"),
    import("https://esm.sh/@preact/signals@1.3.2?bundle"),
  ]);

  const { signal, computed } = signals;

  let apiRef = null;
  let longPressTimer = 0;
  let pickerActive = false;
  let hoveredElement = null;

  const nodeRefs = new WeakMap();
  const nodePathCache = new WeakMap();

  const state = signal(readPluginState());
  const selectedElement = computed(() => {
    const refId = state.value.selectedRefId;
    const value = refId == null ? null : read(refId);

    return value instanceof Element ? value : null;
  });

  /***************/
  /* Boot        */
  /***************/

  const inspector = await whenGlobalReady(GLOBAL_NAME);

  if (!inspector?.registerPlugin) {
    console.warn("[Elements Plugin] RodDockedInspector.registerPlugin was not found.");
    return;
  }

  inspector.registerPlugin({
    id: PLUGIN_ID,
    title: "Elements",
    icon: "square-mouse-pointer",
    order: 1,
    setup,
    render(api) {
      apiRef = api;
      queuePreactRender();

      return api.html`
        <section class="ra-elements-plugin-shell">
          <div id="${MOUNT_ID}"></div>
        </section>
      `;
    },
  });

  console.info("%c[Elements Plugin]%c Preact Signals registered v2.6.0", "color:#7dd3fc;font-weight:900", "color:inherit");

  /***************/
  /* Helpers     */
  /***************/

  /**
   * Waits until a window global is ready.
   *
   * @param {string} name Global name.
   * @returns {Promise<unknown>} Resolved global.
   */
  function whenGlobalReady(name) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      const intervalId = setInterval(() => {
        const value = window[name];

        if (value) {
          clearInterval(intervalId);
          resolve(value);
          return;
        }

        if (Date.now() - startedAt >= READY_TIMEOUT_MS) {
          clearInterval(intervalId);
          reject(new Error(`${name} was not found after ${READY_TIMEOUT_MS}ms`));
        }
      }, READY_INTERVAL_MS);
    });
  }

  /**
   * Reads persisted plugin state.
   *
   * @returns {object} Plugin state.
   */
  function readPluginState() {
    const fallback = {
      expanded: ["html", "html.0", "html.1"],
      visibleLimits: {},
      selectedPath: "html",
      selectedRefId: null,
      selectedPanel: "styles",
      showTextNodes: false,
      wrap: true,
      showInlineSource: false,
      menu: null,
      persistedStyles: {},
      persistedDomFields: {},
    };

    try {
      return {
        ...fallback,
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
        menu: null,
      };
    } catch {
      return fallback;
    }
  }

  /**
   * Updates signal state and persists it.
   *
   * @param {Partial<object>} patch Partial state.
   * @returns {void}
   */
  function setState(patch) {
    state.value = {
      ...state.value,
      ...patch,
    };

    savePluginState();
  }

  /**
   * Persists stable plugin state.
   *
   * @returns {void}
   */
  function savePluginState() {
    const payload = {
      ...state.value,
      menu: null,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  /**
   * Stores a value in the host object store.
   *
   * @param {unknown} value Value.
   * @returns {number | string | null} Ref id.
   */
  function store(value) {
    return apiRef?.objectStore?.set?.(value) ?? null;
  }

  /**
   * Reads a value from host object store.
   *
   * @param {string | number} id Ref id.
   * @returns {unknown} Stored value.
   */
  function read(id) {
    return apiRef?.objectStore?.get?.(Number(id)) ?? apiRef?.objectStore?.get?.(id);
  }

  /**
   * Gets a stable ref id for a node.
   *
   * @param {Node} node DOM node.
   * @returns {number | string | null} Ref id.
   */
  function getNodeRefId(node) {
    if (nodeRefs.has(node)) return nodeRefs.get(node);

    const refId = store(node);
    nodeRefs.set(node, refId);

    return refId;
  }

  /**
   * Escapes HTML for safe string fragments.
   *
   * @param {unknown} value Raw value.
   * @returns {string} Escaped string.
   */
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /**
   * Trims long text.
   *
   * @param {unknown} value Input.
   * @param {number} limit Max length.
   * @returns {string} Trimmed text.
   */
  function trimText(value, limit) {
    const text = String(value ?? "");

    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  }

  /**
   * Checks whether a node belongs to the inspector itself.
   *
   * @param {Node | null} node DOM node.
   * @returns {boolean} True when inspector-owned.
   */
  function isInspectorNode(node) {
    return Boolean(node && document.getElementById(ROOT_ID)?.contains(node));
  }

  /**
   * Checks whether a node should be hidden.
   *
   * @param {Node} node DOM node.
   * @returns {boolean} True when hidden.
   */
  function shouldSkipNode(node) {
    if (isInspectorNode(node)) return true;
    if (node.nodeType === Node.COMMENT_NODE) return true;

    if (node.nodeType === Node.TEXT_NODE) {
      return !state.value.showTextNodes || !node.textContent?.trim();
    }

    return false;
  }

  /**
   * Copies text with clipboard fallback.
   *
   * @param {string} value Text.
   * @returns {void}
   */
  function copyText(value) {
    const text = String(value);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
      return;
    }

    fallbackCopyText(text);
  }

  /**
   * Copies text through a temporary textarea.
   *
   * @param {string} text Text.
   * @returns {void}
   */
  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
    document.documentElement.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  /****************/
  /* Formatting   */
  /****************/

  /**
   * Formats a compact element tag.
   *
   * @param {Element} element Element.
   * @returns {string} Compact tag.
   */
  function formatCompactTag(element) {
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const className =
      typeof element.className === "string" && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).slice(0, 4).join(".")}`
        : "";

    return `<${tagName}${id}${className}>`;
  }

  /**
   * Gets element source language.
   *
   * @param {Element} element Element.
   * @returns {"xml" | "css" | "javascript"} Source language.
   */
  function getElementLanguage(element) {
    if (element instanceof HTMLStyleElement) return "css";
    if (element instanceof HTMLScriptElement) return "javascript";

    return "xml";
  }

  /**
   * Gets element source.
   *
   * @param {Element} element Element.
   * @returns {string} Source.
   */
  function getElementSource(element) {
    if (element instanceof HTMLStyleElement) return element.textContent || "";
    if (element instanceof HTMLScriptElement) return element.textContent || "";

    return element.outerHTML || "";
  }

  /**
   * Gets href/src URL from an element.
   *
   * @param {Element} element Element.
   * @returns {string} URL.
   */
  function getElementUrl(element) {
    return element.getAttribute("href") || element.getAttribute("src") || "";
  }

  /**
   * Checks whether element has external source.
   *
   * @param {Element} element Element.
   * @returns {boolean} True when external.
   */
  function hasExternalSource(element) {
    const url = getElementUrl(element);

    return Boolean(url && /^(https?:)?\/\//i.test(url));
  }

  /**
   * Resolves URL against current page.
   *
   * @param {Element} element Element.
   * @returns {string} Absolute URL.
   */
  function getAbsoluteResourceUrl(element) {
    const url = getElementUrl(element);

    if (!url) return "";

    try {
      return new URL(url, location.href).href;
    } catch {
      return url;
    }
  }

  /**
   * Pretty-formats source when safe.
   *
   * @param {string} source Source.
   * @param {string} language Language.
   * @returns {string} Pretty source.
   */
  function prettySource(source, language) {
    if (source.length > AUTO_PRETTY_THRESHOLD) return source;

    if (window.prettier && window.prettierPlugins) {
      try {
        const parser = language === "css" ? "css" : language === "javascript" ? "babel" : "html";

        return window.prettier.format(source, {
          parser,
          plugins: window.prettierPlugins,
        });
      } catch {}
    }

    if (language === "css") {
      return source
        .replace(/\s*{\s*/g, " {\n  ")
        .replace(/;\s*/g, ";\n  ")
        .replace(/\s*}\s*/g, "\n}\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    if (language === "xml") {
      return source
        .replace(/>\s+</g, "><")
        .replace(/</g, "\n<")
        .replace(/>/g, ">\n")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
    }

    return source.trim();
  }

  /****************/
  /* DOM paths    */
  /****************/

  /**
   * Gets renderable children.
   *
   * @param {Node} node Parent.
   * @returns {Node[]} Children.
   */
  function getRenderableChildren(node) {
    const output = [];
    const children = node.childNodes;

    for (let index = 0; index < children.length && output.length < MAX_CHILDREN_PER_NODE; index += 1) {
      const child = children[index];

      if (!shouldSkipNode(child)) output.push(child);
    }

    return output;
  }

  /**
   * Gets child path.
   *
   * @param {string} parentPath Parent path.
   * @param {number} index Index.
   * @returns {string} Path.
   */
  function getChildPath(parentPath, index) {
    return `${parentPath}.${index}`;
  }

  /**
   * Gets a path for an element.
   *
   * @param {Element} element Element.
   * @returns {string} Path.
   */
  function getPathForElement(element) {
    if (nodePathCache.has(element)) return nodePathCache.get(element);

    const chain = [];
    let current = element;

    while (current && current !== document.documentElement) {
      const parent = current.parentNode;

      if (!parent) break;

      const siblings = Array.from(parent.childNodes).filter((node) => !shouldSkipNode(node));
      chain.unshift(Math.max(0, siblings.indexOf(current)));
      current = parent instanceof Element ? parent : null;
    }

    const path = ["html", ...chain].join(".");
    nodePathCache.set(element, path);

    return path;
  }

  /**
   * Escapes CSS selector value.
   *
   * @param {string} value Raw value.
   * @returns {string} Escaped value.
   */
  function safeCssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);

    return String(value).replace(/["\\]/g, "\\$&");
  }

  /***************/
  /* Actions     */
  /***************/

  /**
   * Reveals an element in tree and opens panel.
   *
   * @param {Element} element Element.
   * @returns {void}
   */
  function revealElementInTree(element) {
    const path = getPathForElement(element);
    const expanded = new Set(state.value.expanded);
    const parts = path.split(".");

    for (let index = 1; index <= parts.length; index += 1) {
      expanded.add(parts.slice(0, index).join("."));
    }

    setState({
      expanded: Array.from(expanded),
      selectedPath: path,
      selectedRefId: getNodeRefId(element),
    });

    if (apiRef?.state) apiRef.state.tab = PLUGIN_ID;

    apiRef?.open?.();

    requestAnimationFrame(() => {
      document
        .querySelector(`[data-elements-path="${safeCssEscape(path)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
  }

  /**
   * Toggles path open/closed.
   *
   * @param {string} path Path.
   * @returns {void}
   */
  function togglePath(path) {
    const expanded = new Set(state.value.expanded);

    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);

    setState({ expanded: Array.from(expanded) });
  }

  /**
   * Selects a node.
   *
   * @param {string} path Path.
   * @param {Element} element Element.
   * @returns {void}
   */
  function selectPath(path, element) {
    window.$0 = element;

    setState({
      selectedPath: path,
      selectedRefId: getNodeRefId(element),
    });
  }

  /**
   * Loads more children for a node.
   *
   * @param {string} path Path.
   * @returns {void}
   */
  function loadMoreChildren(path) {
    setState({
      visibleLimits: {
        ...state.value.visibleLimits,
        [path]: (state.value.visibleLimits[path] || DEFAULT_VISIBLE_CHILDREN) + CHILDREN_STEP,
      },
    });
  }

  /**
   * Opens local source using host modal.
   *
   * @param {Element} element Element.
   * @returns {void}
   */
  function openSource(element) {
    const rawSource = getElementSource(element);
    const language = getElementLanguage(element);
    const source = rawSource.length <= AUTO_PRETTY_THRESHOLD ? prettySource(rawSource, language) : rawSource;

    apiRef?.modal?.openSource?.({
      title: formatCompactTag(element),
      source,
      language,
      refId: getNodeRefId(element),
    });
  }

  /**
   * Opens external source preview using host modal.
   *
   * @param {Element} element Element.
   * @returns {Promise<void>} Fetch task.
   */
  async function openExternalSource(element) {
    const url = getAbsoluteResourceUrl(element);
    const language = getElementLanguage(element);

    apiRef?.modal?.openSource?.({
      title: `Loading ${url}`,
      source: `Loading external resource...\n\n${url}`,
      language: "text",
      refId: getNodeRefId(element),
    });

    try {
      const response = await fetch(url, {
        credentials: "include",
        cache: "force-cache",
      });

      const source = await response.text();
      const finalSource =
        source.length <= EXTERNAL_SOURCE_PRETTY_THRESHOLD ? prettySource(source, language) : source;

      apiRef?.modal?.openSource?.({
        title: `${response.status} ${url}`,
        source: finalSource,
        language,
        refId: getNodeRefId(element),
      });
    } catch (error) {
      apiRef?.modal?.openSource?.({
        title: `Failed to fetch ${url}`,
        source: `${error?.name || "Error"}: ${error?.message || String(error)}\n\nURL: ${url}`,
        language: "text",
        refId: getNodeRefId(element),
      });
    }
  }

  /**
   * Focuses and flashes element.
   *
   * @param {Element} element Element.
   * @returns {void}
   */
  function focusElement(element) {
    window.$0 = element;
    apiRef?.minimize?.();

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });

    const previousOutline = element.style.outline;
    const previousOutlineOffset = element.style.outlineOffset;
    const previousTransition = element.style.transition;

    element.style.transition = "outline 140ms ease, outline-offset 140ms ease";
    element.style.outline = "4px solid rgba(125, 211, 252, .96)";
    element.style.outlineOffset = "5px";

    setTimeout(() => {
      element.style.outline = previousOutline;
      element.style.outlineOffset = previousOutlineOffset;
      element.style.transition = previousTransition;
    }, FLASH_MS);
  }

  /**
   * Runs menu action.
   *
   * @param {string} action Action.
   * @param {Element} element Element.
   * @returns {void}
   */
  function runElementAction(action, element) {
    if (action === "focus") focusElement(element);
    if (action === "source") openSource(element);
    if (action === "external-source") openExternalSource(element);
    if (action === "dollar") window.$0 = element;
    if (action === "copy-outer") copyText(element.outerHTML);
    if (action === "copy-inner") copyText(element.innerHTML);
    if (action === "copy-text") copyText(element.textContent || "");

    if (action === "delete") {
      element.remove();
      closeMenu();
      queuePreactRender();
      return;
    }

    if (action === "open-url") {
      const url = getAbsoluteResourceUrl(element);

      if (url) window.open(url, "_blank", "noopener,noreferrer");
    }

    closeMenu();
  }

  /***************/
  /* Editing     */
  /***************/

  /**
   * Gets stable storage key for element edits.
   *
   * @param {Element} element Element.
   * @returns {string} Storage key.
   */
  function getElementStorageKey(element) {
    const path = getPathForElement(element);
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const classes =
      typeof element.className === "string" && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).join(".")}`
        : "";

    return `${location.href}::${path}::${tag}${id}${classes}`;
  }

  /**
   * Applies persisted styles to element.
   *
   * @param {Element} element Element.
   * @returns {void}
   */
  function applyPersistedStyles(element) {
    const styles = state.value.persistedStyles?.[getElementStorageKey(element)];

    if (!styles) return;

    for (const [property, value] of Object.entries(styles)) {
      element.style[property] = String(value ?? "");
    }
  }

  /**
   * Applies persisted DOM fields.
   *
   * @param {Element} element Element.
   * @returns {void}
   */
  function applyPersistedDomFields(element) {
    const fields = state.value.persistedDomFields?.[getElementStorageKey(element)];

    if (!fields) return;

    for (const [field, value] of Object.entries(fields)) {
      try {
        element[field] = value;
      } catch {}
    }
  }

  /**
   * Updates and persists style property.
   *
   * @param {Element} element Element.
   * @param {string} property Property.
   * @param {string} value Value.
   * @returns {void}
   */
  function updateStyleProperty(element, property, value) {
    const key = getElementStorageKey(element);
    const all = { ...state.value.persistedStyles };
    const current = { ...(all[key] || {}) };

    current[property] = value;
    all[key] = current;
    element.style[property] = value;

    setState({ persistedStyles: all });
  }

  /**
   * Updates and persists DOM field.
   *
   * @param {Element} element Element.
   * @param {string} field Field.
   * @param {unknown} value Value.
   * @returns {void}
   */
  function updateDomField(element, field, value) {
    const key = getElementStorageKey(element);
    const all = { ...state.value.persistedDomFields };
    const current = { ...(all[key] || {}) };

    current[field] = value;
    all[key] = current;

    try {
      element[field] = value;
    } catch {}

    setState({ persistedDomFields: all });
  }

  /**
   * Gets element box model.
   *
   * @param {Element} element Element.
   * @returns {object} Box model.
   */
  function getBoxModel(element) {
    const rect = element.getBoundingClientRect();
    const styles = getComputedStyle(element);

    return {
      size: `${Math.round(rect.width)} × ${Math.round(rect.height)}`,
      margin: [styles.marginTop, styles.marginRight, styles.marginBottom, styles.marginLeft],
      border: [styles.borderTopWidth, styles.borderRightWidth, styles.borderBottomWidth, styles.borderLeftWidth],
      padding: [styles.paddingTop, styles.paddingRight, styles.paddingBottom, styles.paddingLeft],
    };
  }

  /***************/
  /* Picker      */
  /***************/

  /**
   * Starts picker mode.
   *
   * @returns {void}
   */
  function startPicker() {
    if (pickerActive) return;

    pickerActive = true;
    document.addEventListener("pointermove", handlePickerMove, true);
    document.addEventListener("click", handlePickerClick, true);
    apiRef?.minimize?.();
  }

  /**
   * Stops picker mode.
   *
   * @returns {void}
   */
  function stopPicker() {
    pickerActive = false;
    clearHover();
    document.removeEventListener("pointermove", handlePickerMove, true);
    document.removeEventListener("click", handlePickerClick, true);
  }

  /**
   * Handles picker hover.
   *
   * @param {PointerEvent} event Event.
   * @returns {void}
   */
  function handlePickerMove(event) {
    const target = event.target;

    if (!(target instanceof Element) || isInspectorNode(target)) return;
    if (hoveredElement === target) return;

    clearHover();

    hoveredElement = target;
    hoveredElement.__rodPreviousOutline = hoveredElement.style.outline;
    hoveredElement.__rodPreviousOutlineOffset = hoveredElement.style.outlineOffset;
    hoveredElement.style.outline = "3px solid rgba(251, 146, 60, .96)";
    hoveredElement.style.outlineOffset = "4px";
  }

  /**
   * Handles picker click.
   *
   * @param {MouseEvent} event Event.
   * @returns {void}
   */
  function handlePickerClick(event) {
    const target = event.target;

    if (!(target instanceof Element) || isInspectorNode(target)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    stopPicker();
    revealElementInTree(target);
  }

  /**
   * Clears picker hover.
   *
   * @returns {void}
   */
  function clearHover() {
    if (!hoveredElement) return;

    hoveredElement.style.outline = hoveredElement.__rodPreviousOutline || "";
    hoveredElement.style.outlineOffset = hoveredElement.__rodPreviousOutlineOffset || "";
    hoveredElement = null;
  }

  /***************/
  /* Menu        */
  /***************/

  /**
   * Gets safe menu position.
   *
   * @param {PointerEvent} event Event.
   * @param {number} itemCount Item count.
   * @returns {{x: number, y: number}} Position.
   */
  function getSafeMenuPosition(event, itemCount) {
    const height = itemCount * MENU_ITEM_HEIGHT + MENU_PADDING * 2;

    return {
      x: Math.max(EDGE_GAP, Math.min(event.clientX + 5, window.innerWidth - MENU_WIDTH - EDGE_GAP)),
      y: Math.max(EDGE_GAP, Math.min(event.clientY + 5, window.innerHeight - height - EDGE_GAP)),
    };
  }

  /**
   * Opens context menu.
   *
   * @param {PointerEvent} event Event.
   * @param {Element} element Element.
   * @returns {void}
   */
  function openMenu(event, element) {
    const itemCount = hasExternalSource(element) ? 9 : getElementUrl(element) ? 8 : 7;
    const position = getSafeMenuPosition(event, itemCount);

    setState({
      menu: {
        x: position.x,
        y: position.y,
        refId: getNodeRefId(element),
      },
    });
  }

  /**
   * Closes menu.
   *
   * @returns {void}
   */
  function closeMenu() {
    setState({ menu: null });
  }

  /****************/
  /* Preact Views  */
  /****************/

  /**
   * Queues Preact mount after host Lit render.
   *
   * @returns {void}
   */
  function queuePreactRender() {
    requestAnimationFrame(() => {
      const mount = document.getElementById(MOUNT_ID);

      if (!mount) return;

      render(h(App), mount);
    });
  }

  /**
   * Main app.
   *
   * @returns {import("preact").VNode} App node.
   */
  function App() {
    const snapshot = state.value;

    return h(
      "section",
      {
        className: `ra-elements-plugin ${snapshot.wrap ? "ra-wrap" : ""}`,
        onPointerDown(event) {
          const target = event.target;

          if (target instanceof Element && !target.closest(".ra-elements-menu")) {
            closeMenu();
          }
        },
      },
      h(Toolbar),
      h(
        "div",
        { className: "ra-elements-layout" },
        h("div", { className: "ra-elements-tree" }, h(TreeNode, { node: document.documentElement, path: "html", depth: 0 })),
        h(SelectedPanel),
      ),
      h(ContextMenu),
    );
  }

  /**
   * Toolbar.
   *
   * @returns {import("preact").VNode} Toolbar node.
   */
  function Toolbar() {
    const snapshot = state.value;

    return h(
      "div",
      { className: "ra-elements-toolbar" },
      h("button", { type: "button", onClick: queuePreactRender }, iconNode("refresh-cw")),
      h("button", { type: "button", onClick: startPicker }, iconNode("mouse-pointer-click"), "Pick"),
      h("button", { type: "button", onClick: () => setState({ wrap: !snapshot.wrap }) }, iconNode("wrap-text"), "Wrap"),
      h("button", { type: "button", onClick: () => setState({ showTextNodes: !snapshot.showTextNodes }) }, iconNode("text-cursor-input"), "Text"),
      h("button", { type: "button", onClick: () => setState({ showInlineSource: !snapshot.showInlineSource }) }, iconNode("code-2"), "Inline"),
      h("button", { type: "button", onClick: () => setState({ expanded: ["html"], visibleLimits: {} }) }, iconNode("fold-horizontal"), "Collapse"),
    );
  }

  /**
   * Renders a Lucide placeholder.
   *
   * @param {string} name Icon name.
   * @returns {import("preact").VNode} Icon node.
   */
  function iconNode(name) {
    requestAnimationFrame(() => window.lucide?.createIcons?.({ attrs: { "stroke-width": 2 } }));

    return h("i", {
      "data-lucide": name,
      className: "ra-icon",
      "aria-hidden": "true",
    });
  }

  /**
   * Renders attributes.
   *
   * @param {{element: Element}} props Props.
   * @returns {import("preact").VNode[]} Nodes.
   */
  function Attributes({ element }) {
    return Array.from(element.attributes)
      .slice(0, MAX_ATTRS_PER_NODE)
      .map((attr) =>
        h(
          "span",
          { className: "ra-elements-attr", key: attr.name },
          " ",
          h("span", { className: "ra-elements-attr-name" }, attr.name),
          h("span", { className: "ra-elements-equals" }, "="),
          h("span", { className: "ra-elements-attr-value" }, `"${trimText(attr.value, MAX_ATTR_VALUE_LENGTH)}"`),
        ),
      );
  }

  /**
   * Tree node.
   *
   * @param {{node: Node, path: string, depth: number}} props Props.
   * @returns {import("preact").VNode | null} Tree node.
   */
  function TreeNode({ node, path, depth }) {
    const snapshot = state.value;

    if (shouldSkipNode(node)) return null;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();

      if (!text || !snapshot.showTextNodes) return null;

      return h(
        "div",
        { className: "ra-elements-row ra-elements-text-row", style: `--depth:${depth}` },
        h("span"),
        h("span", { className: "ra-elements-text" }, `"${trimText(text, MAX_TEXT_LENGTH)}"`),
      );
    }

    if (!(node instanceof Element)) return null;

    applyPersistedStyles(node);
    applyPersistedDomFields(node);

    const refId = getNodeRefId(node);
    const isOpen = snapshot.expanded.includes(path);
    const isSelected = snapshot.selectedPath === path || snapshot.selectedRefId === refId;
    const tagName = node.tagName.toLowerCase();
    const children = isOpen && depth < MAX_RENDER_DEPTH ? getRenderableChildren(node) : [];
    const childCount = getRenderableChildren(node).length;
    const hasChildren = childCount > 0;
    const visibleLimit = snapshot.visibleLimits[path] || DEFAULT_VISIBLE_CHILDREN;
    const visibleChildren = children.slice(0, visibleLimit);
    const hasMore = children.length > visibleChildren.length;

    return h(
      "div",
      { className: "ra-elements-node" },
      h(
        "div",
        {
          className: `ra-elements-row ${isSelected ? "ra-elements-selected" : ""}`,
          style: `--depth:${depth}`,
          "data-elements-ref": refId,
          "data-elements-path": path,
          onClick(event) {
            event.preventDefault();
            event.stopPropagation();
            selectPath(path, node);
          },
          onDblClick(event) {
            event.preventDefault();
            event.stopPropagation();
            togglePath(path);
          },
          onPointerDown(event) {
            clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => openMenu(event, node), LONG_PRESS_MS);
          },
          onPointerMove() {
            clearTimeout(longPressTimer);
          },
          onPointerUp() {
            clearTimeout(longPressTimer);
          },
          onPointerCancel() {
            clearTimeout(longPressTimer);
          },
        },
        h(
          "button",
          {
            className: "ra-elements-toggle",
            type: "button",
            disabled: !hasChildren,
            onClick(event) {
              event.preventDefault();
              event.stopPropagation();
              togglePath(path);
            },
          },
          hasChildren ? iconNode(isOpen ? "chevron-down" : "chevron-right") : null,
        ),
        h(
          "span",
          { className: "ra-elements-tag" },
          h("span", { className: "ra-elements-punctuation" }, "<"),
          h("span", { className: "ra-elements-tag-name" }, tagName),
          h(Attributes, { element: node }),
          h("span", { className: "ra-elements-punctuation" }, ">"),
        ),
        h(
          "span",
          { className: "ra-elements-inline-actions" },
          h("button", { type: "button", onClick: stopAnd(() => focusElement(node)) }, iconNode("scan-search")),
          h("button", { type: "button", onClick: stopAnd(() => openSource(node)) }, iconNode("code-2")),
          hasExternalSource(node)
            ? h("button", { type: "button", onClick: stopAnd(() => openExternalSource(node)) }, iconNode("download"))
            : null,
          h("button", { type: "button", onClick: stopAnd(() => { window.$0 = node; }) }, "$0"),
        ),
      ),
      isOpen ? h(InlineSource, { element: node, depth }) : null,
      isOpen
        ? visibleChildren.map((child, index) =>
            h(TreeNode, {
              key: getChildPath(path, index),
              node: child,
              path: getChildPath(path, index),
              depth: depth + 1,
            }),
          )
        : null,
      isOpen && hasMore
        ? h(
            "button",
            {
              className: "ra-elements-more",
              type: "button",
              style: `--depth:${depth + 1}`,
              onClick(event) {
                event.preventDefault();
                event.stopPropagation();
                loadMoreChildren(path);
              },
            },
            iconNode("plus"),
            ` Load ${Math.min(CHILDREN_STEP, children.length - visibleChildren.length)} more`,
          )
        : null,
      isOpen
        ? h(
            "div",
            { className: "ra-elements-row ra-elements-close-row", style: `--depth:${depth}` },
            h("span"),
            h(
              "span",
              { className: "ra-elements-tag" },
              h("span", { className: "ra-elements-punctuation" }, "</"),
              h("span", { className: "ra-elements-tag-name" }, tagName),
              h("span", { className: "ra-elements-punctuation" }, ">"),
            ),
          )
        : null,
    );
  }

  /**
   * Stops event then runs callback.
   *
   * @param {() => void} callback Callback.
   * @returns {(event: Event) => void} Handler.
   */
  function stopAnd(callback) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();
      callback();
    };
  }

  /**
   * Inline source preview.
   *
   * @param {{element: Element, depth: number}} props Props.
   * @returns {import("preact").VNode | null} Node.
   */
  function InlineSource({ element, depth }) {
    if (!state.value.showInlineSource) return null;
    if (!(element instanceof HTMLStyleElement) && !(element instanceof HTMLScriptElement)) return null;

    const source = getElementSource(element).trim();

    if (!source) return null;

    return h(
      "div",
      { className: "ra-elements-source-row", style: `--depth:${depth + 1}` },
      h("pre", null, trimText(source, 360)),
      h("button", { type: "button", onClick: () => openSource(element) }, iconNode("code-2"), " source"),
    );
  }

  /**
   * Context menu.
   *
   * @returns {import("preact").VNode | null} Menu.
   */
  function ContextMenu() {
    const menu = state.value.menu;

    if (!menu) return null;

    const element = read(menu.refId);

    if (!(element instanceof Element)) return null;

    const url = getElementUrl(element);
    const external = hasExternalSource(element);

    return h(
      "div",
      {
        className: "ra-elements-menu",
        style: `left:${menu.x}px;top:${menu.y}px`,
        onPointerDown(event) {
          event.stopPropagation();
        },
      },
      h("button", { type: "button", onClick: () => runElementAction("source", element) }, iconNode("code-2"), " Source"),
      external ? h("button", { type: "button", onClick: () => runElementAction("external-source", element) }, iconNode("download"), " Fetch preview") : null,
      h("button", { type: "button", onClick: () => runElementAction("focus", element) }, iconNode("scan-search"), " Focus"),
      h("button", { type: "button", onClick: () => runElementAction("dollar", element) }, iconNode("badge-dollar-sign"), " Set $0"),
      h("button", { type: "button", onClick: () => runElementAction("copy-outer", element) }, iconNode("copy"), " outerHTML"),
      h("button", { type: "button", onClick: () => runElementAction("copy-inner", element) }, iconNode("copy-plus"), " innerHTML"),
      h("button", { type: "button", onClick: () => runElementAction("copy-text", element) }, iconNode("text"), " Text"),
      url ? h("button", { type: "button", onClick: () => runElementAction("open-url", element) }, iconNode("external-link"), " Open URL") : null,
      h("button", { type: "button", className: "ra-elements-danger", onClick: () => runElementAction("delete", element) }, iconNode("trash-2"), " Delete"),
    );
  }

  /**
   * Selected panel.
   *
   * @returns {import("preact").VNode} Panel.
   */
  function SelectedPanel() {
    const element = selectedElement.value;

    if (!element) {
      return h(
        "aside",
        { className: "ra-elements-details" },
        h("div", { className: "ra-elements-empty-details" }, "Select an element to inspect styles, box model and DOM properties."),
      );
    }

    return h(
      "aside",
      { className: "ra-elements-details" },
      h(
        "header",
        { className: "ra-elements-details-head" },
        h("strong", null, formatCompactTag(element)),
        h(
          "div",
          null,
          h("button", { type: "button", onClick: () => setState({ selectedPanel: "styles" }) }, "Styles"),
          h("button", { type: "button", onClick: () => setState({ selectedPanel: "box" }) }, "Box"),
          h("button", { type: "button", onClick: () => setState({ selectedPanel: "props" }) }, "Props"),
        ),
      ),
      state.value.selectedPanel === "box" ? h(BoxModel, { element }) : null,
      state.value.selectedPanel === "props" ? h(DomProperties, { element }) : null,
      state.value.selectedPanel === "styles" ? h(StyleEditor, { element }) : null,
    );
  }

  /**
   * Box model.
   *
   * @param {{element: Element}} props Props.
   * @returns {import("preact").VNode} Box.
   */
  function BoxModel({ element }) {
    const box = getBoxModel(element);

    return h(
      "section",
      { className: "ra-elements-box" },
      h(
        "div",
        { className: "ra-box-layer ra-box-margin" },
        h("span", null, "margin"),
        h("b", null, box.margin[0]),
        h(
          "div",
          null,
          h("b", null, box.margin[3]),
          h(
            "div",
            { className: "ra-box-layer ra-box-border" },
            h("span", null, "border"),
            h("b", null, box.border[0]),
            h(
              "div",
              null,
              h("b", null, box.border[3]),
              h(
                "div",
                { className: "ra-box-layer ra-box-padding" },
                h("span", null, "padding"),
                h("b", null, box.padding[0]),
                h(
                  "div",
                  null,
                  h("b", null, box.padding[3]),
                  h("div", { className: "ra-box-content" }, box.size),
                  h("b", null, box.padding[1]),
                ),
                h("b", null, box.padding[2]),
              ),
              h("b", null, box.border[1]),
            ),
            h("b", null, box.border[2]),
          ),
          h("b", null, box.margin[1]),
        ),
        h("b", null, box.margin[2]),
      ),
    );
  }

  /**
   * Style editor.
   *
   * @param {{element: Element}} props Props.
   * @returns {import("preact").VNode} Editor.
   */
  function StyleEditor({ element }) {
    const computedStyle = getComputedStyle(element);

    return h(
      "section",
      { className: "ra-elements-editor" },
      EDITABLE_STYLE_PROPERTIES.map((property) =>
        h(
          "label",
          { className: "ra-elements-field", key: property },
          h("span", null, property),
          h("input", {
            type: "text",
            value: element.style[property] || computedStyle[property] || "",
            onChange(event) {
              updateStyleProperty(element, property, event.currentTarget.value);
            },
          }),
        ),
      ),
    );
  }

  /**
   * DOM properties.
   *
   * @param {{element: Element}} props Props.
   * @returns {import("preact").VNode} Editor.
   */
  function DomProperties({ element }) {
    return h(
      "section",
      { className: "ra-elements-editor" },
      EDITABLE_DOM_FIELDS.map((field) => h(DomField, { key: field.key, element, field })),
    );
  }

  /**
   * DOM field.
   *
   * @param {{element: Element, field: object}} props Props.
   * @returns {import("preact").VNode} Field.
   */
  function DomField({ element, field }) {
    const value = element[field.key];

    if (field.type === "checkbox") {
      return h(
        "label",
        { className: "ra-elements-field ra-elements-field-check" },
        h("span", null, field.label),
        h("input", {
          type: "checkbox",
          checked: Boolean(value),
          onChange(event) {
            updateDomField(element, field.key, event.currentTarget.checked);
          },
        }),
      );
    }

    if (field.type === "select") {
      return h(
        "label",
        { className: "ra-elements-field" },
        h("span", null, field.label),
        h(
          "select",
          {
            value: String(value ?? ""),
            onChange(event) {
              updateDomField(element, field.key, event.currentTarget.value);
            },
          },
          field.options.map((option) => h("option", { value: option, key: option }, option || "(empty)")),
        ),
      );
    }

    if (field.type === "textarea") {
      return h(
        "label",
        { className: "ra-elements-field" },
        h("span", null, field.label),
        h("textarea", {
          value: String(value ?? ""),
          onChange(event) {
            updateDomField(element, field.key, event.currentTarget.value);
          },
        }),
      );
    }

    return h(
      "label",
      { className: "ra-elements-field" },
      h("span", null, field.label),
      h("input", {
        type: field.type,
        value: String(value ?? ""),
        onChange(event) {
          const nextValue = field.type === "number" ? Number(event.currentTarget.value) : event.currentTarget.value;
          updateDomField(element, field.key, nextValue);
        },
      }),
    );
  }

  /***************/
  /* Setup       */
  /***************/

  /**
   * Sets up plugin styles.
   *
   * @param {object} api Host API.
   * @returns {void}
   */
  function setup(api) {
    apiRef = api;
    api.addStyle?.(getStyleText(), STYLE_ID);
  }

  /***************/
  /* Styles      */
  /***************/

  /**
   * Returns plugin CSS.
   *
   * @returns {string} CSS.
   */
  function getStyleText() {
    return `
      .ra-elements-plugin-shell {
        height: 100%;
        min-height: 0;
      }

      #${MOUNT_ID} {
        height: 100%;
        min-height: 0;
      }

      .ra-elements-plugin {
        height: 100%;
        overflow: hidden;
        display: grid;
        grid-template-rows: auto 1fr;
        --ra-elements-font-size: 8.5px;
        --ra-elements-line-height: 1.35;
        --ra-elements-indent: 9px;
      }

      .ra-elements-toolbar {
        position: sticky;
        top: 0;
        z-index: 6;
        display: flex;
        gap: 4px;
        padding: 3px 4px;
        border-bottom: 1px solid var(--ra-border);
        background: rgb(12 13 15 / .96);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      .ra-elements-toolbar button,
      .ra-elements-inline-actions button,
      .ra-elements-details button {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        border: 1px solid var(--ra-border);
        border-radius: 999px;
        background: rgb(255 255 255 / .06);
        color: var(--ra-text);
        font: 750 9px / 1 var(--ra-font-ui);
      }

      .ra-elements-toolbar button {
        min-height: 22px;
        padding: 0 7px;
        flex: 0 0 auto;
      }

      .ra-elements-layout {
        min-height: 0;
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto;
      }

      .ra-elements-tree {
        min-height: 0;
        padding: 2px 0 40px;
        overflow: auto;
        font: 500 var(--ra-elements-font-size) / var(--ra-elements-line-height) var(--ra-font-mono);
        -webkit-user-select: none;
        user-select: none;
        overscroll-behavior: contain;
        contain: content;
        -webkit-overflow-scrolling: touch;
      }

      .ra-elements-row {
        display: grid;
        grid-template-columns: 14px minmax(0, max-content) auto;
        align-items: start;
        gap: 2px;
        min-height: 15px;
        padding: 1px 4px 1px calc(2px + var(--depth, 0) * var(--ra-elements-indent));
        border-radius: 4px;
        color: var(--ra-text);
        white-space: nowrap;
      }

      .ra-elements-plugin.ra-wrap .ra-elements-row {
        white-space: normal;
      }

      .ra-elements-plugin.ra-wrap .ra-elements-tag {
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .ra-elements-row:hover {
        background: rgb(125 211 252 / .075);
      }

      .ra-elements-selected {
        background: rgb(125 211 252 / .15);
      }

      .ra-elements-toggle {
        width: 13px;
        height: 13px;
        display: grid;
        place-items: center;
        border: 0;
        background: transparent;
        color: var(--ra-muted);
        padding: 0;
      }

      .ra-elements-toggle .ra-icon {
        width: 10px;
        height: 10px;
      }

      .ra-elements-toggle:disabled {
        opacity: 0;
      }

      .ra-elements-tag-name,
      .ra-elements-punctuation {
        color: #ff7b72;
      }

      .ra-elements-attr {
        margin-left: 4px;
      }

      .ra-elements-attr-name {
        color: #a5d6ff;
      }

      .ra-elements-equals {
        color: var(--ra-muted);
      }

      .ra-elements-attr-value {
        color: #a5d6a7;
      }

      .ra-elements-text {
        color: var(--ra-muted);
      }

      .ra-elements-inline-actions {
        display: inline-flex;
        gap: 2px;
        opacity: 0;
        padding-left: 5px;
      }

      .ra-elements-row:hover .ra-elements-inline-actions,
      .ra-elements-selected .ra-elements-inline-actions {
        opacity: 1;
      }

      .ra-elements-inline-actions button {
        min-height: 17px;
        padding: 0 5px;
        font-size: 8px;
      }

      .ra-elements-source-row {
        display: grid;
        gap: 4px;
        margin: 2px 6px 3px calc(18px + var(--depth, 0) * var(--ra-elements-indent));
        padding: 5px;
        border: 1px solid rgb(255 255 255 / .08);
        border-radius: 7px;
        background: rgb(255 255 255 / .035);
      }

      .ra-elements-source-row pre {
        margin: 0;
        max-height: 74px;
        overflow: auto;
        font: 8.5px / 1.35 var(--ra-font-mono);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .ra-elements-more {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-height: 22px;
        margin: 3px 0 4px calc(18px + var(--depth, 0) * var(--ra-elements-indent));
        border: 1px solid var(--ra-border);
        border-radius: 999px;
        background: rgb(255 255 255 / .06);
        color: var(--ra-text);
        font: 800 9px / 1 var(--ra-font-ui);
        padding: 0 7px;
      }

      .ra-elements-menu {
        position: fixed;
        z-index: 2147483601;
        width: ${MENU_WIDTH}px;
        padding: ${MENU_PADDING}px;
        border: 1px solid var(--ra-border-strong);
        border-radius: 11px;
        background: rgb(18 19 22 / .98);
        box-shadow: 0 18px 50px rgb(0 0 0 / .58);
        pointer-events: auto;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }

      .ra-elements-menu button {
        width: 100%;
        height: ${MENU_ITEM_HEIGHT}px;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 7px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--ra-text);
        text-align: left;
        font: 800 10px / 1 var(--ra-font-ui);
      }

      .ra-elements-menu button:hover {
        background: rgb(255 255 255 / .08);
      }

      .ra-elements-danger {
        color: #ff7b72 !important;
      }

      .ra-elements-details {
        max-height: 38vh;
        overflow: auto;
        border-top: 1px solid var(--ra-border);
        background: rgb(8 9 11 / .95);
        padding: 6px;
      }

      .ra-elements-details-head {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        justify-content: space-between;
        gap: 8px;
        align-items: center;
        padding-bottom: 6px;
        background: rgb(8 9 11 / .95);
      }

      .ra-elements-details-head strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--ra-text);
        font: 800 10px / 1.2 var(--ra-font-ui);
      }

      .ra-elements-details-head div {
        display: flex;
        gap: 4px;
        flex: 0 0 auto;
      }

      .ra-elements-details button {
        min-height: 20px;
        padding: 0 7px;
      }

      .ra-elements-empty-details {
        color: var(--ra-muted);
        font: 700 10px / 1.4 var(--ra-font-ui);
        padding: 8px;
      }

      .ra-elements-editor {
        display: grid;
        gap: 5px;
      }

      .ra-elements-field {
        display: grid;
        grid-template-columns: 104px minmax(0, 1fr);
        gap: 6px;
        align-items: center;
        font: 600 10px / 1.25 var(--ra-font-ui);
      }

      .ra-elements-field span {
        color: var(--ra-muted);
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ra-elements-field input,
      .ra-elements-field select,
      .ra-elements-field textarea {
        min-width: 0;
        border: 1px solid var(--ra-border);
        border-radius: 7px;
        background: rgb(255 255 255 / .055);
        color: var(--ra-text);
        font: 500 10px / 1.3 var(--ra-font-mono);
        padding: 5px 6px;
      }

      .ra-elements-field textarea {
        min-height: 52px;
        resize: vertical;
      }

      .ra-elements-field-check input {
        justify-self: start;
      }

      .ra-elements-box {
        display: grid;
        place-items: center;
        padding: 8px 0;
        font: 800 9px / 1 var(--ra-font-ui);
        color: var(--ra-text);
      }

      .ra-box-layer {
        display: grid;
        gap: 4px;
        place-items: center;
        border: 1px solid var(--ra-border);
        border-radius: 8px;
        padding: 5px;
      }

      .ra-box-layer > div {
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .ra-box-margin {
        background: rgb(251 191 36 / .10);
      }

      .ra-box-border {
        background: rgb(248 113 113 / .10);
      }

      .ra-box-padding {
        background: rgb(74 222 128 / .10);
      }

      .ra-box-content {
        min-width: 72px;
        min-height: 36px;
        display: grid;
        place-items: center;
        border-radius: 6px;
        background: rgb(125 211 252 / .16);
      }

      .ra-box-layer span,
      .ra-box-layer b {
        color: var(--ra-muted);
      }
    `;
  }
})();