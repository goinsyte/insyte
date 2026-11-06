import { fonts } from "@insyte/tokens/tokens"
import { Group, Section } from "./section.tsx"

/**
 * The two faces, and the one rule that decides between them.
 *
 * There is deliberately no third, and there is no longer a mono. The legacy system declared
 * `--font-display` and `--font-sans` as byte-identical stacks and applied a `.font-display` class
 * across every marketing page whose only effect was a letter-spacing nudge — a distinction that cost
 * a token and bought nothing. It also declared a mono face and reached for it 454 times, almost none
 * of them code or measurement.
 *
 * So the second face is a real second face now, with a job no sans can do, and the mono is gone
 * rather than restricted: a rule that says "only for figures" is a rule somebody argues with, and a
 * face that is not in the system is not available to argue about.
 */
export function Type() {
  return (
    <Section
      id="type"
      title="Type"
      rule="One sans for everything a person reads, and one narrow display face for the monumental figure and the plate numbers. Nothing else may use the second face, and there is no mono at all — figures line up because they are tabular."
    >
      <Group title="Sans">
        <p className="text-xs tabular-nums text-ink-3">{fonts.sans}</p>
        <p className="max-w-3xl font-sans text-3xl leading-tight tracking-tight text-ink">
          Insyte is where a dropshipping operator runs the day: orders, tickets, suppliers and chargebacks in one place.
        </p>
        <p className="max-w-2xl text-sm text-ink-3">
          General Sans leads the stack as a statement of intent, not as a loaded font: whether ITF's licence permits
          self-hosting is unresolved, so Inter is what actually loads and the fallback is metric-close enough that
          resolving it later does not reflow the page.
        </p>
      </Group>

      <Group title="Display">
        <p className="text-xs tabular-nums text-ink-3">{fonts.display}</p>
        <p
          className="text-[88px] text-ink"
          style={{
            fontFamily: "var(--font-display)",
            fontStretch: "88%",
            fontVariantNumeric: "tabular-nums lining-nums",
            letterSpacing: "-0.045em",
            lineHeight: "0.82"
          }}
        >
          1.284
        </p>
        <p className="max-w-2xl text-sm text-ink-3">
          Archivo, set narrow, because drafting lettering is monoline and slightly narrow — ISO 3098 is the reference,
          and the width axis is the reason this face was chosen over setting the sans larger. It appears twice in the
          product: the one figure a screen is about, and the number on a plate.
        </p>
      </Group>

      <Group title="Figures in a column">
        <table className="w-full max-w-md text-sm">
          <caption className="pb-2 text-left text-sm text-balance text-ink-3">
            Figures line up because they are tabular, not because they are monospaced. This is the whole argument for
            shipping no mono face.
          </caption>
          <tbody className="divide-y divide-hairline">
            {[["Open orders", "1.284"], ["Awaiting supplier", "97"], ["Chargebacks won", "11"]].map((
              [label, value]
            ) => (
              <tr key={label}>
                <th scope="row" className="py-2 pr-8 text-left font-normal text-ink-2">{label}</th>
                <td className="py-2 text-right tabular-nums text-ink">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Group>
    </Section>
  )
}
