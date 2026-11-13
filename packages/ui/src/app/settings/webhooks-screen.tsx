import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import { Switch } from "../../components/switch"
import { ArrowLeft, ChevronRight, Edit3, Eye, EyeOff, Plus, RefreshCcw, Send, Trash2, Webhook } from "../../icons"
import { Blocked } from "../access/blocked"
import { EmptyState } from "../common/empty-state"
import { PageGuide } from "../common/page-guide"
import { CopyButton, MadeByName, Notice, StatusCode, Token } from "../developer/bits"
import { DeliveryDrawer } from "../developer/delivery-drawer"
import { WebhookDialog } from "../developer/webhook-dialog"
import { EditGate as Gate, useWebhooksSource, type WebhooksSearch } from "../developer/webhooks-source"
import { formatDate, formatRelative } from "../lib/format"
import { storeScopeLabel } from "../lib/permissions"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import {
  AUTO_DISABLE_AFTER,
  delivered,
  type EndpointState,
  EVENT_LABEL,
  type Health,
  RETRY,
  timedOut,
  type WebhookEndpoint
} from "../lib/webhooks-core"
import { Segmented, WELL_BTN } from "../team/bits"
import { BandedList, SectionAction, SettingCard, StatusPill } from "./setting-card"

export type Search = WebhooksSearch

const STATE: Record<EndpointState, { tone: "success" | "warning" | "danger" | "info" | "neutral"; label: string }> = {
  active: { tone: "success", label: "In orde" },
  failing: { tone: "danger", label: "Mislukt" },
  disabled: { tone: "danger", label: "Uitgezet door Insyte" },
  paused: { tone: "neutral", label: "Uit" },
  new: { tone: "info", label: "Wacht op eerste event" }
}

const pct = (n: number) => `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`

const GUIDE = [
  {
    title: "Events naar je systemen",
    body:
      "Insyte stuurt de events die je kiest als POST met JSON naar je endpoint. Bijvoorbeeld een betaalde bestelling naar het magazijn.",
    art: "webhook"
  },
  {
    title: "Elke levering ondertekend",
    body:
      "De header Insyte-Signature is een HMAC van de body met het geheim van het endpoint. Controleer hem voordat je een levering vertrouwt.",
    art: "lock"
  },
  {
    title: "Antwoord binnen 10 seconden",
    body: "Met een 2xx. Alles anders telt als mislukt en wordt opnieuw geprobeerd volgens het schema.",
    art: "log"
  },
  {
    title: "Uit na herhaalde fouten",
    body:
      `Na ${AUTO_DISABLE_AFTER} mislukte leveringen op rij zet Insyte een endpoint uit. Er gaan dan geen events meer heen tot je het weer aanzet.`,
    art: "notify"
  },
  {
    title: "Dubbel en versie",
    body:
      "Een event kan twee keer komen: herken hem aan Insyte-Delivery. De API-versie van het endpoint bepaalt de vorm van de payload.",
    art: "flow"
  }
] as const

function healthLine(h: Health) {
  return h.rate === null ? "Geen leveringen in 24 uur" : `${pct(h.rate)} geslaagd in 24 uur`
}

/**
 * Webhooks: the endpoints Insyte posts events to, and what happened to every delivery.
 *
 * The list leads with health — how many of the last day's deliveries got a 2xx back — because that
 * is the one thing to know about an endpoint you are not looking at. An endpoint that keeps failing
 * is warned before Insyte stops sending to it, and says so in words once it has.
 */
export function WebhooksPage() {
  const { endpoint } = useWebhooksSource().search
  const hooks = useWebhooksSource().endpoints
  const open = hooks.find((w) => w.id === endpoint)
  return (
    <>
      {open ? <EndpointDetail w={open} /> : <EndpointList />}
      <PageGuide id="settings.webhooks" title="Webhooks" steps={GUIDE} />
    </>
  )
}

