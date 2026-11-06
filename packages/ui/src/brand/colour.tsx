import { contrast, isInGamut, oklchToHex } from "@insyte/tokens/color"
import { slots } from "@insyte/tokens/css"
import { colors, families, pairs } from "@insyte/tokens/tokens"
import { Group, Section } from "./section.tsx"

/**
 * Every colour the system ships, grouped by what it is for, with the value it actually paints.
 *
 * Read from `@insyte/tokens` rather than described beside it. A palette page maintained by hand is
 * wrong the first time somebody changes a colour, and then it is worse than no page because people
 * still believe it — which the legacy brand book demonstrated across nineteen marks and a
 * two-generations-stale palette.
 *
 * It is also the check made visible: each swatch shows the hex an email client would receive and
 * whether the colour survives sRGB. Eight of the legacy palette's twenty-six did not.
 */
export function Colour() {
  return (
    <Section
      id="colour"
      title="Colour"
      rule="A true-neutral canvas with one committed hue. The ink ramp is chroma 0, so the only colour in the system is the brand — and status, which is the one place colour carries meaning rather than emphasis."
    >
      {families.map((family) => (
        <Group key={family.name} title={family.name}>
          <p className="max-w-2xl text-sm text-ink-3">{family.use}</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {family.members.map((name) => (
              <li key={name} className="flex items-center gap-3 rounded-lg bg-paper p-3 ring-1 ring-hairline">
                <span
                  className="size-10 shrink-0 rounded-md ring-1 ring-hairline ring-inset"
                  style={{ background: colors[name] }}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-ink">{name}</span>
                  <span className="font-mono text-xs text-ink-3">{colors[name]}</span>
                  <span className="font-mono text-xs text-ink-3">
                    {oklchToHex(colors[name])}
                    {!isInGamut(colors[name]) && <span className="text-signal-red">· outside sRGB</span>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Group>
      ))}

      <Group title="Pairs">
        <p className="max-w-2xl text-sm text-ink-3">
          Which ink goes on which surface, and the measured contrast. A surface absent from this list is a surface
          nothing may put text on — which is the point of the atmosphere colours. The floor is 4.5:1, including for the
          status inks, because a status is always small text.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pairs.map(([surface, ink]) => (
            <li
              key={`${surface}/${ink}`}
              className="flex items-baseline justify-between gap-3 rounded-lg p-4 text-sm ring-1 ring-hairline"
              style={{ background: colors[surface], color: colors[ink] }}
            >
              <span>
                {surface} <span className="opacity-70">/ {ink}</span>
              </span>
              <span className="font-mono text-xs tabular-nums">
                {contrast(colors[surface], colors[ink]).toFixed(2)}:1
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="shadcn slots">
        <p className="max-w-2xl text-sm text-ink-3">
          Where the primitives look. These are pointers, not values: one colour with several names for where it is used,
          which is what kept the legacy stylesheet's four copies of each value from agreeing. Note that{" "}
          <code className="font-mono text-xs">accent</code>{" "}
          is a hover background in shadcn's vocabulary, so it points at the informational tint and never at the brand
          hue.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(slots).map(([slot, token]) => (
            <li
              key={slot}
              className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2 ring-1 ring-hairline"
            >
              <span className="font-mono text-xs text-ink-2">--{slot}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink-3">{token}</span>
                <span
                  className="size-4 shrink-0 rounded-sm ring-1 ring-hairline ring-inset"
                  style={{ background: colors[token] }}
                  aria-hidden
                />
              </span>
            </li>
          ))}
        </ul>
      </Group>
    </Section>
  )
}
