import { useState, useSyncExternalStore } from "react"
import { CATALOG, settingsOf } from "../../fixtures/marketplace.ts"
import type { App } from "../../fixtures/marketplace.ts"
import { APPS } from "../../fixtures/settings.ts"
import { DEMO_NOW } from "../../fixtures/workspace.ts"
import { Button } from "../../ui/button.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { Lock } from "../../ui/icons.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { toast } from "../../ui/toast.tsx"
import { Toggle } from "../../ui/toggle.tsx"
import { useView } from "../../view.ts"
import type { Staat } from "../../view.ts"

/*
 * The apps installed in the workspace, shared by the Marketplace and Instellingen → Apps: which are
 * in, when each was opened, the scopes taken back one by one, and the switches an app keeps inside
 * Insyte. Module state; the first-day view starts without apps.
 */

type State = {
  readonly added: ReadonlyArray<string>
  readonly removed: ReadonlyArray<string>
  readonly opened: Readonly<Record<string, Date>>
  readonly revoked: Readonly<Record<string, ReadonlyArray<string>>>
  readonly settings: Readonly<Record<string, Readonly<Record<string, boolean>>>>
}

let state: State = { added: [], removed: [], opened: {}, revoked: {}, settings: {} }
const listeners = new Set<() => void>()
const set = (next: State) => {
  state = next
  for (const l of listeners) l()
}
const useStore = () =>
  useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, () => state)

export type Installed = {
  readonly app: App
  readonly installed: Date
  readonly opened: Date | null
  readonly revoked: ReadonlyArray<string>
}

function installedFor(s: State, staat: Staat): ReadonlyArray<Installed> {
  const seeded = staat === "leeg" ? [] : APPS.map((a) => a.id as string)
  const ids = [...s.added.filter((id) => !seeded.includes(id)), ...seeded].filter((id) => !s.removed.includes(id))
  return ids.flatMap((id) => {
    const app = CATALOG.find((a) => a.id === id)
    if (app === undefined) return []
    const seed = APPS.find((a) => a.id === id)
    return [{
      app,
      installed: seed?.installed ?? DEMO_NOW.date,
      opened: s.opened[id] ?? seed?.opened ?? null,
      revoked: s.revoked[id] ?? []
    }]
  })
}

/** The installed apps, newest first, with what changed while the page was looked at. */
export function useInstalled(): ReadonlyArray<Installed> {
  const s = useStore()
  return installedFor(s, useView().staat)
}

export function install(id: string) {
  set({ ...state, added: [id, ...state.added.filter((x) => x !== id)], removed: state.removed.filter((x) => x !== id) })
}

/** Removes an app and returns the undo. */
export function uninstall(id: string): () => void {
  const before = state
  set({ ...state, removed: [...state.removed, id], added: state.added.filter((x) => x !== id) })
  return () => set(before)
}

function setRevoked(app: App, next: ReadonlyArray<string>) {
  const before = state.revoked[app.id] ?? []
  set({ ...state, revoked: { ...state.revoked, [app.id]: next } })
  const off = next.filter((x) => !before.includes(x)).length
  const on = before.filter((x) => !next.includes(x)).length
  toast({
    title: `Rechten van ${app.name} bijgewerkt`,
    body: off > 0 && on === 0
      ? `${off} ${off === 1 ? "recht" : "rechten"} ingetrokken. Wat het nodig heeft, werkt pas weer als je het aanzet.`
      : on > 0 && off === 0
      ? `${on} ${on === 1 ? "recht" : "rechten"} teruggegeven.`
      : "Ingetrokken en teruggegeven, zoals je koos.",
    tone: "good",
    action: {
      label: "Ongedaan maken",
      onClick: () => set({ ...state, revoked: { ...state.revoked, [app.id]: before } })
    }
  })
}

/**
 * Each scope an app holds, as a switch: what is turned off is taken back, saved together with an undo.
 * Functions that need a revoked scope stop until it is on again.
 */
