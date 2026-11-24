import { useEffect, useRef, useState } from "react"
import { cx } from "../../ui/cx.ts"
import { Search } from "../../ui/icons.tsx"
import { ThemePicker } from "../../ui/theme-picker.tsx"
import { Actions } from "./actions.tsx"
import { Ai } from "./ai.tsx"
import { Charts } from "./charts.tsx"
import { DataDisplay } from "./data.tsx"
import { Feedback } from "./feedback.tsx"
import { Foundations } from "./foundations.tsx"
import { Inputs } from "./inputs.tsx"
import { Navigation } from "./navigation.tsx"
import { Overlays } from "./overlays.tsx"
import { Pages } from "./pages.tsx"
import { Variants } from "./variants.tsx"

/** The kit's chapters, in reading order, with the spreads each holds (for the index and the search). */
const SECTIONS = [
  {
    id: "fundamenten",
    label: "Fundamenten",
    items: [
      ["kleur", "Kleur"],
      ["themas", "Accentthema's"],
      ["kleur-magnus", "Het verloop van Magnus"],
      ["type", "Typografie"],
      ["ruimte", "Ruimte"],
      ["radius", "Rondingen"],
      ["schaduw", "Schaduw"],
      ["beweging", "Beweging"],
      ["iconen", "Iconen"]
    ]
  },
  {
    id: "acties",
    label: "Acties",
    items: [["button", "Knop"], ["icon-button", "Icoonknop"], ["button-link", "Knoplink"], ["chip", "Vervolgstap"]]
  },
  {
    id: "invoer",
    label: "Invoer",
    items: [
      ["input", "Tekstveld"],
      ["field", "Veld met label"],
      ["textarea", "Tekstvak en keuzelijst"],
      ["search-field", "Zoekveld"],
      ["checkbox", "Vinkje en keuzerondje"],
      ["toggle", "Schakelaar"],
      ["segmented", "Gesegmenteerde keuze"],
      ["settings", "Instellingen"],
      ["period", "Periode"],
      ["file-drop", "Bestanden"],
      ["form", "Een formulier"]
    ]
  },
  {
    id: "navigatie",
    label: "Navigatie",
    items: [
      ["rail", "Icoonbalk en winkelkiezer"],
      ["menu", "Menu"],
      ["werkdraad", "Werkdraad"],
      ["tabs", "Tabs"],
      ["breadcrumbs", "Kruimelpad"],
      ["pagination", "Pagina's"],
      ["dropdown", "Menu met acties"]
    ]
  },
  {
    id: "data",
    label: "Data",
    items: [
      ["table", "Tabel"],
      ["table-states", "Staten van een regel"],
      ["list", "Lijst"],
      ["key-value", "Kenmerken"],
      ["stat", "Getal"],
      ["badge", "Tags, status en tellingen"],
      ["avatar", "Avatars"],
      ["timeline", "Tijdlijn"],
      ["stepper", "Stappen"],
      ["accordion", "Inklappen"],
      ["card", "Kaart"]
    ]
  },
  {
    id: "grafieken",
    label: "Grafieken",
    items: [
      ["block-figures", "Kerncijfers"],
      ["block-line", "Lijn"],
      ["block-rank", "Rangorde"],
      ["block-bar", "Staaf"],
      ["block-funnel", "Trechter"],
      ["block-table", "Tabel in een blok"],
      ["block-states", "Laden, leeg en fout"]
    ]
  },
  {
    id: "feedback",
    label: "Feedback",
    items: [
      ["toast", "Melding"],
      ["notice", "Bericht in de pagina"],
      ["states", "Leeg en fout"],
      ["access", "Geen toegang"],
      ["skeleton", "Laden"],
      ["progress", "Voortgang"]
    ]
  },
  {
    id: "paginas",
    label: "Pagina's",
    items: [["page", "Kop, cijfers en zijkolom"], ["record-states", "Laden en falen"], ["acts", "Kleine handelingen"], [
      "qr",
      "QR-code"
    ]]
  },
  {
    id: "overlays",
    label: "Overlays",
    items: [
      ["dialog", "Dialoog"],
      ["alert-dialog", "Bevestigen"],
      ["sheet", "Sheet"],
      ["popover", "Popover"],
      ["menu-live", "Menu, werkend"],
      ["tooltip", "Tooltip"],
      ["command", "Palet"]
    ]
  },
  {
    id: "ai",
    label: "Magnus",
    items: [["composer", "Composer"], ["message", "Gesprek"], ["proposal", "Voorstel"], [
      "chart-card",
      "Grafiek in een gesprek"
    ], ["agent-avatar", "Magnus en de agents"]]
  },
  { id: "varianten", label: "Varianten", items: [["variants", "Varianten"]] }
] as const

