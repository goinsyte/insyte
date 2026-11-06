import { cn } from "@insyte/ui/lib/utils"
import { forwardRef } from "react"
import type * as React from "react"

/*
 * Insyte's own icon set, drawn for this product rather than taken from a kit.
 *
 * It replaced Lucide, which is the reason the console read as generated: Lucide is the default
 * glyph of nearly every component library, so its round caps and soft joins are what a visitor's
 * eye has already filed under "template". This set is drawn with the drafting pen the rest of the
 * product uses — the plate, the empty marks, the Drift mark at the head of the rail:
 *
 *   - square caps and mitred joins, so a corner is a corner and a line ends where it is cut;
 *   - a 24-unit field with an 18-unit live area (3 → 21), one stroke weight (1.75) that a caller may
 *     override but the set itself never varies;
 *   - straight segments and right angles before curves — a reply bends at a corner, a return is an
 *     orthogonal elbow, an automation is two nodes and a ruled connector;
 *   - rectangles on a 2-unit radius, which is the Drift square, and the mark's offset-square device
 *     wherever the subject is "one of several" (copy, stores, apps, customers);
 *   - dots are squares. A round dot is the one detail that makes a set look stock.
 *
 * Each export carries the name Lucide gave the same subject, so a call site moved by changing its
 * import path; Lucide's duplicate spellings (`CheckIcon` beside `Check`) were folded into one name
 * each. `IconComponent` takes the place of `LucideIcon`.
 */

type Node =
  | readonly ["p", string]
  | readonly ["c", number, number, number]
  | readonly ["r", number, number, number, number, number?]
  | readonly ["f", number, number, number, number]
  | readonly ["F", string]

export type IconProps = Omit<React.SVGProps<SVGSVGElement>, "ref"> & {
  size?: number | string
  strokeWidth?: number | string
  /** Keep the stroke at its nominal pixel width whatever the rendered size. */
  absoluteStrokeWidth?: boolean
}

export type IconComponent = React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>

/* Every stroke is measured as length 1, so the console's glyph draw-in (a dash of 1 offset by 1, run to 0)
   works on any glyph without knowing its geometry. With no dash set it changes nothing. */
const draw = (node: Node, i: number): React.ReactElement => {
  switch (node[0]) {
    case "p":
      return <path key={i} d={node[1]} pathLength={1} />
    case "c":
      return <circle key={i} cx={node[1]} cy={node[2]} r={node[3]} pathLength={1} />
    case "r":
      return <rect key={i} x={node[1]} y={node[2]} width={node[3]} height={node[4]} rx={node[5] ?? 2} pathLength={1} />
    case "f":
      // A dot is a filled square, drawn without a stroke so it stays the size it says.
      return <rect key={i} x={node[1]} y={node[2]} width={node[3]} height={node[4]} fill="currentColor" stroke="none" />
    case "F":
      return <path key={i} d={node[1]} fill="currentColor" stroke="none" />
  }
}

function icon(name: string, nodes: ReadonlyArray<Node>): IconComponent {
  const Glyph = forwardRef<SVGSVGElement, IconProps>(function Glyph(
    {
      size = 24,
      strokeWidth = 1.75,
      absoluteStrokeWidth = false,
      color = "currentColor",
      className,
      children,
      ...rest
    },
    ref
  ) {
    const width = absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth
    const labelled = rest["aria-label"] !== undefined || rest["aria-labelledby"] !== undefined
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden={labelled ? undefined : true}
        data-icon={name}
        className={cn("insyte-icon", className)}
        {...rest}
      >
        {nodes.map(draw)}
        {children}
      </svg>
    )
  })
  Glyph.displayName = name
  return Glyph
}

/* ── the glyphs ─────────────────────────────────────────────────────────────────────────────── */

