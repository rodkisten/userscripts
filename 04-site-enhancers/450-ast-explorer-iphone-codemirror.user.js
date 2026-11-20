// ==UserScript==
// @name         Rod AST Explorer · iPhone CodeMirror 6
// @namespace    https://github.com/rodkisten/userscripts
// @version      0.3.0
// @description  Mobile-first enhancements, CodeMirror 6 source editor, dark mode and diagnostic console.
// @match        https://astexplorer.net/*
// @match        https://www.astexplorer.net/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (document.getElementById('rod-ast-toolbar')) return;
  window.__rodAstExplorer = true;
  document.documentElement.classList.add('rod-ast-modern');

  const KEY = 'rod:ast-explorer:settings';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } })();
  const state = { theme: saved.theme || 'auto', tab: saved.tab || 'source', console: [], editor: null };
  const persist = () => localStorage.setItem(KEY, JSON.stringify({ theme: state.theme, tab: state.tab }));
  const host = document.createElement('div');
  host.id = 'rod-ast-toolbar';
  host.innerHTML = '<span class="rod-brand">✳ AST Explorer</span><button data-tab="source">Code</button><button data-tab="ast">AST</button><button data-tab="console">Console <span id="rod-log-count">0</span></button><button id="rod-undo" title="Undo (Ctrl/Cmd+Z)">↶</button><button id="rod-redo" title="Redo (Ctrl/Cmd+Shift+Z)">↷</button><button id="rod-copy" title="Copy source">⧉</button><button id="rod-theme" title="Toggle theme">◐</button>';
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
    .rod-cm-shell{min-height:180px;position:relative;overflow:hidden;border:1px solid var(--rod-border,#ddd);border-radius:10px;background:var(--rod-bg,#fff);color:var(--rod-fg,#171717)}
    .rod-cm-shell .cm-gutters{background:var(--rod-bg,#fff);color:#858b98;border-right:1px solid var(--rod-border,#ddd)}
    .rod-cm-shell .cm-activeLine{background:rgba(128,128,128,.09)}
    .rod-cm-shell .cm-selectionBackground{background:#0070f32b!important}
    .rod-cm-shell .cm-tooltip{border:1px solid var(--rod-border,#ddd);background:var(--rod-bg,#fff);color:var(--rod-fg,#171717);border-radius:9px;box-shadow:0 10px 30px #0002}
    .rod-cm-shell .cm-tooltip-autocomplete>ul>li[aria-selected]{background:#0070f3;color:#fff}
    #rod-ast-toolbar button:focus-visible,#rod-ast-console button:focus-visible{outline:2px solid #0070f3;outline-offset:2px}
    .rod-cm-shell .cm-editor{height:100%;min-height:180px;font-size:13px}
    .rod-cm-shell .cm-scroller{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overscroll-behavior:contain}
    .rod-cm-shell .cm-content{font-size:16px}
    @media(min-width:769px){.rod-cm-shell .cm-content{font-size:13px}}
    @media(max-width:768px){
      #rod-ast-toolbar{position:fixed;top:auto;bottom:0;left:0;right:0;padding:8px 8px calc(8px + env(safe-area-inset-bottom));box-shadow:0 -3px 18px #0002}
      #rod-ast-toolbar .rod-brand{display:none}
      #rod-ast-toolbar button{flex:1;min-width:0;padding:7px 3px;font-size:12px}
      #rod-ast-toolbar #rod-copy{display:none}
      body{padding-bottom:calc(58px + env(safe-area-inset-bottom))!important}
      #rod-ast-console{position:fixed;left:0;right:0;bottom:calc(58px + env(safe-area-inset-bottom));max-height:55dvh;box-shadow:0 -10px 30px #0003}
    }
    html.rod-dark{color-scheme:dark;--rod-bg:#17191e;--rod-fg:#e9edf3;--rod-border:#3b404a;--rod-active:#353b47}
    html.rod-light{color-scheme:light;--rod-bg:#fff;--rod-fg:#171717;--rod-border:#ddd;--rod-active:#e9e9e9}
  `;
  style.textContent += `
    @media(max-width:768px){
      html,body{max-width:100%!important;overflow-x:hidden!important}
      #rod-ast-toolbar{z-index:2147483646}
      #rod-ast-toolbar button{min-height:42px}
      body.rod-mobile-source .rod-ast-secondary{display:none!important}
      body.rod-mobile-ast .rod-ast-primary{display:none!important}
      body.rod-mobile-console .rod-ast-primary,body.rod-mobile-console .rod-ast-secondary{display:none!important}
      body.rod-mobile-source .rod-ast-primary,body.rod-mobile-ast .rod-ast-secondary{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;flex:1 1 100%!important}
      body.rod-mobile-source .rod-cm-shell{width:100%!important;height:calc(100dvh - 190px)!important;min-height:45dvh}
      body.rod-mobile-console #rod-ast-console{display:block;height:calc(100dvh - 150px);max-height:none}
    }
  `;
  // Global design tokens style the existing React UI, not only the custom toolbar.
  style.textContent += `
    html.rod-ast-modern {
      --rod-bg:#ffffff;--rod-fg:#171717;--rod-border:#e5e7eb;--rod-active:#f3f4f6;
      --rod-muted:#737373;--rod-accent:#2563eb;
      color-scheme:light;
    }
    html.rod-ast-modern.rod-dark {
      --rod-bg:#0a0a0b;--rod-fg:#ededed;--rod-border:#29292d;
      --rod-active:#202024;--rod-muted:#a1a1aa;--rod-accent:#60a5fa;
      color-scheme:dark;
    }
    html.rod-ast-modern body,
    html.rod-ast-modern #page,
    html.rod-ast-modern #container,
    html.rod-ast-modern .SplitPane,
    html.rod-ast-modern .Pane,
    html.rod-ast-modern .editor,
    html.rod-ast-modern .output {
      background:var(--rod-bg)!important;color:var(--rod-fg)!important;
      font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
    }
    html.rod-ast-modern button,
    html.rod-ast-modern select,
    html.rod-ast-modern input,
    html.rod-ast-modern .btn,
    html.rod-ast-modern .toolbar,
    html.rod-ast-modern [role="tab"] {
      font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
    }
    html.rod-ast-modern button,
    html.rod-ast-modern .btn,
    html.rod-ast-modern select,
    html.rod-ast-modern [role="tab"] {
      border-radius:8px!important;
      border-color:var(--rod-border)!important;
      color:var(--rod-fg)!important;
      transition:background .15s ease,border-color .15s ease;
    }
    html.rod-ast-modern button:hover,
    html.rod-ast-modern [role="tab"]:hover {
      background:var(--rod-active)!important;
    }
    html.rod-ast-modern a{color:var(--rod-accent)!important}
    html.rod-ast-modern .CodeMirror,
    html.rod-ast-modern .CodeMirror-gutters,
    html.rod-ast-modern .CodeMirror-scroll,
    html.rod-ast-modern .cm-editor,
    html.rod-ast-modern .cm-gutters {
      background:var(--rod-bg)!important;color:var(--rod-fg)!important;
    }
    html.rod-ast-modern .CodeMirror-gutters,
    html.rod-ast-modern .cm-gutters{border-right:1px solid var(--rod-border)!important}
    html.rod-ast-modern .CodeMirror,
    html.rod-ast-modern .cm-editor{
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace!important;
      font-size:13px!important;line-height:1.65!important;
    }
    html.rod-ast-modern .CodeMirror-activeline-background{background:var(--rod-active)!important}
    html.rod-ast-modern .Resizer{background:var(--rod-border)!important;opacity:1!important}
    html.rod-ast-modern .Resizer:hover{background:var(--rod-accent)!important}
    html.rod-ast-modern .settings-drawer__collapsed{background:var(--rod-active)!important}
    html.rod-ast-modern .settings-drawer__expanded{background:var(--rod-bg)!important;border-color:var(--rod-border)!important}
    html.rod-ast-modern #rod-ast-toolbar{
      background:var(--rod-bg)!important;color:var(--rod-fg)!important;
      border-color:var(--rod-border)!important;
      font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
    }
    html.rod-ast-modern #rod-ast-console{
      background:var(--rod-bg)!important;color:var(--rod-fg)!important;
    }
    @media(max-width:768px){
      html.rod-ast-modern,html.rod-ast-modern body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
      html.rod-ast-modern #page,html.rod-ast-modern #container{max-width:100vw!important;min-width:0!important}
      html.rod-ast-modern .CodeMirror,html.rod-ast-modern .cm-content{font-size:16px!important}
      html.rod-ast-modern .SplitPane{min-width:0!important;max-width:100vw!important}
      html.rod-ast-modern .rod-ast-primary,html.rod-ast-modern .rod-ast-secondary{min-width:0!important;max-width:100vw!important}
      html.rod-ast-modern body.rod-mobile-source .rod-ast-secondary{display:none!important}
      html.rod-ast-modern body.rod-mobile-ast .rod-ast-primary{display:none!important}
      html.rod-ast-modern body.rod-mobile-console .rod-ast-primary,
      html.rod-ast-modern body.rod-mobile-console .rod-ast-secondary{display:none!important}
      html.rod-ast-modern body.rod-mobile-source .rod-ast-primary,
      html.rod-ast-modern body.rod-mobile-ast .rod-ast-secondary{
        display:block!important;position:relative!important;left:0!important;
        width:100vw!important;max-width:100vw!important;flex:1 1 100%!important;
      }
      html.rod-ast-modern body.rod-mobile-console #rod-ast-console{
        display:block!important;height:calc(100dvh - 150px);max-height:none;
      }
      html.rod-ast-modern #rod-ast-toolbar button{min-height:40px!important;padding:7px 4px!important}
    }
  `;
  document.head.append(style);
  function detectPanels() {
    const panes=[...document.querySelectorAll('.Pane')].filter(el=>el.getBoundingClientRect().height>150);
    if(panes.length>=2) {
      const source=panes.find(p=>p.querySelector('.CodeMirror'));
      const ast=panes.find(p=>p!==source && (p.querySelector('[role="tree"],.output,.entry')||p.querySelector('.CodeMirror')));
      if(source && ast) { source.classList.add('rod-ast-primary'); ast.classList.add('rod-ast-secondary'); return; }
    }
    const editors=[...document.querySelectorAll('.CodeMirror')];
    const source=editors[0];
    if(!source)return;
    const closest=source.closest('.Pane,.editor')||source.parentElement;
    closest.classList.add('rod-ast-primary');
    const tree=document.querySelector('.output,[role="tree"]');
    const secondary=tree?.closest('.Pane,.output')||tree;
    if(secondary && secondary!==closest && !closest.contains(secondary)) secondary.classList.add('rod-ast-secondary');
  }
  detectPanels();
  const layoutObserver=new MutationObserver(()=>{if(!document.querySelector('.rod-ast-primary,.rod-ast-secondary'))detectPanels();});
  layoutObserver.observe(document.body,{childList:true,subtree:true});
  function findPanels() {
    const source = [...document.querySelectorAll('.CodeMirror')].find(el => el.getBoundingClientRect().width > 100);
    if (!source) return;
    const locate = el => {
      let node = el;
      while (node.parentElement && node.parentElement !== document.body) {
        const rect = node.getBoundingClientRect();
        if (rect.width >= 180 && rect.width < innerWidth * .85 && rect.height > 180) return node;
        node = node.parentElement;
      }
      return el.parentElement;
    };
    const primary = locate(source);
    const other = [...document.querySelectorAll('.CodeMirror,[role="tree"],.react-json-view')].find(el => el !== source && !primary.contains(el) && el.getBoundingClientRect().width > 100);
    if (!other) return;
    const secondary = locate(other);
    if (primary === secondary || primary.contains(secondary) || secondary.contains(primary)) return;
    primary.classList.add('rod-ast-primary');
    secondary.classList.add('rod-ast-secondary');
  }
  findPanels();
  const panelObserver = new MutationObserver(() => { if (!document.querySelector('.rod-ast-primary')) findPanels(); });
  panelObserver.observe(document.body, { childList:true, subtree:true });
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
  host.querySelector('#rod-undo').addEventListener('click', () => state.editor?.undo());\n  host.querySelector('#rod-redo').addEventListener('click', () => state.editor?.redo());\n  host.querySelector('#rod-copy').addEventListener('click', async () => { if (state.editor && navigator.clipboard?.writeText) await navigator.clipboard.writeText(state.editor.getValue()); });\n  host.querySelector('#rod-theme').addEventListener('click', () => {
    state.theme = state.theme === 'auto' ? 'dark' : state.theme === 'dark' ? 'light' : 'auto';
    persist(); applyTheme();
    host.querySelector('#rod-theme').title = 'Theme: ' + state.theme;
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  function selectTab(tab) {
    state.tab = tab; persist();
    document.body.classList.remove('rod-mobile-source','rod-mobile-ast','rod-mobile-console');
    document.body.classList.add('rod-mobile-'+tab);
    detectPanels();
    document.body.classList.remove('rod-mobile-source','rod-mobile-ast','rod-mobile-console');
    document.body.classList.add('rod-mobile-' + tab);
    findPanels();
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
    // One dependency graph avoids duplicate CodeMirror State/View instances.
    const modules = await Promise.all([
      import('https://esm.sh/@codemirror/state@6'),
      import('https://esm.sh/@codemirror/view@6'),
      import('https://esm.sh/codemirror@6'),
      import('https://esm.sh/@codemirror/lang-javascript@6'),
      import('https://esm.sh/@codemirror/theme-one-dark@6'),
      import('https://esm.sh/@codemirror/commands@6'),
      import('https://esm.sh/@codemirror/autocomplete@6'),
      import('https://esm.sh/@codemirror/search@6'),
      import('https://esm.sh/@codemirror/language@6')
    ]);
    const [{ EditorState, Compartment }, { EditorView, keymap }, { basicSetup }, { javascript },
      { oneDark }, { undo, redo, defaultKeymap, historyKeymap },
      { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap },
      { searchKeymap, highlightSelectionMatches }, { bracketMatching, foldKeymap, indentOnInput }] = modules;
    const classic = [...document.querySelectorAll('.CodeMirror')].find(el => el.offsetWidth > 100 && el.offsetHeight > 60 && el.CodeMirror);
    const textarea = classic ? null : [...document.querySelectorAll('textarea')].find(el => el.offsetWidth > 100 && el.offsetHeight > 50);
    if (!classic && !textarea) { log('warn', 'Source editor not found; keeping original.'); return; }
    const legacy = classic?.CodeMirror;
    const original = classic || textarea;
    const read = () => legacy ? legacy.getValue() : textarea.value;
    const write = value => {
      if (legacy) legacy.setValue(value);
      else {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, value);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    const shell = document.createElement('div');
    shell.className = 'rod-cm-shell';
    original.before(shell);
    const oldDisplay = original.style.display;
    const oldHeight = original.getBoundingClientRect().height;
    shell.style.height = Math.max(240, oldHeight) + 'px';
    original.style.display = 'none';
    const theme = new Compartment();
    let syncing = false;
    const darkTheme = () => document.documentElement.classList.contains('rod-dark') ? oneDark : [];
    const view = new EditorView({
      state: EditorState.create({
        doc: read(),
        extensions: [
          basicSetup, javascript(), autocompletion({ activateOnTyping: true }),
          closeBrackets(), bracketMatching(), indentOnInput(), highlightSelectionMatches(),
          keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...foldKeymap, ...defaultKeymap, ...historyKeymap]),
          theme.of(darkTheme()),
          EditorView.theme({
            '&': { height: '100%', backgroundColor: 'transparent' },
            '.cm-content': { caretColor: '#0070f3' },
            '&.cm-focused': { outline: 'none' }
          }),
          EditorView.updateListener.of(update => {
            if (!update.docChanged || syncing) return;
            syncing = true;
            try { write(update.state.doc.toString()); } finally { syncing = false; }
          })
        ]
      }),
      parent: shell
    });
    function syncFromOriginal() {
      if (syncing || read() === view.state.doc.toString()) return;
      syncing = true;
      try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: read() } }); }
      finally { syncing = false; }
    }
    if (legacy) legacy.on('change', syncFromOriginal);
    else { textarea.addEventListener('input', syncFromOriginal); textarea.addEventListener('change', syncFromOriginal); }
    const observer = new MutationObserver(syncFromOriginal);
    observer.observe(original, { attributes: true, attributeFilter: ['value'] });
    state.editor = {
      focus: () => view.focus(),
      undo: () => { undo(view); view.focus(); },
      redo: () => { redo(view); view.focus(); },
      getValue: () => view.state.doc.toString(),
      setDark: dark => view.dispatch({ effects: theme.reconfigure(dark ? oneDark : []) }),
      destroy: () => {
        observer.disconnect();
        if (legacy) legacy.off('change', syncFromOriginal);
        else { textarea.removeEventListener('input', syncFromOriginal); textarea.removeEventListener('change', syncFromOriginal); }
        view.destroy(); shell.remove(); original.style.display = oldDisplay;
      }
    };
    log('info', 'CodeMirror 6 mounted with completion, search, undo/redo and clipboard support');
  }
  mountCodeMirror().catch(error => log('error', 'CodeMirror unavailable; original editor preserved:', error));
})();
