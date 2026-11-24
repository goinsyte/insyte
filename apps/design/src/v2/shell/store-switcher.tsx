import { useEffect, useId, useRef, useState } from "react"
import { Link, navigate, paths } from "../router.tsx"
import { Button } from "../ui/button.tsx"
import { cx } from "../ui/cx.ts"
import { AlertDialog } from "../ui/dialog.tsx"
import { Check, ChevronDown, LogOut, Plus, Settings, UserPlus } from "../ui/icons.tsx"
import { ServiceLogo } from "../ui/service-logo.tsx"
import { toast } from "../ui/toast.tsx"
import { level, useView } from "../view.ts"
import { dropWorkspace, joinWorkspace, restoreWorkspace, switchWorkspace, useShellState } from "./shell-state.ts"
import type { WorkspaceId } from "./shell-state.ts"
import { VariantMark } from "./variants.tsx"
import { INVITE, workspaceOf, WORKSPACES } from "./workspaces.ts"
import type { Workspace } from "./workspaces.ts"

/** The store's monogram: its initial on a light tile, as a Shopify store has no logo in the demo. */
function StoreTile({ name, size = 26 }: { readonly name: string; readonly size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-sm bg-rail-fg text-xs font-bold text-rail"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  )
}

/** A workspace's initials on a small tile: ink when it is the one you are in. */
function Initials({ name, current }: { readonly name: string; readonly current: boolean }) {
  const letters = name.split(/\s+/).map((w) => w[0] ?? "").slice(0, 2).join("").toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-2xs font-bold",
        current ? "bg-ink text-on-ink" : "bg-well text-ink-2"
      )}
    >
      {letters}
    </span>
  )
}

/**
 * The store's platform line ("Shopify · EUR") with the platform's mark before it: the store's letter
 * stays its identity, the mark says where it runs.
 */
function PlatformLine({ detail, className }: { readonly detail: string; readonly className: string }) {
  const platform = detail.split(" · ")[0] ?? ""
  return (
    <span className={cx("flex min-w-0 items-center gap-1 text-2xs", className)}>
      <ServiceLogo service={platform} size={12} bare />
      <span className="truncate">{detail}</span>
    </span>
  )
}

/** The workspaces this person is in now: their own, the ones they did not leave, the one they joined. */
export function useWorkspaces(): {
  readonly current: Workspace
  readonly list: ReadonlyArray<Workspace>
  readonly invited: boolean
} {
  const s = useShellState()
  const list = WORKSPACES.filter((w) =>
    w.id === "northwind" || (w.id === "lumen" && !s.gone.includes("lumen")) || s.joined.includes(w.id)
  )
  const invited = !s.joined.includes(INVITE.workspace) && !s.gone.includes(INVITE.workspace)
  return { current: workspaceOf(s.workspace), list, invited }
}

const membersLabel = (w: Workspace) => `${w.members} ${w.members === 1 ? "lid" : "leden"}`

/**
 * The head of the dark L, top left: the store you are in, and the workspace around it. Someone who
 * works for more than one business sees every workspace they are in at the head of the list, and an
 * invitation to another as a row to accept or decline right there; switching hands over with a short
 * veil, so it is clear the console is now someone else's. Below that the workspace's stores, a way to
 * connect another, the workspace's settings, a new workspace, leaving one that is not yours, and
 * inviting a colleague.
 */