const G = {
  /* direction */
  "chevron-down": [["p", "M6.5 9.5L12 15L17.5 9.5"]],
  "chevron-up": [["p", "M6.5 14.5L12 9L17.5 14.5"]],
  "chevron-left": [["p", "M14.5 6.5L9 12L14.5 17.5"]],
  "chevron-right": [["p", "M9.5 6.5L15 12L9.5 17.5"]],
  "chevrons-left": [["p", "M12 6.5L6.5 12L12 17.5"], ["p", "M18 6.5L12.5 12L18 17.5"]],
  "chevrons-up-down": [["p", "M8 9L12 5L16 9"], ["p", "M8 15L12 19L16 15"]],
  "arrow-right": [["p", "M4 12H18.5"], ["p", "M13 6.5L18.5 12L13 17.5"]],
  "arrow-left": [["p", "M20 12H5.5"], ["p", "M11 6.5L5.5 12L11 17.5"]],
  "arrow-up": [["p", "M12 20V5.5"], ["p", "M6.5 11L12 5.5L17.5 11"]],
  "arrow-down": [["p", "M12 4V18.5"], ["p", "M6.5 13L12 18.5L17.5 13"]],
  "arrow-up-right": [["p", "M6.5 17.5L16.5 7.5"], ["p", "M8.5 7H17V15.5"]],
  // A return is an elbow, not a curve: the line goes down the page and comes back along it.
  "corner-down-left": [["p", "M19.5 4.5V14H5.5"], ["p", "M10 9.5L5.5 14L10 18.5"]],
  "circle-arrow-up": [["c", 12, 12, 8.5], ["p", "M12 16.5V8"], ["p", "M8.5 11.5L12 8L15.5 11.5"]],
  "external-link": [["p", "M10 5.5H5.5V18.5H18.5V14"], ["p", "M13.5 4.5H19.5V10.5"], ["p", "M19 5L11.5 12.5"]],
  "maximize": [["p", "M14 4.5H19.5V10"], ["p", "M10 19.5H4.5V14"], ["p", "M19 5L13.5 10.5"], ["p", "M5 19L10.5 13.5"]],
  "undo": [["p", "M9 13.5L4.5 9L9 4.5"], ["p", "M5 9H14.5A5 5 0 0 1 14.5 19H11"]],
  "rotate-ccw": [["p", "M4.5 4.5V9.5H9.5"], ["p", "M5 9.5A8 8 0 1 1 4.6 15"]],
  "refresh": [["p", "M4.5 4.5V9H9"], ["p", "M19.5 19.5V15H15"], ["p", "M5 9A7.5 7.5 0 0 1 18.6 8.5"], [
    "p",
    "M19 15A7.5 7.5 0 0 1 5.4 15.5"
  ]],
  "log-out": [["p", "M10 4H4.5V20H10"], ["p", "M14.5 7.5L19 12L14.5 16.5"], ["p", "M19 12H9.5"]],

  /* marks */
  "check": [["p", "M4.5 12.5L9.5 17.5L19.5 7"]],
  "x": [["p", "M6 6L18 18"], ["p", "M18 6L6 18"]],
  "plus": [["p", "M12 4.5V19.5"], ["p", "M4.5 12H19.5"]],
  "minus": [["p", "M5 12H19"]],
  "slash": [["p", "M16.5 3.5L7.5 20.5"]],
  "square": [["r", 4.5, 4.5, 15, 15]],
  "circle": [["c", 12, 12, 8.5]],
  "more-horizontal": [["f", 4.5, 11, 2.5, 2.5], ["f", 10.75, 11, 2.5, 2.5], ["f", 17, 11, 2.5, 2.5]],
  "more-vertical": [["f", 10.75, 4.5, 2.5, 2.5], ["f", 10.75, 10.75, 2.5, 2.5], ["f", 10.75, 17, 2.5, 2.5]],
  "grip-vertical": [
    ["f", 8, 5, 2.5, 2.5],
    ["f", 13.5, 5, 2.5, 2.5],
    ["f", 8, 10.75, 2.5, 2.5],
    ["f", 13.5, 10.75, 2.5, 2.5],
    ["f", 8, 16.5, 2.5, 2.5],
    ["f", 13.5, 16.5, 2.5, 2.5]
  ],
  "menu": [["p", "M4 6.5H20"], ["p", "M4 12H20"], ["p", "M4 17.5H20"]],
  "hash": [["p", "M4.5 9H19.5"], ["p", "M4.5 15H19.5"], ["p", "M10 4L8.5 20"], ["p", "M15.5 4L14 20"]],
  "type": [["p", "M5 7V4.5H19V7"], ["p", "M12 4.5V19.5"], ["p", "M9 19.5H15"]],
  "at-sign": [["c", 12, 12, 3.5], ["p", "M15.5 9V13.5A2.5 2.5 0 0 0 20.5 13.5V12A8.5 8.5 0 1 0 16.8 19"]],

  /* status */
  "circle-check": [["c", 12, 12, 8.5], ["p", "M8 12.5L10.75 15.25L16 9.5"]],
  "circle-x": [["c", 12, 12, 8.5], ["p", "M9 9L15 15"], ["p", "M15 9L9 15"]],
  "triangle-alert": [["p", "M12 3.5L21 19.5H3Z"], ["p", "M12 9.5V13.5"], ["f", 10.9, 15.6, 2.2, 2.2]],
  "octagon-alert": [["p", "M8.5 3.5H15.5L20.5 8.5V15.5L15.5 20.5H8.5L3.5 15.5V8.5Z"], ["p", "M12 7.5V12.5"], [
    "f",
    10.9,
    14.9,
    2.2,
    2.2
  ]],
  "octagon-x": [["p", "M8.5 3.5H15.5L20.5 8.5V15.5L15.5 20.5H8.5L3.5 15.5V8.5Z"], ["p", "M9.5 9.5L14.5 14.5"], [
    "p",
    "M14.5 9.5L9.5 14.5"
  ]],
  "info": [["c", 12, 12, 8.5], ["p", "M12 11V16.5"], ["f", 10.9, 7, 2.2, 2.2]],
  // A spinner is an arc with a cut end, which is all a drafting compass leaves behind.
  "loader": [["p", "M12 3.5A8.5 8.5 0 1 1 3.5 12"]],
  "clock": [["c", 12, 12, 8.5], ["p", "M12 7.5V12H15.5"]],

  /* commerce */
  // Orders: a carrier bag, drawn as a trapezoid with a squared handle.
  "shopping-bag": [["p", "M4.5 8H19.5L18.5 20.5H5.5Z"], ["p", "M9 8V6A3 3 0 0 1 15 6V8"]],
  "box": [["p", "M12 3.5L20 7.75V16.25L12 20.5L4 16.25V7.75Z"], ["p", "M4 7.75L12 12L20 7.75"], ["p", "M12 12V20.5"]],
  "package": [["p", "M12 3.5L20 7.75V16.25L12 20.5L4 16.25V7.75Z"], ["p", "M4 7.75L12 12L20 7.75"], [
    "p",
    "M12 12V20.5"
  ], ["p", "M8 5.6L16 9.85V13"]],
  "boxes": [["r", 3.5, 11.5, 8, 8, 1.5], ["r", 12.5, 11.5, 8, 8, 1.5], ["r", 8, 3.5, 8, 8, 1.5]],
  "truck": [["p", "M3 5.5H14V15.5H3Z"], ["p", "M14 9H18L21 12.5V15.5H14"], ["c", 7, 17.5, 2], ["c", 17, 17.5, 2]],
  "store": [["p", "M4.5 4H19.5L21 9H3Z"], ["p", "M5 9V20H19V9"], ["p", "M10 20V14.5H14V20"]],
  "credit-card": [["r", 3, 5.5, 18, 13], ["p", "M3 9.5H21"], ["p", "M6.5 14.5H10"]],
  "wallet": [["r", 3.5, 6, 17, 13.5], ["p", "M20.5 10.5H15.5V15H20.5"], ["p", "M5.5 6L15.5 3.5V6"]],
  "banknote": [["r", 2.5, 6, 19, 12], ["c", 12, 12, 2.75], ["f", 5, 8.5, 2, 2], ["f", 17, 13.5, 2, 2]],
  "receipt": [["p", "M5.5 3.5H18.5V20.5L16 19L13.5 20.5L11 19L8.5 20.5L5.5 19Z"], ["p", "M9 8H15"], [
    "p",
    "M9 11.5H15"
  ], ["p", "M9 15H12.5"]],
  // Savings: a jar with a coin on its way into the slot.
  "piggy-bank": [["r", 4.5, 9.5, 15, 11, 3], ["p", "M9.5 9.5H14.5"], ["c", 12, 5.25, 2.25]],
  "tag": [["p", "M3.5 3.5H11.5L20.5 12.5L12.5 20.5L3.5 11.5Z"], ["f", 6.75, 6.75, 2.5, 2.5]],
  "badge-percent": [["r", 4, 4, 16, 16, 3], ["p", "M9 15L15 9"], ["f", 8, 8, 2.2, 2.2], ["f", 13.8, 13.8, 2.2, 2.2]],

  /* communication */
  // The tray's trough is squared off: a slot the mail drops into, not a dip.
  "inbox": [["p", "M4 13V19.5H20V13"], ["p", "M4 13L6.5 4.5H17.5L20 13"], ["p", "M4 13H8.5V15.5H15.5V13H20"]],
  "mail": [["r", 3, 5.5, 18, 13], ["p", "M3.5 7L12 13L20.5 7"]],
  "send": [["p", "M20.5 3.5L3.5 10.5L10.5 13.5L13.5 20.5Z"], ["p", "M10.5 13.5L20.5 3.5"]],
  "send-horizontal": [["p", "M4 4.5L20.5 12L4 19.5L6.5 12Z"], ["p", "M6.5 12H13"]],
  "reply": [["p", "M9.5 6L4.5 11L9.5 16"], ["p", "M5 11H15A5 5 0 0 1 20 16V19"]],
  "message-square": [["p", "M4 4.5H20V16H10L5.5 20V16H4Z"]],
  "message-square-text": [["p", "M4 4.5H20V16H10L5.5 20V16H4Z"], ["p", "M8 9H16"], ["p", "M8 12H13"]],
  "message-square-quote": [["p", "M4 4.5H20V16H10L5.5 20V16H4Z"], ["p", "M9 8.5V11.5"], ["p", "M14.5 8.5V11.5"]],
  // Two bubbles, one behind the other by the Drift offset.
  "messages-square": [["p", "M8.5 7.5V3.5H20.5V12.5H18"], ["p", "M3.5 7.5H15V16.5H8.5L4.5 20V16.5H3.5Z"]],
  "message-circle": [["p", "M20 12A8 8 0 0 1 8.2 19L3.5 20.5L5 15.8A8 8 0 1 1 20 12Z"]],
  "phone": [[
    "p",
    "M5 3.5H9L10.5 8L8.25 9.5A11 11 0 0 0 14.5 15.75L16 13.5L20.5 15V19A1.5 1.5 0 0 1 19 20.5A15.5 15.5 0 0 1 3.5 5A1.5 1.5 0 0 1 5 3.5Z"
  ]],
  "video": [["r", 3, 6.5, 12.5, 11], ["p", "M15.5 10.5L21 7.5V16.5L15.5 13.5"]],
  "bell": [["p", "M6 16.5V10.5A6 6 0 0 1 18 10.5V16.5L19.5 18H4.5Z"], ["p", "M10 20.5H14"]],
  "bell-ring": [["p", "M6 16.5V10.5A6 6 0 0 1 18 10.5V16.5L19.5 18H4.5Z"], ["p", "M10 20.5H14"], [
    "p",
    "M3.5 9A8.5 8.5 0 0 1 6 4"
  ], ["p", "M20.5 9A8.5 8.5 0 0 0 18 4"]],
  "megaphone": [["p", "M4 9H8L18.5 4V19.5L8 14.5H4Z"], ["p", "M7.5 14.5V19.5H10.5V15.5"], ["p", "M21 10V13.5"]],
  "headphones": [["p", "M4 17V12A8 8 0 0 1 20 12V17"], ["p", "M4 13.5H7.5V20H4Z"], ["p", "M16.5 13.5H20V20H16.5Z"]],
  "newspaper": [["r", 3, 4.5, 14, 15, 1.5], ["p", "M17 9H20.5V18A1.5 1.5 0 0 1 17 18"], ["p", "M6.5 8.5H13.5"], [
    "p",
    "M6.5 12H13.5"
  ], ["p", "M6.5 15.5H10.5"]],

  /* people */
  "user": [["c", 12, 8, 3.5], ["p", "M5 20.5V18.5A4.5 4.5 0 0 1 9.5 14H14.5A4.5 4.5 0 0 1 19 18.5V20.5"]],
  // Customers: one person in front, a second set back by the Drift offset.
  "users": [
    ["c", 9.5, 8.5, 3.25],
    ["p", "M3.5 20V18A4 4 0 0 1 7.5 14H11.5A4 4 0 0 1 15.5 18V20"],
    ["p", "M15 5.3A3.25 3.25 0 0 1 15 11.7"],
    ["p", "M17.75 14A3.75 3.75 0 0 1 20.5 17.6V20"]
  ],
  "user-plus": [["c", 10, 8, 3.5], ["p", "M3.5 20.5V18.5A4.5 4.5 0 0 1 8 14H12A4.5 4.5 0 0 1 16.5 18.5V20.5"], [
    "p",
    "M19 7V13"
  ], ["p", "M16 10H22"]],
  "user-x": [["c", 10, 8, 3.5], ["p", "M3.5 20.5V18.5A4.5 4.5 0 0 1 8 14H12A4.5 4.5 0 0 1 16.5 18.5V20.5"], [
    "p",
    "M17 7.5L21.5 12"
  ], ["p", "M21.5 7.5L17 12"]],
  "user-search": [["c", 10, 8, 3.5], ["p", "M3.5 20.5V18.5A4.5 4.5 0 0 1 8 14H10.5"], ["c", 16.5, 16.5, 2.75], [
    "p",
    "M18.5 18.5L21 21"
  ]],
  "user-cog": [["c", 10, 8, 3.5], ["p", "M3.5 20.5V18.5A4.5 4.5 0 0 1 8 14H11"], ["r", 14.5, 14.5, 6, 6, 1.5], [
    "f",
    16.6,
    16.6,
    1.8,
    1.8
  ]],
  "user-square": [["r", 3.5, 3.5, 17, 17], ["c", 12, 10, 3], [
    "p",
    "M7 20.5V19A3.5 3.5 0 0 1 10.5 15.5H13.5A3.5 3.5 0 0 1 17 19V20.5"
  ]],
  "hand": [[
    "p",
    "M8 12.5V6A1.5 1.5 0 0 1 11 6V11M11 10.5V4.5A1.5 1.5 0 0 1 14 4.5V11M14 10.5V5.5A1.5 1.5 0 0 1 17 5.5V14A6.5 6.5 0 0 1 10.5 20.5A6 6 0 0 1 5.5 18L3.5 14.5A1.5 1.5 0 0 1 6 13L8 15"
  ]],
  "mouse-pointer": [["p", "M5 3.5L19 10L12.5 12L10 19Z"]],
  "smile": [["c", 12, 12, 8.5], ["f", 8.5, 8.5, 2, 2], ["f", 13.5, 8.5, 2, 2], ["p", "M8.5 14.5A4 4 0 0 0 15.5 14.5"]],

  /* places and structure */
  "home": [["p", "M4 10L12 3.5L20 10V20H4Z"], ["p", "M10 20V14H14V20"]],
  "layout-dashboard": [["r", 4, 4, 7, 9, 1.5], ["r", 13, 4, 7, 5, 1.5], ["r", 13, 11, 7, 9, 1.5], [
    "r",
    4,
    15,
    7,
    5,
    1.5
  ]],
  // Apps: the Drift squares, three of them, offset — the mark's own device.
  "layout-grid": [["r", 4, 4, 7, 7, 1.5], ["r", 13, 4, 7, 7, 1.5], ["r", 4, 13, 7, 7, 1.5], ["r", 13, 13, 7, 7, 1.5]],
  "grid": [["r", 3.5, 3.5, 17, 17], ["p", "M12 3.5V20.5"], ["p", "M3.5 12H20.5"]],
  "layout-list": [["r", 4, 4.5, 5.5, 5.5, 1.5], ["r", 4, 14, 5.5, 5.5, 1.5], ["p", "M13 6H20"], ["p", "M13 8.5H17.5"], [
    "p",
    "M13 15.5H20"
  ], ["p", "M13 18H17.5"]],
  "layout-template": [["r", 3.5, 4, 17, 6.5, 1.5], ["r", 3.5, 13.5, 8.5, 6.5, 1.5], ["r", 15, 13.5, 5.5, 6.5, 1.5]],
  "list": [["f", 4, 5.5, 2.5, 2.5], ["f", 4, 10.75, 2.5, 2.5], ["f", 4, 16, 2.5, 2.5], ["p", "M9.5 6.75H20"], [
    "p",
    "M9.5 12H20"
  ], ["p", "M9.5 17.25H20"]],
  "list-filter": [["p", "M4 7H20"], ["p", "M7 12H17"], ["p", "M10 17H14"]],
  "columns": [["r", 3.5, 4, 17, 16], ["p", "M9.25 4V20"], ["p", "M14.75 4V20"]],
  "panel-left-close": [["r", 3.5, 4, 17, 16], ["p", "M9 4V20"], ["p", "M15.5 9.5L13 12L15.5 14.5"]],
  "panel-left-open": [["r", 3.5, 4, 17, 16], ["p", "M9 4V20"], ["p", "M13 9.5L15.5 12L13 14.5"]],
  "split": [["p", "M3.5 12H8.5"], ["p", "M8.5 12L13 6.5H20.5"], ["p", "M8.5 12L13 17.5H20.5"]],
  // A test run: a flask, straight-sided, with the line of what is in it.
  "flask": [["p", "M8.5 3.5H15.5"], ["p", "M10 3.5V9.5L4.5 20H19.5L14 9.5V3.5"], ["p", "M7.25 15H16.75"]],
  "route": [["c", 6, 18, 2], ["c", 18, 6, 2], ["p", "M8 18H13.5A3 3 0 0 0 13.5 12H10.5A3 3 0 0 1 10.5 6H16"]],
  "git-merge": [["c", 6.5, 5.5, 2], ["c", 6.5, 18.5, 2], ["c", 17.5, 12, 2], ["p", "M6.5 7.5V16.5"], [
    "p",
    "M6.5 7.5A4.5 4.5 0 0 0 11 12H15.5"
  ]],
  // Automations: two nodes and the ruled connector between them — a step, then the next one.
  "workflow": [["r", 3.5, 3.5, 6.5, 6.5, 1.5], ["r", 14, 14, 6.5, 6.5, 1.5], ["p", "M10 6.75H17.25V14"]],
  "webhook": [["c", 12, 6, 2.25], ["c", 5.5, 17.5, 2.25], ["c", 18.5, 17.5, 2.25], ["p", "M10.9 8L7 15.5"], [
    "p",
    "M13.1 8L17 15.5"
  ], ["p", "M7.75 17.5H16.25"]],
  "plug": [["p", "M9 3.5V8"], ["p", "M15 3.5V8"], ["p", "M6.5 8H17.5V11.5A5.5 5.5 0 0 1 6.5 11.5Z"], [
    "p",
    "M12 17V20.5"
  ]],
  "database": [
    ["p", "M4.5 6A7.5 2.5 0 0 0 19.5 6A7.5 2.5 0 0 0 4.5 6Z"],
    ["p", "M4.5 6V18A7.5 2.5 0 0 0 19.5 18V6"],
    ["p", "M4.5 12A7.5 2.5 0 0 0 19.5 12"]
  ],
  "folder": [["p", "M3.5 5H10L12 7.5H20.5V19H3.5Z"]],
  "compass": [["c", 12, 12, 8.5], ["p", "M15.5 8.5L13.4 13.4L8.5 15.5L10.6 10.6Z"]],
  "globe": [["c", 12, 12, 8.5], ["p", "M3.5 12H20.5"], ["p", "M12 3.5A5 8.5 0 0 1 12 20.5A5 8.5 0 0 1 12 3.5Z"]],
  "map": [["p", "M3.5 6L9 4L15 6L20.5 4V18L15 20L9 18L3.5 20Z"], ["p", "M9 4V18"], ["p", "M15 6V20"]],
  "map-pin": [["p", "M12 20.5L6.6 13.6A7 7 0 1 1 17.4 13.6Z"], ["c", 12, 9.5, 2.5]],
  "building": [
    ["p", "M5 20.5V3.5H15V20.5"],
    ["p", "M15 9H19.5V20.5"],
    ["p", "M3.5 20.5H20.5"],
    ["f", 7.75, 6.5, 2, 2],
    [
      "f",
      10.75,
      6.5,
      2,
      2
    ],
    ["f", 7.75, 10.5, 2, 2],
    ["f", 10.75, 10.5, 2, 2],
    ["f", 7.75, 14.5, 2, 2],
    ["f", 10.75, 14.5, 2, 2]
  ],
  "factory": [["p", "M3.5 20.5V10L8.5 13V10L13.5 13V4.5H18.5V20.5Z"], ["p", "M3.5 20.5H20.5"], ["f", 7, 16, 2, 2], [
    "f",
    11,
    16,
    2,
    2
  ]],
  "briefcase": [["r", 3.5, 7, 17, 13], ["p", "M9 7V4.5H15V7"], ["p", "M3.5 12.5H20.5"]],
  "smartphone": [["r", 6.5, 3, 11, 18], ["p", "M10.5 17.5H13.5"]],
  "monitor-smartphone": [["r", 2.5, 4, 13.5, 10, 1.5], ["p", "M6 18H11.5"], ["p", "M8.75 14V18"], [
    "r",
    17,
    8,
    4.5,
    12,
    1
  ]],
  "anchor": [["c", 12, 5.5, 2], ["p", "M12 7.5V20.5"], ["p", "M8.5 11H15.5"], ["p", "M4 13.5A8 8 0 0 0 20 13.5"]],
  "diamond": [["p", "M12 3.5L20.5 12L12 20.5L3.5 12Z"]],
  "hexagon": [["p", "M12 3L19.8 7.5V16.5L12 21L4.2 16.5V7.5Z"]],
  "triangle": [["p", "M12 4L20.5 19.5H3.5Z"]],
  "mountain": [["p", "M2.5 19.5L9 8L13 14.5L15.5 11L21.5 19.5Z"]],

  /* documents and files */
  // Copy: the second square sits behind the first by the Drift offset.
  "copy": [["r", 8.5, 8.5, 12, 12], [
    "p",
    "M15.5 8.5V5.5A2 2 0 0 0 13.5 3.5H5.5A2 2 0 0 0 3.5 5.5V13.5A2 2 0 0 0 5.5 15.5H8.5"
  ]],
  "file-text": [["p", "M5.5 3.5H14L18.5 8V20.5H5.5Z"], ["p", "M14 3.5V8H18.5"], ["p", "M8.5 12H15.5"], [
    "p",
    "M8.5 15.5H15.5"
  ]],
  "clipboard-check": [["r", 5, 4.5, 14, 16], ["r", 9, 3, 6, 3, 1], ["p", "M8.5 13L11 15.5L15.5 10.5"]],
  "book-open": [["p", "M3.5 5H9A3 3 0 0 1 12 8V20A2.5 2.5 0 0 0 9.5 17.5H3.5Z"], [
    "p",
    "M20.5 5H15A3 3 0 0 0 12 8V20A2.5 2.5 0 0 1 14.5 17.5H20.5Z"
  ]],
  "image": [["r", 3.5, 4.5, 17, 15], ["p", "M3.5 16L9 10.5L14 15.5L16 13.5L20.5 18"], ["f", 14.25, 7.75, 2.5, 2.5]],
  "image-off": [["p", "M8 4.5H18.5A2 2 0 0 1 20.5 6.5V16"], ["p", "M20 19.5H5.5A2 2 0 0 1 3.5 17.5V5"], [
    "p",
    "M3.5 16L9 10.5L12.5 14"
  ], ["p", "M3.5 3.5L20.5 20.5"]],
  "archive": [["r", 3, 4.5, 18, 4.5, 1], ["p", "M4.5 9V19.5H19.5V9"], ["p", "M10 12.5H14"]],
  "download": [["p", "M12 3.5V14.5"], ["p", "M7 9.5L12 14.5L17 9.5"], ["p", "M4 16.5V20H20V16.5"]],
  "upload": [["p", "M12 15V4"], ["p", "M7 9L12 4L17 9"], ["p", "M4 16.5V20H20V16.5"]],
  "download-cloud": [["p", "M7.5 17.5H6.5A4 4 0 0 1 6 9.5A6 6 0 0 1 17.5 8.5A4.5 4.5 0 0 1 17.5 17.5H16.5"], [
    "p",
    "M12 11V20"
  ], ["p", "M9 17L12 20L15 17"]],
  "save": [["p", "M4 4H16.5L20 7.5V20H4Z"], ["p", "M8 4V8.5H15V4"], ["r", 7.5, 13, 9, 7, 1]],
  "printer": [["p", "M7 8.5V3.5H17V8.5"], [
    "p",
    "M7 17H5A1.5 1.5 0 0 1 3.5 15.5V10A1.5 1.5 0 0 1 5 8.5H19A1.5 1.5 0 0 1 20.5 10V15.5A1.5 1.5 0 0 1 19 17H17"
  ], [
    "p",
    "M7 13.5H17V20.5H7Z"
  ]],
  "trash": [["p", "M3.5 6.5H20.5"], ["p", "M9 6.5V3.5H15V6.5"], ["p", "M5.5 6.5L6.5 20.5H17.5L18.5 6.5"], [
    "p",
    "M10 10.5V16.5"
  ], ["p", "M14 10.5V16.5"]],
  "pencil": [["p", "M4 20H8L19 9L15 5L4 16Z"], ["p", "M12.5 7.5L16.5 11.5"], ["p", "M13 20H20"]],
  "link": [["p", "M9.5 7.5H7.5A4.5 4.5 0 0 0 7.5 16.5H9.5"], ["p", "M14.5 7.5H16.5A4.5 4.5 0 0 1 16.5 16.5H14.5"], [
    "p",
    "M8.5 12H15.5"
  ]],
  "paperclip": [["p", "M16 7V15.5A4 4 0 0 1 8 15.5V6.5A2.75 2.75 0 0 1 13.5 6.5V15A1.25 1.25 0 0 1 11 15V8.5"]],
  "pin": [["p", "M9 3.5H15"], ["p", "M10 3.5V9L6.5 13.5H17.5L14 9V3.5"], ["p", "M12 13.5V20.5"]],
  "pin-off": [["p", "M9 3.5H15"], ["p", "M14 3.5V9L17.5 13.5H13.5"], ["p", "M10 5V9L6.5 13.5H10"], [
    "p",
    "M12 13.5V20.5"
  ], [
    "p",
    "M3.5 3.5L20.5 20.5"
  ]],

  /* controls and settings */
  "search": [["c", 10.5, 10.5, 6.5], ["p", "M15.25 15.25L20 20"]],
  // Settings are sliders: what a setting is, rather than the gear every kit draws.
  "settings": [["p", "M4 7.5H7"], ["p", "M11 7.5H20"], ["r", 7, 5.5, 4, 4, 1], ["p", "M4 16.5H13"], [
    "p",
    "M17 16.5H20"
  ], [
    "r",
    13,
    14.5,
    4,
    4,
    1
  ]],
  "filter": [["p", "M4 5H20L14 12.5V19L10 20.5V12.5Z"]],
  "eye": [["p", "M3 12Q12 2.5 21 12Q12 21.5 3 12Z"], ["c", 12, 12, 3]],
  "eye-off": [["p", "M3 12Q12 2.5 21 12Q12 21.5 3 12Z"], ["c", 12, 12, 3], ["p", "M4.5 4.5L19.5 19.5"]],
  "lock": [["r", 5, 10.5, 14, 10], ["p", "M8 10.5V7.5A4 4 0 0 1 16 7.5V10.5"], ["p", "M12 14V17"]],
  "key": [["c", 8, 15.5, 4], ["p", "M11 12.5L20 3.5"], ["p", "M17 6.5L19.5 9"], ["p", "M14.5 9L16.5 11"]],
  "shield": [["p", "M4.5 5.5L12 3L19.5 5.5V12.5A8 8 0 0 1 12 20.5A8 8 0 0 1 4.5 12.5Z"]],
  "shield-check": [["p", "M4.5 5.5L12 3L19.5 5.5V12.5A8 8 0 0 1 12 20.5A8 8 0 0 1 4.5 12.5Z"], [
    "p",
    "M8.5 11.5L11 14L15.5 9"
  ]],
  "shield-alert": [["p", "M4.5 5.5L12 3L19.5 5.5V12.5A8 8 0 0 1 12 20.5A8 8 0 0 1 4.5 12.5Z"], ["p", "M12 8V12"], [
    "f",
    10.9,
    14.2,
    2.2,
    2.2
  ]],
  "keyboard": [
    ["r", 2.5, 6, 19, 12],
    ["f", 5.5, 9, 2, 2],
    ["f", 9, 9, 2, 2],
    ["f", 12.5, 9, 2, 2],
    ["f", 16, 9, 2, 2],
    [
      "p",
      "M8 14.5H16"
    ]
  ],
  "calendar": [["r", 3.5, 5, 17, 15.5], ["p", "M3.5 9.5H20.5"], ["p", "M8 3V7"], ["p", "M16 3V7"], [
    "f",
    7,
    13,
    2.5,
    2.5
  ]],
  "sun": [
    ["c", 12, 12, 4],
    ["p", "M12 2.5V4.5"],
    ["p", "M12 19.5V21.5"],
    ["p", "M2.5 12H4.5"],
    ["p", "M19.5 12H21.5"],
    [
      "p",
      "M5.3 5.3L6.7 6.7"
    ],
    ["p", "M17.3 17.3L18.7 18.7"],
    ["p", "M5.3 18.7L6.7 17.3"],
    ["p", "M17.3 6.7L18.7 5.3"]
  ],
  "moon": [["p", "M19.5 14.5A8 8 0 1 1 9.5 4.5A6.5 6.5 0 0 0 19.5 14.5Z"]],
  // Auto: one disc, the night half filled — the two themes and the line between them.
  "sun-moon": [["c", 12, 12, 7.5], ["F", "M12 4.5A7.5 7.5 0 0 0 12 19.5Z"]],
  "palette": [
    [
      "p",
      "M12 3.5A8.5 8.5 0 1 0 12 20.5H13.5A2 2 0 0 0 13.5 16.5A2 2 0 0 1 13.5 12.5H17A3.5 3.5 0 0 0 20.5 9A8.5 6 0 0 0 12 3.5Z"
    ],
    [
      "f",
      7,
      10,
      2,
      2
    ],
    ["f", 10, 6.5, 2, 2],
    ["f", 14.5, 6.5, 2, 2]
  ],
  "play": [["p", "M7 4.5L19 12L7 19.5Z"]],
  "pause": [["r", 6.5, 5, 3.5, 14, 1], ["r", 14, 5, 3.5, 14, 1]],

  /* text formatting */
  "bold": [["p", "M7 4.5H13A3.75 3.75 0 0 1 13 12H7Z"], ["p", "M7 12H14A3.75 3.75 0 0 1 14 19.5H7Z"]],
  "italic": [["p", "M10 4.5H18"], ["p", "M6 19.5H14"], ["p", "M14 4.5L10 19.5"]],
  "strikethrough": [["p", "M4 12H20"], ["p", "M16.5 7A4.5 3 0 0 0 12 4.5C9 4.5 7.5 6 7.5 7.75"], [
    "p",
    "M7.5 16.5A4.5 3 0 0 0 12 19.5C15 19.5 16.5 18 16.5 16"
  ]],
  "code": [["p", "M8.5 7L3.5 12L8.5 17"], ["p", "M15.5 7L20.5 12L15.5 17"]],

  /* insight and AI */
  // The AI mark: a four-point star with straight, concave sides and a ruled spark — the drafting
  // version of the puffed sparkle every AI feature on the web draws. It is also the second mark the
  // legacy shell carried, which PRODUCT.md records as unresolved; this is not a vote on that.
  "sparkles": [["p", "M10.5 4L12 10.5L18.5 12L12 13.5L10.5 20L9 13.5L2.5 12L9 10.5Z"], ["p", "M18.5 3V7"], [
    "p",
    "M16.5 5H20.5"
  ]],
  "sparkle": [["p", "M12 3L13.75 10.25L21 12L13.75 13.75L12 21L10.25 13.75L3 12L10.25 10.25Z"]],
  "star": [["p", "M12 3.5L14.6 9L20.5 9.6L16 13.6L17.3 19.5L12 16.5L6.7 19.5L8 13.6L3.5 9.6L9.4 9Z"]],
  "zap": [["p", "M13.5 3L5 13.5H11.5L10.5 21L19 10.5H12.5Z"]],
  "flame": [[
    "p",
    "M12 3.5C14 7 18 9 18 14A6 6 0 0 1 6 14C6 11 7.5 9.5 9 8C9.5 10 10.5 11 12 11C11 8 11.5 5.5 12 3.5Z"
  ]],
  "bot": [
    ["r", 4.5, 8, 15, 11.5],
    ["p", "M12 8V4.5"],
    ["f", 10.9, 2.5, 2.2, 2.2],
    ["f", 8.5, 12, 2.2, 2.2],
    [
      "f",
      13.3,
      12,
      2.2,
      2.2
    ],
    ["p", "M2.5 12.5V15"],
    ["p", "M21.5 12.5V15"]
  ],
  "rocket": [
    ["p", "M12 3C15.5 5 17 9 16 14.5H8C7 9 8.5 5 12 3Z"],
    ["p", "M8 11.5L5 14.5V17.5L8.5 16"],
    [
      "p",
      "M16 11.5L19 14.5V17.5L15.5 16"
    ],
    ["p", "M10.5 18V21"],
    ["p", "M13.5 18V21"],
    ["c", 12, 9, 1.5]
  ],
  "trending-up": [["p", "M3.5 17L9.5 11L13 14.5L20 7.5"], ["p", "M14.5 7.5H20V13"]],
  // Charts are drawn on an axis, because a bar without a baseline measures nothing.
  "bar-chart": [["p", "M4 4V20H20"], ["p", "M8.5 16.5V12"], ["p", "M13 16.5V7.5"], ["p", "M17.5 16.5V10.5"]],
  "line-chart": [["p", "M4 4V20H20"], ["p", "M7.5 15L11 10.5L14 13L19 7"]],
  "ticket": [
    ["p", "M3.5 6H20.5V9.5A2.5 2.5 0 0 0 20.5 14.5V18H3.5V14.5A2.5 2.5 0 0 0 3.5 9.5Z"],
    [
      "p",
      "M14.5 6.5V8"
    ],
    ["p", "M14.5 11.25V12.75"],
    ["p", "M14.5 16V17.5"]
  ],
  // A course: the mortarboard, its board a ruled diamond and the tassel a straight drop.
  "graduation-cap": [["p", "M2.5 9.5L12 5L21.5 9.5L12 14Z"], [
    "p",
    "M6.5 11.75V16.25C8 17.75 10 18.5 12 18.5C14 18.5 16 17.75 17.5 16.25V11.75"
  ], ["p", "M21.5 9.5V15"]],
  // A badge earned: a medal on two ribbons cut square.
  "award": [["c", 12, 9, 5.5], ["p", "M8.75 13.5L7.5 20.5L12 18.5L16.5 20.5L15.25 13.5"], ["f", 11, 8, 2, 2]],
  // A sheet: a ruled grid with the header row and the first column marked off.
  "sheet": [["r", 3.5, 4.5, 17, 15], ["p", "M3.5 9.5H20.5"], ["p", "M3.5 14.5H20.5"], ["p", "M9.5 4.5V19.5"], [
    "p",
    "M15 9.5V19.5"
  ]],
  // Live: a square source with two rings of signal either side.
  "radio": [
    ["f", 11, 11, 2, 2],
    ["p", "M8.25 8.25A5.25 5.25 0 0 0 8.25 15.75"],
    ["p", "M15.75 8.25A5.25 5.25 0 0 1 15.75 15.75"],
    ["p", "M5.25 5.25A9.5 9.5 0 0 0 5.25 18.75"],
    ["p", "M18.75 5.25A9.5 9.5 0 0 1 18.75 18.75"]
  ],
  // A sum, for a formula: the sigma drawn with mitred corners.
  // A finish: a pennant on a staff, the cloth cut square.
  "flag": [["p", "M5.5 21V3.5"], ["p", "M5.5 4.5H18.5L15.5 9L18.5 13.5H5.5"]],
  "sigma": [["p", "M17.5 7V4.5H6.5L12.5 12L6.5 19.5H17.5V17"]]
} as const satisfies Record<string, ReadonlyArray<Node>>

