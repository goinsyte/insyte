import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/dialog"
import { Switch } from "../../components/switch"
import { Check, Minus, Search } from "../../icons"
import { Field, SelectField, TextField } from "../common/form-dialog"
import type { StoreScope } from "../lib/permissions"
import { cn } from "../lib/utils"
import { API_VERSIONS, type ApiVersion, EVENT_GROUPS, RETRY, type WebhookEndpoint } from "../lib/webhooks-core"
import { GHOST_BTN, PRIMARY_BTN, Segmented } from "../team/bits"
import { StorePicker } from "../team/bits"
import { HeadersEditor } from "./bits"
import { type EndpointDraft, useWebhooksSource } from "./webhooks-source"

const URL_OK = /^https:\/\/[^\s/]+\.[^\s]+$/

type Draft = EndpointDraft

const BLANK: Draft = {
  url: "",
  description: "",
  events: ["order.created"],
  apiVersion: API_VERSIONS[0],
  stores: "all",
  headers: [],
  retry: 5,
  active: true
}

/**
 * Adding or changing an endpoint: where it goes and what it is for, which events, which API version
 * shapes the payload, which stores, headers sent along with every delivery, how often a failure is
 * tried again, and whether it is on. The signing secret is made here and shown on the endpoint.
 */
export function WebhookDialog(
  { open, onOpenChange, endpoint, onSaved }: {
    open: boolean
    onOpenChange: (v: boolean) => void
    endpoint?: WebhookEndpoint
    onSaved?: (id: string) => void
  }
) {
  const source = useWebhooksSource()
  const [d, setD] = useState<Draft>(BLANK)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (!open) return
    setD(
      endpoint
        ? {
          url: endpoint.url,
          description: endpoint.description,
          events: endpoint.events,
          apiVersion: endpoint.apiVersion,
          stores: endpoint.stores,
          headers: endpoint.headers,
          retry: endpoint.retry,
          active: endpoint.active
        }
        : BLANK
    )
    setTouched(false)
  }, [open, endpoint])
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const urlOk = URL_OK.test(d.url.trim())
  const ok = urlOk && d.events.length > 0

  async function save() {
    setTouched(true)
    if (!ok || saving) return
    const clean = {
      ...d,
      url: d.url.trim(),
      description: d.description.trim(),
      headers: d.headers.filter((h) => h.key.trim())
    }
    setSaving(true)
    try {
      if (endpoint) {
        const undo = await source.update(endpoint.id, clean)
        if (!undo) return
        toast("Endpoint bijgewerkt", { action: { label: "Ongedaan maken", onClick: undo } })
        onSaved?.(endpoint.id)
      } else {
        const id = await source.create(clean)
        if (!id) return
        toast.success("Endpoint toegevoegd", { description: "Stuur een testevent om te zien of het aankomt." })
        onSaved?.(id)
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[680px] [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{endpoint ? "Endpoint bewerken" : "Endpoint toevoegen"}</DialogTitle>
          <DialogDescription>
            Insyte stuurt voor elk gekozen event een ondertekende JSON-body naar deze URL.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Field label="URL">
              <TextField
                value={d.url}
                onChange={(url) => set({ url })}
                placeholder="https://hooks.northwind.co/insyte"
                type="url"
              />
            </Field>
            {touched && !urlOk
              ? (
                <span className="text-signal-red text-xs">
                  Een volledige https-URL, zoals https://hooks.northwind.co/insyte. Gewone http sturen we niet.
                </span>
              )
              : null}
          </div>
          <Field label="Omschrijving">
            <TextField
              value={d.description}
              onChange={(description) => set({ description })}
              placeholder="Waar het voor is, zodat een collega het later snapt"
            />
          </Field>

          <EventPicker
            value={d.events}
            onChange={(events) => set({ events })}
            error={touched && d.events.length === 0}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="API-versie" hint="Bepaalt de vorm van de payload.">
              <SelectField<ApiVersion>
                value={d.apiVersion}
                onChange={(apiVersion) => set({ apiVersion })}
                options={API_VERSIONS}
                renderLabel={(v) => (v === API_VERSIONS[0] ? `${v} · nieuwste` : v)}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="font-medium text-ink-3 text-sm leading-none">Opnieuw proberen</span>
              <Segmented
                label="Opnieuw proberen"
                value={d.retry}
                onChange={(retry) => set({ retry })}
                options={RETRY.map((r) => ({ id: r.id, label: r.id === 0 ? "Geen" : String(r.id) }))}
              />
              <span className="text-ink-3 text-xs">{RETRY.find((r) => r.id === d.retry)?.detail}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium text-ink-3 text-sm leading-none">Alleen events van</span>
            <StorePicker value={d.stores} onChange={(stores: StoreScope) => set({ stores })} stores={source.stores} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium text-ink-3 text-sm leading-none">Extra headers</span>
            <HeadersEditor value={d.headers} onChange={(headers) => set({ headers })} />
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-mist px-3.5 py-3">
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-base text-ink">Actief</span>
              <span className="text-ink-2 text-sm">
                Uit betekent: events worden niet verstuurd en ook niet bewaard.
              </span>
            </span>
            <Switch checked={d.active} onCheckedChange={(active) => set({ active })} aria-label="Actief" />
          </label>

          <DialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} className={GHOST_BTN}>
              Annuleren
            </button>
            <button type="submit" className={PRIMARY_BTN} disabled={saving}>
              {endpoint ? "Opslaan" : "Endpoint toevoegen"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Events by area, searchable, with a whole area in one click and a count of what is picked. */
export function EventPicker(
  { value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: boolean }
) {
  const [q, setQ] = useState("")
  const picked = new Set(value)
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase()
    return EVENT_GROUPS.map((g) => ({
      ...g,
      events: t
        ? g.events.filter((e) =>
          e.id.includes(t) || e.label.toLowerCase().includes(t) || g.label.toLowerCase().includes(t)
        )
        : g.events
    })).filter((g) => g.events.length)
  }, [q])
  const total = EVENT_GROUPS.reduce((n, g) => n + g.events.length, 0)
  const toggle = (id: string) => onChange(picked.has(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-ink-3 text-sm leading-none">Events</span>
        <span className={cn("text-sm tabular-nums", error ? "text-signal-red" : "text-ink-3")}>
          {error ? "Kies minstens één event" : `${value.length} van ${total} gekozen`}
        </span>
      </div>
      <label className="field flex h-9 items-center gap-2 rounded-md px-3 focus-within:bg-paper">
        <Search className="size-3.5 text-ink-3" strokeWidth={1.75} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek een event, zoals order.paid of chargeback"
          aria-label="Zoek een event"
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
        />
      </label>
      <div className="flex max-h-[300px] flex-col gap-3 overflow-y-auto rounded-lg bg-mist p-2">
        {groups.length === 0
          ? (
            <p className="px-2 py-3 text-ink-3 text-sm">
              Geen event dat zo heet. Zoek op een woord als bestelling, ticket of voorraad.
            </p>
          )
          : null}
        {groups.map((g) => {
          const ids = g.events.map((e) => e.id)
          const n = ids.filter((id) => picked.has(id)).length
          const all = n === ids.length
          return (
            <div key={g.area} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="font-medium text-ink text-sm">
                  {g.label} <span className="font-normal text-ink-3 tabular-nums">{n ? `· ${n}` : ""}</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange(all ? value.filter((x) => !ids.includes(x)) : [...new Set([...value, ...ids])])}
                  className="rounded-md px-1.5 py-0.5 font-medium text-arc-ink text-xs hover:bg-arc-tint"
                >
                  {all ? "Niets van dit gebied" : "Alle events van dit gebied"}
                </button>
              </div>
              <div className="grid gap-0.5 sm:grid-cols-2">
                {g.events.map((e) => {
                  const on = picked.has(e.id)
                  return (
                    <button
                      key={e.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(e.id)}
                      className={cn(
                        "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                        on ? "bg-paper" : "hover:bg-ink/5"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-sm",
                          on
                            ? "bg-abyss text-mesh-ink"
                            : "bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_18%,transparent)]"
                        )}
                      >
                        {on ? <Check className="size-3" strokeWidth={2.5} /> : null}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-ink text-sm">{e.label}</span>
                        <span className="truncate text-ink-3 text-xs tabular-nums">{e.id}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {value.length ?
        (
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex items-center gap-1 self-start rounded-md px-1.5 py-0.5 font-medium text-ink-2 text-xs hover:bg-ink/6"
          >
            <Minus className="size-3" strokeWidth={2} />
            Alles wissen
          </button>
        ) :
        null}
    </div>
  )
}
