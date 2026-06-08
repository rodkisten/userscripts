// ==UserScript==
// @name         Rod / Tools / Safari Mobile REPL (CodeMirror 6)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Mini VSCode REPL com painel flutuante, arrastável e console moderno.
// @match        *://*/*
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';

    // 1. Variáveis CSS Modernas (CSS Vars)
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --repl-bg: rgba(24, 24, 28, 0.75);
            --repl-border: rgba(255, 255, 255, 0.1);
            --repl-text: #e1e4e8;
            --repl-accent: #007aff;
            --repl-radius: 16px;
            --repl-shadow: 0 20px 40px rgba(0,0,0,0.4);
            --repl-blur: blur(20px) saturate(150%);
        }

        /* Botão Flutuante (FAB) */
        #repl-fab {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 56px;
            height: 56px;
            background: var(--repl-accent);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            cursor: grab;
            z-index: 999999;
            touch-action: none;
            user-select: none;
            transition: transform 0.2s;
        }
        #repl-fab:active { cursor: grabbing; transform: scale(0.95); }

        /* Painel Principal */
        #repl-panel {
            position: fixed;
            top: 5vh;
            left: 5vw;
            width: 90vw;
            height: 90vh;
            background: var(--repl-bg);
            backdrop-filter: var(--repl-blur);
            -webkit-backdrop-filter: var(--repl-blur);
            border: 1px solid var(--repl-border);
            border-radius: var(--repl-radius);
            box-shadow: var(--repl-shadow);
            z-index: 999998;
            display: none;
            flex-direction: column;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        #repl-panel.open { display: flex; opacity: 1; }

        /* Cabeçalho */
        #repl-header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--repl-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(0,0,0,0.2);
            touch-action: none;
        }
        #repl-header h2 { margin: 0; font-size: 16px; color: var(--repl-text); font-weight: 600; }
        
        .repl-controls { display: flex; gap: 8px; }
        .repl-btn {
            background: var(--repl-accent);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 6px 12px;
            font-weight: bold;
            cursor: pointer;
            font-size: 14px;
        }
        .repl-btn-close { background: rgba(255, 69, 58, 0.8); }

        /* Layout Interno */
        #repl-body { display: flex; flex-direction: column; height: 100%; flex: 1; overflow: hidden; }
        
        #repl-editor-container {
            flex: 1;
            overflow: auto;
            border-bottom: 1px solid var(--repl-border);
            font-size: 14px;
        }

        /* Console Output */
        #repl-console {
            flex: 1;
            background: rgba(0, 0, 0, 0.4);
            overflow-y: auto;
            padding: 12px;
            color: var(--repl-text);
            font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
            font-size: 13px;
        }
        
        .log-entry { margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px; }
        .log-entry.error { color: #ff6b6b; }
        
        /* Tree View Nativo do Console */
        details.repl-tree { padding-left: 4px; }
        details.repl-tree summary { cursor: pointer; color: #79c0ff; outline: none; }
        details.repl-tree summary::-webkit-details-marker { color: #888; }
        .repl-tree-content { padding-left: 20px; border-left: 1px solid rgba(255,255,255,0.1); margin-left: 6px; margin-top: 4px; }
        .repl-key { color: #d2a8ff; }
        .repl-string { color: #a5d6ff; }
        .repl-number { color: #79c0ff; }
        .repl-boolean { color: #ff7b72; }
        
        /* Ajuste CodeMirror Mobile */
        .cm-editor { height: 100%; outline: none !important; }
        .cm-scroller { font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important; }
    `;
    document.head.appendChild(style);

    // 2. HTML Structure
    const fab = document.createElement('div');
    fab.id = 'repl-fab';
    fab.innerHTML = '⚡️';
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'repl-panel';
    panel.innerHTML = `
        <div id="repl-header">
            <h2>JS REPL</h2>
            <div class="repl-controls">
                <button class="repl-btn" id="repl-run">Run ▶</button>
                <button class="repl-btn repl-btn-close" id="repl-close">✕</button>
            </div>
        </div>
        <div id="repl-body">
            <div id="repl-editor-container"></div>
            <div id="repl-console"></div>
        </div>
    `;
    document.body.appendChild(panel);

    // 3. Lógica de Drag & Drop (Mobile e Desktop)
    let isDragging = false;
    let startX, startY, initialX, initialY;

    const dragStart = (e) => {
        isDragging = true;
        startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        const rect = fab.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        fab.style.transition = 'none';
    };

    const dragMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        const currentY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        const dx = currentX - startX;
        const dy = currentY - startY;
        
        // Limites de tela
        let newX = initialX + dx;
        let newY = initialY + dy;
        newX = Math.max(0, Math.min(newX, window.innerWidth - 56));
        newY = Math.max(0, Math.min(newY, window.innerHeight - 56));

        fab.style.left = `${newX}px`;
        fab.style.top = `${newY}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
    };

    const dragEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;
        fab.style.transition = 'transform 0.2s';
        
        // Se foi apenas um clique (pouco movimento), abre o painel
        const endX = e.type.includes('mouse') ? e.clientX : (e.changedTouches ? e.changedTouches[0].clientX : startX);
        const endY = e.type.includes('mouse') ? e.clientY : (e.changedTouches ? e.changedTouches[0].clientY : startY);
        if (Math.abs(endX - startX) < 10 && Math.abs(endY - startY) < 10) {
            panel.classList.add('open');
            fab.style.display = 'none';
        }
    };

    fab.addEventListener('mousedown', dragStart);
    fab.addEventListener('touchstart', dragStart, { passive: false });
    window.addEventListener('mousemove', dragMove);
    window.addEventListener('touchmove', dragMove, { passive: false });
    window.addEventListener('mouseup', dragEnd);
    window.addEventListener('touchend', dragEnd);

    document.getElementById('repl-close').addEventListener('click', () => {
        panel.classList.remove('open');
        fab.style.display = 'flex';
    });

    // 4. Carregamento do CodeMirror 6 via ESM
    const cmScript = document.createElement('script');
    cmScript.type = 'module';
    cmScript.textContent = `
        import { EditorState, basicSetup } from "https://esm.sh/@codemirror/basic-setup?bundle";
        import { EditorView, keymap } from "https://esm.sh/@codemirror/view?bundle";
        import { javascript } from "https://esm.sh/@codemirror/lang-javascript?bundle";
        import { oneDark } from "https://esm.sh/@codemirror/theme-one-dark?bundle";

        // Atalho Cmd+Enter ou Ctrl+Enter para rodar
        const runKeymap = keymap.of([{
            key: "Mod-Enter",
            run: () => { window.runRepl(); return true; }
        }]);

        const state = EditorState.create({
            doc: "// Escreva seu código aqui...\\n\\nconst msg = 'Olá, Safari!';\\nconsole.log(msg);\\n\\n// Retorno final será impresso:\\n({ user: 'User', status: 'Online' })",
            extensions: [
                basicSetup,
                javascript(),
                oneDark,
                runKeymap,
                EditorView.theme({
                    "&": { height: "100%" }
                })
            ]
        });

        const view = new EditorView({
            state,
            parent: document.getElementById('repl-editor-container')
        });

        // Expõe o conteúdo para o escopo global do Userscript ler
        window.getReplCode = () => view.state.doc.toString();
    `;
    document.body.appendChild(cmScript);

    // 5. Motor do Console (Formatação de Árvore Nativa)
    const consoleEl = document.getElementById('repl-console');

    function buildLogTree(data, label = '') {
        if (data === null) return `<span class="repl-boolean">null</span>`;
        if (data === undefined) return `<span class="repl-boolean">undefined</span>`;
        
        const type = typeof data;
        if (type === 'string') return `<span class="repl-string">"${data}"</span>`;
        if (type === 'number' || type === 'bigint') return `<span class="repl-number">${data}</span>`;
        if (type === 'boolean') return `<span class="repl-boolean">${data}</span>`;
        if (type === 'function') return `<span class="repl-string">ƒ ${data.name || 'anonymous'}()</span>`;

        // É um objeto ou array
        const isArray = Array.isArray(data);
        const keys = Object.keys(data);
        const summaryText = isArray ? `Array(${keys.length})` : (data.constructor ? data.constructor.name : 'Object');

        if (keys.length === 0) return `<span>${summaryText} {}</span>`;

        let html = `<details class="repl-tree"><summary>${label ? `<span class="repl-key">${label}:</span> ` : ''}${summaryText}</summary><div class="repl-tree-content">`;
        
        for (const key of keys) {
            html += `<div>`;
            if (!isArray) html += `<span class="repl-key">${key}:</span> `;
            // Recursividade
            try {
                html += buildLogTree(data[key]);
            } catch(e) {
                html += `<span class="repl-boolean">[Circular or Restricted]</span>`;
            }
            html += `</div>`;
        }
        
        html += `</div></details>`;
        return html;
    }

    function printToConsole(data, isError = false) {
        const entry = document.createElement('div');
        entry.className = 'log-entry' + (isError ? ' error' : '');
        
        if (isError) {
            entry.textContent = data.toString();
        } else {
            entry.innerHTML = buildLogTree(data);
        }
        
        consoleEl.appendChild(entry);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    // Intercepta console.log do contexto
    const originalLog = console.log;
    console.log = (...args) => {
        originalLog.apply(console, args);
        args.forEach(arg => printToConsole(arg));
    };

    // 6. Executor de Estado Persistente
    window.runRepl = () => {
        if (!window.getReplCode) return;
        const code = window.getReplCode();
        
        printToConsole(`> Executando...`);
        
        try {
            // Usa eval global para persistir variáveis declaradas com var ou sem keyword
            // Const e let no root do eval não vazam para o global, mas persistem na aba do console do browser
            const result = window.eval(code);
            
            // Lida com promises (se o usuário rodou algo assíncrono)
            if (result instanceof Promise) {
                result.then(res => printToConsole(res))
                      .catch(err => printToConsole(err, true));
            } else if (result !== undefined) {
                printToConsole(result);
            }
        } catch (error) {
            printToConsole(error, true);
        }
    };

    document.getElementById('repl-run').addEventListener('click', window.runRepl);

})();
