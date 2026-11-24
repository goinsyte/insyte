import type { AreaDef } from "../../areas.ts"
import { paths } from "../../router.tsx"
import { NotificationsPage } from "./page.tsx"

/**
 * Meldingen (`/v2/start/meldingen`): the bell's full page, in Start's section. Its menu is Start's
 * own (the shell's StartPanel), so the area has no `Menu`.
 */
export const area: AreaDef = {
  Screen: () => <NotificationsPage />,
  thread: () => ({
    items: [
      { kind: "page", label: "Meldingen" },
      {
        kind: "ticket",
        label: "Ticket #5142",
        href: paths.ticket("5142"),
        meta: "Sofía noemde je",
        peek: ["‘Kun jij de terugbetaling goedkeuren?’", "Sofía Kim beantwoordt het nu"]
      },
      {
        kind: "chargeback",
        label: "Chargeback #CB-2291",
        href: paths.chargeback("CB-2291"),
        meta: "morgen 12:00",
        peek: ["Klarna · € 129,00 · bestelling #5318", "Bewijspakket staat klaar; indienen wacht op jou"]
      }
    ],
    ask: "Meldingen"
  })
}