function EndpointList() {
  const source = useWebhooksSource()
  const hooks = source.endpoints
  const edit = source.can.edit
  const [adding, setAdding] = useState(false)
  const go = (id: string) => source.go({ endpoint: id })
  const failing = hooks.filter((w) => w.failures > 0 || w.autoDisabled)

  return (
    <>
      <SettingCard
        title={hooks.length ? `Endpoints · ${hooks.length}` : "Endpoints"}
        icon={Webhook}
        subtitle={failing.length
          ? `${failing.length} ${failing.length === 1 ? "endpoint geeft" : "endpoints geven"} fouten`
          : undefined}
        action={
          <Gate perm="integrations" arg={2} className="shrink-0 whitespace-nowrap">
            <SectionAction icon={<Plus className="size-3.5" strokeWidth={2} />} onClick={() => setAdding(true)}>
              Endpoint toevoegen
            </SectionAction>
          </Gate>
        }
      >
        {hooks.length === 0 ?
          (
            <div className="rounded-xl bg-paper">
              <EmptyState
                kind="automations"
                title="Nog geen webhooks"
                body="Stuur events naar je eigen systemen."
                {...(edit.ok ? { action: { label: "Eerste endpoint toevoegen", onClick: () => setAdding(true) } } : {})}
              />
            </div>
          ) :
          (
            <BandedList>
              {hooks.map((w) => {
                const stats = source.stats(w)
                const state = stats.state
                const pill = STATE[state]
                return (
                  <li
                    key={w.id}
                    className="group/item flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-ink/3"
                  >
                    <button
                      type="button"
                      onClick={() => go(w.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-md",
                          state === "failing" || state === "disabled"
                            ? "bg-signal-red-bg text-signal-red"
                            : "bg-ink/6 text-ink-2"
                        )}
                      >
                        <Webhook className="size-4" strokeWidth={1.75} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium text-base text-ink tabular-nums">{w.url}</span>
                        <span className="truncate text-ink-2 text-sm">{w.description || "Geen omschrijving"}</span>
                        <span className="truncate text-ink-3 text-xs tabular-nums">
                          {w.events.length} {w.events.length === 1 ? "event" : "events"} · {healthLine(stats.health)}
                          {state === "failing" ? ` · ${w.failures} op rij mislukt` : ""}
                        </span>
                      </span>
                      <span className="hidden shrink-0 sm:flex">
                        <StatusPill tone={pill.tone} label={pill.label} />
                      </span>
                    </button>
                    <Gate perm="integrations" arg={2}>
                      <Switch
                        className="data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
                        checked={w.active && !w.autoDisabled}
                        aria-label={`${w.url} aan of uit`}
                        onCheckedChange={async (on) => {
                          const undo = await source.setActive(w.id, on)
                          if (undo) {
                            undoable(
                              on ? "Endpoint staat aan" : "Endpoint staat uit",
                              undo,
                              on ? undefined : "Events in die tijd worden niet bewaard."
                            )
                          }
                        }}
                      />
                    </Gate>
                    <ChevronRight className="hidden size-4 shrink-0 text-ink-4 sm:block" strokeWidth={1.75} />
                  </li>
                )
              })}
            </BandedList>
          )}
      </SettingCard>
      <WebhookDialog open={adding} onOpenChange={setAdding} onSaved={go} />
    </>
  )
}

