import { useState } from "react"
import { channelsSeed } from "../../data-source"
import { FormDialog } from "../common/form-dialog"
import { CHANNEL_LABEL, type ChannelId, type WhatsAppTemplate } from "../lib/channels"
import { cn } from "../lib/utils"
import type { ThreadState } from "../stores/inbox-store"
import { useWorkspace } from "../stores/workspace-store"
import { ChannelMark } from "./channel-mark"
import { ChannelHeaderView, ChatLetterView, ReplyWindowNotice, STEPS, WidgetPreview } from "./chat-views"

/*
 * The inbox's chat channels (PLAN 27, design §4): their mark, their group head, the letter drawn as
 * bubbles with the 24-hour reply window, and the connect flow. Email keeps its own letter. The parts
 * themselves are drawn in `chat-views.tsx`; here they read the design app's stores.
 */

/** A channel's mark: the vendor's own logo, or Insyte's glyph on `abyss` for the website chat. */
export { ChannelMark }

export { ChannelHeaderView, ChatLetterView, ReplyWindowNotice, STEPS, WidgetPreview }

export function useChannelStatus(channel: Exclude<ChannelId, "email">) {
  const it = useWorkspace((s) => s.integrations.find((i) => i.key === channel))
  return {
    live: it?.status === "connected",
    status: it?.status ?? "disconnected",
    account: channelsSeed.accounts[channel].account
  }
}

/** The sticky band over a channel's threads, in the mailbox band's grammar. */
export function ChannelHeader({ channel, count }: { channel: Exclude<ChannelId, "email">; count: number }) {
  const st = useChannelStatus(channel)
  return <ChannelHeaderView channel={channel} count={count} live={st.live} account={st.account} />
}

/**
 * The letter of a chat thread: who and where, the conversation as bubbles, the reply window, and a
 * composer that sends a bubble — or, past the window on WhatsApp, only an approved template.
 */
export function ChatLetter({
  thread,
  now,
  onSend,
  banner,
  composerDisabled
}: {
  thread: ThreadState
  now: number
  onSend: (text: string, template?: WhatsAppTemplate) => void
  /** Put above the conversation: the handover band (§5). */
  banner?: React.ReactNode
  composerDisabled?: string | undefined
}) {
  const channel = thread.channel as Exclude<ChannelId, "email">
  const st = useChannelStatus(channel)
  return (
    <ChatLetterView
      channel={channel}
      customer={thread.participants[0]?.name ?? "Klant"}
      handle={thread.handle}
      orderRef={thread.orderRef}
      messages={thread.chat ?? []}
      live={st.live}
      templates={channelsSeed.templates}
      now={now}
      onSend={onSend}
      banner={banner}
      composerDisabled={composerDisabled}
    />
  )
}

/**
 * Kanaal koppelen: the provider's steps, simulated one at a time, each with what Insyte will and will
 * not get. The last step connects; the channel appears in the inbox's panel.
 */
export function ChannelConnectDialog(
  { channel, onClose }: { channel: Exclude<ChannelId, "email"> | null; onClose: () => void }
) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [greeting, setGreeting] = useState("Hoi! Waar kunnen we je mee helpen?")
  const connect = useWorkspace((s) => s.connectIntegration)
  const steps = channel ? STEPS[channel] : []
  const last = step === steps.length - 1
  return (
    <FormDialog
      open={channel !== null}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          setStep(0)
        }
      }}
      title={channel ? `${CHANNEL_LABEL[channel]} koppelen` : ""}
      description={channel ? `Stap ${step + 1} van ${steps.length}` : undefined}
      primaryLabel={busy ? "Koppelen…" : last ? "Koppelen" : "Volgende"}
      disabled={busy}
      onSubmit={async () => {
        if (!channel) return
        if (!last) return setStep((x) => x + 1)
        setBusy(true)
        await connect(channel)
        setBusy(false)
        onClose()
        setStep(0)
      }}
    >
      {channel ?
        (
          <div className="flex flex-col gap-4">
            <ol className="flex gap-1.5" aria-hidden>
              {steps.map((s, i) => (
                <li key={s.title} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-arc" : "bg-ink/8")} />
              ))}
            </ol>
            <div className="flex items-start gap-3">
              <ChannelMark channel={channel} size={36} />
              <div className="flex flex-col gap-1">
                <p className="font-medium text-ink">{steps[step]?.title}</p>
                <p className="text-ink-2 text-sm leading-relaxed">{steps[step]?.body}</p>
              </div>
            </div>
            {channel === "webchat" && last ?
              (
                <label className="flex flex-col gap-1.5">
                  <span className="font-medium text-ink-3 text-sm">Welkomsttekst</span>
                  <input
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                    className="field h-10 rounded-md px-3 text-base text-ink outline-none focus:bg-paper"
                  />
                </label>
              ) :
              null}
            {channel === "webchat" && last ? <WidgetPreview greeting={greeting} /> : null}
          </div>
        ) :
        null}
    </FormDialog>
  )
}
