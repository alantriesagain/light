import { defineRule } from "../define.js";

const NATIVE_EVENTS = new Set([
  "click", "dblclick", "input", "change", "submit", "reset", "focus", "blur",
  "focusin", "focusout", "keydown", "keyup", "keypress", "scroll", "wheel",
  "mousedown", "mouseup", "mousemove", "mouseenter", "mouseleave", "mouseover", "mouseout",
  "pointerdown", "pointerup", "pointermove", "pointerenter", "pointerleave", "pointercancel",
  "touchstart", "touchend", "touchmove", "touchcancel",
  "dragstart", "dragend", "dragover", "dragenter", "dragleave", "drop", "drag",
  "load", "error", "abort", "loadeddata", "loadedmetadata", "canplay", "ended",
  "play", "pause", "timeupdate", "volumechange", "seeked", "waiting",
  "animationend", "animationstart", "animationiteration", "transitionend",
  "contextmenu", "select", "toggle", "invalid", "paste", "copy", "cut",
  "compositionstart", "compositionend", "compositionupdate",
]);

const BINDING = /@([\w-]+)=/g;
const BUBBLY = /new CustomEvent\(\s*["']([\w-]+)["']\s*,\s*\{[^}]*bubbles:\s*true/g;

/**
 * @param {string} source
 * @param {number} index
 */
const nearestOpenTag = (source, index) => {
  let last = null;
  const re = /<([a-z][\w-]*)/g;
  let m;
  while ((m = re.exec(source)) && m.index < index) last = m;
  return last;
};

/**
 * @param {string} source
 * @param {number} from
 */
const scanTagEnd = (source, from) => {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (ch === "$" && source[i + 1] === "{") {
      depth++;
      i++;
    } else if (depth > 0 && ch === "{") depth++;
    else if (depth > 0 && ch === "}") depth--;
    else if (depth === 0 && ch === ">") return i;
    else if (depth === 0 && ch === "<") return -1;
  }
  return -1;
};

export default defineRule({
  severity: "warn",
  description: "An @event binding on a childless component tag names an event the target, or a fragment it lists under mixins, actually produces",
  why: "a listener for an event nothing dispatches is invisible dead code: the handler never runs and the feature silently does nothing (editor-code @change and admin-model-list @row-click both shipped this way); native events, the events a host's plugins make every component emit, names dispatched with bubbles:true in checkable files, and elements with children are exempt. Cross-package bubbling the check can't see would need the dispatcher in another package's internals, which no current binding relies on",
  check(ctx) {
    const index = ctx.componentIndex();
    /** @type {Set<string>} */
    const bubbly = new Set();
    for (const file of ctx.files()) {
      if (!/\.js$/.test(file) || file.endsWith(".test.js")) continue;
      const source = ctx.read(file) || "";
      for (const m of source.matchAll(BUBBLY)) bubbly.add(m[1]);
    }
    for (const file of ctx.files()) {
      if (!/\.js$/.test(file) || file.endsWith(".test.js")) continue;
      const source = ctx.read(file) || "";
      if (!source.includes("@")) continue;
      for (const match of source.matchAll(BINDING)) {
        const event = match[1];
        if (NATIVE_EVENTS.has(event) || ctx.pluginEvents.has(event) || bubbly.has(event)) continue;
        const open = nearestOpenTag(source, match.index);
        if (!open) continue;
        const tag = open[1];
        if (!tag.includes("-") || !index.has(tag)) continue;
        const target = index.sourceOf(tag);
        if (!target || target.includes(event) || index.mixinSourcesOf(tag).some((mixin) => mixin.includes(event))) continue;
        const end = scanTagEnd(source, match.index);
        if (end === -1) continue;
        if (!new RegExp(String.raw`^\s*</${tag}>`).test(source.slice(end + 1))) continue;
        ctx.report({
          file,
          offset: match.index,
          message: `@${event} on <${tag}>: the component neither declares nor dispatches "${event}"; this handler can never run`,
        });
      }
    }
  },
});