function EndpointDetail({ w }: { w: WebhookEndpoint }) {
  const source = useWebhooksSource()
  const { levering } = source.search
  const stores = source.stores
  const edit = source.can.edit
  const deliveries = source.useDeliveries(w.id)
  const [cut, setCut] = useState<"all" | "failed" | "retrying">("all")
  const [shown, setShown] = useState(25)
  const [editing, setEditing] = useState(false)
  const [reveal, setReveal] = useState(false)
  const { state, health: h, avgMs: avg } = source.stats(w)
  const secret = source.secretOf(w.id)
  const rows = deliveries.filter((
    d
  ) => (cut === "failed" ? !delivered(d) : cut === "retrying" ? d.nextRetry !== undefined : true))
  const open = deliveries.find((d) => d.id === levering) ?? null
  const openDelivery = (id: string | undefined) =>
    source.go({ endpoint: w.id, ...(id === undefined ? {} : { levering: id }) }, { replace: true })
  const left = AUTO_DISABLE_AFTER - w.failures

  async function test(event: string) {
    const d = await source.sendTest(w.id, event)
    if (!d) return
    if (delivered(d)) {
      toast.success(`Testevent aangekomen · ${d.status} in ${d.ms} ms`, {
        description: EVENT_LABEL[event],
        action: { label: "Bekijken", onClick: () => openDelivery(d.id) }
      })
    } else {toast.error(`Testevent mislukt · ${d.status ?? "time-out"}`, {
        description: "Het endpoint gaf een fout terug. Bekijk het antwoord in de levering.",
        action: { label: "Bekijken", onClick: () => openDelivery(d.id) }
      })}
  }

  async function remove() {
    const undo = await source.remove(w.id)
    if (!undo) return
    source.go({})
    undoable("Endpoint verwijderd", undo, "Er gaan geen events meer heen.")
  }

  async function rotate() {
    const undo = await source.rotateSecret(w.id)
    if (!undo) return
    setReveal(true)
    undoable(
      "Nieuw geheim gemaakt",
      undo,
      "Werk de controle aan jouw kant bij: leveringen worden vanaf nu met het nieuwe geheim ondertekend."
    )
  }

  async function toggleReveal() {
    if (!reveal && secret === undefined && (await source.revealSecret(w.id)) === undefined) return
    setReveal((v) => !v)
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link
          to="/settings/webhooks"
          search={{}}
          className="flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 font-medium text-ink-2 text-sm hover:bg-ink/6 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.75} />
          Alle endpoints
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="flex flex-wrap items-center gap-2 font-medium text-lg text-ink">
              <span className="min-w-0 break-all tabular-nums">{w.url}</span>
              <StatusPill tone={STATE[state].tone} label={STATE[state].label} />
            </h2>
            <p className="text-ink-2 text-sm">{w.description || "Geen omschrijving"}</p>
            <p className="flex flex-wrap items-center gap-1.5 text-ink-3 text-xs">
              <MadeByName memberId={w.created_by} name={source.personName(w.created_by)} /> · toegevoegd{" "}
              {formatDate(w.created_at, { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {edit.ok ?
              (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={state === "disabled" || !w.active}>
                    <button type="button" className={WELL_BTN} disabled={state === "disabled" || !w.active}>
                      <Send className="size-3.5" strokeWidth={1.75} />
                      Testevent sturen
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-[320px] w-[280px] overflow-y-auto">
                    <DropdownMenuLabel>Kies een event</DropdownMenuLabel>
                    {w.events.map((e) => (
                      <DropdownMenuItem
                        key={e}
                        onClick={() => void test(e)}
                        className="flex-col items-start gap-0"
                      >
                        <span className="text-ink">{EVENT_LABEL[e] ?? e}</span>
                        <span className="text-ink-3 text-xs">{e}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) :
              (
                <Blocked reason={edit.reason}>
                  <button type="button" className={WELL_BTN}>
                    <Send className="size-3.5" strokeWidth={1.75} />
                    Testevent sturen
                  </button>
                </Blocked>
              )}
            <Gate perm="integrations" arg={2}>
              <button type="button" onClick={() => setEditing(true)} className={WELL_BTN}>
                <Edit3 className="size-3.5" strokeWidth={1.75} />
                Bewerken
              </button>
            </Gate>
            <Gate perm="integrations" arg={2}>
              <button
                type="button"
                onClick={() => void remove()}
                aria-label="Endpoint verwijderen"
                className={cn(WELL_BTN, "hover:bg-signal-red-bg hover:text-signal-red")}
              >
                <Trash2 className="size-3.5" strokeWidth={1.75} />
              </button>
            </Gate>
          </div>
        </div>
      </div>

      {state === "disabled" ?
        (
          <Notice
            tone="red"
            action={edit.ok ?
              (
                <button
                  type="button"
                  onClick={() => void source.setActive(w.id, true)}
                  className="flex h-8 items-center rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm hover:bg-abyss-2"
                >
                  Weer aanzetten
                </button>
              ) :
              null}
          >
            Insyte heeft dit endpoint uitgezet na {AUTO_DISABLE_AFTER}{" "}
            mislukte leveringen op rij. Er gaan geen events meer heen tot je het weer aanzet.
          </Notice>
        ) :
        state === "failing" ?
        (
          <Notice tone={left <= 2 ? "red" : "amber"}>
            De laatste {w.failures} {w.failures === 1 ? "levering mislukte" : "leveringen mislukten"}. Na nog {left}
            {" "}
            mislukte {left === 1 ? "levering" : "leveringen"}{" "}
            zetten we dit endpoint uit. Verstuur er een opnieuw zodra het weer werkt.
          </Notice>
        ) :
        !w.active ?
        <Notice tone="arc">Dit endpoint staat uit. Zet het aan in de lijst om weer events te ontvangen.</Notice> :
        null}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-glacier sm:grid-cols-5">
        {(
          [
            ["Geslaagd in 24 uur", h.rate === null ? "—" : pct(h.rate)],
            ["Leveringen in 24 uur", `${h.count}${h.failed ? ` · ${h.failed} mislukt` : ""}`],
            ["Gemiddelde duur", avg === null ? "—" : `${avg} ms`],
            ["API-versie", w.apiVersion],
            ["Opnieuw proberen", RETRY.find((r) => r.id === w.retry)?.label ?? ""]
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5 bg-paper px-3.5 py-3">
            <dt className="text-ink-3 text-xs">{k}</dt>
            <dd className="truncate font-medium text-base text-ink tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <SettingCard title="Ondertekening" icon={Eye}>
        <div className="flex flex-col gap-2 rounded-xl bg-paper px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Token className="h-7 px-2 text-sm">
              {reveal && secret !== undefined ? secret : `${w.secret.slice(0, 10)}${"•".repeat(18)}`}
            </Token>
            <Gate perm="integrations" arg={2}>
              <button
                type="button"
                onClick={() => void toggleReveal()}
                className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-sm hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-45"
              >
                {reveal
                  ? <EyeOff className="size-3.5" strokeWidth={1.75} />
                  : <Eye className="size-3.5" strokeWidth={1.75} />}
                {reveal ? "Verbergen" : "Tonen"}
              </button>
            </Gate>
            <Gate perm="integrations" arg={2}>
              <CopyButton value={secret ?? ""} tone="ghost" disabled={secret === undefined} />
            </Gate>
            <Gate perm="integrations" arg={2}>
              <button
                type="button"
                onClick={() => void rotate()}
                className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-sm hover:bg-ink/6 hover:text-ink disabled:pointer-events-none disabled:opacity-45"
              >
                <RefreshCcw className="size-3.5" strokeWidth={1.75} />
                Roteren
              </button>
            </Gate>
          </div>
          {w.secretRotatedAt
            ? <p className="text-ink-3 text-sm">Geroteerd {formatRelative(w.secretRotatedAt)}</p>
            : null}
        </div>
      </SettingCard>

      <SettingCard title={`Events · ${w.events.length}`} icon={Webhook}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1">
            {w.events.map((e) => <Token key={e}>{e}</Token>)}
          </div>
          <p className="text-ink-3 text-sm">
            Uit {storeScopeLabel(w.stores, stores)}
            {w.headers.length
              ? ` · met ${w.headers.length} extra ${w.headers.length === 1 ? "header" : "headers"}: ${
                w.headers.map((x) => x.key).join(", ")
              }`
              : ""}.
          </p>
        </div>
      </SettingCard>

      <SettingCard
        title={`Leveringen · ${deliveries.length}`}
        icon={Send}
        action={
          <Segmented
            label="Leveringen"
            value={cut}
            onChange={(v) => {
              setCut(v)
              setShown(25)
            }}
            options={[
              { id: "all", label: "Alle" },
              { id: "failed", label: "Mislukt" },
              { id: "retrying", label: "Wacht op poging" }
            ]}
          />
        }
      >
        {rows.length === 0 ?
          (
            <p className="rounded-xl bg-paper px-4 py-5 text-ink-3 text-sm">
              {deliveries.length === 0 ? "Nog niets verstuurd." : "Niets in deze selectie."}
            </p>
          ) :
          (
            <div className="table-scroll">
              <table className="w-full min-w-[680px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-ink-3 text-xs">
                    <th className="h-8 px-2.5 font-medium">Event</th>
                    <th className="h-8 px-2.5 font-medium">Status</th>
                    <th className="h-8 px-2.5 text-right font-medium">Pogingen</th>
                    <th className="h-8 px-2.5 text-right font-medium">Duur</th>
                    <th className="h-8 px-2.5 font-medium">Volgende poging</th>
                    <th className="h-8 px-2.5 text-right font-medium">Tijd</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map((d, i) => (
                    <tr
                      key={d.id}
                      onClick={() => openDelivery(d.id)}
                      className={cn(
                        "h-9 cursor-pointer text-ink-2 transition-colors hover:bg-arc-tint",
                        i % 2 ? "bg-paper" : "bg-mist",
                        "[&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md"
                      )}
                    >
                      <td className="px-2.5">
                        <button
                          type="button"
                          onClick={(e) => (e.stopPropagation(), openDelivery(d.id))}
                          className="flex min-w-0 items-center gap-2 text-left"
                        >
                          <span className="truncate text-ink">{EVENT_LABEL[d.event] ?? d.event}</span>
                          <span className="hidden truncate text-ink-3 text-xs tabular-nums lg:inline">{d.event}</span>
                          {d.test
                            ? (
                              <span className="rounded-full bg-arc-tint px-1.5 font-medium text-arc-ink text-2xs">
                                Test
                              </span>
                            )
                            : null}
                        </button>
                      </td>
                      <td className="px-2.5">
                        <StatusCode status={d.status} />
                      </td>
                      <td className="px-2.5 text-right tabular-nums">{d.attempts}</td>
                      <td className="px-2.5 text-right tabular-nums">{timedOut(d) ? "> 10 s" : `${d.ms} ms`}</td>
                      <td className="px-2.5 tabular-nums">{d.nextRetry ? formatRelative(d.nextRetry) : "—"}</td>
                      <td className="whitespace-nowrap px-2.5 text-right tabular-nums">{formatRelative(d.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown < rows.length ?
                (
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + 50)}
                    className="mt-1 flex h-8 items-center rounded-md px-2 font-medium text-arc-ink text-sm hover:bg-arc-tint"
                  >
                    Meer tonen · nog {rows.length - shown}
                  </button>
                ) :
                null}
            </div>
          )}
      </SettingCard>

      <WebhookDialog open={editing} onOpenChange={setEditing} endpoint={w} />
      <DeliveryDrawer delivery={open} endpoint={w} onClose={() => openDelivery(undefined)} onOpen={openDelivery} />
    </>
  )
}
