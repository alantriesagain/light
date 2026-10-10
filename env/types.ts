/**
 * @bootstrapp/light/env: the page's environment as components read it.
 */

/** A point-in-time read of `env` (the data fields, no methods). */
export interface EnvSnapshot {
  /** The OS, from the user agent. */
  os: "ios" | "android" | "macos" | "windows" | "linux" | "unknown";
  isTouch: boolean;
  pixelRatio: number;
  /** Viewport width (CSS px). */
  width: number;
  /** Viewport height (CSS px). */
  height: number;
  screenWidth: number;
  screenHeight: number;
  orientation: "portrait" | "landscape";
  breakpoint: "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
  /** Viewport width below the `md` (768px) breakpoint. */
  isMobile: boolean;
  isDesktop: boolean;
  /** `prefers-color-scheme: dark` at the OS or browser level. */
  prefersDark: boolean;
  /** The applied color scheme (`<html class="dark">`). */
  dark: boolean;
}

export interface Env extends EnvSnapshot {
  /** A plain-object copy of the current values. */
  snapshot(): EnvSnapshot;
  /** Called with a fresh snapshot on resize (debounced), orientation, color-scheme and `dark` class changes. */
  subscribe(fn: (snapshot: EnvSnapshot) => void): () => void;
}

export * from "./index.js";
export { default } from "./index.js";
