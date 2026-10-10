const ADJECTIVES = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
const COLOURS = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
const NOUNS = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];

let seed = 1;
/** @param {number} max */
const random = (max) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed % max;
};

let nextId = 1;

/**
 * Rows the way js-framework-benchmark builds them, from a seeded generator so
 * every run and every variant draws the same labels.
 * @param {number} count
 * @returns {{ id: number, label: string }[]}
 */
export const buildData = (count) =>
  Array.from({ length: count }, () => ({
    id: nextId++,
    label: `${ADJECTIVES[random(ADJECTIVES.length)]} ${COLOURS[random(COLOURS.length)]} ${NOUNS[random(NOUNS.length)]}`,
  }));

/** @param {number} n */
export const frames = (n) =>
  new Promise((resolve) => {
    let left = n;
    const step = () => (--left <= 0 ? resolve(undefined) : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

/**
 * @template {{ id: number }} R
 * @typedef {{
 *   set: (rows: R[]) => void,
 *   get: () => R[],
 *   select: (id: number) => void,
 *   make?: (rows: { id: number, label: string }[]) => R[],
 *   relabel?: (every: number) => void,
 * }} RowsImpl
 */

/**
 * The js-framework-benchmark operations, in its order, over one variant's
 * `set`/`get`/`select`. A variant whose rows hold their label in a signal
 * passes `make` to wrap new rows and `relabel` to update in place.
 * @template {{ id: number }} R
 * @param {RowsImpl<R>} impl
 */
export const rowSteps = ({ set, get, select, make = (rows) => /** @type {R[]} */ (/** @type {unknown} */ (rows)), relabel }) => {
  const fresh = (/** @type {number} */ count) => make(buildData(count));
  const relabelEvery = (/** @type {number} */ every) =>
    relabel
      ? relabel(every)
      : set(get().map((row, i) => (i % every ? row : { ...row, label: `${/** @type {{ label: string }} */ (/** @type {unknown} */ (row)).label} !!!` })));
  const swap = () => {
    const rows = [...get()];
    [rows[1], rows[998]] = [rows[998], rows[1]];
    set(rows);
  };
  return [
    { name: "create 1k", run: () => set(fresh(1000)) },
    { name: "replace 1k", run: () => set(fresh(1000)) },
    { name: "update every 10th", run: () => relabelEvery(10) },
    { name: "select row", run: () => select(get()[1].id) },
    { name: "swap rows", run: swap },
    { name: "remove row", run: () => set(get().filter((_, i) => i !== 1)) },
    { name: "clear 1k", run: () => set([]) },
    { name: "create 10k", run: () => set(fresh(10000)) },
    { name: "clear 10k", run: () => set([]) },
    { name: "setup 1k", measure: false, run: () => set(fresh(1000)) },
    { name: "append 1k", run: () => set([...get(), ...fresh(1000)]) },
  ];
};

/**
 * Expose a page's steps to the runner. `finished(start)` resolves with the
 * moment the step's rendering ended; the runner reads the CPU the step cost
 * from the DevTools metrics around the call.
 * @param {{ name: string, measure?: boolean, run: () => unknown }[]} steps
 * @param {(start: number) => Promise<number>} finished
 */
export const register = (steps, finished) => {
  Object.assign(window, { bench: {
    ready: true,
    steps: steps.map(({ name, measure = true }) => ({ name, measure })),
    /** @param {number} index */
    async run(index) {
      const start = performance.now();
      await steps[index].run();
      const end = await finished(start);
      await frames(2);
      return end - start;
    },
  } });
};
