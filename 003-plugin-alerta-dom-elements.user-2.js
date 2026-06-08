// ==UserScript==
// @name         XXX003 / Alerta / Plugin / Elements
// @namespace    https://rod.dev/userscripts
// @version      2.6.0
// @description  Chrome-like Elements plugin for Alerta with split DOM/React panels, rich style editor, persisted CSS overrides, box model, source viewer, React props/hooks/state, $0/$r, and virtualized source preview.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @weight       997
// @grant        none
// @noframes
// ==/UserScript==

(async function AlertaElementsPlugin() {
  "use strict";

  const [inspector] = await window.RodUtils.waitForGlobal("RodDockedInspector");
  const api = inspector.api;
  const { html, Utils: utils } = api
  //const Utils = api.utils;

  /***************************************************************************************************
   * Constants
   **************************************************************************************************/

  const PLUGIN_ID = "elements";
  const STYLE_ID = "rod-alerta-elements-plugin-v26";
  const STORAGE_KEY = "rod.alerta.elements.v2.6";
  const DEFAULT_VISIBLE_CHILDREN = 80;
  const CHILDREN_STEP = 80;
  const MAX_CHILDREN_PER_NODE = 260;
  const MAX_ATTRS_PER_NODE = 18;
  const MAX_ATTR_VALUE_LENGTH = 180;
  const MAX_TEXT_LENGTH = 220;
  const SOURCE_LINE_HEIGHT = 19;
  const SOURCE_VIEWPORT_HEIGHT = 360;

  const SETTINGS_FIELDS = [
    {
      key: "showTextNodes",
      type: "boolean",
      label: "Show text nodes",
      defaultValue: true,
    },
    {
      key: "showInlineSource",
      type: "boolean",
      label: "Show inline source actions",
      defaultValue: true,
    },
    {
      key: "wrapSource",
      type: "boolean",
      label: "Soft wrap source",
      defaultValue: true,
    },
    {
      key: "reactPanel",
      type: "boolean",
      label: "Enable React panel",
      defaultValue: true,
    },
    {
      key: "autoRevealLoggedElements",
      type: "boolean",
      label: "Auto reveal logged elements",
      defaultValue: false,
    },
    {
      key: "sourcePretty",
      type: "boolean",
      label: "Pretty source",
      defaultValue: true,
    },
  ];

  const STYLE_FIELDS = [
    {
      prop: "display",
      type: "select",
      options: [
        "",
        "block",
        "inline",
        "inline-block",
        "flex",
        "grid",
        "none",
        "contents",
      ],
    },
    {
      prop: "position",
      type: "select",
      options: ["", "static", "relative", "absolute", "fixed", "sticky"],
    },
    { prop: "color", type: "color" },
    { prop: "backgroundColor", type: "color" },
    { prop: "fontSize", type: "text" },
    {
      prop: "fontWeight",
      type: "select",
      options: ["", "400", "500", "600", "700", "800", "900", "bold", "normal"],
    },
    { prop: "lineHeight", type: "text" },
    { prop: "width", type: "text" },
    { prop: "height", type: "text" },
    { prop: "margin", type: "text" },
    { prop: "padding", type: "text" },
    { prop: "border", type: "text" },
    { prop: "borderRadius", type: "text" },
    { prop: "opacity", type: "range", min: 0, max: 1, step: 0.01 },
    { prop: "zIndex", type: "number" },
    {
      prop: "overflow",
      type: "select",
      options: ["", "visible", "hidden", "auto", "scroll", "clip"],
    },
    { prop: "transform", type: "text" },
    { prop: "boxShadow", type: "text" },
  ];

  const DOM_FIELDS = [
    { key: "id", label: "id", type: "text" },
    { key: "className", label: "class", type: "text" },
    { key: "title", label: "title", type: "text" },
    { key: "hidden", label: "hidden", type: "checkbox" },
    {
      key: "contentEditable",
      label: "contentEditable",
      type: "select",
      options: ["inherit", "true", "false", "plaintext-only"],
    },
    {
      key: "dir",
      label: "dir",
      type: "select",
      options: ["", "auto", "ltr", "rtl"],
    },
    { key: "lang", label: "lang", type: "text" },
    { key: "tabIndex", label: "tabIndex", type: "number" },
    { key: "draggable", label: "draggable", type: "checkbox" },
    { key: "innerText", label: "innerText", type: "textarea" },
  ];

  /***************************************************************************************************
   * State
   **************************************************************************************************/

  const nodeRefs = new WeakMap();
  const state = api.createStore(readState(), handleStateChange);
  let renderQueued = false;
  let sourceScrollTop = 0;

  /***************************************************************************************************
   * Boot
   **************************************************************************************************/

  api.addStyle(getStyles(), STYLE_ID);
  api.settings.register(PLUGIN_ID, SETTINGS_FIELDS);

  api.registerPlugin({
    id: PLUGIN_ID,
    title: "Elements",
    icon: "layout-panel-left",
    order: 25,
    setup,
    render,
  });

  /***************************************************************************************************
   * Lifecycle
   **************************************************************************************************/

  /**
   * Sets up plugin hooks.
   *
   * @returns {void}
   * @example
   * setup();
   */
  function setup() {
    api.on("elements:reveal", (element) => selectElement(element, "elements"));
    api.on("element:selected", (event) =>
      selectElement(
        event.element,
        event.source === "react" ? "react" : state.selectedPanel || "elements",
      ),
    );
    api.on("react:selected", (event) => selectElement(event.element, "react"));
    api.on("log:add", (record) => {
      if (!api.settings.get(PLUGIN_ID, "autoRevealLoggedElements", false))
        return;
      for (let index = 0; index < record.refIds.length; index += 1) {
        const value = api.objectStore.get(record.refIds[index]);
        const element = Utils.getElementFromObject(value);
        if (element) {
          selectElement(element, "elements");
          break;
        }
      }
    });
  }

  /**
   * Reads plugin state.
   *
   * @returns {object} State.
   * @example
   * const state = readState();
   */
  function readState() {
    try {
      return {
        expanded: ["html"],
        visibleLimits: {},
        selectedPath: "html",
        selectedRefId: null,
        selectedPanel: "elements",
        selectedDetail: "styles",
        customStyleProp: "",
        customStyleValue: "",
        source: null,
        persistedStyles: {},
        persistedDomFields: {},
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
      };
    } catch {
      return {
        expanded: ["html"],
        visibleLimits: {},
        selectedPath: "html",
        selectedRefId: null,
        selectedPanel: "elements",
        selectedDetail: "styles",
        customStyleProp: "",
        customStyleValue: "",
        source: null,
        persistedStyles: {},
        persistedDomFields: {},
      };
    }
  }

  /**
   * Handles state change.
   *
   * @returns {void}
   * @example
   * handleStateChange();
   */
  function handleStateChange() {
    saveState();
    scheduleRender();
  }

  /**
   * Saves plugin state.
   *
   * @returns {void}
   * @example
   * saveState();
   */
  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          expanded: state.expanded,
          visibleLimits: state.visibleLimits,
          selectedPath: state.selectedPath,
          selectedRefId: state.selectedRefId,
          selectedPanel: state.selectedPanel,
          selectedDetail: state.selectedDetail,
          customStyleProp: state.customStyleProp,
          customStyleValue: state.customStyleValue,
          persistedStyles: state.persistedStyles,
          persistedDomFields: state.persistedDomFields,
        }),
      );
    } catch {}
  }

  /**
   * Schedules a render.
   *
   * @returns {void}
   * @example
   * scheduleRender();
   */
  function scheduleRender() {
    if (renderQueued) return;

    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      api.scheduleRender();
    });
  }

  /***************************************************************************************************
   * Rendering
   **************************************************************************************************/

  /**
   * Renders plugin.
   *
   * @returns {*} Template.
   * @example
   * render();
   */
  function render() {
    const selected = getSelectedElement();

    return api.html`
      <section class="ra-elements">
        <div class="ra-elements-toolbar">
          <button class="ra-pill" type="button" @click=${() => selectElement(document.documentElement, "elements")}>${api.icon("house")}html</button>
          <button class="ra-pill" type="button" @click=${() => selectElement(document.body, "elements")}>${api.icon("box")}body</button>
          <button class="ra-pill" type="button" @click=${() => selectElement(window.$0, "elements")}>${api.icon("badge-dollar-sign")}$0</button>
          <button class="ra-pill" type="button" @click=${refresh}>${api.icon("refresh-cw")}Refresh</button>
        </div>

        <div class="ra-elements-split">
          <section class="ra-elements-tree">
            ${renderNode(document.documentElement, "html", 0)}
          </section>

          <section class="ra-elements-detail">
            ${selected ? renderDetails(selected) : api.html`<div class="ra-elements-empty">Select an element.</div>`}
          </section>
        </div>
      </section>
    `;
  }

  /**
   * Renders one DOM node.
   *
   * @param {Node} node Node.
   * @param {string} path Path.
   * @param {number} depth Depth.
   * @returns {*} Template.
   * @example
   * renderNode(document.body, "html/body:0", 1);
   */
  function renderNode(node, path, depth) {
    if (shouldSkipNode(node)) return api.nothing;

    const isElement = node instanceof Element;
    const isSelected = state.selectedPath === path;
    const isExpanded = state.expanded.includes(path);
    const refId = getNodeRefId(node);
    const hasChildren = isElement && getVisibleChildren(node).length > 0;
    const react = isElement && Utils.isReactElement(node);

    return api.html`
      <div class="ra-dom-node">
        <div class="ra-dom-row ${isSelected ? "ra-selected" : ""}" style="--ra-depth:${depth}" @click=${() => selectNode(node, path)}>
          ${hasChildren ? api.html`<button class="ra-dom-toggle" type="button" @click=${(event) => toggleNode(event, path)}>${api.icon(isExpanded ? "chevron-down" : "chevron-right")}</button>` : api.html`<span class="ra-dom-spacer"></span>`}
          <span class="ra-dom-label">${renderNodeLabel(node)}${react ? api.html`<span class="ra-react-badge">⚛</span>` : api.nothing}</span>
          <button class="ra-dom-mini" type="button" @click=${(event) => setZero(event, refId)}>$0</button>
        </div>
        ${hasChildren && isExpanded ? renderChildren(node, path, depth + 1) : api.nothing}
      </div>
    `;
  }

  /**
   * Renders children.
   *
   * @param {Element} element Element.
   * @param {string} path Path.
   * @param {number} depth Depth.
   * @returns {*} Template.
   * @example
   * renderChildren(document.body, "html/body:0", 1);
   */
  function renderChildren(element, path, depth) {
    const children = getVisibleChildren(element);
    const limit = state.visibleLimits[path] || DEFAULT_VISIBLE_CHILDREN;
    const visibleCount = Math.min(
      children.length,
      limit,
      MAX_CHILDREN_PER_NODE,
    );
    const output = [];

    for (let index = 0; index < visibleCount; index += 1) {
      output.push(
        renderNode(
          children[index],
          `${path}/${children[index].nodeName.toLowerCase()}:${index}`,
          depth,
        ),
      );
    }

    return api.html`
      <div class="ra-dom-children">
        ${output}
        ${children.length > visibleCount ? api.html`<button class="ra-dom-more" type="button" @click=${() => loadMoreChildren(path)}>Load more ${Math.min(CHILDREN_STEP, children.length - visibleCount)}</button>` : api.nothing}
      </div>
    `;
  }

  /**
   * Renders node label.
   *
   * @param {Node} node Node.
   * @returns {*} Template.
   * @example
   * renderNodeLabel(document.body);
   */
  function renderNodeLabel(node) {
    if (node instanceof Text)
      return api.html`<span class="ra-dom-text">${Utils.trimText(node.textContent, MAX_TEXT_LENGTH)}</span>`;
    if (!(node instanceof Element))
      return api.html`<span class="ra-dom-muted">${node.nodeName}</span>`;

    const tag = node.tagName.toLowerCase();
    const id = node.id ? `#${node.id}` : "";
    const cls =
      typeof node.className === "string" && node.className.trim()
        ? `.${node.className.trim().split(/\s+/).slice(0, 4).join(".")}`
        : "";

    return api.html`<span class="ra-dom-tag">&lt;${tag}</span><span class="ra-dom-id">${id}</span><span class="ra-dom-class">${cls}</span><span class="ra-dom-tag">&gt;</span>`;
  }

  /**
   * Renders details panel.
   *
   * @param {Element} element Element.
   * @returns {*} Template.
   * @example
   * renderDetails(document.body);
   */
  function renderDetails(element) {
    return api.html`
      <div class="ra-elements-detail-inner">
        <div class="ra-detail-tabs">
          <button class="ra-pill ${state.selectedPanel === "elements" ? "ra-active" : ""}" type="button" @click=${() => setPanel("elements")}>${api.icon("code-xml")}DOM</button>
          <button class="ra-pill ${state.selectedPanel === "react" ? "ra-active" : ""}" type="button" @click=${() => setPanel("react")}>${api.icon("atom")}React</button>
        </div>

        ${state.selectedPanel === "react" ? renderReactPanel(element) : renderDomPanel(element)}
      </div>
    `;
  }

  /**
   * Renders DOM detail panel.
   *
   * @param {Element} element Element.
   * @returns {*} Template.
   * @example
   * renderDomPanel(document.body);
   */
  function renderDomPanel(element) {
    return api.html`
      <div class="ra-dom-panel">
        <div class="ra-selected-summary">
          <code>${Utils.formatElement(element)}</code>
          <div class="ra-selected-actions">
            <button class="ra-pill" type="button" @click=${() => setGlobalZero(element)}>$0</button>
            <button class="ra-pill" type="button" @click=${() => api.dom.flashElement(element)}>Flash</button>
            <button class="ra-pill" type="button" @click=${() => openElementSource(element)}>Source</button>
          </div>
        </div>

        ${renderBoxModel(element)}

        <div class="ra-subtabs">
          ${["styles", "dom", "attrs", "source"].map((tab) => api.html`<button class="ra-pill ${state.selectedDetail === tab ? "ra-active" : ""}" type="button" @click=${() => setDetail(tab)}>${tab}</button>`)}
        </div>

        ${state.selectedDetail === "styles" ? renderStyleEditor(element) : api.nothing}
        ${state.selectedDetail === "dom" ? renderDomEditor(element) : api.nothing}
        ${state.selectedDetail === "attrs" ? renderAttributes(element) : api.nothing}
        ${state.selectedDetail === "source" ? renderSourcePanel() : api.nothing}
      </div>
    `;
  }

  /**
   * Renders React panel.
   *
   * @param {Element} element Element.
   * @returns {*} Template.
   * @example
   * renderReactPanel(document.body);
   */
  function renderReactPanel(element) {
    const info = Utils.getReactOwnerInfo(element);

    if (!info) {
      return api.html`<div class="ra-elements-empty">No React fiber found for this element.</div>`;
    }

    return api.html`
      <div class="ra-react-panel">
        <div class="ra-selected-summary">
          <code>${info.type || "React node"}</code>
          <div class="ra-selected-actions">
            <button class="ra-pill" type="button" @click=${() => setGlobalReact(element)}>$r</button>
            <button class="ra-pill" type="button" @click=${() => copyJson(info.props)}>Copy props</button>
          </div>
        </div>
        <section class="ra-react-section"><h4>Props</h4>${renderObjectBlock(info.props)}</section>
        <section class="ra-react-section"><h4>Hooks</h4>${renderObjectBlock(info.hooks)}</section>
        <section class="ra-react-section"><h4>State</h4>${renderObjectBlock(info.state)}</section>
      </div>
    `;
  }

  /**
   * Renders object block through main inspector logic.
   *
   * @param {*} value Value.
   * @returns {*} Template.
   * @example
   * renderObjectBlock({});
   */
  function renderObjectBlock(value) {
    if (!Utils.isObjectLike(value))
      return api.html`<pre class="ra-json-block">${String(value)}</pre>`;
    const refId = api.objectStore.set(value);
    return api.viewInspectableObject(refId, `react:${refId}`, "", {
      showActions: false,
    });
  }

  /**
   * Renders box model.
   *
   * @param {Element} element Element.
   * @returns {*} Template.
   * @example
   * renderBoxModel(document.body);
   */
  function renderBoxModel(element) {
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return api.html`
      <div class="ra-box-model">
        <div class="ra-box-row"><span>margin</span><code>${computed.marginTop} ${computed.marginRight} ${computed.marginBottom} ${computed.marginLeft}</code></div>
        <div class="ra-box-row"><span>border</span><code>${computed.borderTopWidth} ${computed.borderRightWidth} ${computed.borderBottomWidth} ${computed.borderLeftWidth}</code></div>
        <div class="ra-box-row"><span>padding</span><code>${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}</code></div>
        <div class="ra-box-row ra-box-size"><span>size</span><code>${Math.round(rect.width)} × ${Math.round(rect.height)}</code></div>
      </div>
    `;
  }

  /**
   * Renders style editor.
   *
   * @param {Element} element Element.
   * @returns {*} Template.
   * @example
   * renderStyleEditor(document.body);
   */
  function renderStyleEditor(element) {
    const computed = getComputedStyle(element);

    return api.html`
      <section class="ra-style-editor">
        <div class="ra-style-add">
          <input class="ra-input" list="ra-style-props" placeholder="property" .value=${state.customStyleProp} @input=${(event) => (state.customStyleProp = event.target.value)}/>
          <input class="ra-input" placeholder="value" .value=${state.customStyleValue} @input=${(event) => (state.customStyleValue = event.target.value)}/>
          <button class="ra-pill" type="button" @click=${() => applyCustomStyle(element)}>Add</button>
          <datalist id="ra-style-props">${STYLE_FIELDS.map((field) => api.html`<option value=${field.prop}></option>`)}</datalist>
        </div>

        <div class="ra-style-grid">
          ${STYLE_FIELDS.map((field) => renderStyleField(element, field, computed))}
        </div>
      </section>
    `;
  }

  /**
   * Renders style field.
   *
   * @param {Element} element Element.
   * @param {object} field Field.
   * @param {CSSStyleDeclaration} computed Computed styles.
   * @returns {*} Template.
   * @example
   * renderStyleField(document.body, STYLE_FIELDS[0], getComputedStyle(document.body));
   */
  function renderStyleField(element, field, computed) {
    const id = getElementKey(element);
    const saved = state.persistedStyles?.[id]?.[field.prop];
    const value = saved ?? element.style[field.prop] ?? "";
    const computedValue = computed[field.prop] || "";

    return api.html`
      <label class="ra-style-field">
        <span><strong>${field.prop}</strong><small>${computedValue}</small></span>
        ${field.type === "select" ? api.html`<select class="ra-select" .value=${String(value)} @change=${(event) => setStyleValue(element, field.prop, event.target.value)}>${field.options.map((option) => api.html`<option value=${option}>${option || "unset"}</option>`)}</select>` : api.nothing}
        ${field.type === "color" ? api.html`<span class="ra-color-field"><input type="color" .value=${normalizeColor(value || computedValue)} @input=${(event) => setStyleValue(element, field.prop, event.target.value)}/><input class="ra-input" .value=${String(value)} @input=${(event) => setStyleValue(element, field.prop, event.target.value)}/></span>` : api.nothing}
        ${field.type === "range" ? api.html`<input class="ra-range" type="range" min=${field.min} max=${field.max} step=${field.step} .value=${String(value || computedValue || 1)} @input=${(event) => setStyleValue(element, field.prop, event.target.value)}/>` : api.nothing}
        ${field.type === "number" ? api.html`<input class="ra-input" type="number" .value=${String(value)} @input=${(event) => setStyleValue(element, field.prop, event.target.value)}/>` : api.nothing}
        ${!["select", "color", "range", "number"].includes(field.type) ? api.html`<input class="ra-input" .value=${String(value)} @input=${(event) => setStyleValue(element, field.prop, event.target.value)}/>` : api.nothing}
      </label>
    `;
  }

  /**
   * Renders DOM editor.
   *
   * @param {Element} element Element.
   * @returns {*} Template.
   * @example
   * renderDomEditor(document.body);
   */
  function renderDomEditor(element) {
    return api.html`
      <section class="ra-dom-editor">
        ${DOM_FIELDS.map((field) => renderDomField(element, field))}
      </section>
    `;
  }

  /**
   * Renders DOM field.
   *
   * @param {Element} element Element.
   * @param {object} field Field.
   * @returns {*} Template.
   * @example
   * renderDomField(document.body, DOM_FIELDS[0]);
   */
  function renderDomField(element, field) {
    const value = element[field.key];

    return api.html`
      <label class="ra-style-field">
        <span><strong>${field.label}</strong><small>${field.key}</small></span>
        ${field.type === "checkbox" ? api.html`<input type="checkbox" .checked=${Boolean(value)} @change=${(event) => setDomValue(element, field.key, event.target.checked)}/>` : api.nothing}
        ${field.type === "select" ? api.html`<select class="ra-select" .value=${String(value)} @change=${(event) => setDomValue(element, field.key, event.target.value)}>${field.options.map((option) => api.html`<option value=${option}>${option || "empty"}</option>`)}</select>` : api.nothing}
        ${field.type === "number" ? api.html`<input class="ra-input" type="number" .value=${String(value)} @input=${(event) => setDomValue(element, field.key, Number(event.target.value))}/>` : api.nothing}
        ${field.type === "textarea" ? api.html`<textarea class="ra-textarea" .value=${String(value || "")} @input=${(event) => setDomValue(element, field.key, event.target.value)}></textarea>` : api.nothing}
        ${field.type === "text" ? api.html`<input class="ra-input" .value=${String(value || "")} @input=${(event) => setDomValue(element, field.key, event.target.value)}/>` : api.nothing}
      </label>
    `;
  }

  /**
   * Renders attributes.
   *
   * @param {Element} element Element.
   * @returns {*} Template.
   * @example
   * renderAttributes(document.body);
   */
  function renderAttributes(element) {
    const attrs = Array.from(element.attributes).slice(0, MAX_ATTRS_PER_NODE);

    return api.html`
      <section class="ra-attrs">
        ${attrs.map(
          (attr) => api.html`
          <label class="ra-style-field">
            <span><strong>${attr.name}</strong><small>attribute</small></span>
            <input class="ra-input" .value=${attr.value} @input=${(event) => setAttributeValue(element, attr.name, event.target.value)}/>
          </label>
        `,
        )}
      </section>
    `;
  }

  /**
   * Renders source panel.
   *
   * @returns {*} Template.
   * @example
   * renderSourcePanel();
   */
  function renderSourcePanel() {
    const source = state.source;

    if (!source)
      return api.html`<div class="ra-elements-empty">Open source from a selected script/style/template element.</div>`;

    const lines = Utils.splitLines(source.code);
    const slice = Utils.getVirtualSlice({
      scrollTop: sourceScrollTop,
      viewportHeight: SOURCE_VIEWPORT_HEIGHT,
      rowHeight: SOURCE_LINE_HEIGHT,
      total: lines.length,
      overscan: 16,
    });
    const visibleLines = lines.slice(slice.start, slice.end);

    return api.html`
      <section class="ra-source-panel">
        <header><strong>${source.title}</strong><button class="ra-pill" type="button" @click=${() => api.copyText(source.code)}>Copy</button></header>
        <div class="ra-virtual-source ${api.settings.get(PLUGIN_ID, "wrapSource", true) ? "ra-wrap" : ""}" @scroll=${handleSourceScroll}>
          <div style="height:${slice.before}px"></div>
          ${visibleLines.map((line, index) => api.html`<div class="ra-source-line"><span>${slice.start + index + 1}</span><code>${api.unsafeHTML(Utils.highlightCode(line || " ", source.language))}</code></div>`)}
          <div style="height:${slice.after}px"></div>
        </div>
      </section>
    `;
  }

  /***************************************************************************************************
   * Actions
   **************************************************************************************************/

  /**
   * Selects a DOM node.
   *
   * @param {Node} node Node.
   * @param {string} path Path.
   * @returns {void}
   * @example
   * selectNode(document.body, "html/body:0");
   */
  function selectNode(node, path) {
    if (!(node instanceof Element)) return;

    state.selectedPath = path;
    state.selectedRefId = getNodeRefId(node);
    window.$0 = node;
    api.emit("$0:updated", node);
    api.dom.flashElement(node);
  }

  /**
   * Selects an element.
   *
   * @param {Element} element Element.
   * @param {string} panel Panel.
   * @returns {void}
   * @example
   * selectElement(document.body, "elements");
   */
  function selectElement(element, panel = "elements") {
    if (!(element instanceof Element)) return;

    const path = Utils.getDomPath(element);

    ensurePathExpanded(path);

    state.selectedPath = path;
    state.selectedRefId = getNodeRefId(element);
    state.selectedPanel = panel;
    window.$0 = element;

    if (panel === "react") setGlobalReact(element);

    scheduleRender();
  }

  /**
   * Sets selected panel.
   *
   * @param {string} panel Panel.
   * @returns {void}
   * @example
   * setPanel("react");
   */
  function setPanel(panel) {
    state.selectedPanel = panel;

    const element = getSelectedElement();
    if (panel === "react" && element) setGlobalReact(element);
  }

  /**
   * Sets selected detail.
   *
   * @param {string} detail Detail.
   * @returns {void}
   * @example
   * setDetail("styles");
   */
  function setDetail(detail) {
    state.selectedDetail = detail;

    if (detail === "source") {
      const element = getSelectedElement();
      if (element) openElementSource(element);
    }
  }

  /**
   * Toggles node.
   *
   * @param {Event} event Event.
   * @param {string} path Path.
   * @returns {void}
   * @example
   * toggleNode(event, "html");
   */
  function toggleNode(event, path) {
    event.stopPropagation();

    const expanded = new Set(state.expanded || []);

    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);

    state.expanded = Array.from(expanded);
  }

  /**
   * Loads more children.
   *
   * @param {string} path Path.
   * @returns {void}
   * @example
   * loadMoreChildren("html");
   */
  function loadMoreChildren(path) {
    state.visibleLimits[path] =
      (state.visibleLimits[path] || DEFAULT_VISIBLE_CHILDREN) + CHILDREN_STEP;
    scheduleRender();
  }

  /**
   * Sets $0 from ref.
   *
   * @param {Event} event Event.
   * @param {number} refId Ref id.
   * @returns {void}
   * @example
   * setZero(event, 1);
   */
  function setZero(event, refId) {
    event.stopPropagation();
    const value = api.objectStore.get(refId);
    if (value instanceof Element) setGlobalZero(value);
  }

  /**
   * Sets $0.
   *
   * @param {Element} element Element.
   * @returns {void}
   * @example
   * setGlobalZero(document.body);
   */
  function setGlobalZero(element) {
    window.$0 = element;
    api.emit("$0:updated", element);
    api.addLog("info", "$0 updated", element);
  }

  /**
   * Sets $r.
   *
   * @param {Element} element Element.
   * @returns {void}
   * @example
   * setGlobalReact(document.body);
   */
  function setGlobalReact(element) {
    window.$r = Utils.getReactOwnerInfo(element);
    api.addLog("info", "$r updated", window.$r);
  }

  /**
   * Applies style value.
   *
   * @param {Element} element Element.
   * @param {string} prop CSS property.
   * @param {string} value Value.
   * @returns {void}
   * @example
   * setStyleValue(document.body, "color", "red");
   */
  function setStyleValue(element, prop, value) {
    const id = getElementKey(element);

    if (!state.persistedStyles[id]) state.persistedStyles[id] = {};

    state.persistedStyles[id][prop] = value;
    element.style[prop] = value;
    scheduleRender();
  }

  /**
   * Applies custom style.
   *
   * @param {Element} element Element.
   * @returns {void}
   * @example
   * applyCustomStyle(document.body);
   */
  function applyCustomStyle(element) {
    if (!state.customStyleProp) return;
    setStyleValue(element, state.customStyleProp, state.customStyleValue);
    state.customStyleProp = "";
    state.customStyleValue = "";
  }

  /**
   * Sets DOM value.
   *
   * @param {Element} element Element.
   * @param {string} key Key.
   * @param {*} value Value.
   * @returns {void}
   * @example
   * setDomValue(document.body, "id", "x");
   */
  function setDomValue(element, key, value) {
    const id = getElementKey(element);

    if (!state.persistedDomFields[id]) state.persistedDomFields[id] = {};

    state.persistedDomFields[id][key] = value;
    element[key] = value;
    scheduleRender();
  }

  /**
   * Sets attribute.
   *
   * @param {Element} element Element.
   * @param {string} name Name.
   * @param {string} value Value.
   * @returns {void}
   * @example
   * setAttributeValue(document.body, "data-x", "1");
   */
  function setAttributeValue(element, name, value) {
    element.setAttribute(name, value);
    scheduleRender();
  }

  /**
   * Opens element source.
   *
   * @param {Element} element Element.
   * @returns {Promise<void>} Source promise.
   * @example
   * await openElementSource(document.querySelector("script"));
   */
  async function openElementSource(element) {
    const language =
      element instanceof HTMLStyleElement
        ? "css"
        : element instanceof HTMLScriptElement
          ? "javascript"
          : "html";
            
    let title = Utils.formatElement(element);
    let code = "";

    if (element instanceof HTMLScriptElement && element.src) {
      title = element.src;
      code = await fetchText(element.src);
    } else if (element instanceof HTMLLinkElement && element.href) {
      title = element.href;
      code = await fetchText(element.href);
    } else if (
      element instanceof HTMLStyleElement ||
      element instanceof HTMLScriptElement
    ) {
      code = element.textContent || "";
    } else {
      code = Utils.formatHtml(element.outerHTML || "");
    }

    if (api.settings.get(PLUGIN_ID, "sourcePretty", true)) {
      code = await Utils.prettySource(code, language);
    }

    state.source = { title, code, language };
    state.selectedDetail = "source";
  }

  /**
   * Handles source scroll.
   *
   * @param {Event} event Scroll event.
   * @returns {void}
   * @example
   * handleSourceScroll(event);
   */
  function handleSourceScroll(event) {
    sourceScrollTop = event.currentTarget.scrollTop;
    scheduleRender();
  }

  /**
   * Copies JSON.
   *
   * @param {*} value Value.
   * @returns {void}
   * @example
   * copyJson({});
   */
  function copyJson(value) {
    Utils.copyText(Utils.safeJson(value));
  }

  /**
   * Refreshes plugin render.
   *
   * @returns {void}
   * @example
   * refresh();
   */
  function refresh() {
    scheduleRender();
  }

  /***************************************************************************************************
   * Helpers
   **************************************************************************************************/

  /**
   * Gets selected element.
   *
   * @returns {Element|null} Element.
   * @example
   * const el = getSelectedElement();
   */
  function getSelectedElement() {
    const fromStore =
      state.selectedRefId != null
        ? api.objectStore.get(state.selectedRefId)
        : null;
    if (fromStore instanceof Element && fromStore.isConnected) return fromStore;

    const resolved = Utils.resolveDomPath(state.selectedPath);
    return resolved instanceof Element ? resolved : document.documentElement;
  }

  /**
   * Gets node ref id.
   *
   * @param {Node} node Node.
   * @returns {number|string|null} Ref id.
   * @example
   * getNodeRefId(document.body);
   */
  function getNodeRefId(node) {
    if (nodeRefs.has(node)) return nodeRefs.get(node);

    const refId = api.objectStore.set(node);
    nodeRefs.set(node, refId);

    return refId;
  }

  /**
   * Gets visible children.
   *
   * @param {Element} element Element.
   * @returns {Node[]} Children.
   * @example
   * getVisibleChildren(document.body);
   */
  function getVisibleChildren(element) {
    const childNodes = element.childNodes;
    const output = [];

    for (let index = 0; index < childNodes.length; index += 1) {
      const node = childNodes[index];
      if (!shouldSkipNode(node)) output.push(node);
      if (output.length >= MAX_CHILDREN_PER_NODE) break;
    }

    return output;
  }

  /**
   * Checks whether node should be skipped.
   *
   * @param {Node} node Node.
   * @returns {boolean} Skip state.
   * @example
   * shouldSkipNode(document.body);
   */
  function shouldSkipNode(node) {
    if (isInspectorNode(node)) return true;
    if (node.nodeType === Node.COMMENT_NODE) return true;
    if (node.nodeType === Node.TEXT_NODE)
      return (
        !api.settings.get(PLUGIN_ID, "showTextNodes", true) ||
        !node.textContent?.trim()
      );
    return false;
  }

  /**
   * Checks if node belongs to inspector.
   *
   * @param {Node} node Node.
   * @returns {boolean} Inspector state.
   * @example
   * isInspectorNode(document.body);
   */
  function isInspectorNode(node) {
    const host = api.mount.getHost();
    const root = api.mount.getRoot();
    return Boolean(node && (host?.contains?.(node) || root?.contains?.(node)));
  }

  /**
   * Ensures path is expanded.
   *
   * @param {string} path Path.
   * @returns {void}
   * @example
   * ensurePathExpanded("html/body:0");
   */
  function ensurePathExpanded(path) {
    const expanded = new Set(state.expanded || []);
    const parts = path.split("/");
    let current = "";

    for (let index = 0; index < parts.length; index += 1) {
      current = index === 0 ? parts[index] : `${current}/${parts[index]}`;
      expanded.add(current);
    }

    state.expanded = Array.from(expanded);
  }

  /**
   * Gets element storage key.
   *
   * @param {Element} element Element.
   * @returns {string} Key.
   * @example
   * getElementKey(document.body);
   */
  function getElementKey(element) {
    return Utils.getDomPath(element) || Utils.formatElement(element);
  }

  /**
   * Fetches text.
   *
   * @param {string} url URL.
   * @returns {Promise<string>} Text.
   * @example
   * await fetchText("/app.js");
   */
  async function fetchText(url) {
    const response = await fetch(url, { credentials: "include" });
    return response.text();
  }

  /**
   * Normalizes color.
   *
   * @param {string} value CSS color.
   * @returns {string} Hex-ish color.
   * @example
   * normalizeColor("red");
   */
  function normalizeColor(value) {
    const input = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(input)) return input;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) return "#ffffff";

    context.fillStyle = input || "#ffffff";

    const normalized = context.fillStyle;
    return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#ffffff";
  }

  /***************************************************************************************************
   * Styles
   **************************************************************************************************/

  /**
   * Returns styles.
   *
   * @returns {string} CSS.
   * @example
   * getStyles();
   */
  function getStyles() {
    return `
      .ra-elements {
        display: grid;
        gap: 8px;
        min-height: 0;
      }
      .ra-elements-toolbar {
        display: flex;
        gap: 7px;
        overflow: auto;
      }
      .ra-elements-split {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(210px, 0.88fr);
        gap: 8px;
        min-height: 0;
      }
      .ra-elements-tree,
      .ra-elements-detail {
        min-height: 420px;
        max-height: calc(100vh - 240px);
        overflow: auto;
        border: 1px solid var(--ra-border);
        border-radius: 16px;
        background: rgb(255 255 255 / 0.025);
      }
      .ra-dom-row {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr) auto;
        gap: 5px;
        align-items: center;
        padding: 3px 6px 3px calc(6px + var(--ra-depth) * 13px);
        min-height: 28px;
        border-radius: 10px;
        font: 500 12px/1.25 var(--ra-font-mono);
      }
      .ra-dom-row:hover,
      .ra-dom-row.ra-selected {
        background: rgb(125 211 252 / 0.12);
      }
      .ra-dom-toggle,
      .ra-dom-mini {
        border: 0;
        background: transparent;
        color: var(--ra-text);
        height: 22px;
        border-radius: 8px;
      }
      .ra-dom-mini {
        font: 800 10px/1 var(--ra-font-ui);
        border: 1px solid var(--ra-border);
        padding: 0 6px;
      }
      .ra-dom-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ra-dom-tag {
        color: var(--ra-cyan);
      }
      .ra-dom-id {
        color: #f6c177;
      }
      .ra-dom-class {
        color: #7ee787;
      }
      .ra-dom-text,
      .ra-dom-muted {
        color: var(--ra-muted);
      }
      .ra-elements-detail-inner,
      .ra-dom-panel,
      .ra-react-panel {
        display: grid;
        gap: 8px;
        padding: 8px;
      }
      .ra-detail-tabs,
      .ra-selected-actions,
      .ra-subtabs {
        display: flex;
        gap: 7px;
        overflow: auto;
      }
      .ra-active {
        border-color: rgb(125 211 252 / 0.5) !important;
        background: rgb(125 211 252 / 0.12) !important;
      }
      .ra-selected-summary {
        display: grid;
        gap: 8px;
        padding: 9px;
        border: 1px solid var(--ra-border);
        border-radius: 14px;
        background: rgb(255 255 255 / 0.035);
      }
      .ra-selected-summary code {
        font: 700 12px/1.3 var(--ra-font-mono);
        color: var(--ra-cyan);
        white-space: pre-wrap;
        word-break: break-word;
      }
      .ra-box-model {
        display: grid;
        gap: 4px;
        padding: 8px;
        border: 1px solid var(--ra-border);
        border-radius: 14px;
        background: rgb(0 0 0 / 0.12);
      }
      .ra-box-row {
        display: grid;
        grid-template-columns: 70px minmax(0, 1fr);
        gap: 8px;
        font: 650 11px/1.3 var(--ra-font-ui);
        color: var(--ra-muted);
      }
      .ra-box-row code {
        font: 600 11px/1.3 var(--ra-font-mono);
        color: var(--ra-text);
      }
      .ra-style-editor,
      .ra-dom-editor,
      .ra-attrs,
      .ra-react-panel {
        display: grid;
        gap: 8px;
      }
      .ra-style-add {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
        gap: 7px;
      }
      .ra-style-grid {
        display: grid;
        gap: 1px;
        border: 1px solid var(--ra-border);
        border-radius: 14px;
        overflow: hidden;
      }
      .ra-style-field {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(120px, 190px);
        gap: 8px;
        align-items: center;
        padding: 8px;
        background: rgb(0 0 0 / 0.1);
      }
      .ra-style-field span {
        display: grid;
        gap: 2px;
      }
      .ra-style-field strong {
        font: 800 11px/1.2 var(--ra-font-ui);
        color: var(--ra-text);
      }
      .ra-style-field small {
        font: 500 10px/1.2 var(--ra-font-ui);
        color: var(--ra-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ra-color-field {
        display: grid !important;
        grid-template-columns: 36px minmax(0, 1fr);
        gap: 6px;
      }
      .ra-color-field input[type="color"] {
        width: 36px;
        height: 32px;
        border: 1px solid var(--ra-border);
        border-radius: 10px;
        background: transparent;
        padding: 0;
      }
      .ra-textarea {
        min-height: 96px;
        border: 1px solid var(--ra-border);
        border-radius: 14px;
        background: rgb(0 0 0 / 0.3);
        color: var(--ra-text);
        padding: 8px;
        font: 12px/1.4 var(--ra-font-mono);
      }
      .ra-react-section {
        display: grid;
        gap: 7px;
        border: 1px solid var(--ra-border);
        border-radius: 14px;
        padding: 8px;
        background: rgb(255 255 255 / 0.025);
      }
      .ra-react-section h4 {
        margin: 0;
        color: var(--ra-cyan);
        font: 900 11px/1 var(--ra-font-ui);
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .ra-json-block {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font: 12px/1.4 var(--ra-font-mono);
      }
      .ra-source-panel {
        display: grid;
        gap: 8px;
      }
      .ra-source-panel header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .ra-source-panel strong {
        font: 800 11px/1 var(--ra-font-ui);
        color: var(--ra-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ra-virtual-source {
        height: 360px;
        overflow: auto;
        border: 1px solid var(--ra-border);
        border-radius: 14px;
        background: rgb(3 7 12 / 0.82);
        font: 12px/19px var(--ra-font-mono);
      }
      .ra-source-line {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr);
        min-height: 19px;
      }
      .ra-source-line span {
        padding: 0 8px;
        text-align: right;
        color: var(--ra-faint);
        user-select: none;
      }
      .ra-source-line code {
        white-space: pre;
        overflow: hidden;
        text-overflow: clip;
      }
      .ra-virtual-source.ra-wrap .ra-source-line code {
        white-space: pre-wrap;
        word-break: break-word;
      }
      .ra-elements-empty {
        min-height: 160px;
        display: grid;
        place-items: center;
        color: var(--ra-muted);
        text-align: center;
        font: 650 12px/1.4 var(--ra-font-ui);
      }
      @media (max-width: 720px) {
        .ra-elements-split {
          grid-template-columns: 1fr;
        }
        .ra-elements-tree,
        .ra-elements-detail {
          max-height: none;
          min-height: 300px;
        }
        .ra-style-field {
          grid-template-columns: 1fr;
        }
        .ra-style-add {
          grid-template-columns: 1fr;
        }
      }
    `;
  }
})();
