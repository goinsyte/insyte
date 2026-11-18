import { useAtomSet } from "@effect/atom-react"
import type { TrashKind, TrashList } from "@insyte/modules/trash/domain/Trash"
import type { TrashItem } from "@insyte/ui/app/lib/settings-depth"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { TrashSource } from "@insyte/ui/app/settings/trash-source"
import { Exit } from "effect"
import { useState } from "react"
import { AUTOMATIONS } from "../data/automations.ts"
import { COSTS } from "../data/costs.ts"
import { COURSES } from "../data/courses.ts"
import { TRASH, trashWrites } from "../data/settings-log.ts"
import { SHEETS } from "../data/sheets.ts"
import { SUPPLIERS } from "../data/suppliers.ts"
import { TICKETS } from "../data/tickets.ts"
import { WEBHOOKS } from "../data/webhooks.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The Prullenbak over `Trash.*` (M17 step 20.1a). An item put back or purged leaves the list at once; one that did not
 * take comes back with the server's reason. Terugzetten is each kind's own put-back, so its Ongedaan maken spends that
 * kind's undo, which puts the item in the trash again. Purging and emptying were asked by the page and have no undo.
 */

/** The design's word for each kind the server holds. */
const KIND: Record<TrashKind, TrashItem["kind"]> = {
  ticket: "ticket",
  automation: "automatisering",
  sheet: "rekenblad",
  course: "cursus",
  webhook: "webhook",
  cost_line: "kostenpost",
  supplier: "leverancier"
}

/** What an item without a title is called, as its own page calls it. */
const UNTITLED: Partial<Record<TrashKind, string>> = { course: "Naamloze cursus", sheet: "Naamloos rekenblad" }

const LATE: [string, string] = [
  "Te laat om ongedaan te maken",
  "Het staat weer op zijn plek. Verwijder het opnieuw als dat de bedoeling was."
]

const COPY: RefusalCopy = {
  gone: "Dat staat niet meer in de prullenbak",
  conflicts: {
    expired: LATE,
    already_sent: LATE,
    store_gone: ["Kan niet terug", "Een winkel van dit endpoint is niet meer gekoppeld. Maak het opnieuw aan."],
    out_of_reach: ["Kan niet terug", "Dit endpoint hoort ook bij winkels waar je rol niet bij kan."],
    url_refused: ["Kan niet terug", "Naar dit adres stuurt Insyte geen events meer. Maak het opnieuw aan."],
    name_taken: ["Kan niet terug", "Een andere leverancier heeft deze naam nu. Geef die eerst een andere naam."]
  }
}

const keys = {
  reactivityKeys: [...TRASH, ...TICKETS, ...AUTOMATIONS, ...SHEETS, ...COURSES, ...WEBHOOKS, ...COSTS, ...SUPPLIERS]
}

export function useConsoleTrashSource(list: TrashList, canEdit: boolean): TrashSource {
  const write = {
    restore: useAtomSet(trashWrites.restore, { mode: "promiseExit" }),
    purge: useAtomSet(trashWrites.purge, { mode: "promiseExit" }),
    empty: useAtomSet(trashWrites.empty, { mode: "promiseExit" }),
    undo: useAtomSet(trashWrites.undo, { mode: "promiseExit" })
  }
  // Put back or purged here: gone from the list before the refetch arrives.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const hide = (ids: ReadonlyArray<string>) => setHidden((h) => new Set([...h, ...ids]))
  const show = (ids: ReadonlyArray<string>) => setHidden((h) => new Set([...h].filter((id) => !ids.includes(id))))

  const items = list.items.filter((i) => !hidden.has(i.id)).map((i): TrashItem => ({
    id: i.id,
    kind: KIND[i.kind],
    title: i.title.trim() === "" ? UNTITLED[i.kind] ?? "Zonder titel" : i.title,
    by: i.deletedBy ?? "iemand",
    at: new Date(i.deletedAt).toISOString(),
    // Removed before its kind joined the trash: its 30 days run from then (0101).
    purgeAt: new Date(i.purgeAt).toISOString()
  }))

  return {
    items,
    canEdit,
    restore: (picked) => {
      const ids = picked.map((i) => i.id)
      hide(ids)
      void write.restore({ payload: { ids }, ...keys }).then((exit) => {
        if (Exit.isFailure(exit)) {
          show(ids)
          return void sayRefusal(failureOf(exit), COPY)
        }
        const tokens = exit.value.undo
        undoable(
          picked.length === 1 ? `“${picked[0]!.title}” teruggezet` : `${picked.length} items teruggezet`,
          () => {
            show(ids)
            for (const ticket of tokens) {
              void write.undo({ payload: { token: ticket.token }, ...keys }).then((undone) => {
                if (Exit.isFailure(undone)) sayRefusal(failureOf(undone), COPY)
              })
            }
          },
          "Het staat weer waar het stond."
        )
      })
    },
    purge: (picked) => {
      const ids = picked.map((i) => i.id)
      hide(ids)
      void write.purge({ payload: { ids }, ...keys }).then((exit) => {
        if (Exit.isFailure(exit)) {
          show(ids)
          sayRefusal(failureOf(exit), COPY)
        }
      })
    },
    empty: () => {
      const ids = items.map((i) => i.id)
      hide(ids)
      void write.empty({ payload: undefined, ...keys }).then((exit) => {
        if (Exit.isFailure(exit)) {
          show(ids)
          sayRefusal(failureOf(exit), COPY)
        }
      })
    }
  }
}