/* ── exports, under the names call sites already use ─────────────────────────────────────────── */

export const ChevronDown = icon("ChevronDown", G["chevron-down"])
export const ChevronUp = icon("ChevronUp", G["chevron-up"])
export const ChevronLeft = icon("ChevronLeft", G["chevron-left"])
export const ChevronRight = icon("ChevronRight", G["chevron-right"])
export const ChevronsLeft = icon("ChevronsLeft", G["chevrons-left"])
export const ChevronsUpDown = icon("ChevronsUpDown", G["chevrons-up-down"])
export const ArrowRight = icon("ArrowRight", G["arrow-right"])
export const ArrowLeft = icon("ArrowLeft", G["arrow-left"])
export const ArrowUp = icon("ArrowUp", G["arrow-up"])
export const ArrowDown = icon("ArrowDown", G["arrow-down"])
export const ArrowUpRight = icon("ArrowUpRight", G["arrow-up-right"])
export const CornerDownLeft = icon("CornerDownLeft", G["corner-down-left"])
export const CircleArrowUp = icon("CircleArrowUp", G["circle-arrow-up"])
export const ExternalLink = icon("ExternalLink", G["external-link"])
export const Maximize2 = icon("Maximize2", G.maximize)
export const Undo2 = icon("Undo2", G.undo)
export const RotateCcw = icon("RotateCcw", G["rotate-ccw"])
export const RefreshCcw = icon("RefreshCcw", G.refresh)
export const LogOut = icon("LogOut", G["log-out"])

