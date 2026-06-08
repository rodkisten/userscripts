// ==UserScript==
// @name         003 / Alerta / Plugin / REPL
// @namespace    https://rod.dev/userscripts
// @version      1.4.0
// @description  Production REPL plugin for Alerta with shared API integration, CodeMirror 6 fallback-safe mount, expression-aware evaluation, rich logger output, history, settings, and DOM/React object rendering.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @weight       1000
// @grant        none
// @noframes
// @require      https://rodkisten.github.io/rod-panel-codemirror6.iife.js
// @require      https://code.migos.club/api/cdn?pkgs=codemirror,@codemirror/state,@codemirror/view,@codemirror/autocomplete,@codemirror/language,@codemirror/lang-javascript,@codemirror/lang-css,@codemirror/lang-html&bundle=iife&global=RodCDN&cache=immutable
// ==/UserScript==

(async function AlertaReplPlugin() {
  "use strict";

  const [inspector] = await window.RodUtils.waitForGlobal("RodDockedInspector");
  const api = inspector.api;
  const Utils = api.utils;

  /***************************************************************************************************
   * Constants
   **************************************************************************************************/

  const PLUGIN_ID = "repl";
  const STYLE_ID = "rod-alerta-repl-plugin-v14";
  const STORAGE_KEY = "rod.alerta.repl.v1.4";
  const CM6_BUNDLE_URL = "https://rodkisten.github.io/rod-panel-codemirror6.iife.js";
  const MAX_HISTORY = 120;
  const MAX_OUTPUT = 120;
  const SAVE_DELAY_MS = 120;
  const MOUNT_DELAY_MS = 50;
  const DEFAULT_CODE = `const target = $0 || document.body;
console.log({
  target,
  tag: target?.tagName,
  id: target?.id,
  classes: [...target?.classList || []],
  rect: target?.getBoundingClientRect?.(),
  text: target?.textContent?.trim()?.slice(0, 240)
});`;

  const SETTINGS_FIELDS = [
    { key: "softWrap", type: "boolean", label: "Soft wrap", description: "Wrap long lines in the editor.", defaultValue: true },
    { key: "fontSize", type: "range", label: "Editor font size", min: 10, max: 20, step: 1, defaultValue: 13 },
    { key: "lineNumbers", type: "boolean", label: "Line numbers", defaultValue: true },
    { key: "autocomplete", type: "boolean", label: "Autocomplete", defaultValue: true },
    { key: "evaluateExpressionFirst", type: "boolean", label: "Expression-first eval", description: "Returns the last expression when possible instead of undefined.", defaultValue: true },
    { key: "clearBeforeRun", type: "boolean", label: "Clear before run", defaultValue: false },
    { key: "showHistory", type: "boolean", label: "Show history", defaultValue: true },
    { key: "showOutput", type: "boolean", label: "Show output", defaultValue: true },
  ];

  /***************************************************************************************************
   * State
   **************************************************************************************************/

  let editorView = null;
  let mountTimer = 0;
  let saveTimer = 0;
  let renderQueued = false;

  const state = api.createStore(readState(), handleStateChange);

  /***************************************************************************************************
   * Boot
   **************************************************************************************************/

  api.addStyle(getStyles(), STYLE_ID);
  api.settings.register(PLUGIN_ID, SETTINGS_FIELDS);

  api.registerPlugin({
    id: PLUGIN_ID,
    title: "REPL",
    icon: "square-terminal",
    order: 30,
    setup,
    render,
  });

  /***************************************************************************************************
   * Lifecycle
   **************************************************************************************************/

  /**
   * Sets up event hooks.
   *
   * @returns {void}
   * @example
   * setup();
   */
  function setup() {
    api.on("render", queueEditorMount);
    api.on("tab:changed", (tab) => {
      if (tab === PLUGIN_ID) queueEditorMount();
    });
    api.on("setting:changed", (change) => {
      if (change?.pluginId === PLUGIN_ID) queueEditorRemount();
    });
  }

  /**
   * Reads plugin state.
   *
   * @returns {object} State.
   * @example
   * const data = readState();
   */
  function readState() {
    try {
      return {
        code: DEFAULT_CODE,
        output: [],
        history: [],
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
      };
    } catch {
      return { code: DEFAULT_CODE, output: [], history: [] };
    }
  }

  /**
   * Handles plugin state changes.
   *
   * @returns {void}
   * @example
   * handleStateChange();
   */
  function handleStateChange() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, SAVE_DELAY_MS);
    queueRender();
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: state.code, output: state.output.slice(0, MAX_OUTPUT), history: state.history.slice(0, MAX_HISTORY) }));
    } catch {}
  }

  /**
   * Queues host render.
   *
   * @returns {void}
   * @example
   * queueRender();
   */
  function queueRender() {
    if (renderQueued) return;

    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      api.scheduleRender();
    });
  }

  /**
   * Queues editor mount.
   *
   * @returns {void}
   * @example
   * queueEditorMount();
   */
  function queueEditorMount() {
    clearTimeout(mountTimer);
    mountTimer = setTimeout(mountEditor, MOUNT_DELAY_MS);
  }

  /**
   * Forces editor remount.
   *
   * @returns {void}
   * @example
   * queueEditorRemount();
   */
  function queueEditorRemount() {
    destroyEditor();
    queueEditorMount();
  }

  /***************************************************************************************************
   * Settings
   **************************************************************************************************/

  /**
   * Reads a setting.
   *
   * @param {string} key Key.
   * @returns {*} Value.
   * @example
   * getSetting("softWrap");
   */
  function getSetting(key) {
    const field = SETTINGS_FIELDS.find((item) => item.key === key);
    return api.settings.get(PLUGIN_ID, key, field?.defaultValue);
  }

  /***************************************************************************************************
   * Rendering
   **************************************************************************************************/

  /**
   * Renders plugin UI.
   *
   * @returns {*} Template.
   * @example
   * render();
   */
  function render() {
    return api.html`
      <section class="ra-repl">
        <div class="ra-repl-toolbar">
          <button class="ra-pill ra-run" type="button" @click=${runCode}>${api.icon("play")}Run</button>
          <button class="ra-pill" type="button" @click=${formatCode}>${api.icon("wand-sparkles")}Pretty</button>
          <button class="ra-pill" type="button" @click=${copyCode}>${api.icon("copy")}Copy</button>
          <button class="ra-pill" type="button" @click=${clearOutput}>${api.icon("eraser")}Clear</button>
          <button class="ra-pill" type="button" @click=${insertSelection}>${api.icon("mouse-pointer-click")}$0</button>
        </div>

        <details class="ra-repl-settings">
          <summary>${api.icon("sliders-horizontal")} REPL settings</summary>
          <div class="ra-repl-settings-grid">
            ${SETTINGS_FIELDS.map((field) => renderInlineSetting(field))}
          </div>
        </details>

        <div class="ra-repl-editor-shell">
          <div class="ra-repl-editor" data-repl-editor></div>
          <textarea class="ra-repl-textarea" data-repl-textarea .value=${state.code} @input=${handleTextareaInput}></textarea>
        </div>

        ${getSetting("showOutput") ? api.html`
          <section class="ra-repl-section">
            <header><strong>REPL output</strong><button class="ra-pill" type="button" @click=${clearOutput}>Clear</button></header>
            <div class="ra-repl-output">
              ${state.output.length ? api.repeat(state.output, (record) => record.id, renderOutputRecord) : api.html`<div class="ra-repl-empty">Run code to see rich output here.</div>`}
            </div>
          </section>
        ` : api.nothing}

        ${getSetting("showHistory") ? api.html`
          <section class="ra-repl-section">
            <header><strong>History</strong><button class="ra-pill" type="button" @click=${clearHistory}>Clear history</button></header>
            <div class="ra-repl-history">
              ${state.history.map((item, index) => api.html`<button class="ra-repl-history-item" type="button" @click=${() => restoreHistory(index)}><span>${item.time}</span><code>${Utils.trimText(item.code, 180)}</code></button>`)}
            </div>
          </section>
        ` : api.nothing}
      </section>
    `;
  }

  /**
   * Renders inline setting.
   *
   * @param {object} field Field.
   * @returns {*} Template.
   * @example
   * renderInlineSetting(SETTINGS_FIELDS[0]);
   */
  function renderInlineSetting(field) {
    const value = getSetting(field.key);

    if (field.type === "boolean") {
      return api.html`<label><span>${field.label}</span><input type="checkbox" .checked=${Boolean(value)} @change=${(event) => setSetting(field.key, event.target.checked)} /></label>`;
    }

    if (field.type === "range") {
      return api.html`<label><span>${field.label}</span><input type="range" min=${field.min} max=${field.max} step=${field.step || 1} .value=${String(value)} @input=${(event) => setSetting(field.key, Number(event.target.value))} /><code>${value}</code></label>`;
    }

    return api.nothing;
  }

  /**
   * Renders one output record.
   *
   * @param {object} record Record.
   * @returns {*} Template.
   * @example
   * renderOutputRecord(record);
   */
  function renderOutputRecord(record) {
    if (record.refId) {
      return api.html`<article class="ra-repl-record ra-repl-${record.kind}">${api.viewInspectableObject(record.refId, `repl:${record.id}`, record.label || "")}</article>`;
    }

    return api.html`
      <article class="ra-repl-record ra-repl-${record.kind}">
        <header><strong>${record.kind}</strong><span>${record.time}</span></header>
        <pre>${record.text}</pre>
      </article>
    `;
  }

  /***************************************************************************************************
   * Editor
   **************************************************************************************************/

  /**
   * Mounts CodeMirror or the fallback textarea.
   *
   * @returns {void}
   * @example
   * mountEditor();
   */
  function mountEditor() {
    if (api.state.tab !== PLUGIN_ID) return;

    const root = api.mount.getRoot();
    const mount = root.querySelector("[data-repl-editor]");
    const textarea = root.querySelector("[data-repl-textarea]");

    if (!mount || !textarea) return;

    if (editorView) {
      textarea.style.display = "none";
      return;
    }

    if (!window.RodCodeMirror6 && !window.RodCM6 && !window.RodCDN?.codemirror) {
      textarea.style.display = "block";
      textarea.style.fontSize = `${getSetting("fontSize")}px`;
      return;
    }

    try {
      textarea.style.display = "none";
      mount.innerHTML = "";
      editorView = mountCodeMirror(mount, state.code);
    } catch (error) {
      textarea.style.display = "block";
      pushOutput("error", error);
      api.addLog("error", "[REPL] Failed to mount CodeMirror 6.", error);
    }
  }

  /**
   * Mounts CodeMirror using available globals.
   *
   * @param {HTMLElement} mount Mount node.
   * @param {string} code Initial code.
   * @returns {*} Editor handle.
   * @example
   * const editor = mountCodeMirror(node, "1+1");
   */
  function mountCodeMirror(mount, code) {
    if (window.RodCodeMirror6?.createEditor) {
      return window.RodCodeMirror6.createEditor({
        parent: mount,
        value: code,
        language: "javascript",
        softWrap: getSetting("softWrap"),
        lineNumbers: getSetting("lineNumbers"),
        autocomplete: getSetting("autocomplete"),
        fontSize: getSetting("fontSize"),
        onChange(value) {
          state.code = value;
        },
      });
    }

    if (window.RodCM6?.createEditor) {
      return window.RodCM6.createEditor({
        parent: mount,
        doc: code,
        onChange(value) {
          state.code = value;
        },
      });
    }

    const cm = window.RodCDN;
    const EditorState = cm["@codemirror/state"]?.EditorState || cm.codemirror?.EditorState;
    const EditorView = cm["@codemirror/view"]?.EditorView || cm.codemirror?.EditorView;
    const basicSetup = cm.codemirror?.basicSetup;
    const javascript = cm["@codemirror/lang-javascript"]?.javascript;

    if (!EditorState || !EditorView) throw new Error("CodeMirror 6 globals were not found.");

    const extensions = [
      basicSetup,
      javascript?.(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) state.code = update.state.doc.toString();
      }),
      EditorView.theme({
        "&": { fontSize: `${getSetting("fontSize")}px` },
        ".cm-content": { fontFamily: "var(--ra-font-mono)" },
      }),
    ].filter(Boolean);

    if (getSetting("softWrap") && EditorView.lineWrapping) extensions.push(EditorView.lineWrapping);

    return new EditorView({
      parent: mount,
      state: EditorState.create({ doc: code, extensions }),
    });
  }

  /**
   * Destroys editor.
   *
   * @returns {void}
   * @example
   * destroyEditor();
   */
  function destroyEditor() {
    try {
      editorView?.destroy?.();
    } catch {}
    editorView = null;
  }

  /**
   * Reads editor code.
   *
   * @returns {string} Code.
   * @example
   * const code = getEditorCode();
   */
  function getEditorCode() {
    if (editorView?.state?.doc) return editorView.state.doc.toString();
    if (editorView?.getValue) return editorView.getValue();
    if (editorView?.value) return editorView.value;
    return String(state.code || "");
  }

  /**
   * Sets editor code.
   *
   * @param {string} code Code.
   * @returns {void}
   * @example
   * setEditorCode("1+1");
   */
  function setEditorCode(code) {
    state.code = String(code || "");

    if (editorView?.dispatch && editorView?.state?.doc) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: state.code,
        },
      });
      return;
    }

    if (editorView?.setValue) {
      editorView.setValue(state.code);
    }
  }

  /**
   * Handles textarea input.
   *
   * @param {Event} event Input event.
   * @returns {void}
   * @example
   * handleTextareaInput(event);
   */
  function handleTextareaInput(event) {
    state.code = event.target.value;
  }

  /***************************************************************************************************
   * Actions
   **************************************************************************************************/

  /**
   * Executes REPL code.
   *
   * @returns {Promise<void>} Run promise.
   * @example
   * await runCode();
   */
  async function runCode() {
    const code = getEditorCode();

    if (getSetting("clearBeforeRun")) clearOutput();

    state.code = code;
    pushHistory(code);

    try {
      const result = evaluateCode(code);
      pushOutput("result", result, "return");
      api.addLog("info", "[REPL result]", result);
    } catch (error) {
      pushOutput("error", error);
      api.addLog("error", "[REPL error]", error);
    }
  }

  /**
   * Evaluates code with expression-first semantics.
   *
   * @param {string} code Code.
   * @returns {*} Result.
   * @example
   * evaluateCode("1 + 1");
   */
  function evaluateCode(code) {
    const source = String(code || "");

    const runner = new Function(
      "$0",
      "$r",
      "api",
      "inspector",
      "Utils",
      "console",
      "alerta",
      `
        "use strict";
        if (${JSON.stringify(Boolean(getSetting("evaluateExpressionFirst")))}) {
          try {
            return (0, eval)(${JSON.stringify(source)});
          } catch (expressionError) {
            if (!/Unexpected token|Unexpected identifier|Unexpected end|Illegal return statement/.test(String(expressionError && expressionError.message))) {
              throw expressionError;
            }
          }
        }

        return (function() {
          ${source}
        }).call(window);
      `,
    );

    return runner(window.$0, window.$r, api, inspector, Utils, console, window.alerta);
  }

  /**
   * Formats code.
   *
   * @returns {Promise<void>} Format promise.
   * @example
   * await formatCode();
   */
  async function formatCode() {
    const formatted = await Utils.prettySource(getEditorCode(), "javascript");
    setEditorCode(formatted);
  }

  /**
   * Copies code.
   *
   * @returns {void}
   * @example
   * copyCode();
   */
  function copyCode() {
    Utils.copyText(getEditorCode());
  }

  /**
   * Clears output.
   *
   * @returns {void}
   * @example
   * clearOutput();
   */
  function clearOutput() {
    state.output = [];
  }

  /**
   * Clears history.
   *
   * @returns {void}
   * @example
   * clearHistory();
   */
  function clearHistory() {
    state.history = [];
  }

  /**
   * Inserts $0 helper.
   *
   * @returns {void}
   * @example
   * insertSelection();
   */
  function insertSelection() {
    setEditorCode(`${getEditorCode()}\n\n$0`);
  }

  /**
   * Restores history.
   *
   * @param {number} index History index.
   * @returns {void}
   * @example
   * restoreHistory(0);
   */
  function restoreHistory(index) {
    const item = state.history[index];
    if (item) setEditorCode(item.code);
  }

  /**
   * Pushes history.
   *
   * @param {string} code Code.
   * @returns {void}
   * @example
   * pushHistory("1+1");
   */
  function pushHistory(code) {
    const next = [{ time: new Date().toLocaleTimeString(), code }, ...state.history];
    if (next.length > MAX_HISTORY) next.length = MAX_HISTORY;
    state.history = next;
  }

  /**
   * Pushes output.
   *
   * @param {string} kind Kind.
   * @param {*} value Value.
   * @param {string} label Label.
   * @returns {void}
   * @example
   * pushOutput("result", document.body);
   */
  function pushOutput(kind, value, label = "") {
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind,
      time: new Date().toLocaleTimeString(),
      label,
      text: "",
      refId: null,
    };

    if (Utils.isObjectLike(value)) {
      record.refId = api.objectStore.set(value);
      record.text = Utils.getNodeLabel(value);
    } else {
      record.text = String(value);
    }

    const next = [record, ...state.output];

    if (next.length > MAX_OUTPUT) next.length = MAX_OUTPUT;

    state.output = next;
  }

  /**
   * Sets a setting.
   *
   * @param {string} key Key.
   * @param {*} value Value.
   * @returns {void}
   * @example
   * setSetting("softWrap", true);
   */
  function setSetting(key, value) {
    api.settings.set(PLUGIN_ID, key, value);
  }

  /***************************************************************************************************
   * Styles
   **************************************************************************************************/

  /**
   * Returns plugin styles.
   *
   * @returns {string} CSS.
   * @example
   * getStyles();
   */
  function getStyles() {
    return `
      .ra-repl{display:grid;gap:8px}
      .ra-repl-toolbar{display:flex;gap:7px;align-items:center;overflow:auto;padding-bottom:2px}
      .ra-repl-toolbar .ra-run{border-color:rgb(125 211 252 / .55);background:rgb(125 211 252 / .12)}
      .ra-repl-settings{border:1px solid var(--ra-border);border-radius:14px;background:rgb(255 255 255 / .035);overflow:hidden}
      .ra-repl-settings summary{display:flex;align-items:center;gap:8px;padding:9px 11px;font:850 12px/1 var(--ra-font-ui);cursor:pointer}
      .ra-repl-settings-grid{display:grid;gap:1px;padding:0 9px 9px}
      .ra-repl-settings-grid label{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:7px 0;color:var(--ra-text);font:650 11px/1.25 var(--ra-font-ui)}
      .ra-repl-editor-shell{min-height:360px;border:1px solid var(--ra-border-strong);border-radius:18px;overflow:hidden;background:rgb(3 7 12 / .82)}
      .ra-repl-editor{min-height:360px}
      .ra-repl-textarea{display:none;width:100%;min-height:360px;padding:14px;border:0;outline:0;resize:vertical;background:rgb(3 7 12 / .82);color:var(--ra-text);font:13px/1.45 var(--ra-font-mono);white-space:pre;tab-size:2}
      .ra-repl-section{display:grid;gap:8px}
      .ra-repl-section header{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px}
      .ra-repl-section header strong{color:var(--ra-strong);font:900 12px/1 var(--ra-font-ui);letter-spacing:.12em;text-transform:uppercase}
      .ra-repl-output,.ra-repl-history{display:grid;gap:8px}
      .ra-repl-record{border:1px solid var(--ra-border);border-radius:14px;background:rgb(255 255 255 / .035);padding:8px}
      .ra-repl-record header{display:flex;justify-content:space-between;color:var(--ra-muted);font:800 10px/1 var(--ra-font-ui);text-transform:uppercase}
      .ra-repl-record pre{margin:7px 0 0;white-space:pre-wrap;word-break:break-word;font:420 var(--ra-font-size)/1.38 var(--ra-font-mono)}
      .ra-repl-error{border-left:3px solid var(--ra-error-border)}
      .ra-repl-empty{min-height:88px;display:grid;place-items:center;border:1px dashed var(--ra-border);border-radius:14px;color:var(--ra-muted);font:600 12px/1.4 var(--ra-font-ui);text-align:center}
      .ra-repl-history-item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:center;width:100%;border:1px solid var(--ra-border);border-radius:14px;background:rgb(255 255 255 / .035);color:var(--ra-text);padding:8px;text-align:left}
      .ra-repl-history-item span{color:var(--ra-muted);font:800 10px/1 var(--ra-font-ui)}
      .ra-repl-history-item code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:420 11px/1 var(--ra-font-mono)}
      .cm-editor{min-height:360px;background:transparent;color:var(--ra-text)}
      .cm-scroller{font-family:var(--ra-font-mono)!important}
    `;
  }
})();
