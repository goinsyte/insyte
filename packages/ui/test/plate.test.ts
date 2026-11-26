import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router"
import { createElement, type FunctionComponent, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

/** `data-source`'s, restated: its own imports are the bundler's too. */
interface Plate {
  number: string
  heading: string
  body: string
  dimension: string
  before: { label: string; value: string }
  after: { label: string; value: string }
  change: string
  witness: string
  state: string
  confidence: string
  fileLabel: string
  filed?: string | undefined
}

// Loaded the way `console-screens.test.ts` loads screens: the screens' own imports are written for the bundler.
const view = "../src/app/dashboard/plate.tsx"
const { PlateView } = (await import(/* @vite-ignore */ view)) as {
  PlateView: FunctionComponent<{
    plate: Plate
    drawing: number
    phase: "drawn" | "filed" | "discarded"
    onFile: () => void
    onRedraw: () => void
    onDiscard: () => void
  }>
}

const noop = () => {}
const plate: Plate = {
  number: "R-1003",
  heading: "De klant weet nog niet dat de bestelling later komt",
  body: "De vervoerder verwacht het pakket donderdag.",
  dimension: "nog 4u 10m",
  before: { label: "Nu", value: "Geen bericht aan de klant" },
  after: { label: "Getekend", value: "Mail aan klant@example.com" },
  change: "Mail aan de klant",
  witness: "Testwinkel",
  state: "getekend, niet uitgevoerd",
  confidence: "zekerheid hoog",
  fileLabel: "Versturen zoals getekend"
}
const filed = (p: Plate) =>
  renderToStaticMarkup(
    createElement(PlateView, { plate: p, drawing: 1, phase: "filed", onFile: noop, onRedraw: noop, onDiscard: noop })
  )

/*
 * The stamp says what is true at the moment it lands (12.2b): a mail still inside its undo window has not gone, so its
 * plate is stamped "Wordt verstuurd…", the way the design says a mail on its way everywhere else. Anything filing does
 * at once is stamped "Uitgevoerd".
 */
describe("the plate's stamp", () => {
  it("says Uitgevoerd for a change filing made at once", () => {
    const html = filed(plate)
    expect(html).toContain(">Uitgevoerd<")
    expect(html).toContain("uitgevoerd ·")
  })

  it("says Wordt verstuurd… for a mail waiting out its undo window", () => {
    const html = filed({ ...plate, filed: "Wordt verstuurd…" })
    expect(html).toContain(">Wordt verstuurd…<")
    expect(html).toContain("wordt verstuurd… ·")
    expect(html).not.toMatch(/uitgevoerd/i)
  })
})

const { PlateEmpty } = (await import(/* @vite-ignore */ view)) as {
  PlateEmpty: FunctionComponent<{
    onDismiss: () => void
    settling: boolean
    open?: { to: string; search?: Record<string, string>; next: string } | undefined
  }>
}

/** Its "Openen" is a router link: rendered inside a router, as the console does. */
const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() })
const routed = (el: ReactElement) =>
  renderToStaticMarkup(createElement(RouterContextProvider, { router, children: el }))

/*
 * A row Insyte draws no plate for (a store's sync that fails, a leg not sent) is not a dead end: the empty plate says the
 * next step and opens the record where it is handled.
 */
describe("the empty plate", () => {
  it("says the next step and opens the row's record", () => {
    const html = routed(
      createElement(PlateEmpty, {
        onDismiss: noop,
        settling: false,
        open: { to: "/orders/ord_1", next: "Stuur de bestelling opnieuw door." }
      })
    )
    expect(html).toContain("Stuur de bestelling opnieuw door.")
    expect(html).toMatch(/<a [^>]*href="\/orders\/ord_1"[^>]*>Openen<\/a>/)
    expect(html).toContain("Markeren als gezien")
  })

  it("only offers to mark it seen where the host knows no record, or once it is set aside", () => {
    expect(routed(createElement(PlateEmpty, { onDismiss: noop, settling: false }))).not.toContain("Openen")
    const settled = routed(
      createElement(PlateEmpty, { onDismiss: noop, settling: true, open: { to: "/orders/ord_1", next: "Volgende." } })
    )
    expect(settled).toContain("Opzijgezet.")
    expect(settled).not.toContain("Openen")
  })
})
