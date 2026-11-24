import { Fragment, useState } from "react"
import type { ReactNode } from "react"
import { LineChart } from "../../charts/line-chart.tsx"
import { keyActivity, keyScopes, relative, stamp, storesLabel } from "../../fixtures/settings.ts"
import type { ApiKey, Delivery, Endpoint, Header } from "../../fixtures/settings.ts"
import { STORES } from "../../fixtures/workspace.ts"
import { Tag } from "../../ui/badge.tsx"
import type { Tone } from "../../ui/badge.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { Sheet } from "../../ui/dialog.tsx"
import { Plus, RefreshCcw, Trash, X } from "../../ui/icons.tsx"
import { Field, Input } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { Notice } from "../../ui/notice.tsx"
import { toast } from "../../ui/toast.tsx"
import { CopyValue } from "./parts.tsx"

/*
 * The deeper parts of API-sleutels and Webhooks: one key's use (a chart of the last two weeks, its
 * latest requests, the scopes it holds), the addresses and stores it is held to, and one webhook
 * delivery opened from the log with what was sent and what came back. Ids, paths and payloads are
 * data, but this system has no typewriter face: they are set in the sans, with tabular figures.
 */

const METHOD_TONE: Readonly<Record<string, Tone>> = { GET: "neutral", POST: "good", PATCH: "warn", DELETE: "bad" }

function Method({ method }: { readonly method: string }) {
  return <Tag tone={METHOD_TONE[method] ?? "neutral"} className="w-12 justify-center">{method}</Tag>
}

/** An HTTP answer with its tone: 2xx good, 4xx a warning, 5xx and no answer bad. */
function HttpStatus({ status }: { readonly status: number | null }) {
  const tone: Tone = status === null || status >= 500 ? "bad" : status >= 400 ? "warn" : "good"
  return <Tag tone={tone} className="figure">{status ?? "Time-out"}</Tag>
}

/* ── JSON, readable ──────────────────────────────────────────────────────────────────────────────── */

function json(v: unknown, depth: number): ReactNode {
  const pad = "  ".repeat(depth + 1)
  const end = "  ".repeat(depth)
  if (v === null) return <span className="text-ink-3">null</span>
  if (typeof v === "string") return <span className="text-accent-ink">"{v}"</span>
  if (typeof v === "number" || typeof v === "boolean") return <span className="font-medium text-ink">{String(v)}</span>
  if (Array.isArray(v)) {
    return (
      <>
        <span className="text-ink-3">[</span>
        {"\n"}
        {v.map((x, i) => (
          <Fragment key={i}>
            {pad}
            {json(x, depth + 1)}
            {i < v.length - 1 && <span className="text-ink-3">,</span>}
            {"\n"}
          </Fragment>
        ))}
        {end}
        <span className="text-ink-3">]</span>
      </>
    )
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
    return (
      <>
        <span className="text-ink-3">{"{"}</span>
        {"\n"}
        {entries.map(([k, x], i) => (
          <Fragment key={k}>
            {pad}
            <span className="text-ink-2">"{k}"</span>
            <span className="text-ink-3">:</span> {json(x, depth + 1)}
            {i < entries.length - 1 && <span className="text-ink-3">,</span>}
            {"\n"}
          </Fragment>
        ))}
        {end}
        <span className="text-ink-3">{"}"}</span>
      </>
    )
  }
  return String(v)
}

function JsonView({ value }: { readonly value: unknown }) {
  return (
    <pre className="figure overflow-x-auto rounded-md bg-well px-3 py-2.5 font-sans text-xs leading-[1.7] break-words whitespace-pre-wrap">
      {json(value, 0)}
    </pre>
  )
}

function Body({ text }: { readonly text: string }) {
  try {
    return <JsonView value={JSON.parse(text)} />
  } catch {
    return <p className="rounded-md bg-well px-3 py-2.5 text-xs break-all text-ink-2">{text}</p>
  }
}

const H3 = ({ children }: { readonly children: ReactNode }) => (
  <h3 className="text-xs font-medium text-ink-3">{children}</h3>
)

/* ── one key ─────────────────────────────────────────────────────────────────────────────────────── */

const IP = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/(3[0-2]|[12]?\d))?$/

