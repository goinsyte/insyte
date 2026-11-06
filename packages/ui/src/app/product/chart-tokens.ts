/* ─────────────────────────────────────────────────────────────────────
   Chart tokens — typed exports of brand-book OKLCH variables for Recharts
   (and any other chart library that accepts a `stroke` / `fill` / `stopColor`
   string). Using CSS variables instead of hardcoded hex means a future
   palette change propagates through every chart automatically, and matches
   the brand book's mono-mesh aesthetic.

   The forbidden hardcoded colors (e.g. `#0781e9`) get replaced with these
   exports anywhere a chart is rendered in the product surfaces.
   ──────────────────────────────────────────────────────────────────────── */

export const CHART_ARC = "var(--arc)";
export const CHART_ARC_SOFT = "var(--arc-soft)";
export const CHART_ARC_TINT = "var(--arc-tint)";
export const CHART_ABYSS = "var(--abyss)";

export const CHART_SKY = "var(--sky)";

export const CHART_INK = "var(--ink)";
export const CHART_INK_2 = "var(--ink-2)";
export const CHART_INK_3 = "var(--ink-3)";
export const CHART_INK_4 = "var(--ink-4)";
export const CHART_INK_5 = "var(--ink-5)";

export const CHART_HAIRLINE = "var(--hairline)";
export const CHART_HAIRLINE_STRONG = "var(--hairline-strong)";

export const CHART_SIGNAL_GREEN = "var(--signal-green)";
export const CHART_SIGNAL_AMBER = "var(--signal-amber)";
export const CHART_SIGNAL_RED = "var(--signal-red)";

/** Common axis tick style for Recharts — small ink-4, no axis line. */
export const CHART_AXIS_TICK = { fontSize: 10, fill: CHART_INK_4 };

/** Standard grid stroke — hairline with dashed pattern, no vertical lines. */
export const CHART_GRID_PROPS = {
	stroke: CHART_HAIRLINE,
	strokeDasharray: "3 3",
	vertical: false,
};
