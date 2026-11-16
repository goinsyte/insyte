import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ChannelChange, ChannelView } from "@insyte/modules/inbox/domain/Chat"
import { FormDialog } from "@insyte/ui/app/common/form-dialog"
import { ChannelMark } from "@insyte/ui/app/inbox/channel-mark"
import { STEPS, WidgetPreview } from "@insyte/ui/app/inbox/chat-views"
import { undoable } from "@insyte/ui/app/lib/undo"
import { cn } from "@insyte/ui/app/lib/utils"
import type { ChatChannel } from "@insyte/ui/app/settings/integrations-source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { toast } from "sonner"
import { frameAtom } from "../data/frame.ts"
import { channelsAtom, INBOX, inboxWrites } from "../data/inbox.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The website chat on Koppelingen (M15 step 8): "Koppelen" opens the design's two steps, with the store to put it on
 * where the workspace has more than one, the greeting and the widget's preview; the server turns the store's chat on
 * and gives the theme editor's page where the operator switches the app embed on (Shopify keeps that switch, Insyte
 * cannot flip it). A connected store's "Beheren" opens what it has: the greeting, the way to the theme, Ontkoppelen
 * with its Undo.
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

/** Opens the store's theme editor on the app embed, in a tab of its own. */
const openTheme = (url: string) => void window.open(url, "_blank", "noopener,noreferrer")

/** The toast after a change, with its Undo. */
function useDone() {
  const undo = useAtomSet(inboxWrites.undo, { mode: "promiseExit" })
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

/** A connected store's website chat: its greeting, the way to the theme, and Ontkoppelen. */
export function WebchatManageDialog({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const status = value(useAtomValue(channelsAtom))
  const disconnect = useAtomSet(inboxWrites.disconnectChannel, { mode: "promiseExit" })
  const done = useDone()
  const [busy, setBusy] = useState(false)
  const channel: ChannelView | undefined = status?.channels.find((c) => c.id === id)
  return (
    <FormDialog
      open={id !== undefined && channel !== undefined}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      title={channel === undefined ? "Websitechat" : `Websitechat · ${channel.storeName}`}
      description={channel === undefined
        ? undefined
        : `${channel.threads} ${channel.threads === 1 ? "gesprek" : "gesprekken"} in de inbox`}
      primaryLabel={busy ? "Ontkoppelen…" : "Ontkoppelen"}
      disabled={busy || channel === undefined}
      onSubmit={async () => {
        if (channel === undefined) return
        setBusy(true)
        const exit = await disconnect({ payload: { id: channel.id }, ...keys })
        setBusy(false)
        if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
        onClose()
        done(
          exit.value,
          `Websitechat van ${channel.storeName} ontkoppeld`,
          "De chat verdwijnt van je winkel. De gesprekken blijven in de inbox."
        )
      }}
    >
      {channel === undefined ? null : (
        <div className="flex flex-col gap-4">
          <WidgetPreview greeting={channel.greeting} store={channel.storeName} />
          <p className="text-ink-2 text-sm leading-relaxed">
            Staat de chat nog niet op je winkel? Zet de app-embed van Insyte aan in je thema.
          </p>
          <button
            type="button"
            onClick={() => openTheme(channel.activateUrl)}
            className="flex h-8 w-fit items-center rounded-md bg-paper px-3 font-medium text-ink text-sm hover:bg-ink/6"
          >
            Thema openen
          </button>
        </div>
      )}
    </FormDialog>
  )
}
