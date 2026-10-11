import { html } from "@bootstrapp/light/html";
import T from "@bootstrapp/light/types";
import { defineComponent } from "@bootstrapp/light";
import { lcText } from "../utils/text.js";

export default defineComponent({
  tag: "lc-title-bar",
  props: {
    title: "",
    variant: T.string({
      defaultValue: "default",
      enum: ["default", "unified", "hidden"],
    }),
    showControls: true,
    draggable: true,
  },
  style: true,

  handleMinimize() {
    this.$emit("minimize");
  },

  handleMaximize() {
    this.$emit("maximize");
  },

  handleClose() {
    this.$emit("close");
  },

  render() {
    if (this.variant === "hidden")
      return html``;

    return html`
      <div part="lc-title-bar-titlebar" class="title-bar" role="banner">
        <div part="lc-title-bar-left" class="title-bar-left">
          <slot name="left"></slot>
        </div>

        <div part="lc-title-bar-center" class="title-bar-center">
          ${this.title ? html`<span part="lc-title-bar-title" class="title-text">${this.title}</span>` : ""}
          <slot name="center"></slot>
        </div>

        <div part="lc-title-bar-right" class="title-bar-right">
          <slot name="right"></slot>
          ${
            this.showControls
              ? html`
                <div part="lc-title-bar-controls" class="window-controls">
                  <button
                    part="lc-title-bar-minimize"
                    class="control-button minimize"
                    @click=${this.handleMinimize}
                    aria-label=${lcText("lc-title-bar", "minimize")}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.5" />
                    </svg>
                  </button>
                  <button
                    part="lc-title-bar-maximize"
                    class="control-button maximize"
                    @click=${this.handleMaximize}
                    aria-label=${lcText("lc-title-bar", "maximize")}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <rect
                        x="2"
                        y="2"
                        width="8"
                        height="8"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                      />
                    </svg>
                  </button>
                  <button
                    part="lc-title-bar-close"
                    class="control-button close"
                    @click=${this.handleClose}
                    aria-label=${lcText("lc-title-bar", "close")}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5" />
                      <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" />
                    </svg>
                  </button>
                </div>
              `
              : ""
          }
        </div>
      </div>
    `;
  },
});

/**
 * Title Bar Component
 *
 * @component
 * @category layout
 * @tag lc-title-bar
 *
 * A desktop window title bar with draggable region and window controls.
 * Designed for desktop applications with native-like window chrome.
 *
 * @slot left - Left side content (app icon, menu, etc.)
 * @slot center - Center content (window title, tabs, etc.)
 * @slot right - Right side content (before window controls)
 *
 * @part titlebar - The title bar container
 * @part left - The left section
 * @part center - The center section
 * @part right - The right section
 * @part title - The title text
 * @part controls - The window controls container
 * @part minimize - The minimize button
 * @part maximize - The maximize button
 * @part close - The close button
 *
 * @example Basic Title Bar
 * ```html
 * <lc-title-bar title="My Application"></lc-title-bar>
 * ```
 *
 * @example With App Icon
 * ```html
 * <lc-title-bar title="My App">
 *   <div slot="left" style="display: flex; align-items: center; gap: 8px;">
 *     <img src="/icon.png" alt="App Icon" width="20" height="20">
 *     <span style="font-weight: 600;">MyApp</span>
 *   </div>
 * </lc-title-bar>
 * ```
 *
 * @example With Menu
 * ```html
 * <lc-title-bar title="Document.txt - Editor">
 *   <div slot="left" style="display: flex; gap: 12px; padding-left: 12px;">
 *     <button>File</button>
 *     <button>Edit</button>
 *     <button>View</button>
 *     <button>Help</button>
 *   </div>
 * </lc-title-bar>
 * ```
 *
 * @example Unified Variant (macOS-style)
 * ```html
 * <lc-title-bar
 *   title="My Document"
 *   variant="unified"
 * ></lc-title-bar>
 * ```
 *
 * @example With Custom Controls
 * ```html
 * <lc-title-bar title="My App">
 *   <div slot="right">
 *     <button><lc-icon name="settings"></lc-icon></button>
 *     <button><lc-icon name="circle-help"></lc-icon></button>
 *   </div>
 * </lc-title-bar>
 * ```
 *
 * @example Without Controls
 * ```html
 * <lc-title-bar
 *   title="Embedded Window"
 *   show-controls="false"
 * ></lc-title-bar>
 * ```
 *
 * @example With Event Handling
 * ```html
 * <lc-title-bar
 *   title="My App"
 *   @minimize=${() => console.log('Minimize')}
 *   @maximize=${() => console.log('Maximize')}
 *   @close=${() => console.log('Close')}
 * ></lc-title-bar>
 * ```
 *
 * @example Non-Draggable
 * ```html
 * <lc-title-bar
 *   title="Locked Window"
 *   draggable="false"
 * ></lc-title-bar>
 * ```
 *
 * @example With Tabs (Chromium-style)
 * ```html
 * <lc-title-bar show-controls>
 *   <div slot="center" style="display: flex; gap: 4px;">
 *     <button class="tab active">Home</button>
 *     <button class="tab">Documents</button>
 *     <button class="tab">Settings</button>
 *     <button class="tab-new">+</button>
 *   </div>
 * </lc-title-bar>
 * ```
 *
 * @example Hidden Variant
 * ```html
 * <lc-title-bar variant="hidden"></lc-title-bar>
 * ```
 */
