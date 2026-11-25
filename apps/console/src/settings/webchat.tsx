import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ChannelChange, ChannelView } from "@insyte/modules/inbox/domain/Chat"
import { FormDialog } from "@insyte/ui/app/common/form-dialog"
import { ChannelMark } from "@insyte/ui/app/inbox/channel-mark"
import { STEPS, WidgetPreview } from "@insyte/ui/app/inbox/chat-views"
import { undoable } from "@insyte/ui/app/lib/undo"
import { cn } from "@insyte/ui/app/lib/utils"
import type { ChatChannel } from "@insyte/ui/app/settings/integrations-source"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@insyte/ui/components/dialog"
import { Link } from "@tanstack/react-router"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { toast } from "sonner"
import { frameAtom } from "../data/frame.ts"
import { useAtomSetInTurn } from "../data/in-turn.ts"
import { channelsAtom, INBOX, inboxWrites } from "../data/inbox.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * The website chat on Koppelingen (M15 step 8): "Koppelen" opens the design's two steps, with the store to put it on
 * where the workspace has more than one, the greeting and the widget's preview; the server turns the store's chat on
 * and gives the theme editor's page where the operator switches the app embed on (Shopify keeps that switch, Insyte
 * cannot flip it). A connected store's "Beheren" opens what it has: the greeting to change, the way to the theme and to
 * where the rest is set, Ontkoppelen with its Undo.
 */

const keys = { reactivityKeys: [...INBOX] }

const DEFAULT_GREETING = "Hoi! Waar kunnen we je mee helpen?"

const COPY: RefusalCopy = {
  gone: "Die winkel of chat bestaat niet meer",
  invalid: {
    storeId: "Kies de winkel waar de chat op komt.",
    greeting: "De welkomsttekst is te lang.",
    color: "Kies een geldige kleur."
  },
  other: (tagged) => {
    if (tagged._tag !== "ChatUnavailable") return false
    toast.error("De websitechat is hier nog niet beschikbaar", {
      description: "Insyte zet hem aan zodra deze omgeving klaar is."
    })
    return true
  }
}

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

/** Shopify did not take where the embed loads the widget from: on, but nothing shows on the storefront yet. */
const THEME_NOT_UPDATED = "Chat staat aan, maar je thema kon niet worden bijgewerkt"
const themeNotUpdated = () =>
  void toast.warning(THEME_NOT_UPDATED, {
    description: "Je winkel toont de chat pas als dat gelukt is. Probeer het zo nog eens bij Beheren."
  })

/** Opens the store's theme editor on the app embed, in a tab of its own. */
const openTheme = (url: string) => void window.open(url, "_blank", "noopener,noreferrer")

/** The toast after a change, with its Undo. */
function useDone() {
  const undo = useAtomSetInTurn(inboxWrites.undo)
  return (change: ChannelChange, label: string, detail?: string) => {
    const ticket = change.undo
    if (ticket === null) return void toast.success(label, { description: detail })
    undoable(
      label,
      () =>
        void undo({ payload: { token: ticket.token }, ...keys }).then((exit) => {
          if (Exit.isFailure(exit)) sayRefusal(failureOf(exit), COPY)
        }),
      detail
    )
  }
}