export const Check = icon("Check", G.check)
export const X = icon("X", G.x)
export const Plus = icon("Plus", G.plus)
export const Minus = icon("Minus", G.minus)
export const Slash = icon("Slash", G.slash)
export const Square = icon("Square", G.square)
export const Circle = icon("Circle", G.circle)
export const MoreHorizontal = icon("MoreHorizontal", G["more-horizontal"])
export const MoreVertical = icon("MoreVertical", G["more-vertical"])
export const GripVertical = icon("GripVertical", G["grip-vertical"])
export const Menu = icon("Menu", G.menu)
export const Hash = icon("Hash", G.hash)
export const Type = icon("Type", G.type)
export const AtSign = icon("AtSign", G["at-sign"])

export const CheckCircle2 = icon("CheckCircle2", G["circle-check"])
export const XCircle = icon("XCircle", G["circle-x"])
export const AlertTriangle = icon("AlertTriangle", G["triangle-alert"])
export const AlertOctagon = icon("AlertOctagon", G["octagon-alert"])
export const OctagonXIcon = icon("OctagonX", G["octagon-x"])
export const InfoIcon = icon("Info", G.info)
export const Loader = icon("Loader", G.loader)
export const Clock = icon("Clock", G.clock)

export const ShoppingBag = icon("ShoppingBag", G["shopping-bag"])
export const Box = icon("Box", G.box)
export const Package = icon("Package", G.package)
export const Boxes = icon("Boxes", G.boxes)
export const Truck = icon("Truck", G.truck)
export const Store = icon("Store", G.store)
export const CreditCard = icon("CreditCard", G["credit-card"])
export const Wallet = icon("Wallet", G.wallet)
export const Banknote = icon("Banknote", G.banknote)
export const Receipt = icon("Receipt", G.receipt)
export const PiggyBank = icon("PiggyBank", G["piggy-bank"])
export const Tag = icon("Tag", G.tag)
export const BadgePercent = icon("BadgePercent", G["badge-percent"])

