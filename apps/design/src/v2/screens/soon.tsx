import { ASSISTANT } from "../assistant.ts"
import { paths } from "../router.tsx"
import { sectionLabel } from "../shell/sections.ts"
import { ButtonLink } from "../ui/button.tsx"
import { ArrowLeft } from "../ui/icons.tsx"

const BUILT = [
  { label: "Start", to: paths.home },
  { label: `${ASSISTANT}`, to: paths.chat("terugbetalingen") },
  { label: "Een agent", to: paths.agent("waar-is-mijn-bestelling") },
  { label: "Analyse", to: paths.board("week") },
  { label: "Live", to: paths.live },
  { label: "Onderdelen", to: paths.parts }
] as const

/**
 * A page this version has not drawn yet. Says so plainly and points at what is drawn, rather than
 * pretending with an empty screen.
 */
export function SoonScreen({ section, page }: { readonly section: string; readonly page: string | null }) {
  const label = sectionLabel(section)
  return (
    <div className="pane-scroll flex flex-1 items-start justify-center px-6 py-16 sm:py-24">
      <div className="flex max-w-md flex-col gap-4">
        <h1 className="text-xl font-semibold text-ink">
          {label}
          {page === null ? "" : <span className="font-normal text-ink-3">· {page.replaceAll("-", " ")}</span>}
        </h1>
        <p className="text-base text-ink-2">
          Dit scherm is nog niet ontworpen in versie 2. De shell met de werkdraad is er wel, net als deze schermen:
        </p>
        <ul className="flex flex-wrap gap-2">
          {BUILT.map((item) => (
            <li key={item.to}>
              <ButtonLink to={item.to} size="sm">{item.label}</ButtonLink>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mt-2 flex items-center gap-1.5 self-start text-sm text-ink-3 hover:text-ink"
        >
          <ArrowLeft size={15} />
          Terug
        </button>
      </div>
    </div>
  )
}
