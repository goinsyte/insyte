import { useLayoutEffect, useState } from "react"
import type { RefObject } from "react"
import { useTheme } from "../../ui/theme.ts"

/*
 * Reading the tokens back from the page, so the kit never writes a colour down: what a swatch shows
 * and what a contrast badge measures is what `tokens.css` resolves to here, in this theme.
 */

let canvas: CanvasRenderingContext2D | null = null

/** Any CSS colour to 8-bit sRGB, through a 1px canvas (the browser does the colour maths). */
function rgb(css: string): readonly [number, number, number] {
  canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (canvas === null) return [0, 0, 0]
  canvas.clearRect(0, 0, 1, 1)
  canvas.fillStyle = "#000"
  canvas.fillStyle = css
  canvas.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = canvas.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: readonly [number, number, number]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

/** WCAG contrast between two CSS colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(rgb(a))
  const lb = luminance(rgb(b))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** A token's resolved colour at `element`: painted on a probe inside it and read back. */
export function resolve(element: HTMLElement, token: string): string {
  const probe = document.createElement("span")
  probe.style.color = `var(--color-${token})`
  probe.style.display = "none"
  element.appendChild(probe)
  const value = getComputedStyle(probe).color
  probe.remove()
  return value
}

/** Resolves `tokens` inside `ref` and again whenever the theme changes. */
export function useResolved(ref: RefObject<HTMLElement | null>, tokens: ReadonlyArray<string>) {
  const { accent, mode } = useTheme()
  const [values, setValues] = useState<Readonly<Record<string, string>>>({})
  const key = tokens.join(",")
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    setValues(Object.fromEntries(key.split(",").map((t) => [t, resolve(element, t)])))
  }, [ref, key, accent, mode])
  return values
}

/** "oklch(0.52 0.2 268)" shortened to its three numbers, for a swatch's caption. */
export function shortColour(value: string | undefined): string {
  if (value === undefined) return ""
  const m = /oklch\(([^)]+)\)/.exec(value)
  if (m === null) return value
  return (m[1] ?? "")
    .split(/\s+/)
    .slice(0, 3)
    .map((n) => {
      const x = Number(n)
      return Number.isFinite(x) ? String(Math.round(x * 1000) / 1000) : n
    })
    .join(" ")
}