export const Inbox = icon("Inbox", G.inbox)
export const Mail = icon("Mail", G.mail)
export const Send = icon("Send", G.send)
export const SendHorizontal = icon("SendHorizontal", G["send-horizontal"])
export const Reply = icon("Reply", G.reply)
export const MessageSquare = icon("MessageSquare", G["message-square"])
export const MessageSquareText = icon("MessageSquareText", G["message-square-text"])
export const MessageSquareQuote = icon("MessageSquareQuote", G["message-square-quote"])
export const MessagesSquare = icon("MessagesSquare", G["messages-square"])
export const MessageCircle = icon("MessageCircle", G["message-circle"])
export const Phone = icon("Phone", G.phone)
export const Video = icon("Video", G.video)
export const Bell = icon("Bell", G.bell)
export const BellRing = icon("BellRing", G["bell-ring"])
export const Megaphone = icon("Megaphone", G.megaphone)
export const Headphones = icon("Headphones", G.headphones)
export const Newspaper = icon("Newspaper", G.newspaper)

export const User = icon("User", G.user)
export const Users = icon("Users", G.users)
export const UserPlus = icon("UserPlus", G["user-plus"])
export const UserX = icon("UserX", G["user-x"])
export const UserSearch = icon("UserSearch", G["user-search"])
export const UserCog = icon("UserCog", G["user-cog"])
export const UserSquare = icon("UserSquare", G["user-square"])
export const Hand = icon("Hand", G.hand)
export const MousePointer2 = icon("MousePointer2", G["mouse-pointer"])
export const Smile = icon("Smile", G.smile)

