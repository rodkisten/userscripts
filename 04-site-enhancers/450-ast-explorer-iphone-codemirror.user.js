// ==UserScript==
// @name         Rod AST Explorer · iPhone CodeMirror 6
// @namespace    https://github.com/rodkisten/userscripts
// @version      0.1.0
// @description  Mobile-first enhancements, CodeMirror 6 source editor, dark mode and diagnostic console.
// @match        https://astexplorer.net/*
// @match        https://www.astexplorer.net/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__rodAstExplorer) return;
  window.__rodAstExplorer = true;

  const KEY = 'rod:ast-explorer:settings';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } })();
  const state = { theme: saved.theme || 'auto', tab: saved.tab || 'source', console: [], editor: null };
  const persist = () => localStorage.setItem(KEY, JSON.stringify({ theme: state.theme, tab: state.tab }));
  const host = document.createElement('div');
  host.id = 'rod-ast-toolbar';
  host.innerHTML = '<span class="rod-brand">✳ AST Explorer</span><button data-tab="source">Code</button><button data-tab="ast">AST</button><button data-tab="console">Console <span id="rod-log-count">0</span></button><button id="rod-theme" title="Toggle theme">◐</button>';
  const panel = document.createElement('section');
  panel.id = 'rod-ast-console';
  panel.setAttribute('aria-label', 'AST Explorer diagnostics');
  panel.innerHTML = '<header><strong>Console output</strong><button id="rod-clear">Clear</button></header><div id="rod-log-list" role="log" aria-live="polite"></div>';
  const style = document.createElement('style');
  style.textContent = `
    #rod-ast-toolbar{position:sticky;top:0;z-index:2147483000;display:flex;align-items:center;gap:5px;padding:8px max(8px,env(safe-area-inset-right));background:var(--rod-bg,#fff);color:var(--rod-fg,#171717);border-bottom:1px solid var(--rod-border,#ddd);font:500 13px system-ui;box-sizing:border-box}
    #rod-ast-toolbar .rod-brand{margin-right:auto;white-space:nowrap;font-weight:750}
    #rod-ast-toolbar button,#rod-ast-console button{border:1px solid var(--rod-border,#ddd);border-radius:9px;background:transparent;color:inherit;padding:8px;min-height:36px;font:inherit}
    #rod-ast-toolbar button[aria-pressed=true]{background:var(--rod-active,#e9e9e9)}
    #rod-ast-console{display:none;position:relative;z-index:20;background:var(--rod-bg,#fff);color:var(--rod-fg,#171717);font:12px ui-monospace,monospace;min-height:180px;max-height:55dvh;overflow:auto;border-top:1px solid var(--rod-border,#ddd)}
    #rod-ast-console.rod-visible{display:block}
    #rod-ast-console header{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:inherit;border-bottom:1px solid var(--rod-border,#ddd)}
    #rod-log-list>div{padding:7px 12px;border-bottom:1px solid var(--rod-border,#ddd);overflow-wrap:anywhere;white-space:pre-wrap}
    #rod-log-list .error{color:#e05252} #rod-log-list .warn{color:#d79528}
    .rod-cm-shell{min-height:180px;position:relative;overflow:hidden}
    .rod-cm-shell .cm-editor{height:100%;min-height:180px;font-size:13px}
    .rod-cm-shell .cm-scroller{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overscroll-behavior:contain}
    .rod-cm-shell .cm-content{font-size:16px}
    @media(min-width:769px){.rod-cm-shell .cm-content{font-size:13px}}
    @media(max-width:768px){
      #rod-ast-toolbar{position:fixed;top:auto;bottom:0;left:0;right:0;padding:8px 8px calc(8px + env(safe-area-inset-bottom));box-shadow:0 -3px 18px #0002}
      #rod-ast-toolbar .rod-brand{display:none}
      #rod-ast-toolbar button{flex:1;min-width:0}
      body{padding-bottom:calc(58px + env(safe-area-inset-bottom))!important}
      #rod-ast-console{position:fixed;left:0;right:0;bottom:calc(58px + env(safe-area-inset-bottom));max-height:55dvh;box-shadow:0 -10px 30px #0003}
    }
    html.rod-dark{color-scheme:dark;--rod-bg:#17191e;--rod-fg:#e9edf3;--rod-border:#3b404a;--rod-active:#353b47}
    html.rod-light{color-scheme:light;--rod-bg:#fff;--rod-fg:#171717;--rod-border:#ddd;--rod-active:#e9e9e9}
  `;
  document.head.append(style);
  document.body.prepend(host);
  document.body.append(panel);
  const list = panel.querySelector('#rod-log-list');
  const serialize = value => {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? String(item) : item, 2) ?? String(value); }
    catch { return String(value); }
  };
  function log(level, ...values) {
    const line = { level, time: new Date().toLocaleTimeString(), message: values.map(serialize).join(' ') };
    state.console.push(line);
    if (state.console.length > 250) { state.console.shift(); list.firstChild?.remove(); }
    const item = document.createElement('div');
    item.className = level;
    item.textContent = '[' + line.time + '] ' + level.toUpperCase() + ' ' + line.message;
    list.append(item);
    host.querySelector('#rod-log-count').textContent = String(state.console.length);
  }
  window.addEventListener('error', event => log('error', event.message, event.filename, event.lineno));
  window.addEventListener('unhandledrejection', event => log('error', event.reason));
  // Diagnostic console is opt-in: do not permanently replace the page's console methods.
  const original = {};
  let capture = false;
  function setCapture(enabled) {
    if (enabled === capture) return;
    capture = enabled;
    for (const level of ['log','info','warn','error','debug']) {
      if (enabled) {
        original[level] = console[level];
        console[level] = (...args) => { original[level].apply(console, args); log(level, ...args); };
      } else if (original[level]) console[level] = original[level];
    }
  }
  panel.querySelector('#rod-clear').addEventListener('click', () => {
    state.console.length = 0; list.replaceChildren(); host.querySelector('#rod-log-count').textContent = '0';
  });
  function applyTheme() {
    const dark = state.theme === 'dark' || (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('rod-dark', dark);
    document.documentElement.classList.toggle('rod-light', !dark);
    document.documentElement.style.setProperty('--rod-cm-dark', String(dark));
    state.editor?.setDark(dark);
  }
  host.querySelector('#rod-theme').addEventListener('click', () => {
    state.theme = state.theme === 'auto' ? 'dark' : state.theme === 'dark' ? 'light' : 'auto';
    persist(); applyTheme();
    host.querySelector('#rod-theme').title = 'Theme: ' + state.theme;
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  function selectTab(tab) {
    state.tab = tab; persist();
    panel.classList.toggle('rod-visible', tab === 'console');
    host.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
    if (tab === 'console') setCapture(true);
    else setCapture(false);
    if (tab === 'source') state.editor?.focus();
    if (tab === 'ast') {
      const ast = document.querySelector('[class*="tree"],[class*="ast"]');
      if (ast) ast.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  host.addEventListener('click', event => {
    const button = event.target.closest('[data-tab]');
    if (button) selectTab(button.dataset.tab);
  });
  selectTab(state.tab);
  applyTheme();

  async function mountCodeMirror() {
    // Bundled ESM modules are fetched at runtime so the .user.js stays independently installable.
    const [{ EditorState, Compartment }, { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection }, { basicSetup }, { javascript }, { oneDark }, { defaultKeymap, historyKeymap }] = await Promise.all([
      import('https://esm.sh/@codemirror/state@6?bundle'),
      import('https://esm.sh/@codemirror/view@6?bundle'),
      import('https://esm.sh/codemirror@6?bundle'),
      import('https://esm.sh/@codemirror/lang-javascript@6?bundle'),
      import('https://esm.sh/@codemirror/theme-one-dark@6?bundle'),
      import('https://esm.sh/@codemirror/commands@6?bundle')
    ]);
    const textarea = [...document.querySelectorAll('textarea')].find(el => el.offsetWidth > 100 && el.offsetHeight > 50);
    if (!textarea) { log('warn', 'No compatible source textarea found; original editor preserved.'); return; }
    const shell = document.createElement('div');
    shell.className = 'rod-cm-shell';
    textarea.parentElement.insertBefore(shell, textarea);
    const oldDisplay = textarea.style.display;
    textarea.style.display = 'none';
    const theme = new Compartment();
    let syncing = false;
    const view = new EditorView({
      state: EditorState.create({
        doc: textarea.value,
        extensions: [
          basicSetup, javascript(), lineNumbers(), highlightActiveLine(), drawSelection(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          theme.of(document.documentElement.classList.contains('rod-dark') ? oneDark : []),
          EditorView.updateListener.of(update => {
            if (!update.docChanged || syncing) return;
            const value = update.state.doc.toString();
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            setter?.call(textarea, value);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
          })
        ]
      }),
      parent: shell
    });
    // Keep external parser, gist and URL updates reflected in the replacement editor.
    const observer = new MutationObserver(() => syncFromOriginal());
    observer.observe(textarea, { attributes: true, attributeFilter: ['value'] });
    function syncFromOriginal() {
      if (textarea.value === view.state.doc.toString()) return;
      syncing = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: textarea.value } });
      syncing = false;
    }
    const onChange = () => syncFromOriginal();
    textarea.addEventListener('input', onChange);
    textarea.addEventListener('change', onChange);
    state.editor = {
      focus: () => view.focus(),
      setDark: dark => view.dispatch({ effects: theme.reconfigure(dark ? oneDark : []) }),
      destroy: () => { observer.disconnect(); textarea.removeEventListener('input', onChange); textarea.removeEventListener('change', onChange); view.destroy(); shell.remove(); textarea.style.display = oldDisplay; }
    };
    log('info', 'CodeMirror 6 mounted');
  }
  mountCodeMirror().catch(error => log('error', 'CodeMirror unavailable; original editor preserved:', error));
})();