const SPREADS: ReadonlyArray<readonly [string, string, string]> = SECTIONS.flatMap((s) =>
  s.items.map(([id, label]) => [id, label, s.label] as const)
)

/** Which section the reader is in: the last section head that has scrolled past the top third. */
function useCurrentSection(root: React.RefObject<HTMLDivElement | null>) {
  const [current, setCurrent] = useState<string>(SECTIONS[0].id)
  useEffect(() => {
    const scroller = root.current
    if (scroller === null) return
    const onScroll = () => {
      const top = scroller.getBoundingClientRect().top + scroller.clientHeight / 3
      let id: string = SECTIONS[0].id
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id)
        if (el !== null && el.getBoundingClientRect().top <= top) id = s.id
      }
      setCurrent(id)
    }
    onScroll()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => scroller.removeEventListener("scroll", onScroll)
  }, [root])
  return current
}

/**
 * Scrolls the kit's own pane to an anchor, under the sticky index. A plain `#anchor` or
 * `scrollIntoView` would also scroll every ancestor, the app frame with its main bar included.
 */
function jumpTo(id: string, scroller: HTMLElement | null, smooth = true) {
  const target = document.getElementById(id)
  if (target === null || scroller === null) return
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 72
  scroller.scrollTo({
    top: Math.max(0, top),
    behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto"
  })
  history.replaceState(null, "", `#${id}`)
}

/**
 * The spread a search names: its Dutch title, then a code name from its caption (`Button`,
 * `AgentAvatar`), then the first title that starts with or contains the text.
 */
function findSpread(text: string): string | undefined {
  const q = text.trim().toLowerCase()
  if (q === "") return undefined
  const exact = SPREADS.find(([, label]) => label.toLowerCase() === q)
  if (exact !== undefined) return exact[0]
  const named = SPREADS.find(([id]) =>
    (document.getElementById(`${id}-code`)?.textContent ?? "")
      .split(/[\s·,]+/)
      .some((word) => word.toLowerCase() === q)
  )
  if (named !== undefined) return named[0]
  return (SPREADS.find(([, label]) => label.toLowerCase().startsWith(q))
    ?? SPREADS.find(([, label]) => label.toLowerCase().includes(q)))?.[0]
}

/**
 * Jumps to a spread from the index's search field: on Enter or when a suggestion is picked, never
 * while typing, so "Menu met" does not land on "Menu" halfway. A miss says so.
 */
function SpreadSearch({ scroller }: { readonly scroller: React.RefObject<HTMLDivElement | null> }) {
  const [value, setValue] = useState("")
  const [miss, setMiss] = useState(false)
  const listId = "kit-onderdelen"
  const go = (text: string) => {
    const id = findSpread(text)
    setMiss(id === undefined && text.trim() !== "")
    if (id === undefined) return
    setValue("")
    // After the field has settled, or the datalist's closing cancels the scroll.
    requestAnimationFrame(() => jumpTo(id, scroller.current, false))
  }
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <label className="relative flex w-full items-center sm:w-56">
        <span className="sr-only">Zoek een onderdeel</span>
        <Search size={14} className="pointer-events-none absolute left-2.5 text-ink-3" />
        <input
          list={listId}
          value={value}
          aria-describedby="kit-zoek-uitslag"
          onChange={(event) => {
            setValue(event.target.value)
            setMiss(false)
            const native = event.nativeEvent as InputEvent
            if (native.inputType === "insertReplacementText" || native.inputType === undefined) {
              if (SPREADS.some(([, label]) => label === event.target.value)) go(event.target.value)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") go(value)
          }}
          placeholder="Zoek een onderdeel of codenaam"
          className="h-8 w-full rounded-sm bg-canvas pr-2 pl-8 text-sm text-ink ring-1 ring-line-strong ring-inset outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent"
        />
        <datalist id={listId}>
          {SPREADS.map(([id, label, chapter]) => <option key={id} value={label}>{chapter}</option>)}
        </datalist>
      </label>
      <p id="kit-zoek-uitslag" aria-live="polite" className={cx("text-xs text-bad-ink", !miss && "sr-only")}>
        {miss ? "Geen onderdeel gevonden" : ""}
      </p>
    </div>
  )
}

