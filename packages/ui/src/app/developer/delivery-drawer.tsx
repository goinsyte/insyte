import { useRef, useState } from "react"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../components/sheet"
import { RefreshCcw, X } from "../../icons"
import { formatDateTime, formatRelative } from "../lib/format"
import { ZONE } from "../lib/format"
import {
  delivered,
  type Delivery,
  DELIVERY_ERROR,
  EVENT_LABEL,
  timedOut,
  type WebhookEndpoint
} from "../lib/webhooks-core"
import { PRIMARY_BTN } from "../team/bits"
import { BodyView, CopyButton, JsonView, StatusCode, Token } from "./bits"
import { EditGate as Gate, useWebhooksSource } from "./webhooks-source"

/**
 * One delivery, opened from the log: what was sent (headers and body, as Insyte signed them), what
 * came back, how long it took and how many attempts it needed. "Opnieuw versturen" sends the same
 * body again as a new attempt, and the drawer moves to it.
 */
export function DeliveryDrawer(
  { delivery, endpoint, onClose, onOpen }: {
    delivery: Delivery | null
    endpoint: WebhookEndpoint
    onClose: () => void
    onOpen: (id: string) => void
  }
) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <Sheet open={delivery !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-[520px] max-w-[100vw] gap-0 overflow-y-auto bg-paper p-0 sm:max-w-[520px]"
        showCloseButton={false}
        initialFocus={ref}
      >
        {delivery ? <Loaded ref={ref} d={delivery} endpoint={endpoint} onClose={onClose} onOpen={onOpen} /> : null}
      </SheetContent>
    </Sheet>
  )
}

/** The delivery as its host has it in full: the body and answer, which the log leaves out. */
function Loaded(
  { d, ...rest }: {
    d: Delivery
    endpoint: WebhookEndpoint
    onClose: () => void
    onOpen: (id: string) => void
    ref: React.Ref<HTMLDivElement>
  }
) {
  const full = useWebhooksSource().useDelivery(d)
  return <Body d={full} {...rest} />
}

function Body(
  { d, endpoint, onClose, onOpen, ref }: {
    d: Delivery
    endpoint: WebhookEndpoint
    onClose: () => void
    onOpen: (id: string) => void
    ref: React.Ref<HTMLDivElement>
  }
) {
  const source = useWebhooksSource()
  const ok = delivered(d)
  const [redelivering, setRedelivering] = useState(false)
  const ts = Math.floor(Date.parse(d.at) / 1000)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Insyte-Webhooks/1.0",
    "Insyte-Event": d.event,
    "Insyte-Delivery": d.id,
    "Insyte-Api-Version": endpoint.apiVersion,
    "Insyte-Signature": d.signature ?? `t=${ts},v1=${endpoint.secret.slice(6, 22)}…`,
    // A header's value never comes back from the server: there it reads as dots.
    ...Object.fromEntries(endpoint.headers.map((h) => [h.key, h.value || "••••••••"]))
  }
  return (
    <div ref={ref} tabIndex={-1} className="flex min-h-full flex-col outline-none">
      <header className="flex items-start gap-3 bg-mist px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <SheetTitle className="flex flex-wrap items-center gap-2 font-medium text-lg text-ink">
            {EVENT_LABEL[d.event] ?? d.event}
            {d.test
              ? <span className="rounded-full bg-arc-tint px-2 py-0.5 font-medium text-arc-ink text-xs">Test</span>
              : null}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-1.5 text-ink-2 text-sm">
            <Token>{d.event}</Token>
            <Token>{d.id}</Token>
          </SheetDescription>
        </div>
        <button
          type="button"
          aria-label="Sluiten"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-px bg-mist sm:grid-cols-4">
        {(
          [
            ["Antwoord", <StatusCode key="s" status={d.status} />],
            ["Pogingen", `${d.attempts} van ${d.maxAttempts ?? Math.max(endpoint.retry, 1)}`],
            ["Duur", timedOut(d) ? "> 10 s" : `${d.ms} ms`],
            [
              "Verstuurd",
              new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: ZONE }).format(
                new Date(d.at)
              )
            ]
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-1 bg-paper px-5 py-3">
            <dt className="text-ink-3 text-xs">{k}</dt>
            <dd className="font-medium text-base text-ink tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-5 px-5 py-5">
        {d.nextRetry ?
          (
            <p className="rounded-lg bg-signal-amber-bg px-3.5 py-2.5 text-ink text-sm">
              Volgende poging {formatRelative(d.nextRetry)}, om {formatDateTime(d.nextRetry)}. Of verstuur hem nu zelf.
            </p>
          ) :
          !ok ?
          (
            <p className="rounded-lg bg-signal-red-bg px-3.5 py-2.5 text-ink text-sm">
              Alle pogingen zijn op. Herstel het endpoint en verstuur hem opnieuw.
            </p>
          ) :
          null}

        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-ink-3 text-xs">Verzoek · POST {endpoint.url}</h3>
          <dl className="flex flex-col overflow-hidden rounded-lg text-sm">
            {Object.entries(headers).map(([k, v], i) => (
              <div
                key={k}
                className={`grid grid-cols-[150px_minmax(0,1fr)] gap-3 px-3 py-1.5 ${i % 2 ? "bg-paper" : "bg-mist"}`}
              >
                <dt className="truncate text-ink-2">{k}</dt>
                <dd className="break-all text-ink tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-ink-3 text-xs">Body</h3>
            <CopyButton value={JSON.stringify(d.request, null, 2)} label="JSON kopiëren" tone="ghost" className="h-7" />
          </div>
          <JsonView value={d.request} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-medium text-ink-3 text-xs">
            Antwoord van het endpoint{d.status !== null ? ` · ${d.status}` : ""}
          </h3>
          {d.status === null
            ? (
              <p className="rounded-lg bg-mist px-3.5 py-3 text-ink-3 text-sm">
                {DELIVERY_ERROR[d.error ?? "timeout"] ?? DELIVERY_ERROR.timeout}
              </p>
            )
            : <BodyView body={d.response} />}
        </section>
      </div>

      <footer className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 bg-mist px-5 py-3">
        <span className="text-ink-3 text-sm">{formatDateTime(d.at)}</span>
        <Gate perm="integrations" arg={2}>
          <button
            type="button"
            className={PRIMARY_BTN}
            disabled={redelivering}
            onClick={async () => {
              setRedelivering(true)
              const next = await source.redeliver(d.id).finally(() => setRedelivering(false))
              if (!next) return
              if (delivered(next)) {
                toast.success(`Opnieuw verstuurd · ${next.status} in ${next.ms} ms`, {
                  description: "Zelfde body en event-id, zodat het endpoint een dubbele herkent."
                })
              } else {toast.error(`Opnieuw versturen mislukt · ${next.status ?? "geen antwoord"}`, {
                  description: "Bekijk het antwoord in de levering."
                })}
              onOpen(next.id)
            }}
          >
            <RefreshCcw className="size-4" strokeWidth={1.75} />
            Opnieuw versturen
          </button>
        </Gate>
      </footer>
    </div>
  )
}
