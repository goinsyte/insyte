import { Colour } from "./colour.tsx"
import { Motion } from "./motion.tsx"
import { Shape } from "./shape.tsx"
import { Type } from "./type.tsx"

const sections = [
  ["colour", "Colour"],
  ["shape", "Shape"],
  ["type", "Type"],
  ["motion", "Motion"]
] as const

/**
 * The design system, as a page.
 *
 * Every value here is read from `@insyte/tokens`, which is the only reason this page is worth
 * having. The legacy repo maintained a 49-route brand book by hand, roughly sixteen thousand lines,
 * alongside a `design.json` describing a palette two generations old — and the stylesheet had moved
 * on from both. A document that can disagree with the system is worse than no document, because
 * people keep believing it.
 *
 * What is deliberately not here: voice, and the mark. `PRODUCT.md` is the authority on voice and
 * restating it here would create a second one. The mark is an open decision — the legacy repo ships
 * two, a three-square "Drift" field and a four-point star — and an open decision belongs on the
 * record, not on a specimen sheet.
 */
export function Brand() {
  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex max-w-5xl flex-col gap-20 px-6 py-16 sm:px-8">
        <header className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-medium tracking-tight text-ink">Insyte design system</h1>
            <p className="max-w-2xl leading-relaxed text-ink-2">
              Colour, shape, type and motion, read from{" "}
              <code className="font-mono text-sm">packages/tokens/src/tokens.ts</code>{" "}
              at build time. Nothing on this page is written down twice: if a value here is wrong, the system is wrong.
            </p>
          </div>
          <nav aria-label="Sections">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {sections.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-ink-3 underline-offset-4 hover:text-arc hover:underline">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main className="flex flex-col gap-20">
          <Colour />
          <Shape />
          <Type />
          <Motion />
        </main>

        <footer className="flex flex-col gap-2 border-t border-hairline pt-8 text-sm text-ink-3">
          <p>
            Voice, positioning and the evidence this product does and does not have are in{" "}
            <code className="font-mono text-xs">PRODUCT.md</code>. The mark is undecided: the legacy repo ships two.
          </p>
          <p>Private beta. Not a public page.</p>
        </footer>
      </div>
    </div>
  )
}
