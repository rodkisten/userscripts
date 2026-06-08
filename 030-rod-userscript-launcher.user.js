// ==UserScript==
// @name         Rod / Core / Userscript Launcher
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Floating catalog for the organized Rod userscript stack, built with Fábrica/Cipó when available.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @weight       970
// @grant        none
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// ==/UserScript==

(() => {
  "use strict";
  
  const APP_ID = "rod-userscript-launcher";
  const STORAGE_KEY = "rod.userscripts.launcher.v20260601";
  const DEFAULT_STATE = Object.freeze({ collapsed: true, x: 14, y: 150 });
  const ITEMS = Object.freeze([
    ["Core", "000 Boot Essentials", "Shared helpers and mobile guards"],
    ["DevTools", "110 Eruda Mobile", "Eruda + Seiva + Fábrica + Cipó"],
    ["DevTools", "120 Source IDE", "Mobile CodeMirror source viewer"],
    ["GitHub", "200 Import Links", "Clickable imports and path resolution"],
    ["Docs", "300-380 Readers", "Arch, man7, OpenBSD, Zsh, Go and GNU"],
    ["Sites", "400-460 Enhancers", "Greasy Fork, DEV.to, LinkedIn, Marketplace"],
  ]);
  
  const readState = () => {
    try { return { ...DEFAULT_STATE, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; } catch { return {
        ...DEFAULT_STATE }; }
  };
  
  const writeState = (next) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };
  
  const state = readState();
  if (document.getElementById(APP_ID)) return;
  
  const host = document.createElement("div");
  host.id = APP_ID;
  host.style.cssText =
    `position:fixed;left:${state.x}px;top:${state.y}px;z-index:2147483647;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;`;
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.append(host);
  
  const style = document.createElement("style");
  style.textContent =
    `
    :host{all:initial}.box{width:min(330px,calc(100vw - 24px));color:#f8fafc;background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.28);border-radius:22px;box-shadow:0 22px 80px rgba(0,0,0,.45);overflow:hidden;backdrop-filter:blur(18px)}
    .head{display:flex;align-items:center;gap:10px;padding:10px 12px;touch-action:none;user-select:none}.dot{width:34px;height:34px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#8b5cf6,#06b6d4);font-size:18px}.title{font:700 13px/1.1 ui-sans-serif,system-ui}.sub{font:500 11px/1.2 ui-sans-serif;color:#cbd5e1}.grow{flex:1}.btn{border:0;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;padding:8px 10px;font:700 12px ui-sans-serif;min-width:38px}.body{border-top:1px solid rgba(148,163,184,.18);padding:10px;display:grid;gap:8px}.item{padding:9px 10px;border-radius:14px;background:rgba(255,255,255,.065);border:1px solid rgba(255,255,255,.08)}.k{font:800 10px/1 ui-sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#a5b4fc}.n{margin-top:5px;font:750 12px/1.25 ui-sans-serif}.d{margin-top:3px;font:500 11px/1.35 ui-sans-serif;color:#cbd5e1}.hidden{display:none}`;
  shadow.append(style);
  
  const F = globalThis.Fabrica || globalThis.FabricaHTML || globalThis.fabrica;
  const C = globalThis.Cipo || globalThis.Cipó || globalThis.cipo;
 
  const make = (tag, props = {}, ...children) => {
    if (F?.html && typeof F.html === "function") return null;
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2)
      .toLowerCase(), value);
      else node.setAttribute(key, String(value));
    }
    for (const child of children.flat()) node.append(child instanceof Node ? child : document.createTextNode(String(
      child)));
    return node;
  };
  
  let collapsed = Boolean(state.collapsed);
  const body = make("div", { class: collapsed ? "body hidden" : "body" }, ITEMS.map(([kind, name, desc]) => make(
    "div", { class: "item" }, make("div", { class: "k" }, kind), make("div", { class: "n" }, name), make(
    "div", { class: "d" }, desc))));
  const toggle = make("button", { class: "btn", onclick: () => { collapsed = !collapsed;
      body.classList.toggle("hidden", collapsed);
      writeState({ ...readState(), collapsed }); } }, collapsed ? "Open" : "Hide");
  const box = make("section", { class: "box" }, make("div", { class: "head" }, make("div", { class: "dot" }, "⚡"),
    make("div", { class: "grow" }, make("div", { class: "title" }, "Rod Userscripts"), make(
    "div", { class: "sub" }, C ? "Cipó ready" : "Organized stack")), toggle), body);
  shadow.append(box);
  
  let drag = null;
  box.querySelector(".head").addEventListener("pointerdown", (event) => {
    drag = { id: event.pointerId, ox: event.clientX - host.offsetLeft, oy: event.clientY - host.offsetTop };
    box.querySelector(".head").setPointerCapture(event.pointerId);
  });
  box.querySelector(".head").addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const x = Math.max(8, Math.min(window.innerWidth - 56, event.clientX - drag.ox));
    const y = Math.max(8, Math.min(window.innerHeight - 56, event.clientY - drag.oy));
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    writeState({ ...readState(), x, y });
  });
  box.querySelector(".head").addEventListener("pointerup", () => { drag = null; });
})();
