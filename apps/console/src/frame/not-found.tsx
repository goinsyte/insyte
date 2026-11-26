import { EmptyPage } from "@insyte/ui/app/common/empty-page"
import { PageHeader } from "@insyte/ui/app/common/page-header"
import { panelForPath } from "@insyte/ui/app/lib/app-shell-config"
import type { IndexItem } from "@insyte/ui/app/marketing-sections/link-index"
import { useRouterState } from "@tanstack/react-router"
import { useHasPage } from "./pages.ts"

/*
 * An address the console has no page for. Inside the app (the frame's areas: `/settings/…`, `/orders/1/…`) it is said in
 * the frame, with the way back to that area and to Start; anywhere else, on a plain page with the way to the console's
 * front door, which sends the person on as the gate does. A record that is not there (`/orders/ord_gone`) is said in
 * the frame too, by its own route, in its own words.
 */

const TITLE = "Deze pagina bestaat niet"
const BODY = "Het adres klopt niet, of de pagina is verplaatst of weggehaald."
const RECORD_BODY = "Het adres klopt niet, het is weggehaald, of het valt buiten de winkels die je kunt zien."

/** The area an address falls under (`/settings/region` → Instellingen), when the panel knows it and it is a page. */
const areaOf = (path: string, hasPage: (to: string) => boolean): IndexItem | undefined => {
  const root = `/${path.split("/")[1] ?? ""}`
  const title = panelForPath(root)?.title
  if (title === undefined || root === "/dashboard" || !hasPage(root)) return undefined
  return { id: "area", to: root, label: title, body: `Terug naar ${title}.` }
}

const START: IndexItem = { id: "start", to: "/dashboard", label: "Start", body: "Wat er vandaag op je wacht." }

/** In the frame: the shell stays, and the miss is said where the page would be. */
export function InAppNotFound() {
  return <InFrame title={TITLE} body={BODY} />
}

function InFrame({ title, body }: { title: string; body: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const area = areaOf(path, useHasPage())
  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader title="Niet gevonden" />
      <div className="px-5">
        <EmptyPage
          kind="missing"
          count={path}
          title={title}
          body={body}
          startsTitle="Verder naar"
          starts={area === undefined ? [START] : [area, START]}
        />
      </div>
    </div>
  )
}

/**
 * A record route's `notFoundComponent` (`"Deze bestelling bestaat niet"`): its loader's `notFound()` stops there, in
 * the frame, instead of reaching the frame's own and taking the rail and the top bar with it.
 */
export const recordNotFound = (title: string) =>
  function RecordNotFound() {
    return <InFrame title={title} body={RECORD_BODY} />
  }

/** Outside the app: no shell to keep, so a page of its own with the way in. */
export function PlainNotFound() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <main className="min-h-svh bg-paper px-5 text-ink">
      <EmptyPage
        kind="missing"
        count={path}
        title={TITLE}
        body={BODY}
        startsTitle="Verder naar"
        starts={[{ id: "home", to: "/", label: "Insyte", body: "Inloggen, of verder waar je was." }]}
      />
    </main>
  )
}
