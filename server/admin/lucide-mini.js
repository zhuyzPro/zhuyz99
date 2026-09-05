/**
 * @license lucide v0.468.0 - ISC
 *
 * Small runtime subset containing only the icons used by this site.
 */
(function (global) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const defaultAttributes = {
    xmlns: SVG_NS,
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  };
  const icons = {
    "arrow-down": [["path", { d: "M12 5v14" }], ["path", { d: "m19 12-7 7-7-7" }]],
    "arrow-right": [["path", { d: "M5 12h14" }], ["path", { d: "m12 5 7 7-7 7" }]],
    "arrow-up": [["path", { d: "m5 12 7-7 7 7" }], ["path", { d: "M12 19V5" }]],
    "arrow-up-right": [["path", { d: "M7 7h10v10" }], ["path", { d: "M7 17 17 7" }]],
    check: [["path", { d: "M20 6 9 17l-5-5" }]],
    "external-link": [["path", { d: "M15 3h6v6" }], ["path", { d: "M10 14 21 3" }], ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]],
    "folder-plus": [["path", { d: "M12 10v6" }], ["path", { d: "M9 13h6" }], ["path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }]],
    "log-out": [["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }], ["polyline", { points: "16 17 21 12 16 7" }], ["line", { x1: "21", x2: "9", y1: "12", y2: "12" }]],
    moon: [["path", { d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" }]],
    plus: [["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }]],
    pencil: [["path", { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }], ["path", { d: "m15 5 4 4" }]],
    route: [["circle", { cx: "6", cy: "19", r: "3" }], ["path", { d: "M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" }], ["circle", { cx: "18", cy: "5", r: "3" }]],
    "settings-2": [["path", { d: "M20 7h-9" }], ["path", { d: "M14 17H5" }], ["circle", { cx: "17", cy: "17", r: "3" }], ["circle", { cx: "7", cy: "7", r: "3" }]],
    sun: [["circle", { cx: "12", cy: "12", r: "4" }], ["path", { d: "M12 2v2" }], ["path", { d: "M12 20v2" }], ["path", { d: "m4.93 4.93 1.41 1.41" }], ["path", { d: "m17.66 17.66 1.41 1.41" }], ["path", { d: "M2 12h2" }], ["path", { d: "M20 12h2" }], ["path", { d: "m6.34 17.66-1.41 1.41" }], ["path", { d: "m19.07 4.93-1.41 1.41" }]],
    "trash-2": [["path", { d: "M3 6h18" }], ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-2-2-2V6" }], ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }], ["line", { x1: "10", x2: "10", y1: "11", y2: "17" }], ["line", { x1: "14", x2: "14", y1: "11", y2: "17" }]],
    x: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
  };

  function createElement(tag, attributes, children) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes || {}).forEach(([name, value]) => element.setAttribute(name, String(value)));
    (children || []).forEach(([childTag, childAttributes, childChildren]) => element.appendChild(createElement(childTag, childAttributes, childChildren)));
    return element;
  }

  function createIcons({ attrs = {} } = {}) {
    document.querySelectorAll("[data-lucide]").forEach((placeholder) => {
      const name = placeholder.getAttribute("data-lucide");
      const children = icons[name];
      if (!children) return;
      const svgAttributes = { ...defaultAttributes, "data-lucide": name, ...attrs, class: `lucide lucide-${name}` };
      Array.from(placeholder.attributes).forEach((attribute) => {
        if (attribute.name !== "data-lucide") svgAttributes[attribute.name] = attribute.value;
      });
      placeholder.replaceWith(createElement("svg", svgAttributes, children));
    });
  }

  global.lucide = { createIcons };
})(typeof globalThis === "undefined" ? window : globalThis);
