/**
 * The colour arithmetic the brand exploration needs: OKLCH values as numbers (so a contrast ratio can
 * be computed rather than eyeballed), their CSS and hex spellings, and a mix.
 *
 * The conversion is Björn Ottosson's OKLab → linear sRGB, then the WCAG 2.1 relative luminance. A
 * value outside sRGB is clamped per channel, which is what a browser paints on an sRGB screen.
 */

export type Okl = readonly [l: number, c: number, h: number]

/** The v2 surfaces a brand colour has to hold on, mirrored from `tokens.css`. */
export const WHITE: Okl = [1, 0, 0]
export const PANEL: Okl = [0.977, 0.002, 95]
export const INK: Okl = [0.225, 0.006, 250]
export const RAIL: Okl = [0.215, 0.007, 245]

export const css = ([l, c, h]: Okl): string => `oklch(${l} ${c} ${h})`

const clamp = (v: number) => Math.min(1, Math.max(0, v))
const round = (v: number) => Math.round(v * 1000) / 1000
const encode = (v: number) => {
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(clamp(s) * 255).toString(16).padStart(2, "0")
}

function linear([l, c, h]: Okl): readonly [number, number, number] {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    clamp(4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1),
    clamp(-1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1),
    clamp(-0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1)
  ]
}

function luminance(color: Okl): number {
  const [r, g, b] = linear(color)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: Okl, b: Okl): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export function hex(color: Okl): string {
  return `#${linear(color).map(encode).join("")}`
}

/** A point between two colours in OKLCH, hue the short way round. */
export function mix(a: Okl, b: Okl, t = 0.5): Okl {
  let dh = b[2] - a[2]
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  return [round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t), round((a[2] + dh * t + 360) % 360)]
}

/**
 * The same hue, lighter, until it stands 2.2:1 off a dark ground: how a mark's darkest tones (indigo,
 * plum, petrol, graphite) stay visible on dark instead of sinking into it. Light tones pass unchanged.
 */
export function lift(color: Okl, ground: Okl = RAIL, min = 2.2): Okl {
  let next = color
  while (contrast(next, ground) < min && next[0] < 0.9) next = [round(next[0] + 0.02), next[1], next[2]]
  return next
}

/** Eight petals from four stops: each stop, then the midpoint to the next, round the flower. */
export function ring(stops: readonly [Okl, Okl, Okl, Okl]): ReadonlyArray<Okl> {
  return stops.flatMap((stop, i) => [stop, mix(stop, stops[(i + 1) % 4] ?? stop)])
}