export function ScopesDialog({ item, onClose }: { readonly item: Installed | null; readonly onClose: () => void }) {
  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      lead={item === null ? undefined : <ServiceLogo service={item.app.id} name={item.app.name} size={40} />}
      title={item === null ? "Rechten" : `Rechten van ${item.app.name}`}
      description="Zet uit wat deze app niet mag doen. Functies die het nodig hebben, werken pas weer als je het aanzet."
    >
      {item !== null && <ScopesForm key={item.app.id} item={item} onClose={onClose} />}
    </Dialog>
  )
}

function ScopesForm({ item, onClose }: { readonly item: Installed; readonly onClose: () => void }) {
  const [revoked, setDraft] = useState<ReadonlyArray<string>>(item.revoked)
  const unchanged = revoked.toSorted().join() === item.revoked.toSorted().join()
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col">
        {item.app.scopes.map((sc) => {
          const granted = !revoked.includes(sc.id)
          return (
            <li key={sc.id} className="flex items-center justify-between gap-4 py-2">
              <span className="flex min-w-0 items-start gap-2">
                <Lock size={13} className="mt-1 shrink-0 text-ink-3" />
                <span className="flex min-w-0 flex-col">
                  <span className={granted ? "text-sm text-ink" : "text-sm text-ink-3 line-through"}>{sc.label}</span>
                  <span className="figure text-xs text-ink-3">{sc.id}</span>
                </span>
              </span>
              <Toggle
                label={sc.label}
                on={granted}
                onChange={(on) => setDraft((r) => (on ? r.filter((x) => x !== sc.id) : [...r, sc.id]))}
              />
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end gap-2 pb-3">
        <Button variant="ghost" onClick={onClose}>Annuleren</Button>
        <Button
          variant="primary"
          disabled={unchanged}
          onClick={() => {
            setRevoked(item.app, revoked)
            onClose()
          }}
        >
          Rechten bijwerken
        </Button>
      </div>
    </div>
  )
}

/**
 * An installed app opened inside Insyte: who it is, that it is connected, and the few switches it
 * keeps here. Opening it counts as its last use. Rechten leads to its scopes.
 */
export function OpenAppDialog({ item, onClose, onScopes }: {
  readonly item: Installed | null
  readonly onClose: () => void
  readonly onScopes: (item: Installed) => void
}) {
  const s = useStore()
  if (item === null) return <Dialog open={false} onClose={onClose} title="" />
  const app = item.app
  const values = s.settings[app.id] ?? {}
  const held = app.scopes.length - item.revoked.length
  return (
    <Dialog
      open
      onClose={onClose}
      lead={<ServiceLogo service={app.id} name={app.name} size={44} />}
      title={app.name}
      description={
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 shrink-0 rounded-full bg-good-ink" aria-hidden="true" />
          Gekoppeld aan Northwind · door {app.vendorUrl} · zojuist gesynchroniseerd
        </span>
      }
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => {
              onClose()
              onScopes(item)
            }}
          >
            Rechten · {held} van {app.scopes.length}
          </Button>
          <Button variant="primary" onClick={onClose}>Klaar</Button>
        </>
      }
    >
      <ul className="flex flex-col pb-2">
        {settingsOf(app.id).map((label, i) => {
          const on = values[label] ?? i < 2
          return (
            <li key={label} className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm text-ink">{label}</span>
              <Toggle
                label={label}
                on={on}
                onChange={(next) => {
                  set({ ...state, settings: { ...state.settings, [app.id]: { ...values, [label]: next } } })
                  toast({ title: `${label} ${next ? "aan" : "uit"}`, tone: next ? "good" : "neutral" })
                }}
              />
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}

/** Mark an app as opened now. */
export function markOpened(id: string) {
  set({ ...state, opened: { ...state.opened, [id]: DEMO_NOW.date } })
}
