// ==UserScript==
// @name         Rod / DevTools / React Bridge Inspector
// @namespace    https://rod.dev/userscripts
// @version      2026.06.01
// @description  Inspects React-controlled DOM nodes and Fiber metadata when available.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @weight       820
// @grant        unsafeWindow
// @noframes
// @require      https://oirodolfo.github.io/bundler/bundle.iife.js?v0
// ==/UserScript==

(function ReactBridgeInspector(globalWindow) {
  "use strict";

  /********************************************************************************************************
   * Constants
   ********************************************************************************************************/

  const BRIDGE_NAME = "ReactBridge";
  const DEFAULT_EVENT_OPTIONS = Object.freeze({
    bubbles: true,
    cancelable: true,
    composed: true,
  });

  const REACT_INTERNAL_KEY_PREFIXES = Object.freeze([
    "__reactFiber$",
    "__reactProps$",
    "__reactContainer$",
    "__reactEventHandlers$",
  ]);

  /********************************************************************************************************
   * Small Utilities
   ********************************************************************************************************/

  /**
   * Returns the real page window when the userscript manager exposes unsafeWindow.
   *
   * @returns {Window & typeof globalThis} Page window.
   *
   * @example
   * ```js
   * const page = getPageWindow();
   * console.log(page.ReactBridge);
   * ```
   */
  function getPageWindow() {
    return typeof unsafeWindow !== "undefined" ? unsafeWindow : globalWindow;
  }

  /**
   * Safely logs bridge messages without crashing the host page.
   *
   * @param {"log" | "warn" | "error" | "debug"} level Console level.
   * @param {...unknown} args Message parts.
   * @returns {void}
   *
   * @example
   * ```js
   * log("warn", "React node not found");
   * ```
   */
  function log(level, ...args) {
    try {
      console[level]("[ReactBridge]", ...args);
    } catch {
      // Ignore logging failures. Userscripts should never break the page.
    }
  }

  /**
   * Checks whether a value is a DOM Element.
   *
   * @param {unknown} value Value to inspect.
   * @returns {value is Element} True when value is an Element.
   *
   * @example
   * ```js
   * isElement(document.body);
   * // true
   * ```
   */
  function isElement(value) {
    return value instanceof Element;
  }

  /**
   * Finds a DOM element from a selector or returns the element itself.
   *
   * @param {string | Element} target Selector or Element.
   * @param {ParentNode} [root=document] Search root.
   * @returns {Element | null} Found element.
   *
   * @example
   * ```js
   * const button = resolveElement("button[type='submit']");
   * ```
   */
  function resolveElement(target, root = document) {
    if (isElement(target)) {
      return target;
    }

    if (typeof target !== "string" || target.trim() === "") {
      return null;
    }

    return root.querySelector(target);
  }

  /**
   * Reads the first own property key that looks like a React private field.
   *
   * @param {Element} element DOM element.
   * @param {string} prefix React private key prefix.
   * @returns {string | null} Matching property key.
   *
   * @example
   * ```js
   * const key = getReactInternalKey(button, "__reactFiber$");
   * ```
   */
  function getReactInternalKey(element, prefix) {
    const keys = Object.getOwnPropertyNames(element);

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];

      if (key.startsWith(prefix)) {
        return key;
      }
    }

    return null;
  }

  /********************************************************************************************************
   * React Fiber Access
   ********************************************************************************************************/

  /**
   * Returns React Fiber from a DOM element when React exposes it on the node.
   *
   * @param {string | Element} target Selector or Element.
   * @returns {unknown | null} React Fiber node or null.
   *
   * @example
   * ```js
   * const fiber = ReactBridge.getFiber("#root button");
   * console.log(fiber);
   * ```
   */
  function getFiber(target) {
    const element = resolveElement(target);

    if (!element) {
      return null;
    }

    const fiberKey = getReactInternalKey(element, "__reactFiber$");
    const containerKey = getReactInternalKey(element, "__reactContainer$");

    if (fiberKey) {
      return element[fiberKey] ?? null;
    }

    if (containerKey) {
      return element[containerKey] ?? null;
    }

    return null;
  }

  /**
   * Returns React props attached to a DOM element when available.
   *
   * @param {string | Element} target Selector or Element.
   * @returns {Record<string, unknown> | null} React props object or null.
   *
   * @example
   * ```js
   * const props = ReactBridge.getProps("button");
   * console.log(props?.onClick);
   * ```
   */
  function getProps(target) {
    const element = resolveElement(target);

    if (!element) {
      return null;
    }

    const propsKey =
      getReactInternalKey(element, "__reactProps$") ??
      getReactInternalKey(element, "__reactEventHandlers$");

    if (!propsKey) {
      return null;
    }

    return element[propsKey] ?? null;
  }

  /**
   * Walks up the Fiber tree looking for a matching component.
   *
   * @param {unknown} fiber React Fiber node.
   * @param {(fiber: any) => boolean} predicate Matcher.
   * @returns {unknown | null} Matching Fiber or null.
   *
   * @example
   * ```js
   * const fiber = ReactBridge.findFiberUp(
   *   ReactBridge.getFiber("input"),
   *   node => node?.type?.name === "LoginForm"
   * );
   * ```
   */
  function findFiberUp(fiber, predicate) {
    let current = fiber;

    while (current) {
      if (predicate(current)) {
        return current;
      }

      current = current.return ?? null;
    }

    return null;
  }

  /**
   * Finds the nearest named React component above a DOM node.
   *
   * @param {string | Element} target Selector or Element.
   * @returns {{ name: string | null, fiber: unknown | null }} Component info.
   *
   * @example
   * ```js
   * ReactBridge.getNearestComponent("input");
   * // { name: "LoginForm", fiber: ... }
   * ```
   */
  function getNearestComponent(target) {
    const fiber = getFiber(target);

    const componentFiber = findFiberUp(fiber, (node) => {
      const type = node?.type;
      return Boolean(
        typeof type === "function" ||
          typeof type?.name === "string" ||
          typeof type?.displayName === "string",
      );
    });

    const type = componentFiber?.type;
    const name = type?.displayName ?? type?.name ?? null;

    return {
      name,
      fiber: componentFiber,
    };
  }

  /**
   * Reads a compact summary from a React Fiber node.
   *
   * @param {string | Element} target Selector or Element.
   * @returns {Record<string, unknown> | null} Fiber summary.
   *
   * @example
   * ```js
   * console.table(ReactBridge.inspect("button"));
   * ```
   */
  function inspect(target) {
    const element = resolveElement(target);
    const fiber = getFiber(element);
    const props = getProps(element);
    const nearestComponent = getNearestComponent(element);

    if (!element) {
      return null;
    }

    return {
      element,
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      className: element.className || null,
      hasFiber: Boolean(fiber),
      hasProps: Boolean(props),
      props,
      nearestComponent: nearestComponent.name,
      fiber,
    };
  }

  /********************************************************************************************************
   * Native React-Friendly Manipulation
   ********************************************************************************************************/

  /**
   * Calls the native value setter, which React controlled inputs can detect.
   *
   * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} element Form element.
   * @param {string} value New value.
   * @returns {void}
   *
   * @example
   * ```js
   * const input = document.querySelector("input");
   * setNativeValue(input, "hello");
   * ```
   */
  function setNativeValue(element, value) {
    const tagName = element.tagName.toLowerCase();
    const property = tagName === "select" ? "value" : "value";

    const ownDescriptor = Object.getOwnPropertyDescriptor(element, property);
    const prototype = Object.getPrototypeOf(element);
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(prototype, property);

    if (prototypeDescriptor?.set && ownDescriptor?.set !== prototypeDescriptor.set) {
      prototypeDescriptor.set.call(element, value);
      return;
    }

    if (ownDescriptor?.set) {
      ownDescriptor.set.call(element, value);
      return;
    }

    element[property] = value;
  }

  /**
   * Dispatches a DOM event with React-friendly defaults.
   *
   * @param {Element} element Target element.
   * @param {string} eventName Event name.
   * @returns {boolean} Dispatch result.
   *
   * @example
   * ```js
   * ReactBridge.dispatch(button, "click");
   * ```
   */
  function dispatch(element, eventName) {
    return element.dispatchEvent(new Event(eventName, DEFAULT_EVENT_OPTIONS));
  }

  /**
   * Sets a controlled input value and dispatches input/change events.
   *
   * @param {string | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} target Selector or form element.
   * @param {string} value New value.
   * @returns {boolean} True when successful.
   *
   * @example
   * ```js
   * ReactBridge.setInputValue("input[name='email']", "rod@example.com");
   * ```
   */
  function setInputValue(target, value) {
    const element = resolveElement(target);

    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLSelectElement)
    ) {
      log("warn", "Target is not an input, textarea, or select.", target);
      return false;
    }

    element.focus();
    setNativeValue(element, value);
    dispatch(element, "input");
    dispatch(element, "change");

    return true;
  }

  /**
   * Sets a checkbox or radio input and dispatches React-friendly events.
   *
   * @param {string | HTMLInputElement} target Selector or input element.
   * @param {boolean} checked New checked state.
   * @returns {boolean} True when successful.
   *
   * @example
   * ```js
   * ReactBridge.setChecked("input[type='checkbox']", true);
   * ```
   */
  function setChecked(target, checked) {
    const element = resolveElement(target);

    if (!(element instanceof HTMLInputElement)) {
      log("warn", "Target is not an input.", target);
      return false;
    }

    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "checked");

    element.focus();

    if (descriptor?.set) {
      descriptor.set.call(element, checked);
    } else {
      element.checked = checked;
    }

    dispatch(element, "input");
    dispatch(element, "change");
    dispatch(element, "click");

    return true;
  }

  /**
   * Clicks a DOM element using pointer, mouse, and click events.
   *
   * @param {string | Element} target Selector or Element.
   * @returns {boolean} True when successful.
   *
   * @example
   * ```js
   * ReactBridge.smartClick("button[type='submit']");
   * ```
   */
  function smartClick(target) {
    const element = resolveElement(target);

    if (!element) {
      log("warn", "Element not found.", target);
      return false;
    }

    element.dispatchEvent(new PointerEvent("pointerdown", DEFAULT_EVENT_OPTIONS));
    element.dispatchEvent(new MouseEvent("mousedown", DEFAULT_EVENT_OPTIONS));
    element.dispatchEvent(new PointerEvent("pointerup", DEFAULT_EVENT_OPTIONS));
    element.dispatchEvent(new MouseEvent("mouseup", DEFAULT_EVENT_OPTIONS));
    element.dispatchEvent(new MouseEvent("click", DEFAULT_EVENT_OPTIONS));

    return true;
  }

  /**
   * Calls a React prop handler directly when the prop is attached to the DOM node.
   *
   * Prefer smartClick or native events first. Direct handler calls skip React's normal event path.
   *
   * @param {string | Element} target Selector or Element.
   * @param {string} propName Handler name, for example "onClick".
   * @param {...unknown} args Handler arguments.
   * @returns {boolean} True when the handler was called.
   *
   * @example
   * ```js
   * ReactBridge.callProp("button", "onClick", { type: "click" });
   * ```
   */
  function callProp(target, propName, ...args) {
    const props = getProps(target);
    const handler = props?.[propName];

    if (typeof handler !== "function") {
      log("warn", `React prop handler not found: ${propName}`, target);
      return false;
    }

    handler(...args);
    return true;
  }

  /********************************************************************************************************
   * React Presence Detection
   ********************************************************************************************************/

  /**
   * Checks whether an element has any known React private fields.
   *
   * @param {Element} element DOM element.
   * @returns {boolean} True when React internals are found.
   *
   * @example
   * ```js
   * ReactBridge.isReactElement(document.querySelector("#root"));
   * ```
   */
  function isReactElement(element) {
    if (!isElement(element)) {
      return false;
    }

    const keys = Object.getOwnPropertyNames(element);

    return keys.some((key) =>
      REACT_INTERNAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
  }

  /**
   * Finds React-owned elements under a root.
   *
   * @param {ParentNode} [root=document] Search root.
   * @param {number} [limit=100] Max results.
   * @returns {Element[]} React-owned elements.
   *
   * @example
   * ```js
   * const nodes = ReactBridge.findReactElements(document, 20);
   * ```
   */
  function findReactElements(root = document, limit = 100) {
    const result = [];
    const all = root.querySelectorAll("*");

    for (let index = 0; index < all.length && result.length < limit; index += 1) {
      const element = all[index];

      if (isReactElement(element)) {
        result.push(element);
      }
    }

    return result;
  }

  /********************************************************************************************************
   * Optional Event Listener Interception
   ********************************************************************************************************/

  const originalAddEventListener = EventTarget.prototype.addEventListener;

  /**
   * Patches addEventListener to observe React delegated listeners.
   *
   * This is useful when the userscript runs at document-start. It helps you see where React attaches
   * delegated events, but it does not magically expose component state.
   *
   * @returns {void}
   *
   * @example
   * ```js
   * ReactBridge.enableEventSpy();
   * ```
   */
  function enableEventSpy() {
    if (EventTarget.prototype.addEventListener.__reactBridgePatched) {
      return;
    }

    function patchedAddEventListener(type, listener, options) {
      if (
        type === "click" ||
        type === "input" ||
        type === "change" ||
        type === "keydown" ||
        type === "submit"
      ) {
        try {
          log("debug", "addEventListener", {
            target: this,
            type,
            listener,
            options,
          });
        } catch {
          // Keep this spy silent if logging fails.
        }
      }

      return originalAddEventListener.call(this, type, listener, options);
    }

    Object.defineProperty(patchedAddEventListener, "__reactBridgePatched", {
      value: true,
      configurable: false,
    });

    EventTarget.prototype.addEventListener = patchedAddEventListener;
  }

  /********************************************************************************************************
   * Public API
   ********************************************************************************************************/

  const bridge = Object.freeze({
    inspect,
    getFiber,
    getProps,
    findFiberUp,
    getNearestComponent,
    setInputValue,
    setChecked,
    smartClick,
    callProp,
    dispatch,
    isReactElement,
    findReactElements,
    enableEventSpy,
  });

  const pageWindow = getPageWindow();

  Object.defineProperty(pageWindow, BRIDGE_NAME, {
    value: bridge,
    enumerable: false,
    configurable: true,
    writable: false,
  });

  log("log", `Installed as window.${BRIDGE_NAME}`);
})(window);