/** "Websitechat koppelen": the design's steps, then the server's. */
export function WebchatConnectDialog({ channel, onClose }: { channel: ChatChannel | null; onClose: () => void }) {
  const frame = value(useAtomValue(frameAtom))
  const status = value(useAtomValue(channelsAtom))
  const connect = useAtomSet(inboxWrites.connectChannel, { mode: "promiseExit" })
  const done = useDone()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [greeting, setGreeting] = useState(DEFAULT_GREETING)
  const on = new Set(status?.channels.filter((c) => c.status === "connected").map((c) => c.storeId) ?? [])
  const stores = (frame?.stores ?? []).filter((s) => !on.has(s.id))
  const [storeId, setStoreId] = useState<string | undefined>(undefined)
  const chosen = storeId ?? stores[0]?.id
  const steps = STEPS.webchat
  const last = step === steps.length - 1
  const open = channel === "webchat"
  const close = () => {
    onClose()
    setStep(0)
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close()
      }}
      title="Websitechat koppelen"
      description={`Stap ${step + 1} van ${steps.length}`}
      primaryLabel={busy ? "Koppelen…" : last ? "Koppelen" : "Volgende"}
      disabled={busy || (last && chosen === undefined)}
      onSubmit={async () => {
        if (!last) return setStep((x) => x + 1)
        setBusy(true)
        const exit = await connect({
          payload: {
            kind: "webchat",
            ...(chosen === undefined || (frame?.stores.length ?? 0) <= 1 ? {} : { storeId: chosen }),
            greeting: greeting.trim() || DEFAULT_GREETING
          },
          ...keys
        })
        setBusy(false)
        if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
        close()
        done(exit.value, `Websitechat gekoppeld aan ${exit.value.channel.storeName}`)
        if (!exit.value.channel.themeUpdated) return themeNotUpdated()
        toast("Zet de chat nog aan in je thema", {
          description: "Shopify vraagt je de app-embed van Insyte aan te zetten.",
          action: { label: "Thema openen", onClick: () => openTheme(exit.value.channel.activateUrl) }
        })
      }}
    >
      {open ?
        (
          <div className="flex flex-col gap-4">
            <ol className="flex gap-1.5" aria-hidden>
              {steps.map((s, i) => (
                <li key={s.title} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-arc" : "bg-ink/8")} />
              ))}
            </ol>
            <div className="flex items-start gap-3">
              <ChannelMark channel="webchat" size={36} />
              <div className="flex flex-col gap-1">
                <p className="font-medium text-ink">{steps[step]?.title}</p>
                <p className="text-ink-2 text-sm leading-relaxed">{steps[step]?.body}</p>
              </div>
            </div>
            {last && stores.length > 1 ?
              (
                <label className="flex flex-col gap-1.5">
                  <span className="font-medium text-ink-3 text-sm">Winkel</span>
                  <select
                    value={chosen}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="field h-10 rounded-md px-3 text-base text-ink outline-none focus:bg-paper"
                  >
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              ) :
              null}
            {last ?
              (
                <label className="flex flex-col gap-1.5">
                  <span className="font-medium text-ink-3 text-sm">Welkomsttekst</span>
                  <input
                    value={greeting}
                    maxLength={200}
                    onChange={(e) => setGreeting(e.target.value)}
                    className="field h-10 rounded-md px-3 text-base text-ink outline-none focus:bg-paper"
                  />
                </label>
              ) :
              null}
            {last ?
              (
                <WidgetPreview
                  greeting={greeting}
                  store={stores.find((s) => s.id === chosen)?.name ?? frame?.stores[0]?.name ?? ""}
                />
              ) :
              null}
          </div>
        ) :
        null}
    </FormDialog>
  )
}

/** The secondary button of the manage dialogs. */
const QUIET =
  "flex h-9 items-center justify-center rounded-lg px-3.5 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"

/**
 * A connected store's website chat: the greeting to change and save, the way to the theme and to where its answers are
 * set (Klantagent), and Ontkoppelen as a quiet red button, not the primary, with its Undo; "Sluiten" closes.
 */
