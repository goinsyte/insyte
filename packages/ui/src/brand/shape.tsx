import { radiusScale } from "@insyte/tokens/css"
import { radius, radiusUse } from "@insyte/tokens/tokens"
import { Group, Section } from "./section.tsx"

/**
 * The radius ladder, and the Tailwind utility that reaches each rung.
 *
 * Both read from the tokens, including the mapping, because the legacy stylesheet shipped two
 * ladders at once — these five roles plus a seven-step Tailwind override — so `rounded-xl` and
 * `rounded-tile` were different sizes and nobody could say which was correct.
 */
/** Which Tailwind name reaches a role. The pill has none: `rounded-full` is Tailwind's own. */
const utilityFor = (role: string) => Object.entries(radiusScale).find(([, mapped]) => mapped === role)?.[0]

export function Shape() {
  return (
    <Section
      id="shape"
      title="Shape"
      rule="Five radii, one role each, and no sixth. The role is the decision; the pixel value follows from it. A uniform radius everywhere is how a page becomes the cover image for a UI kit."
    >
      <Group title="Roles">
        <ul className="flex flex-col gap-px overflow-hidden rounded-lg bg-hairline">
          {Object.entries(radius).map(([name, value]) => {
            const utility = utilityFor(name)

            return (
              <li key={name} className="flex items-center gap-4 bg-paper p-4">
                <span
                  className="size-12 shrink-0 bg-arc-tint ring-1 ring-arc-soft ring-inset"
                  style={{ borderRadius: value }}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm text-ink">{name}</span>
                    <span className="font-mono text-xs tabular-nums text-ink-3">{value}</span>
                  </span>
                  <span className="text-sm text-ink-3">{radiusUse[name as keyof typeof radius]}</span>
                </span>
                <span className="ml-auto shrink-0 font-mono text-xs text-ink-3">
                  {utility === undefined ? "rounded-full" : `rounded-${utility}`}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="max-w-2xl text-sm text-ink-3">
          Tailwind's scale is mapped onto the roles rather than sitting beside them, so there is one ladder with two
          sets of names. Anything above <code className="font-mono text-xs">rounded-xl</code>{" "}
          resolves to a Tailwind default this system never chose, and the component tests fail on it.
        </p>
      </Group>
    </Section>
  )
}
