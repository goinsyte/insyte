import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { CATALOG_BY_ID } from "@insyte/domain/Marketplace"
import type { Catalog, InstallView } from "@insyte/modules/marketplace/domain/Marketplace"
import { ConfirmDialog } from "@insyte/ui/app/common/confirm-dialog"
import type { Extension } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import { scopeIdsOf, scopeLabelsOf } from "@insyte/ui/app/marketplace/app-catalog"
import { type AppKey, AppKeyDialog } from "@insyte/ui/app/marketplace/app-key-dialog"
import type { InstallRecord, MarketplaceSource } from "@insyte/ui/app/marketplace/marketplace-source"
import { useMarketplaceModalStore } from "@insyte/ui/app/stores/marketplace-modal-store"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { Exit, Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"
import { KEYS } from "../data/developer.ts"
import { MARKETING, marketingWrites } from "../data/marketing.ts"
import { catalogAtom, installsAtom, MARKETPLACE, marketplaceWrites, recommendedAtom } from "../data/marketplace.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The Marketplace in the console (M17 step 3): the design's modal, detail, dialogs and Instellingen → Apps over
 * `Marketplace.*`, read while the modal is open or the Apps page shows. What an install does is the app's own:
 *
 * - Klaviyo is a connection Insyte already makes: installing it is Klaviyo's approval page, and back to Apps. Removing
 *   it lets the connection go first, for good, so it asks.
 * - Zapier gets an API key of its own, shown once to paste into Zapier. Removing it revokes the key, with Ongedaan
 *   maken; so does taking its scopes back.
 * - Every other app says Binnenkort.
 *
 * "Openen" goes where the app is used in Insyte, not to a dialog of switches nothing reads.
 */

const COPY: RefusalCopy = {
  gone: "Die app is niet (meer) geïnstalleerd",
  conflicts: {
    soon: ["Deze app komt binnenkort", "Installeren kan nog niet."],
    installed: ["Deze app is al geïnstalleerd", "Je vindt hem onder Instellingen, dan Apps."],
    connected: ["Eerst loskoppelen", "De koppeling staat nog aan."],
    not_scoped: ["Rechten staan vast", "Deze rechten regel je bij de aanbieder zelf."],
    not_configured: ["Klaviyo kan hier nog niet", "Deze omgeving heeft de Klaviyo-app nog niet."],
    unreachable: ["Klaviyo reageert niet", "Probeer het zo nog eens."]
  },
  invalid: { required: "Schrijf eerst je bericht.", too_long: "Dat bericht is te lang." }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

/** The design's feedback choices, as the server keeps them. */
const CATEGORY: Record<string, "suggest" | "broken" | "listing" | "other"> = {
  "Een app voorstellen": "suggest",
  "Er werkt iets niet": "broken",
  "Een app-vermelding klopt niet": "listing",
  Anders: "other"
}

/** Where an installed app is used in Insyte. */
const PLACE: Record<string, string> = {
  ext_klaviyo: "/customers",
  ext_zapier: "/settings/api-keys"
}

const NO_CATALOG = Atom.make(AsyncResult.initial<Catalog, never>())
const NO_INSTALLS = Atom.make(AsyncResult.initial<ReadonlyArray<InstallView>, never>())
const NO_IDS = Atom.make(AsyncResult.initial<ReadonlyArray<string>, never>())
const NONE: ReadonlyArray<string> = []

const extensionOf = (app: Catalog["apps"][number], installed: boolean): Extension => ({
  id: app.id,
  name: app.name,
  tagline: app.tagline,
  category: app.listing,
  installed,
  rating: app.rating,
  install_count: app.installCount
})

const iso = (ms: number) => new Date(ms).toISOString()

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

/** The source the shell carries, and what the console draws over it: the key shown once, the confirmation. */
export function useConsoleMarketplace(): { source: MarketplaceSource; overlay: ReactNode } {
  const navigate = useNavigate()
  const open = useMarketplaceModalStore((s) => s.open)
  const closeModal = useMarketplaceModalStore((s) => s.closeModal)
  const onApps = useRouterState({ select: (s) => s.location.pathname.startsWith("/settings/apps") })
  const active = open || onApps
  const catalogResult = useAtomValue(active ? catalogAtom : NO_CATALOG)
  const installsResult = useAtomValue(active ? installsAtom : NO_INSTALLS)
  const recommendedResult = useAtomValue(active ? recommendedAtom : NO_IDS)
  const refresh = {
    catalog: useAtomRefresh(catalogAtom),
    installs: useAtomRefresh(installsAtom),
    recommended: useAtomRefresh(recommendedAtom)
  }
  const write = {
    install: useAtomSet(marketplaceWrites.install, { mode: "promiseExit" }),
    uninstall: useAtomSet(marketplaceWrites.uninstall, { mode: "promiseExit" }),
    setScopes: useAtomSet(marketplaceWrites.setScopes, { mode: "promiseExit" }),
    open: useAtomSet(marketplaceWrites.open, { mode: "promiseExit" }),
    feedback: useAtomSet(marketplaceWrites.feedback, { mode: "promiseExit" }),
    undo: useAtomSet(marketplaceWrites.undo, { mode: "promiseExit" }),
    beginConnect: useAtomSet(marketingWrites.beginConnect, { mode: "promiseExit" }),
    disconnect: useAtomSet(marketingWrites.disconnect, { mode: "promiseExit" })
  }
  const [shown, setShown] = useState<AppKey | null>(null)
  const [leaving, setLeaving] = useState<Extension | null>(null)

  const catalog = value(catalogResult)
  const installs = value(installsResult)
  const recommended = value(recommendedResult) ?? NONE
  const keys = { reactivityKeys: [...MARKETPLACE, ...KEYS] }

  const byApp = useMemo(() => new Map((installs ?? []).map((i) => [i.appId, i])), [installs])
  const apps = useMemo(() => catalog?.apps.map((a) => extensionOf(a, byApp.has(a.id))) ?? [], [catalog, byApp])
  const records = useMemo(
    () =>
      Object.fromEntries(
        [...byApp.values()].map((i): [string, InstallRecord] => [i.appId, {
          id: i.appId,
          installedAt: iso(i.installedAt),
          ...(i.lastOpenedAt === null ? {} : { lastOpenedAt: iso(i.lastOpenedAt) })
        }])
      ),
    [byApp]
  )
  const failed = AsyncResult.isFailure(catalogResult) || AsyncResult.isFailure(installsResult)
  const status: MarketplaceSource["status"] = catalog !== undefined && installs !== undefined
    ? "ready"
    : failed
    ? "error"
    : "loading"

  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((u) => {
      if (Exit.isFailure(u)) refused(failureOf(u))
    })

  const install = async (ext: Extension) => {
    const app = CATALOG_BY_ID[ext.id]
    if (app === undefined || app.install.kind === "soon") return
    if (app.install.kind === "connect") {
      // Klaviyo's approval page first: a stage without the app says so before anything is kept.
      const begun = await write.beginConnect({ payload: { returnPath: "/settings/apps" } })
      if (Exit.isFailure(begun)) return refused(failureOf(begun))
      const exit = await write.install({ payload: { appId: ext.id }, reactivityKeys: MARKETPLACE })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      if (exit.value.connect === null) return void toast.success(`${ext.name} geïnstalleerd`)
      window.location.assign(begun.value.authorizeUrl)
      return
    }
    const exit = await write.install({ payload: { appId: ext.id }, ...keys })
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    if (exit.value.key !== null) {
      setShown({ appId: ext.id, name: ext.name, secret: exit.value.key.secret, prefix: exit.value.key.prefix })
    }
  }

  const uninstallKeyed = async (ext: Extension) => {
    const exit = await write.uninstall({ payload: { appId: ext.id }, ...keys })
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    const ticket = exit.value.undo
    if (ticket === null) return void toast(`${ext.name} verwijderd`)
    undoable(`${ext.name} verwijderd`, () => undo(ticket.token), `De API-sleutel van ${ext.name} is ingetrokken.`)
  }

  /** A connector app: the connection let go, then the app; nothing to put back. */
  const uninstallConnected = async (ext: Extension) => {
    const gone = await write.disconnect({ payload: undefined, reactivityKeys: [...MARKETPLACE, ...MARKETING] })
    if (Exit.isFailure(gone)) return refused(failureOf(gone))
    const exit = await write.uninstall({ payload: { appId: ext.id }, reactivityKeys: MARKETPLACE })
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    toast(`${ext.name} verwijderd`)
  }

  const source: MarketplaceSource = {
    apps,
    status,
    retry: () => {
      refresh.catalog()
      refresh.installs()
      refresh.recommended()
    },
    records,
    installedIds: [...byApp.keys()],
    isInstalled: (id) => byApp.has(id),
    getRecord: (id) => records[id],
    recommended,
    soon: (id) => CATALOG_BY_ID[id]?.install.kind !== "connect" && CATALOG_BY_ID[id]?.install.kind !== "key",
    install: (ext) => void install(ext),
    uninstall: (ext) => {
      if (CATALOG_BY_ID[ext.id]?.install.kind === "connect") setLeaving(ext)
      else void uninstallKeyed(ext)
    },
    markOpened: (id) => void write.open({ payload: { appId: id }, reactivityKeys: MARKETPLACE }),
    open: (ext) => {
      closeModal()
      void navigate({ to: (PLACE[ext.id] ?? "/settings/apps") as never })
    },
    revokedScopes: (id) => scopeLabelsOf(id, byApp.get(id)?.revokedScopes ?? NONE),
    canRescope: (id) => CATALOG_BY_ID[id]?.install.kind === "key",
    setRevokedScopes: (ext, revoked) =>
      void write.setScopes({ payload: { appId: ext.id, revoked: scopeIdsOf(ext.id, revoked) }, ...keys }).then(
        (exit) => {
          if (Exit.isFailure(exit)) return refused(failureOf(exit))
          const n = revoked.length
          undoable(
            n === 0
              ? `${ext.name} heeft al zijn rechten`
              : `${ext.name} is ${n} ${n === 1 ? "recht" : "rechten"} kwijt`,
            () => undo(exit.value.undo.token)
          )
        }
      ),
    sendFeedback: async (input) => {
      const exit = await write.feedback({
        payload: { category: CATEGORY[input.category] ?? "other", message: input.message }
      })
      if (Exit.isFailure(exit)) {
        refused(failureOf(exit))
        return false
      }
      return true
    }
  }

  const overlay = (
    <>
      <AppKeyDialog value={shown} onClose={() => setShown(null)} />
      <ConfirmDialog
        open={leaving !== null}
        onOpenChange={(o) => !o && setLeaving(null)}
        title={`${leaving?.name ?? ""} verwijderen?`}
        description={`De koppeling met ${
          leaving?.name ?? ""
        } stopt direct en Insyte stuurt er niets meer heen. Wat er al staat, blijft daar. Dit kun je niet ongedaan maken.`}
        confirmLabel="Verwijderen"
        tone="destructive"
        onConfirm={() => {
          const ext = leaving
          setLeaving(null)
          if (ext !== null) void uninstallConnected(ext)
        }}
      />
    </>
  )
  return { source, overlay }
}