/** The addresses a key may be used from: none is everywhere. Each is an IPv4 address or a range. */
function IpEditor({ value, onChange, disabled }: {
  readonly value: ReadonlyArray<string>
  readonly onChange: (next: ReadonlyArray<string>) => void
  readonly disabled: boolean
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | undefined>(undefined)
  const add = () => {
    const ip = draft.trim()
    if (ip === "") return
    if (!IP.test(ip)) {
      setError("Een IPv4-adres of een reeks, zoals 185.43.12.0/24")
      return
    }
    if (value.includes(ip)) {
      setError("Dat adres staat er al")
      return
    }
    onChange([...value, ip])
    setDraft("")
    setError(undefined)
  }
  return (
    <div className="flex flex-col gap-2">
      {value.length === 0
        ? <p className="text-sm text-ink-2">Van overal. Zet er adressen in om de sleutel daartoe te beperken.</p>
        : (
          <ul className="flex flex-wrap gap-1.5" aria-label="Toegestane adressen">
            {value.map((ip) => (
              <li key={ip} className="figure inline-flex h-7 items-center gap-1 rounded-sm bg-well pr-0.5 pl-2 text-sm">
                {ip}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`${ip} weghalen`}
                    onClick={() =>
                      onChange(value.filter((x) => x !== ip))}
                    className="inline-flex size-6 items-center justify-center rounded-xs text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-9"
                  >
                    <X size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      {!disabled && (
        <form
          className="flex items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
        >
          <Field label="Adres toevoegen" error={error} className="flex-1">
            {(c) => (
              <Input
                {...c}
                inputMode="decimal"
                placeholder="185.43.12.0/24"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setError(undefined)
                }}
              />
            )}
          </Field>
          <Button type="submit" className="mt-5" icon={<Plus />}>Toevoegen</Button>
        </form>
      )}
    </div>
  )
}

/**
 * One key in its sheet: what it reaches and how much it is used, then the name, the addresses it may
 * come from and the stores it may touch, saved together with an undo. Rotating and revoking stay in
 * the screen, which owns the secret.
 */
export function KeyDetail({ k, edit, onSave, rotate }: {
  readonly k: ApiKey
  readonly edit: boolean
  readonly onSave: (next: Pick<ApiKey, "label" | "ips" | "stores">) => void
  readonly rotate: ReactNode
}) {
  const { days, requests } = keyActivity(k)
  const scopes = keyScopes(k)
  const [name, setName] = useState(k.label)
  const [ips, setIps] = useState<ReadonlyArray<string>>(k.ips)
  const [stores, setStores] = useState<"all" | ReadonlyArray<string>>(k.stores)
  const [shown, setShown] = useState(8)
  const active = k.status === "active"
  const can = edit && active
  const dirty = name.trim() !== k.label || JSON.stringify(ips) !== JSON.stringify(k.ips) ||
    JSON.stringify(stores) !== JSON.stringify(k.stores)
  const total = days.reduce((n, d) => n + d.requests, 0)
  const errors = days.reduce((n, d) => n + d.errors, 0)
  const picked = stores === "all" ? STORES.map((s) => s.id) : stores

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <H3>Verzoeken, laatste 14 dagen</H3>
          <span className="figure text-xs text-ink-3">
            {total.toLocaleString("nl-NL")} ·{" "}
            {total === 0 ? "0" : ((errors / total) * 100).toFixed(1).replace(".", ",")}% fouten
          </span>
        </div>
        {total === 0
          ? <p className="text-sm text-ink-2">Nog geen verzoeken. Zodra de sleutel gebruikt wordt, zie je het hier.</p>
          : (
            <LineChart
              height={150}
              data={{
                labels: days.map((d) => d.label),
                current: days.map((d) => d.requests),
                format: "count"
              }}
            />
          )}
      </section>

      <section className="flex flex-col gap-2">
        <H3>Scopes · {scopes.length}</H3>
        <div className="flex flex-wrap gap-1">
          {scopes.map((s) => <Tag key={s} tone={s.endsWith(".write") ? "accent" : "neutral"}>{s}</Tag>)}
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <H3>Recente verzoeken</H3>
        {requests.length === 0
          ? <p className="text-sm text-ink-2">Nog geen verzoeken.</p>
          : (
            <>
              <ul className="flex flex-col">
                {requests.slice(0, shown).map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5 py-1.5">
                    <Method method={r.method} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="figure truncate text-sm text-ink">{r.path}</span>
                      <span className="figure truncate text-xs text-ink-3">
                        {r.ms} ms · {r.ip} · {relative(r.at)}
                      </span>
                    </span>
                    <HttpStatus status={r.status} />
                  </li>
                ))}
              </ul>
              {shown < requests.length && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => setShown((n) => n + 12)}
                >
                  Meer tonen
                </Button>
              )}
            </>
          )}
      </section>

      {active && (
        <section className="flex flex-col gap-4">
          <Field label="Naam">
            {(c) => <Input {...c} value={name} disabled={!can} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-ink">IP-adressen</span>
            <IpEditor value={ips} onChange={setIps} disabled={!can} />
          </div>
          <fieldset className="flex flex-col gap-2" disabled={!can}>
            <legend className="mb-1.5 text-xs font-medium text-ink">Winkels</legend>
            <Checkbox
              label="Alle winkels"
              description="Ook winkels die je later koppelt."
              checked={stores === "all"}
              disabled={!can}
              onChange={(on) => setStores(on ? "all" : STORES.filter((s) => s.connected).map((s) => s.id))}
            />
            {stores !== "all" && STORES.map((s) => (
              <Checkbox
                key={s.id}
                label={s.name}
                description={s.connected ? undefined : "Ontkoppeld"}
                checked={picked.includes(s.id)}
                disabled={!can}
                onChange={(on) => setStores(on ? [...picked, s.id] : picked.filter((x) => x !== s.id))}
              />
            ))}
            {stores !== "all" && stores.length === 0 && (
              <p className="text-xs text-bad-ink">Kies minstens één winkel</p>
            )}
          </fieldset>
          {dirty && can && (
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={name.trim() === "" || (stores !== "all" && stores.length === 0)}
                onClick={() => onSave({ label: name.trim(), ips, stores })}
              >
                Wijzigingen opslaan
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setName(k.label)
                  setIps(k.ips)
                  setStores(k.stores)
                }}
              >
                Negeren
              </Button>
            </div>
          )}
          {rotate}
        </section>
      )}
    </div>
  )
}

