/**
 * The live side of the home page's first pairs: `my-counter`, defined the way
 * the snippet beside it says, so what the reader clicks is what they read.
 * `View.define` takes the same definition again as a no-op, so the page may
 * call `defineDemos()` every time it connects.
 */
import View from "@bootstrapp/light";
import { html } from "@bootstrapp/light/html";

const counter = {
  tag: "my-counter",
  properties: {
    label: "Clicks",
    count: 0,
    big: false,
  },
  render() {
    return html`<button type="button" ?data-big=${this.big} @click=${() => this.count++}>${this.label}: ${this.count}</button>`;
  },
};

export const defineDemos = () => {
  View.define(counter);
};
