import { durations, durationUse, easings, easingUse } from "@insyte/tokens/tokens"
import { Group, Section } from "./section.tsx"

/**
 * The curves and the clocks, with a specimen that actually runs on each.
 *
 * The animation is CSS, driven by the token's own custom property, so a specimen cannot drift from
 * the value beside it. The keyframes live in the host app's stylesheet because a package does not
 * own a stylesheet here; see `packages/ui/src/brand/kit.css`.
 */
export function Motion() {
  return (
    <Section
      id="motion"
      title="Motion"
      rule="Exponential ease-out, no bounce and no elastic. Motion shows where something came from; it is never the reason to look. Everything here freezes under a reduced-motion preference."
    >
      <Group title="Curves">
        <ul className="flex flex-col gap-px overflow-hidden rounded-lg bg-hairline">
          {Object.entries(easings).map(([name, value]) => (
            <li key={name} className="flex flex-col gap-2 bg-paper p-4">
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm text-ink">{easingUse[name as keyof typeof easings].name}</span>
                <span className="font-mono text-xs text-ink-3">--ease-{name}</span>
                <span className="font-mono text-xs text-ink-3">{value}</span>
              </span>
              <span className="text-sm text-ink-3">{easingUse[name as keyof typeof easings].use}</span>
              <span className="@container mt-1 block h-1.5 rounded-full bg-mist" aria-hidden>
                <span
                  className="block size-1.5 rounded-full bg-arc motion-safe:animate-[brand-travel_2.4s_infinite]"
                  style={{ animationTimingFunction: value }}
                />
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Clocks">
        <ul className="flex flex-col gap-px overflow-hidden rounded-lg bg-hairline">
          {Object.entries(durations).map(([name, value]) => (
            <li key={name} className="flex items-baseline gap-4 bg-paper px-4 py-3">
              <span className="w-16 shrink-0 text-sm text-ink">{name}</span>
              <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-ink-3">{value}ms</span>
              <span className="text-sm text-ink-3">{durationUse[name as keyof typeof durations]}</span>
            </li>
          ))}
        </ul>
        <p className="max-w-2xl text-sm text-ink-3">
          Five, and the last is not a sibling of the others: ambient is eighteen seconds because it describes the mesh
          drifting, which is a different kind of thing from a panel opening. It sits in the same list so that nothing
          invents a sixth value inline.
        </p>
      </Group>
    </Section>
  )
}