export function WebchatManageDialog({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const status = value(useAtomValue(channelsAtom))
  const disconnect = useAtomSet(inboxWrites.disconnectChannel, { mode: "promiseExit" })
  const connect = useAtomSet(inboxWrites.connectChannel, { mode: "promiseExit" })
  const setChannelGreeting = useAtomSet(inboxWrites.setChannelGreeting, { mode: "promiseExit" })
  const done = useDone()
  // Koppelingen · Beheren: what every button here asks of the server.
  const gate = useGate("integrations", 2)
  const [busy, setBusy] = useState<"theme" | "save" | "disconnect" | null>(null)
  const channel: ChannelView | undefined = status?.channels.find((c) => c.id === id)
  const [greeting, setGreeting] = useState<string | null>(null)
  const shown = greeting ?? channel?.greeting ?? ""
  const changed = channel !== undefined && greeting !== null && greeting.trim() !== channel.greeting.trim()
  const close = () => {
    setGreeting(null)
    onClose()
  }
  // The same connect again, greeting and colour kept: Shopify is asked once more where the embed loads the widget.
  const retryTheme = async (c: ChannelView) => {
    setBusy("theme")
    const exit = await connect({ payload: { kind: "webchat", storeId: c.storeId }, ...keys })
    setBusy(null)
    if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
    if (!exit.value.channel.themeUpdated) return themeNotUpdated()
    toast.success("Je thema is bijgewerkt", {
      description: "De chat staat nu op je winkel, als de app-embed aan staat."
    })
  }
  // The greeting alone, with its Undo: Shopify is not asked again (that is "Opnieuw proberen").
  const save = async (c: ChannelView) => {
    setBusy("save")
    const exit = await setChannelGreeting({
      payload: { id: c.id, greeting: shown.trim() || DEFAULT_GREETING },
      ...keys
    })
    setBusy(null)
    if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
    setGreeting(null)
    done(exit.value, "Welkomsttekst opgeslagen")
  }
  const letGo = async (c: ChannelView) => {
    setBusy("disconnect")
    const exit = await disconnect({ payload: { id: c.id }, ...keys })
    setBusy(null)
    if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
    close()
    done(
      exit.value,
      `Websitechat van ${c.storeName} ontkoppeld`,
      "De chat verdwijnt van je winkel. De gesprekken blijven in de inbox."
    )
  }
  return (
    <Dialog
      open={id !== undefined && channel !== undefined}
      onOpenChange={(o) => {
        if (!o) close()
      }}
    >
      <DialogContent style={{ maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle>{channel === undefined ? "Websitechat" : `Websitechat · ${channel.storeName}`}</DialogTitle>
          {channel === undefined ? null : (
            <DialogDescription>
              {`${channel.threads} ${channel.threads === 1 ? "gesprek" : "gesprekken"} in de inbox`}
            </DialogDescription>
          )}
        </DialogHeader>
        {channel === undefined ? null : (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-ink-3 text-sm">Welkomsttekst</span>
              <input
                value={shown}
                maxLength={200}
                disabled={!gate.ok}
                title={gate.ok ? undefined : gate.reason}
                onChange={(e) => setGreeting(e.target.value)}
                className="field h-10 rounded-md px-3 text-base text-ink outline-none focus:bg-paper"
              />
            </label>
            <WidgetPreview greeting={shown} store={channel.storeName} />
            {channel.themeUpdated ? null : (
              <div className="flex flex-col gap-2 rounded-md bg-paper p-3">
                <p className="font-medium text-ink text-sm">{THEME_NOT_UPDATED}</p>
                <p className="text-ink-2 text-sm leading-relaxed">
                  Je winkel toont de chat pas als Shopify weet waar Insyte staat.
                </p>
                <button
                  type="button"
                  disabled={busy !== null || !gate.ok}
                  title={gate.ok ? undefined : gate.reason}
                  onClick={() => void retryTheme(channel)}
                  className="flex h-8 w-fit items-center rounded-md bg-ink/6 px-3 font-medium text-ink text-sm hover:bg-ink/10 disabled:opacity-50"
                >
                  {busy === "theme" ? "Opnieuw proberen…" : "Opnieuw proberen"}
                </button>
              </div>
            )}
            <p className="text-ink-2 text-sm leading-relaxed">
              Staat de chat nog niet op je winkel? Zet de app-embed van Insyte aan in je thema. Wat Insyte in de chat
              antwoordt, stel je in bij Klantagent.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openTheme(channel.activateUrl)}
                className="flex h-8 w-fit items-center rounded-md bg-paper px-3 font-medium text-ink text-sm hover:bg-ink/6"
              >
                Thema openen
              </button>
              <Link
                to="/settings/ai/customer-agent"
                className="flex h-8 w-fit items-center rounded-md bg-paper px-3 font-medium text-ink text-sm hover:bg-ink/6"
              >
                Klantagent
              </Link>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <button
            type="button"
            disabled={busy !== null || channel === undefined || !gate.ok}
            title={gate.ok ? undefined : gate.reason}
            onClick={() => channel !== undefined && void letGo(channel)}
            className="flex h-9 items-center justify-center rounded-lg px-3.5 font-medium text-base text-signal-red transition-colors hover:bg-signal-red-bg disabled:opacity-50"
          >
            {busy === "disconnect" ? "Ontkoppelen…" : "Ontkoppelen"}
          </button>
          <span className="flex gap-2">
            <button type="button" onClick={close} className={QUIET}>Sluiten</button>
            <button
              type="button"
              disabled={busy !== null || !changed || !gate.ok}
              title={gate.ok ? undefined : gate.reason}
              onClick={() => channel !== undefined && void save(channel)}
              className="flex h-9 items-center justify-center gap-2 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "save" ? "Opslaan…" : "Opslaan"}
            </button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
