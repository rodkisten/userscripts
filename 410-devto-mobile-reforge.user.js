// ==UserScript==
// @name         Rod / Sites / DEV.to Reforge
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Mobile-first DEV.to redesign with safer reading and navigation improvements.
// @author       Rod
// @match        https://dev.to/*
// @match        https://www.dev.to/*
// @run-at       document-idle
// @weight       380
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  "use strict";

  const LOG = "[DEV Reforge]";
  const STORAGE = "dev-reforge-v1";

  const state = {
    theme: localStorage.getItem(`${STORAGE}:theme`) || "violet",
    fontSize: Number(localStorage.getItem(`${STORAGE}:fontSize`) || 14),
  };

  const themes = {
    violet: {
      bg: "#0b0b10",
      card: "rgba(22,22,30,.76)",
      text: "#f4f2ff",
      muted: "#aaa6ba",
      accent: "#9b8cff",
      accent2: "#c8bfff",
      glow: "rgba(155,140,255,.22)",
      border: "rgba(255,255,255,.09)",
    },
    mint: {
      bg: "#07110d",
      card: "rgba(14,25,20,.78)",
      text: "#f2fff8",
      muted: "#9fb6aa",
      accent: "#6ee7a8",
      accent2: "#b6ffd5",
      glow: "rgba(110,231,168,.18)",
      border: "rgba(180,255,215,.09)",
    },
    amber: {
      bg: "#120d09",
      card: "rgba(30,20,14,.78)",
      text: "#fff7ef",
      muted: "#b8a89b",
      accent: "#ffb071",
      accent2: "#ffd1aa",
      glow: "rgba(255,176,113,.18)",
      border: "rgba(255,210,160,.09)",
    },
    ocean: {
      bg: "#071018",
      card: "rgba(12,24,35,.88)",
      text: "#f0f8ff",
      muted: "#9fb4c7",
      accent: "#78c7ff",
      accent2: "#b5e2ff",
      glow: "rgba(120,199,255,.27)",
      border: "rgba(160,220,255,.09)",
    },
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const ready = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
      return;
    }

    fn();
  };

  const injectStyle = (css) => {
    const style = document.createElement("style");
    style.id = "dev-reforge-style";
    style.textContent = css;
    document.documentElement.appendChild(style);
  };

  const setVars = () => {
    const theme = themes[state.theme] || themes.violet;
    const root = document.documentElement;

    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--dr-${key}`, value);
    });

    root.style.setProperty("--dr-font-size", `${state.fontSize}px`);

    localStorage.setItem(`${STORAGE}:theme`, state.theme);
    localStorage.setItem(`${STORAGE}:fontSize`, String(state.fontSize));
  };

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      if ([...document.scripts].some((script) => script.src === src)) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

  const loadHighlight = async () => {
    if (window.hljs) return true;

    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js");
      return Boolean(window.hljs);
    } catch (error) {
      console.warn(LOG, "Highlight.js failed to load", error);
      return false;
    }
  };

  const css = `
    :root {
      color-scheme: dark;
      --dr-radius: 22px;
      --dr-font-size: 14px;
    }

    html,
    body {
      background:
        radial-gradient(circle at 12% 0%, var(--dr-glow), transparent 34%),
        radial-gradient(circle at 95% 20%, rgba(255,255,255,.035), transparent 28%),
        var(--dr-bg) !important;
      color: var(--dr-text) !important;
      font-size: var(--dr-font-size) !important;
      overflow-x: hidden !important;
      -webkit-font-smoothing: antialiased !important;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: .035;
      z-index: 0;
      background-image:
        repeating-radial-gradient(circle at 20% 30%, rgba(255,255,255,.7) 0 1px, transparent 1px 4px);
      mix-blend-mode: screen;
    }

    body *,
    .crayons-layout,
    .crayons-layout__content,
    #main-content {
      box-sizing: border-box !important;
    }

    .crayons-header {
      background: rgba(8,8,12,.78) !important;
      border-bottom: 1px solid var(--dr-border) !important;
      backdrop-filter: blur(20px) saturate(140%) !important;
    }

    .crayons-story,
    .crayons-card,
    /**.comment,
    .comment__content,**/
    .single-article {
     background:
        linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
        var(--dr-card) !important;
      border: 1px solid var(--dr-border) !important;
      border-radius: var(--dr-radius) !important;
      box-shadow: 0 18px 60px rgba(0,0,0,.34) !important;
      backdrop-filter: blur(22px) saturate(130%) !important; 
    } 
    
    a.crayons-article_context-note.crayons-article_context-note_feed {
      display: none !important
    }

    .crayons-story {
      margin: 12px 10px !important;
      padding: 14px !important;
      overflow: hidden !important;
    }

    .crayons-story__body {
      padding: 0 !important;
    }

    .crayons-story__title,
    .crayons-story__title a,
    h1, h2, h3, h4 {
      color: color-mix(in oklab, var(--dr-accent) 45%, white); !important;
      font-weight: 650 !important;
      letter-spacing: -.035em !important;
      line-height: 1.08 !important;
    }

    h1, .crayons-story__title {
      font-size: clamp(1.75rem, 4vw, 2.5rem);
      /**font-size: clamp(1.55rem, 7vw, 2.35rem) !important;**/
      font-weight: 500;
    }
    .crayons-article__context-note {
       display: none !important
     }

    h2 {
      color: var(--dr-accent2) !important;
    }

    h3 {
      color: var(--dr-accent) !important;
    }

    a {
      color: var(--dr-accent2) !important;
      text-decoration-thickness: 1px !important;
      text-underline-offset: 3px !important;
    }

    p,
    li,
    .crayons-story__tertiary,
    .crayons-story__secondary,
    .color-base-60,
    .color-base-70 {
      color: var(--dr-muted) !important;
    }
    
    .multiple_reactions_engagement {
         display: none
    }

    .crayons-tag {
      display: inline-flex !important;
      align-items: center !important;
      border-radius: 999px !important;
      padding: 3px 8px !important;
      margin: 0 !important;
      background: rgba(255,255,255,.055) !important;
      border: 1px solid var(--dr-border) !important;
      color: var(--dr-accent2) !important;
      font-weight: 600 !important;
      font-size: .82rem !important;
    }
    
    
    div.crayons-article_context-note{
      display: none
    }
    .crayons-story__tags
     {
      background: intial;
      border: nome;
    }

    .dr-tags {
      display: flex !important;
      align-items: center !important;
      gap: 4px !important;
      flex-wrap: wrap !important;
      margin-top: 5px !important;
    }

    .dr-tag-more {
      border: 1px solid var(--dr-border) !important;
      border-radius: 999px !important;
      background: rgba(255,255,255,.06) !important;
      color: var(--dr-text) !important;
      padding: 5px 10px !important;
      font-weight: 800 !important;
    }

    .comment,
    .comment__content {
      padding: 4px !important;
      margin-block: 2px !important;
      bacground-color: rgba(0,0,0,0.2);
    }
    
    div.comment__content.crayons-card {
      margin: inherit;
      padding: 1rem;
      
      & p {
        font-size: 1rem;
      }
    }

    .comment__body,
    .comment__body p,
    .comment__content p {
      line-height: 1 !important;
    }

    .comment__body p,
    .comment__content p {
      display: -webkit-box !important;
      -webkit-line-clamp: 2 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
    }

    .comment.dr-expanded p,
    .comment__content.dr-expanded p {
      -webkit-line-clamp: unset !important;
    }

    pre {
      max-width: 100vw !important;
      overflow-x: auto !important;
      margin-inline: -2px !important;
      padding: 14px !important;
      border-radius: 18px !important;
      border: 1px solid var(--dr-border) !important;
      background: #0d1117 !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04) !important;
    }

    pre code {
      white-space: pre !important;
      font-size: .88em !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
    }

    .hljs {
      background: transparent !important;
      color: #e6edf3 !important;
    }

    .hljs-keyword,
    .hljs-selector-tag,
    .hljs-built_in {
      color: #ff9fb7 !important;
    }

    .hljs-string,
    .hljs-title,
    .hljs-section {
      color: #b7f7c2 !important;
    }

    .hljs-number,
    .hljs-literal {
      color: #ffd19a !important;
    }

    .hljs-comment {
      color: #7f8ea3 !important;
      font-style: italic !important;
    }

    .crayons-story__indention,
    .crayons-story__meta,
    .crayons-story__footer {
      padding-inline: 0 !important;
    }

    div.crayons-card. crayons-card--secondary. crayons-bb.bb-placement.js-billboard {
      display: nome !important
    }
    .dr-toolbar {
      position: fixed !important;
      right: 12px !important;
      bottom: 18px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
    }

    .dr-fab {
      width: 52px !important;
      height: 52px !important;
      border-radius: 18px !important;
      border: 1px solid var(--dr-border) !important;
      background: var(--dr-card) !important;
      color: var(--dr-text) !important;
      font-size: 22px !important;
      box-shadow: 0 18px 44px rgba(0,0,0,.4) !important;
      backdrop-filter: blur(18px) !important;
    }

    .dr-panel {
      position: fixed !important;
      right: 12px !important;
      bottom: 82px !important;
      width: min(330px, calc(100vw - 24px)) !important;
      z-index: 2147483647 !important;
      display: none !important;
      padding: 16px !important;
      border-radius: 24px !important;
      border: 1px solid var(--dr-border) !important;
      background: var(--dr-card) !important;
      backdrop-filter: blur(28px) saturate(140%) !important;
      box-shadow: 0 24px 70px rgba(0,0,0,.46) !important;
    }

    .dr-panel.dr-open {
      display: block !important;
    }

    .dr-theme-grid {
      display: grid !important;
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 8px !important;
      margin: 12px 0 !important;
    }

    .dr-theme {
      height: 46px !important;
      border-radius: 16px !important;
      border: 1px solid var(--dr-border) !important;
    }

    .dr-github-card {
      position: fixed !important;
      left: 12px !important;
      right: 12px !important;
      bottom: 86px !important;
      z-index: 2147483647 !important;
      display: none !important;
      padding: 16px !important;
      border-radius: 24px !important;
      border: 1px solid var(--dr-border) !important;
      background: var(--dr-card) !important;
      color: var(--dr-text) !important;
      backdrop-filter: blur(28px) saturate(145%) !important;
      box-shadow: 0 25px 80px rgba(0,0,0,.55) !important;
    }

    .dr-github-card.dr-open {
      display: block !important;
    }

    @media (max-width: 768px) {
      .crayons-layout {
        padding: 0 !important;
      }

      .crayons-layout__content {
        width: 100% !important;
        max-width: 100% !important;
      }

      .crayons-layout__sidebar-right {
        display: none !important;
      }

      .crayons-story {
        border-radius: 0 !important;
        margin: 10px 0 !important;
        border-inline: 0 !important;
      }

      .crayons-story__cover,
      .crayons-story__cover img {
        border-radius: 18px !important;
        overflow: hidden !important;
      }
    }
  `;

  const installToolbar = () => {
    if ($("#dr-toolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.id = "dr-toolbar";
    toolbar.className = "dr-toolbar";

    const button = document.createElement("button");
    button.className = "dr-fab";
    button.textContent = "✦";

    const panel = document.createElement("div");
    panel.className = "dr-panel";

    panel.innerHTML = `
      <strong style="color:var(--dr-text);font-size:1rem;">DEV Reforge</strong>
      <p style="color:var(--dr-muted);margin:.35rem 0 0;">Theme, leitura e UI mobile.</p>
      <div class="dr-theme-grid"></div>
      <label style="display:block;color:var(--dr-muted);font-size:.85rem;margin-top:10px;">
        Font size
      </label>
      <input class="dr-font" type="range" min="13" max="22" value="${state.fontSize}" style="width:100%;margin-top:8px;">
    `;

    const grid = $(".dr-theme-grid", panel);

    Object.entries(themes).forEach(([name, theme]) => {
      const themeButton = document.createElement("button");
      themeButton.className = "dr-theme";
      themeButton.title = name;
      themeButton.style.background = `radial-gradient(circle at 20% 20%, ${theme.glow}, transparent 40%), ${theme.bg}`;

      themeButton.addEventListener("click", () => {
        state.theme = name;
        setVars();
      });

      grid.appendChild(themeButton);
    });

    $(".dr-font", panel).addEventListener("input", (event) => {
      state.fontSize = Number(event.target.value);
      setVars();
    });

    button.addEventListener("click", () => {
      panel.classList.toggle("dr-open");
    });

    toolbar.appendChild(button);
    document.body.appendChild(toolbar);
    document.body.appendChild(panel);
  };

  const compactTags = () => {
    $$(".crayons-story").forEach((story) => {
      if (story.dataset.drTags) return;

      const tagContainer =
        $(".crayons-story__tags", story) ||
        $(".crayons-story__bottom", story);

      if (!tagContainer) return;

      const tags = $$(".crayons-tag", tagContainer);

      if (tags.length <= 1) return;

      story.dataset.drTags = "1";

      const wrapper = document.createElement("div");
      wrapper.className = "dr-tags";

      const first = tags[0];
      wrapper.appendChild(first);

      const hidden = tags.slice(1);
      hidden.forEach((tag) => {
        tag.style.display = "none";
        wrapper.appendChild(tag);
      });

      const more = document.createElement("button");
      more.className = "dr-tag-more";
      more.textContent = `+${hidden.length}`;

      more.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const open = more.dataset.open === "1";
        more.dataset.open = open ? "0" : "1";

        hidden.forEach((tag) => {
          tag.style.display = open ? "none" : "inline-flex";
        });

        more.textContent = open ? `+${hidden.length}` : "−";
      });

      wrapper.appendChild(more);
      tagContainer.appendChild(wrapper);
    });
  };

  const compactComments = () => {
    $$(".comment, .comment__content").forEach((comment) => {
      if (comment.dataset.drComment) return;
      comment.dataset.drComment = "1";

      comment.addEventListener("click", () => {
        comment.classList.toggle("dr-expanded");
      });
    });
  };

  const highlightCode = async () => {
    const loaded = await loadHighlight();
    if (!loaded || !window.hljs) return;

    $$("pre code").forEach((code) => {
      if (code.dataset.drHighlight) return;
      code.dataset.drHighlight = "1";

      try {
        window.hljs.highlightElement(code);
      } catch (error) {
        console.warn(LOG, "Code highlight failed", error);
      }
    });
  };

  const installGithubCards = () => {
    if ($("#dr-github-card")) return;

    const card = document.createElement("div");
    card.id = "dr-github-card";
    card.className = "dr-github-card";
    document.body.appendChild(card);

    const cache = new Map();

    const parseRepo = (href) => {
      try {
        const url = new URL(href);
        if (!url.hostname.includes("github.com")) return null;

        const [owner, repo] = url.pathname.split("/").filter(Boolean);
        if (!owner || !repo) return null;

        return { owner, repo };
      } catch {
        return null;
      }
    };

    const fetchRepo = async (owner, repo) => {
      const key = `${owner}/${repo}`;
      if (cache.has(key)) return cache.get(key);

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      const data = await response.json();

      cache.set(key, data);
      return data;
    };

    $$("a[href*='github.com']").forEach((link) => {
      if (link.dataset.drGithub) return;
      link.dataset.drGithub = "1";

      link.addEventListener("click", async (event) => {
        const repo = parseRepo(link.href);
        if (!repo) return;

        event.preventDefault();

        card.innerHTML = `
          <strong>Loading GitHub card…</strong>
          <p style="color:var(--dr-muted);margin:.5rem 0 0;">${repo.owner}/${repo.repo}</p>
        `;
        card.classList.add("dr-open");

        try {
          const data = await fetchRepo(repo.owner, repo.repo);

          card.innerHTML = `
            <div style="display:flex;gap:12px;align-items:center;">
              <img src="${data.owner?.avatar_url || ""}" style="width:52px;height:52px;border-radius:16px;object-fit:cover;">
              <div>
                <strong style="font-size:1rem;">${data.full_name || `${repo.owner}/${repo.repo}`}</strong>
                <p style="margin:.25rem 0 0;color:var(--dr-muted);line-height:1.35;">${data.description || "No description."}</p>
              </div>
            </div>
            <div style="display:flex;gap:12px;margin-top:12px;color:var(--dr-muted);font-size:.88rem;">
              <span>⭐ ${data.stargazers_count ?? 0}</span>
              <span>🍴 ${data.forks_count ?? 0}</span>
              <span>● ${data.language || "Code"}</span>
            </div>
            <div style="display:flex;gap:10px;margin-top:14px;">
              <a href="${link.href}" style="font-weight:800;">Open GitHub</a>
              <button id="dr-close-gh" style="margin-left:auto;border:0;border-radius:999px;padding:7px 12px;background:rgba(255,255,255,.08);color:var(--dr-text);">Close</button>
            </div>
          `;

          $("#dr-close-gh")?.addEventListener("click", () => {
            card.classList.remove("dr-open");
          });
        } catch {
          card.innerHTML = `
            <strong>GitHub card failed</strong>
            <p style="color:var(--dr-muted);">Tap again later or open the link directly.</p>
            <a href="${link.href}">Open GitHub</a>
          `;
        }
      });
    });
  };

  const polish = () => {
    compactTags();
    compactComments();
    installGithubCards();
    highlightCode();
    $("div[.crayons-card .crayons-card--secondary crayons-bb .bb-placement .js-billboard]")?.remove()
    $("div.crayons-card.crayons-card--secondary. crayons-bb.bb-placement.js-billboard")?.remove()
  };

  const boot = () => {
    console.log(LOG, "booting");

    injectStyle(css);
    setVars();
    installToolbar();
    polish();

    const observer = new MutationObserver(() => {
      clearTimeout(window.__drTick);
      window.__drTick = setTimeout(polish, 180);
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
    });

    console.log(LOG, "loaded");
  };

  ready(boot);
})();