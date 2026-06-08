// ==UserScript==
// @name         Rod / GitHub / Discussion Auto Loader
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Automatically expands collapsed GitHub discussion content and loads more replies.
// @author       Rod
// @match        https://github.com/orgs/*/discussions/*
// @match        https://github.com/*/*/discussions/*
// @match        https://github.com/*/*/issues/*
// @match        https://github.com/*/*/pulls/*
// @run-at       document-idle
// @weight       620
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    let loadMoreRunning = false;
    let expandRunning = false;
    let loadIntervalId = null;
    let expandIntervalId = null;
    let clickCount = 0;
    let expandCount = 0;
    
    const CLICK_DELAY_MS = 1200;
    const PANEL_ID = 'gh-autoloader-panel-' + Math.random().toString(36).substr(2, 6);

    // --- Find the "Load more" button ---
    function findLoadMoreButton() {
        // Primary: ajax-pagination-btn class (matches the HTML you provided)
        const ajaxBtn = document.querySelector('.ajax-pagination-btn');
        if (ajaxBtn && ajaxBtn.offsetParent !== null) return ajaxBtn;

        // Fallback: any button/link containing "Load more" text
        const allButtons = document.querySelectorAll(`button:not(#${PANEL_ID} *), a:not(#${PANEL_ID} *)`);
        for (const el of allButtons) {
            if (/load more/i.test(el.textContent) && el.offsetParent !== null) {
                return el;
            }
        }
        return null;
    }

    // --- Find and click all collapsed comment buttons ---
    function expandCollapsedComments() {
        let expanded = 0;
        
        // Method 1: Look for buttons with octicon-unfold icon
        const unfoldButtons = document.querySelectorAll('button svg.octicon-unfold');
        unfoldButtons.forEach(svg => {
            const button = svg.closest('button');
            if (button && button.offsetParent !== null && !button.disabled) {
                button.click();
                expanded++;
            }
        });

        // Method 2: Look for buttons with tooltip text "show comment"
        const tooltips = document.querySelectorAll('[id*="_r_"]');
        tooltips.forEach(tooltip => {
            if (tooltip.textContent.toLowerCase().includes('show comment')) {
                const buttonId = tooltip.getAttribute('aria-labelledby') || tooltip.id;
                if (buttonId) {
                    const button = document.querySelector(`[aria-labelledby="${buttonId}"]`);
                    if (button && button.offsetParent !== null && !button.disabled) {
                        button.click();
                        expanded++;
                    }
                }
            }
        });

        // Method 3: Look for buttons in CommentActions with unfold icon
        const commentActionButtons = document.querySelectorAll('.CommentActions-module__CommentActionsIconButton__Fsg4J');
        commentActionButtons.forEach(button => {
            const unfoldIcon = button.querySelector('.octicon-unfold');
            if (unfoldIcon && button.offsetParent !== null && !button.disabled) {
                button.click();
                expanded++;
            }
        });

        return expanded;
    }

    // --- Status text helpers ---
    function statusText() {
        const details = [];
        
        if (loadMoreRunning) {
            details.push(`Loading… (${clickCount})`);
        } else if (clickCount > 0) {
            details.push(`${clickCount} loads`);
        }
        
        if (expandRunning) {
            details.push(`Expanding… (${expandCount})`);
        } else if (expandCount > 0) {
            details.push(`${expandCount} expanded`);
        }
        
        return details.length > 0 ? details.join(' | ') : 'Idle';
    }

    // --- Core loop for Load More ---
    function tickLoadMore() {
        const btn = findLoadMoreButton();
        if (btn) {
            btn.click();
            clickCount++;
            updateUI();
        } else {
            // No more "Load more" buttons
            stopLoadMore(true);
        }
    }

    // --- Core loop for Expand Collapsed ---
    function tickExpand() {
        const expanded = expandCollapsedComments();
        if (expanded > 0) {
            expandCount += expanded;
            updateUI();
        } else {
            // No more collapsed comments
            stopExpand(true);
        }
    }

    function startLoadMore() {
        if (loadMoreRunning) return;
        loadMoreRunning = true;
        clickCount = 0;
        updateUI();
        tickLoadMore();
        loadIntervalId = setInterval(tickLoadMore, CLICK_DELAY_MS);
    }

    function stopLoadMore(auto = false) {
        if (!loadMoreRunning && !auto) return;
        loadMoreRunning = false;
        clearInterval(loadIntervalId);
        loadIntervalId = null;
        updateUI();
    }

    function startExpand() {
        if (expandRunning) return;
        expandRunning = true;
        expandCount = 0;
        updateUI();
        tickExpand();
        expandIntervalId = setInterval(tickExpand, CLICK_DELAY_MS);
    }

    function stopExpand(auto = false) {
        if (!expandRunning && !auto) return;
        expandRunning = false;
        clearInterval(expandIntervalId);
        expandIntervalId = null;
        updateUI();
    }

    function startBoth() {
        startLoadMore();
        startExpand();
    }

    function stopBoth() {
        stopLoadMore();
        stopExpand();
    }

    // --- Build floating UI ---
    const panel = document.createElement('div');
    panel.id = PANEL_ID
    panel.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 10px;
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #e6edf3;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        min-width: 200px;
        user-select: none;
    `;

    const title = document.createElement('div');
    title.textContent = '⚡ Discussion Auto-Loader';
    title.style.cssText = 'font-weight: 600; font-size: 13px; color: #58a6ff;';

    const label = document.createElement('div');
    label.style.cssText = 'color: #8b949e; font-size: 12px;';
    label.textContent = statusText();

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 8px;';

    // Add hover styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        .gh-autoloader-btn {
            flex: 1;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 1px 3px rgba(0,0,0,0.12);
            white-space: nowrap;
        }
        .gh-autoloader-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        .gh-autoloader-btn:active:not(:disabled) {
            transform: translateY(0);
            box-shadow: 0 1px 3px rgba(0,0,0,0.12);
        }
        .gh-autoloader-btn:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
        .gh-autoloader-btn-load {
            border: 1px solid #238636;
            background: linear-gradient(180deg, #2ea043 0%, #238636 100%);
            color: #fff;
        }
        .gh-autoloader-btn-load:hover:not(:disabled) {
            background: linear-gradient(180deg, #3fb950 0%, #2ea043 100%);
            border-color: #2ea043;
        }
        .gh-autoloader-btn-expand {
            border: 1px solid #1f6feb;
            background: linear-gradient(180deg, #388bfd 0%, #1f6feb 100%);
            color: #fff;
        }
        .gh-autoloader-btn-expand:hover:not(:disabled) {
            background: linear-gradient(180deg, #539bf5 0%, #388bfd 100%);
            border-color: #388bfd;
        }
        .gh-autoloader-btn-both {
            border: 1px solid #a371f7;
            background: linear-gradient(180deg, #b083f0 0%, #a371f7 100%);
            color: #fff;
        }
        .gh-autoloader-btn-both:hover:not(:disabled) {
            background: linear-gradient(180deg, #bc8cff 0%, #b083f0 100%);
            border-color: #b083f0;
        }
        .gh-autoloader-btn-stop {
            border: 1px solid #30363d;
            background: linear-gradient(180deg, #21262d 0%, #161b22 100%);
            color: #8b949e;
        }
        .gh-autoloader-btn-stop:hover:not(:disabled) {
            background: linear-gradient(180deg, #30363d 0%, #21262d 100%);
            border-color: #484f58;
            color: #c9d1d9;
        }
        .gh-autoloader-btn-stop.active {
            border-color: #da3633;
            background: linear-gradient(180deg, #b62324 0%, #8e1b1d 100%);
            color: #ffdcd7;
        }
        .gh-autoloader-btn-stop.active:hover:not(:disabled) {
            background: linear-gradient(180deg, #da3633 0%, #b62324 100%);
            border-color: #f85149;
        }
    `;
    document.head.appendChild(styleSheet);

    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.textContent = '▶ Load More';
    loadMoreBtn.className = 'gh-autoloader-btn gh-autoloader-btn-load';

    const expandBtn = document.createElement('button');
    expandBtn.textContent = '↕ Expand';
    expandBtn.className = 'gh-autoloader-btn gh-autoloader-btn-expand';

    const btnRow2 = document.createElement('div');
    btnRow2.style.cssText = 'display: flex; gap: 8px;';

    const startBothBtn = document.createElement('button');
    startBothBtn.textContent = '▶ Both';
    startBothBtn.className = 'gh-autoloader-btn gh-autoloader-btn-both';

    const stopBtn = document.createElement('button');
    stopBtn.textContent = '⏹ Stop All';
    stopBtn.className = 'gh-autoloader-btn gh-autoloader-btn-stop';

    const delayRow = document.createElement('div');
    delayRow.style.cssText = 'display: flex; align-items: center; gap: 8px; color: #8b949e;';

    const delayLabel = document.createElement('label');
    delayLabel.textContent = 'Delay (ms):';
    delayLabel.style.fontSize = '12px';

    const delayInput = document.createElement('input');
    delayInput.type = 'number';
    delayInput.value = CLICK_DELAY_MS;
    delayInput.min = 300;
    delayInput.max = 10000;
    delayInput.step = 100;
    delayInput.style.cssText = `
        width: 70px;
        background: #0d1117;
        border: 1px solid #30363d;
        border-radius: 6px;
        color: #e6edf3;
        padding: 3px 6px;
        font-size: 12px;
    `;

    // Drag support
    let dragging = false, ox = 0, oy = 0;
    title.style.cursor = 'grab';
    title.addEventListener('mousedown', e => {
        dragging = true;
        const r = panel.getBoundingClientRect();
        ox = e.clientX - r.left;
        oy = e.clientY - r.top;
        title.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        panel.style.left = (e.clientX - ox) + 'px';
        panel.style.top = (e.clientY - oy) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
        dragging = false;
        title.style.cursor = 'grab';
    });

    function updateUI() {
        label.textContent = statusText();
        
        loadMoreBtn.disabled = loadMoreRunning;
        expandBtn.disabled = expandRunning;
        startBothBtn.disabled = loadMoreRunning || expandRunning;
        
        const anyRunning = loadMoreRunning || expandRunning;
        if (anyRunning) {
            stopBtn.classList.add('active');
        } else {
            stopBtn.classList.remove('active');
        }
    }

    loadMoreBtn.addEventListener('click', () => {
        clickCount = 0;
        startLoadMore();
    });

    expandBtn.addEventListener('click', () => {
        expandCount = 0;
        startExpand();
    });

    startBothBtn.addEventListener('click', () => {
        clickCount = 0;
        expandCount = 0;
        startBoth();
    });

    stopBtn.addEventListener('click', () => stopBoth());

    delayRow.append(delayLabel, delayInput);
    btnRow.append(loadMoreBtn, expandBtn);
    btnRow2.append(startBothBtn, stopBtn);
    panel.append(title, label, btnRow, btnRow2, delayRow);
    document.body.appendChild(panel);

    updateUI();

})();