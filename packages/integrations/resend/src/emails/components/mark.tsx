import { font, light, mix, type } from "../theme.ts"

/*
 * The Drift mark (`MarkDrift`, three offset squares, white on abyss), drawn with table cells rather than shipped as a
 * picture. Every stage sits behind Cloudflare Access until the cut-over, so a hosted file would not load for whoever
 * opens the mail; Gmail drops inline SVG and `data:` images, and an attached (cid) image shows as an attachment in some
 * clients. Cells with a background colour render in Gmail, Outlook (Word included) and Apple Mail, survive "images
 * off", and need no host.
 *
 * The geometry is the mark's own: squares at 2, 13 and 24 of 64, each 38 wide, so the edges fall at 2, 13, 24, 40, 51
 * and 62 and the drawing is a 5 × 5 grid. Each cell takes the colour of the squares over it, flattened over `abyss` the
 * way the SVG's opacities composite (0.2, then 0.5 over it, then the opaque front square). The front square is
 * `mesh-ink`, the brightest ink allowed on the blue, rather than white. Rounded corners do not survive Outlook, and at
 * 22px the steps are what reads.
 */

const BACK = mix("mesh-ink", "abyss", 0.2)
const OVERLAP = mix("mesh-ink", "abyss", 0.6)
const MIDDLE = mix("mesh-ink", "abyss", 0.5)
const FRONT = light["mesh-ink"]
const GROUND = light.abyss

const inside = (from: number, i: number, j: number) => i >= from && i <= from + 2 && j >= from && j <= from + 2

const cell = (i: number, j: number) => {
  if (inside(2, i, j)) return FRONT
  if (inside(1, i, j)) return inside(0, i, j) ? OVERLAP : MIDDLE
  if (inside(0, i, j)) return BACK
  return GROUND
}

/** Column and row sizes in px: the mark's 11 · 11 · 16 · 11 · 11 units at 22px. */
const STEPS = [4, 4, 6, 4, 4] as const

const pixel = (size: number, colour: string) => ({
  width: `${size}px`,
  height: `${size}px`,
  backgroundColor: colour,
  fontSize: "0",
  lineHeight: "0",
  padding: "0"
})

/** The mark on its `abyss` tile, as the console's rail draws it. */
const Mark = () => (
  <table
    role="presentation"
    aria-hidden="true"
    data-skip-in-text="true"
    cellPadding={0}
    cellSpacing={0}
    border={0}
    style={{ borderCollapse: "separate", backgroundColor: GROUND, borderRadius: "9px" }}
  >
    <tbody>
      <tr>
        <td style={{ padding: "6px", backgroundColor: GROUND, borderRadius: "9px" }}>
          <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: "collapse" }}>
            <tbody>
              {STEPS.map((height, i) => (
                <tr key={i}>
                  {STEPS.map((width, j) => (
                    <td
                      key={j}
                      width={width}
                      height={height}
                      {...{ bgcolor: cell(i, j) } as Record<string, string>}
                      style={{ ...pixel(width, cell(i, j)), height: `${height}px` }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
)

/** The mark beside "insyte" in the sans, lower case, medium: the console's sign-in lockup. */
export const Lockup = () => (
  <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
    <tbody>
      <tr>
        <td style={{ verticalAlign: "middle" }}>
          <Mark />
        </td>
        <td
          className="x-ink"
          style={{
            verticalAlign: "middle",
            paddingLeft: "10px",
            fontFamily: font.sans,
            ...type("lg"),
            fontWeight: 500,
            color: light.ink
          }}
        >
          insyte
        </td>
      </tr>
    </tbody>
  </table>
)