/**
 * Onderdelen: the UI kit of version 2, set as a book. A cover with the title in two tones and a
 * title block; a sticky index of the chapters; each chapter opened by its title and lede; each
 * component a spread. Hover, focus and pressed are drawn, not waited for, in every accent theme.
 * A new screen starts here: take the pieces, do not draw new ones.
 */
export function KitScreen() {
  const scroller = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLOListElement>(null)
  const current = useCurrentSection(scroller)
  const total = SPREADS.length

  // Keep the current chapter's link in view in the index strip, without moving the page.
  useEffect(() => {
    const box = strip.current
    const link = box?.querySelector<HTMLElement>(`[data-chapter="${current}"]`)
    if (box == null || link == null) return
    const left = link.offsetLeft - 16
    const right = link.offsetLeft + link.offsetWidth + 16
    if (left < box.scrollLeft) box.scrollLeft = left
    else if (right > box.scrollLeft + box.clientWidth) box.scrollLeft = right - box.clientWidth
  }, [current])

  return (
    <div
      ref={scroller}
      className="pane-scroll flex-1"
      onClickCapture={(event) => {
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='#']")
        if (link === null || event.metaKey || event.ctrlKey) return
        event.preventDefault()
        jumpTo(link.getAttribute("href")?.slice(1) ?? "", scroller.current)
      }}
    >
      <nav
        aria-label="Hoofdstukken van de kit"
        className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur-sm"
      >
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:gap-6 sm:px-8">
          <ol
            ref={strip}
            className="no-scrollbar relative -mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1"
          >
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#${s.id}`}
                  data-chapter={s.id}
                  aria-current={current === s.id ? "location" : undefined}
                  className={cx(
                    "relative inline-flex h-8 items-center px-2 text-sm whitespace-nowrap",
                    current === s.id
                      ? "font-medium text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-ink"
                      : "text-ink-3 hover:text-ink"
                  )}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
          <SpreadSearch scroller={scroller} />
        </div>
      </nav>

      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-20 px-4 pt-10 pb-16 sm:px-8 sm:pt-14">
        <header className="flex flex-col gap-10">
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
            <h1 className="text-3xl font-semibold text-balance text-ink sm:text-4xl">
              Onderdelen
              <span className="block text-ink-3">Waar versie 2 van gemaakt is.</span>
            </h1>
            <div className="flex flex-col gap-6">
              <p className="max-w-[48ch] text-md text-pretty text-ink-2">
                Elk gedeeld onderdeel: waar het voor is, hoe het is opgebouwd, wanneer je het gebruikt en wanneer niet,
                en hoe het eruitziet in elke staat. Een nieuw scherm begint hier: pak de onderdelen, teken geen nieuwe.
              </p>
              <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
                {[
                  ["Hoofdstukken", String(SECTIONS.length)],
                  ["Onderdelen", String(total)],
                  ["Map", "src/v2/ui"],
                  ["Bijgewerkt", "23 nov 2026"]
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex flex-col gap-1 pt-3 pb-1"
                  >
                    <dt className="text-xs text-ink-3">{label}</dt>
                    <dd className="figure text-sm text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-xl bg-panel px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[56ch] text-sm text-pretty text-ink-2">
              <span className="font-medium text-ink">Thema.</span>{" "}
              Geldt voor de hele app en blijft bewaard. Status en het verloop van Magnus wisselen niet mee.
            </p>
            <ThemePicker />
          </div>
        </header>

        <Foundations />
        <Actions />
        <Inputs />
        <Navigation />
        <DataDisplay />
        <Charts />
        <Feedback />
        <Pages />
        <Overlays />
        <Ai />
        <Variants />

        <footer className="grid grid-cols-1 gap-6 pt-6 text-sm text-ink-2 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <p className="max-w-[56ch] text-pretty">
            Wat hier niet staat, is nog geen onderdeel. Heeft een scherm iets nodig dat ontbreekt, dan komt het eerst
            hier, met zijn staten, en pas daarna in het scherm.
          </p>
          <div className="flex flex-col gap-1 text-xs text-ink-3">
            <span>Onderdelen: src/v2/ui · Grafieken: src/v2/charts · Tokens: src/v2/tokens.css</span>
            <a href="#fundamenten" className="w-fit text-ink-2 underline underline-offset-2 hover:text-ink">
              Terug naar het begin
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