export const Home = icon("Home", G.home)
export const LayoutDashboard = icon("LayoutDashboard", G["layout-dashboard"])
export const LayoutGrid = icon("LayoutGrid", G["layout-grid"])
export const Grid2x2 = icon("Grid2x2", G.grid)
export const LayoutList = icon("LayoutList", G["layout-list"])
export const LayoutTemplate = icon("LayoutTemplate", G["layout-template"])
export const List = icon("List", G.list)
export const ListFilter = icon("ListFilter", G["list-filter"])
export const Columns3 = icon("Columns3", G.columns)
export const PanelLeftClose = icon("PanelLeftClose", G["panel-left-close"])
export const PanelLeftOpen = icon("PanelLeftOpen", G["panel-left-open"])
export const Split = icon("Split", G.split)
export const Route = icon("Route", G.route)
export const GitMerge = icon("GitMerge", G["git-merge"])
export const Workflow = icon("Workflow", G.workflow)
export const Webhook = icon("Webhook", G.webhook)
export const Plug = icon("Plug", G.plug)
export const Database = icon("Database", G.database)
export const Folder = icon("Folder", G.folder)
export const Compass = icon("Compass", G.compass)
export const Globe = icon("Globe", G.globe)
export const Map = icon("Map", G.map)
export const MapPin = icon("MapPin", G["map-pin"])
export const Building = icon("Building", G.building)
export const Factory = icon("Factory", G.factory)
export const Briefcase = icon("Briefcase", G.briefcase)
export const Smartphone = icon("Smartphone", G.smartphone)
export const MonitorSmartphone = icon("MonitorSmartphone", G["monitor-smartphone"])
export const Anchor = icon("Anchor", G.anchor)
export const Diamond = icon("Diamond", G.diamond)
export const Hexagon = icon("Hexagon", G.hexagon)
export const Triangle = icon("Triangle", G.triangle)
export const Mountain = icon("Mountain", G.mountain)

