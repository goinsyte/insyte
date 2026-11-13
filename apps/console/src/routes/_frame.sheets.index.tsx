import { SheetsPage, type SheetsSearch } from "@insyte/ui/app/sheets/sheets-screen"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { sheetsAtom } from "../data/sheets.ts"
import { SheetsGate } from "../sheets/sheets-gate.tsx"

/**
 * Rekenbladen (step 16.4, M14 step 4): the reference's list over `Sheets.list`, in the frame. The loader reads the
 * reader's sheets on the server; the figures their previews read follow in the browser. The panel's views and folders
 * cut the list here, as in the reference.
 */
export const Route = createFileRoute("/_frame/sheets/")({
  head: () => ({ meta: [{ title: "Rekenbladen · Insyte" }] }),
  validateSearch: (s: Record<string, unknown>): SheetsSearch => ({
    view: typeof s["view"] === "string" ? s["view"] : undefined,
    folder: typeof s["folder"] === "string" ? s["folder"] : undefined
  }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(sheetsAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, sheetsAtom)))
  },
  component: SheetsRoute
})

function SheetsRoute() {
  return (
    <SheetsGate kind="cards" title="Rekenbladen">
      <SheetsPage />
    </SheetsGate>
  )
}
