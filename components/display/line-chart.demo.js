import { html } from "@bootstrapp/light/html";

const signups = [
  { label: "Jan", value: 42 },
  { label: "Feb", value: 58 },
  { label: "Mar", value: 51 },
  { label: "Apr", value: 74 },
  { label: "May", value: 96 },
  { label: "Jun", value: 88 },
];

export default {
  description: "A line over a scale, with points and an area fill.",
  preview: () => html`
    <div style="width: 180px">
      <lc-line-chart .data=${[{ label: "J", value: 42 }, { label: "F", value: 58 }, { label: "M", value: 51 }, { label: "A", value: 74 }, { label: "M", value: 96 }]} height="80" show-area></lc-line-chart>
    </div>
  `,
  examples: [
    {
      title: "Basic",
      render: () => html`
        <lc-line-chart .data=${signups} height="200"></lc-line-chart>
      `,
    },
    {
      title: "Filled area",
      description: "The area fades from the line colour to nothing at the baseline.",
      render: () => html`
        <lc-line-chart .data=${signups} height="200" show-area variant="success"></lc-line-chart>
      `,
    },
    {
      title: "Straight segments",
      render: () => html`
        <lc-line-chart .data=${signups} height="200" .smooth=${false}></lc-line-chart>
      `,
    },
  ],
};