export const Copy = icon("Copy", G.copy)
export const FileText = icon("FileText", G["file-text"])
export const ClipboardCheck = icon("ClipboardCheck", G["clipboard-check"])
export const BookOpen = icon("BookOpen", G["book-open"])
export const Image = icon("Image", G.image)
export const ImageOff = icon("ImageOff", G["image-off"])
export const Archive = icon("Archive", G.archive)
export const Download = icon("Download", G.download)
export const Upload = icon("Upload", G.upload)
export const DownloadCloud = icon("DownloadCloud", G["download-cloud"])
export const Save = icon("Save", G.save)
export const Printer = icon("Printer", G.printer)
export const Trash2 = icon("Trash2", G.trash)
export const Edit3 = icon("Edit3", G.pencil)
export const Link2 = icon("Link2", G.link)
export const Paperclip = icon("Paperclip", G.paperclip)
export const Pin = icon("Pin", G.pin)
export const PinOff = icon("PinOff", G["pin-off"])

export const Search = icon("Search", G.search)
export const Settings = icon("Settings", G.settings)
export const Filter = icon("Filter", G.filter)
export const Eye = icon("Eye", G.eye)
export const EyeOff = icon("EyeOff", G["eye-off"])
export const Lock = icon("Lock", G.lock)
export const Key = icon("Key", G.key)
export const Shield = icon("Shield", G.shield)
export const ShieldCheck = icon("ShieldCheck", G["shield-check"])
export const ShieldAlert = icon("ShieldAlert", G["shield-alert"])
export const Keyboard = icon("Keyboard", G.keyboard)
export const Calendar = icon("Calendar", G.calendar)
export const Sun = icon("Sun", G.sun)
export const Moon = icon("Moon", G.moon)
export const SunMoon = icon("SunMoon", G["sun-moon"])
export const Palette = icon("Palette", G.palette)
export const Play = icon("Play", G.play)
export const Pause = icon("Pause", G.pause)
export const Bold = icon("Bold", G.bold)
export const Italic = icon("Italic", G.italic)
export const Strikethrough = icon("Strikethrough", G.strikethrough)
export const Code = icon("Code", G.code)

export const Sparkles = icon("Sparkles", G.sparkles)
export const Sparkle = icon("Sparkle", G.sparkle)
export const Star = icon("Star", G.star)
export const Zap = icon("Zap", G.zap)
export const Flame = icon("Flame", G.flame)
export const Bot = icon("Bot", G.bot)
export const Rocket = icon("Rocket", G.rocket)
export const TrendingUp = icon("TrendingUp", G["trending-up"])
export const BarChart3 = icon("BarChart3", G["bar-chart"])
export const ChartLine = icon("ChartLine", G["line-chart"])
export const Ticket = icon("Ticket", G.ticket)
export const FlaskConical = icon("FlaskConical", G.flask)
export const GraduationCap = icon("GraduationCap", G["graduation-cap"])
export const Award = icon("Award", G.award)
export const Sheet = icon("Sheet", G.sheet)
export const Radio = icon("Radio", G.radio)
export const Sigma = icon("Sigma", G.sigma)
export const Flag = icon("Flag", G.flag)

/** Every glyph by its drawing name, for the contact sheet and the brand kit. */
export const glyphs: Readonly<Record<string, IconComponent>> = Object.fromEntries(
  Object.entries(G).map(([key, nodes]) => [key, icon(key, nodes)])
)