export function StoreSwitcher({ storeId, onChange }: {
  readonly storeId: string
  readonly onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState<Workspace | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()
  const view = useView()
  const { current, list, invited } = useWorkspaces()
  const stores = current.stores
  const store = stores.find((s) => s.id === storeId) ?? stores[0]

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (store === undefined) return null

  const go = (id: WorkspaceId) => {
    setOpen(false)
    const to = workspaceOf(id)
    switchWorkspace(id, () => {
      onChange(to.stores[0]?.id ?? "")
      toast({ title: `Je werkt nu in ${to.name}`, body: `Als ${to.role.toLowerCase()}.` })
    })
  }
  const invite = workspaceOf(INVITE.workspace)
  const several = list.length > 1 || invited

  return (
    <div ref={root} className="relative h-full">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="flex h-full w-full items-center gap-2 rounded-md px-2 text-left text-rail-fg hover:bg-rail-2"
      >
        {/* The Varianten panel's logo, if one is chosen; else the store's letter. */}
        <span className="relative">
          <VariantMark fallback={<StoreTile name={store.name} />} />
          {invited && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent ring-2 ring-rail"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-semibold">{store.name}</span>
          <PlatformLine detail={store.detail} className="text-rail-ink" />
        </span>
        {invited && <span className="sr-only">, 1 uitnodiging open</span>}
        <ChevronDown size={14} className="shrink-0 text-rail-ink" />
      </button>

      {open && (
        <div
          id={listId}
          role="dialog"
          aria-label="Werkruimte en winkel"
          className="pane-scroll absolute top-full left-0 z-40 mt-1.5 max-h-[min(40rem,85vh)] w-72 animate-rise rounded-md bg-canvas p-1 shadow-pop ring-1 ring-line"
        >
          <div className="flex items-center gap-2.5 px-2 pt-2 pb-2.5">
            <Initials name={current.name} current />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-ink">{current.name}</span>
              <span className="truncate text-xs text-ink-3">
                {current.role} · {membersLabel(current)} · {current.plan}
              </span>
            </span>
          </div>

          {several && (
            <>
              <p className="px-2 pt-1.5 pb-1 text-2xs font-medium text-ink-3">Werkruimtes</p>
              <ul aria-label="Werkruimtes">
                {list.map((w) => {
                  const here = w.id === current.id
                  return (
                    <li key={w.id}>
                      <button
                        type="button"
                        aria-current={here ? "true" : undefined}
                        onClick={() => (here ? setOpen(false) : go(w.id))}
                        className={cx(
                          "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left hover:bg-hover",
                          here && "bg-selected"
                        )}
                      >
                        <Initials name={w.name} current={here} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm text-ink">{w.name}</span>
                          <span className="truncate text-2xs text-ink-3">{w.role} · {membersLabel(w)}</span>
                        </span>
                        {here && <Check size={16} className="shrink-0 text-ink" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {invited && (
                <div className="mx-1 mt-1 flex flex-col gap-2 rounded-sm bg-accent-tint px-2 py-2">
                  <div className="flex items-center gap-2.5">
                    <Initials name={invite.name} current={false} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-ink">{invite.name}</span>
                      <span className="text-2xs text-pretty text-ink-2">
                        {INVITE.by} nodigt je uit als {INVITE.role.toLowerCase()} · {INVITE.sent}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        dropWorkspace(invite.id)
                        toast({
                          title: `Uitnodiging van ${invite.name} geweigerd`,
                          body: `${INVITE.by} ziet dat je niet meedoet.`,
                          action: { label: "Ongedaan maken", onClick: () => restoreWorkspace(invite.id, false) }
                        })
                      }}
                    >
                      Weigeren
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        joinWorkspace(invite.id)
                        toast({
                          title: `Je zit nu in ${invite.name}`,
                          body: `Als ${invite.role.toLowerCase()}. Je vindt het hier tussen je werkruimtes.`,
                          tone: "good",
                          action: { label: "Openen", onClick: () => go(invite.id) }
                        })
                      }}
                    >
                      Accepteren
                    </Button>
                  </div>
                </div>
              )}
              <div className="-mx-1 my-1 h-px bg-line" role="separator" />
            </>
          )}

          <p className="px-2 pt-1.5 pb-1 text-2xs font-medium text-ink-3">Winkels in {current.name}</p>
          <ul role="listbox" aria-label="Winkel kiezen">
            {stores.map((s) => {
              const selected = s.id === store.id
              return (
                <li key={s.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      if (!s.connected) {
                        navigate(paths.settings("winkels"))
                        return
                      }
                      onChange(s.id)
                    }}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left hover:bg-hover",
                      selected && "bg-selected"
                    )}
                  >
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm bg-ink text-2xs font-bold text-on-ink">
                      {s.name.slice(0, 1)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-ink">{s.name}</span>
                      <PlatformLine detail={s.detail} className={s.connected ? "text-ink-3" : "text-warn-ink"} />
                    </span>
                    {selected && <Check size={16} className="shrink-0 text-ink" />}
                    {!s.connected && (
                      <span className="shrink-0 text-2xs font-medium text-warn-ink">Opnieuw koppelen</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-1 flex flex-col border-t border-line pt-1">
            {level(view, "settings") >= 3 && (
              <MenuLink
                to={paths.settings("winkels")}
                glyph={Plus}
                onGo={() => setOpen(false)}
              >
                Winkel koppelen
              </MenuLink>
            )}
            <MenuLink to={paths.settings("profiel")} glyph={Settings} onGo={() => setOpen(false)}>
              Werkruimte-instellingen
            </MenuLink>
            <MenuLink to={paths.onboarding("merk")} glyph={Plus} onGo={() => setOpen(false)}>
              Nieuwe werkruimte
            </MenuLink>
            {!current.own && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setLeaving(current)
                }}
                className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm text-bad-ink hover:bg-hover"
              >
                <LogOut size={16} />
                {current.name} verlaten
              </button>
            )}
            {level(view, "team") >= 2 && (
              <MenuLink
                to={paths.settings("team")}
                glyph={UserPlus}
                onGo={() => setOpen(false)}
              >
                Collega uitnodigen
              </MenuLink>
            )}
          </div>
        </div>
      )}
      <AlertDialog
        open={leaving !== null}
        title={`${leaving?.name ?? ""} verlaten?`}
        body={`Je verliest meteen de toegang tot de bestellingen, tickets en chats van ${
          leaving?.name ?? "deze werkruimte"
        }. Wat je daar deed blijft op je naam staan. Terugkomen kan alleen met een nieuwe uitnodiging.`}
        confirmLabel="Werkruimte verlaten"
        onCancel={() => setLeaving(null)}
        onConfirm={() => {
          if (leaving === null) return
          const name = leaving.name
          setLeaving(null)
          switchWorkspace("northwind", () => {
            dropWorkspace(leaving.id)
            onChange(workspaceOf("northwind").stores[0]?.id ?? "")
            toast({ title: `Je hebt ${name} verlaten` })
          })
        }}
      />
    </div>
  )
}

function MenuLink({ to, glyph: G, onGo, children }: {
  readonly to: string
  readonly glyph: typeof Plus
  readonly onGo: () => void
  readonly children: string
}) {
  return (
    <Link
      to={to}
      onClick={onGo}
      className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-ink-2 hover:bg-hover hover:text-ink"
    >
      <G size={16} className="text-ink-3" />
      {children}
    </Link>
  )
}

/** The hand-over between two workspaces: a veil with the one you are going to, then the console is theirs. */
export function WorkspaceVeil() {
  const { switching } = useShellState()
  if (switching === null) return null
  const to = workspaceOf(switching)
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex animate-rise items-center justify-center bg-canvas/85 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-lg bg-ink text-xl font-semibold text-on-ink shadow-pop">
          {to.name.split(/\s+/).map((w) => w[0] ?? "").slice(0, 2).join("").toUpperCase()}
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-sm text-ink-3">Naar werkruimte</span>
          <span className="text-xl font-semibold text-ink">{to.name}</span>
        </span>
        <span aria-hidden="true" className="relative h-0.5 w-32 overflow-hidden rounded-full bg-line">
          <span className="absolute inset-y-0 w-1/3 animate-sweep rounded-full bg-accent" />
        </span>
      </div>
    </div>
  )
}
