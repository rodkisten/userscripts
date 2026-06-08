// ==UserScript==
// @name         Rod / Sites / Force Same Tab
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Forces links to stay in the current tab when browsing on mobile.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @weight       330
// @grant        none
// @noframes
// ==/UserScript==

(() => {
	"use strict";

	const normalizeLink = (link) => {
		if (!(link instanceof HTMLAnchorElement)) return;

		link.removeAttribute("target");
		link.setAttribute("target", "_self");
	};

	const normalizeAll = (root = document) => {
		root.querySelectorAll?.("a[target], a").forEach(normalizeLink);
	};

	window.open = (url) => {
		if (typeof url === "string" && url.trim()) {
			window.location.href = url;
		}

		return window;
	};

	document.addEventListener(
		"click",
		(event) => {
			const link = event.target?.closest?.("a");

			if (!link) return;

			normalizeLink(link);
		},
		true,
	);

	const start = () => {
		normalizeAll();

		new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node instanceof HTMLAnchorElement) normalizeLink(node);
					if (node instanceof Element) normalizeAll(node);
				}
			}
		}).observe(document.documentElement || document.body, {
			childList: true,
			subtree: true,
		});
	};

	if (document.documentElement) {
		start();
	} else {
		document.addEventListener("DOMContentLoaded", start, { once: true });
	}
})();