/* ── headers ─────────────────────────────────────────────────────────────────────────────────────── */

/** Headers sent along with every delivery, as name and value. A saved value comes back as dots. */
export function HeadersEditor({ value, onChange }: {
  readonly value: ReadonlyArray<Header>
  readonly onChange: (next: ReadonlyArray<Header>) => void
}) {
  const set = (i: number, next: Partial<Header>) => onChange(value.map((h, j) => (j === i ? { ...h, ...next } : h)))
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-ink">Extra headers</span>
      {value.length === 0 && (
        <p className="text-xs text-ink-3">Bijvoorbeeld een Authorization-header die je eigen server verwacht.</p>
      )}
      {value.map((h, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
          <Input
            aria-label="Naam van de header"
            placeholder="X-Header-Naam"
            value={h.key}
            onChange={(e) =>
              set(i, { key: e.target.value })}
          />
          <Input
            aria-label="Waarde van de header"
            placeholder={h.key !== "" && h.value === "" ? "••••••••" : "Waarde"}
            value={h.value}
            onChange={(e) =>
              set(i, { value: e.target.value })}
          />
          <IconButton label="Header verwijderen" size="sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash />
          </IconButton>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        icon={<Plus />}
        className="self-start"
        onClick={() => onChange([...value, { key: "", value: "" }])}
      >
        Header toevoegen
      </Button>
    </div>
  )
}

/* ── one delivery ────────────────────────────────────────────────────────────────────────────────── */

const time = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${
    String(d.getSeconds()).padStart(2, "0")
  }`

/**
 * One delivery, opened from the log, over the endpoint's sheet: what was sent (headers and body as
 * Insyte signed them), what came back, how long it took and how many attempts it needed. Opnieuw
 * versturen sends the same body again as a new attempt, and the sheet moves to it.
 */
export function DeliverySheet({ delivery: d, endpoint, edit, onClose, onRedeliver }: {
  readonly delivery: Delivery | undefined
  readonly endpoint: Endpoint | undefined
  readonly edit: boolean
  readonly onClose: () => void
  readonly onRedeliver: (d: Delivery) => void
}) {
  const ok = d !== undefined && d.status !== null && d.status < 300
  const headers: ReadonlyArray<readonly [string, string]> = d === undefined || endpoint === undefined ? [] : [
    ["Content-Type", "application/json"],
    ["User-Agent", "Insyte-Webhooks/1.0"],
    ["Insyte-Event", d.event],
    ["Insyte-Delivery", d.id],
    ["Insyte-Api-Version", endpoint.apiVersion],
    ["Insyte-Signature", `t=${Math.floor(d.at.getTime() / 1000)},v1=${endpoint.secret.slice(6, 22)}…`],
    ...endpoint.headers.filter((h) => h.key.trim() !== "").map((h) => [h.key, "••••••••"] as const)
  ]
  return (
    <Sheet
      open={d !== undefined}
      onClose={onClose}
      title={d?.event ?? ""}
      meta={d === undefined ? undefined : `${d.test === true ? "Testevent · " : ""}${d.id} · ${stamp(d.at)}`}
      footer={d !== undefined && edit && (
        <Button icon={<RefreshCcw />} onClick={() => onRedeliver(d)}>Opnieuw versturen</Button>
      )}
    >
      {d !== undefined && endpoint !== undefined && (
        <div className="flex flex-col gap-6">
          <KeyValue
            layout="grid"
            items={[
              { label: "Antwoord", value: <HttpStatus status={d.status} /> },
              { label: "Pogingen", value: `${d.attempts} van ${d.max}`, figure: true },
              { label: "Duur", value: d.status === null ? "> 10 s" : `${d.ms} ms`, figure: true },
              { label: "Verstuurd", value: time(d.at), figure: true }
            ]}
          />
          {d.nextRetry !== undefined
            ? (
              <Notice tone="warn" title={`Volgende poging ${relative(d.nextRetry)}`}>
                Om {stamp(d.nextRetry)}. Of verstuur hem nu zelf.
              </Notice>
            )
            : !ok && (
              <Notice tone="bad" title="Alle pogingen zijn op">
                Herstel het endpoint en verstuur hem opnieuw.
              </Notice>
            )}
          <section className="flex flex-col gap-2">
            <H3>Verzoek · POST {endpoint.url.replace(/^https:\/\//, "")}</H3>
            <dl className="flex flex-col">
              {headers.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 py-1 text-xs">
                  <dt className="truncate text-ink-3">{k}</dt>
                  <dd className="figure break-all text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <H3>Body</H3>
              <CopyValue value={JSON.stringify(d.body, null, 2)} label="JSON" shown="Kopiëren" />
            </div>
            <JsonView value={d.body} />
          </section>
          <section className="flex flex-col gap-2">
            <H3>Antwoord van het endpoint{d.status === null ? "" : ` · ${d.status}`}</H3>
            {d.response === null
              ? (
                <p className="rounded-md bg-well px-3 py-2.5 text-sm text-ink-2">
                  Geen antwoord binnen 10 seconden. Insyte brak de verbinding af.
                </p>
              )
              : <Body text={d.response} />}
          </section>
          <p className="text-xs text-ink-3">Gaat naar {storesLabel(endpoint.stores).toLowerCase()}.</p>
        </div>
      )}
    </Sheet>
  )
}

/** A redelivery: the same body and event id, so the endpoint recognises a duplicate. */
export function redeliver(d: Delivery, endpoint: Endpoint): Delivery {
  const fails = endpoint.failures > 0
  const at = new Date(2026, 10, 23, 14, 31)
  const next: Delivery = {
    id: `${d.id}_r${Math.random().toString(36).slice(2, 6)}`,
    event: d.event,
    at,
    status: fails ? 502 : 200,
    ms: fails ? 9_800 : 168,
    attempts: 1,
    max: d.max,
    ...(d.test === true ? { test: true } : {}),
    body: d.body,
    response: fails ? "<html><body><h1>502 Bad Gateway</h1></body></html>" : "{\"ok\":true}"
  }
  toast(
    fails
      ? { title: "Opnieuw versturen mislukt · 502", body: "Bekijk het antwoord in de levering.", tone: "bad" }
      : {
        title: "Opnieuw verstuurd · 200 in 168 ms",
        body: "Zelfde body en event-id, zodat het endpoint een dubbele herkent.",
        tone: "good"
      }
  )
  return next
}
