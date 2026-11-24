import type { AreaDef } from "../../areas.ts"
import { APPROVALS } from "../../fixtures/home.ts"
import { paths } from "../../router.tsx"
import type { AreaRoute } from "../../router.tsx"
import type { Thread } from "../../shell/threads.ts"
import { ApprovalsPage } from "./approvals.tsx"
import { GalleryPage } from "./gallery.tsx"
import { ScheduledPage } from "./scheduled.tsx"

/**
 * Magnus's sub-pages (`/v2/magnus/goedkeuringen`, `/gepland`, `/galerij`): the area's entry for the
 * shell (`areas.ts`). The chat, the agents and the log are screens of their own; the menu is the
 * shell's MagnusPanel, so the area has no `Menu`.
 */
function Screen({ route }: { readonly route: AreaRoute }) {
  if (route.base === "magnus/gepland") return <ScheduledPage />
  if (route.base === "magnus/galerij") return <GalleryPage />
  return <ApprovalsPage />
}

function thread(route: AreaRoute): Thread {
  if (route.base === "magnus/gepland") {
    return {
      items: [
        { kind: "page", label: "Gepland" },
        {
          kind: "agent",
          label: "Leveranciersopvolger",
          href: paths.agent("leveranciers"),
          meta: "vandaag 16:30",
          peek: ["Mailt Kestrel Goods opnieuw als er geen antwoord is", "Eerst vragen"]
        },
        {
          kind: "supplier",
          label: "Kestrel Goods",
          href: paths.supplier("kestrel-goods"),
          meta: "6 vertraagd",
          peek: ["Gem. levertijd 6,1 dagen, belofte 5", "Kantoor sluit om 16:00"]
        }
      ],
      ask: "Geplande taken van de agents"
    }
  }
  if (route.base === "magnus/galerij") {
    return {
      items: [
        { kind: "page", label: "Agentgalerij" },
        { kind: "page", label: "Mijn agents", href: paths.agents, meta: "al aan het werk" },
        { kind: "setting", label: "Zelfstandigheid", href: paths.settings("ai/zelfstandigheid"), meta: "de regels" }
      ],
      ask: "Agentgalerij"
    }
  }
  const first = APPROVALS.toSorted((a, b) => a.deadline - b.deadline)[0]
  return {
    items: [
      { kind: "page", label: "Goedkeuringen" },
      ...(first === undefined ? [] : [{
        kind: "agent" as const,
        label: first.agent,
        href: paths.agent(first.agentId),
        meta: `vóór ${first.due}`,
        peek: [first.title, `Eerst vragen · sinds ${first.at}`]
      }]),
      {
        kind: "ticket",
        label: "Ticket #5146",
        href: paths.ticket("5146"),
        meta: "Luca Romano",
        peek: ["Bestelling #5309 is vier dagen te laat", "Voorstel: kortingscode SORRY10"]
      }
    ],
    ask: "Goedkeuringen"
  }
}

export const area: AreaDef = { Screen, thread }
