import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  WebhookDeliveryDetail,
  WebhookDeliveryView,
  WebhookEndpointView
} from "@insyte/modules/developer/domain/Webhook"
import type { Roles } from "@insyte/modules/roles/domain/Roles"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import type { EndpointDraft, Undo, WebhooksSearch, WebhooksSource } from "@insyte/ui/app/developer/webhooks-source"
import type { ApiVersion, Delivery, WebhookEndpoint } from "@insyte/ui/app/lib/webhooks-core"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo, useState } from "react"
import { deliveriesAtom, deliveryAtom, WEBHOOKS, webhookWrites } from "../data/webhooks.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * Instellingen → Webhooks' source in the console (M19.4): `Webhooks.list` as the screens read it, an endpoint's
 * deliveries and one delivery in full from their own reads, and every change as its RPC, refreshing through `WEBHOOKS`;
 * "Ongedaan maken" spends the change's undo token. The secret is here only once it was made, revealed or rotated in
 * this visit; a header's value never comes back, so the dialog shows it empty and an empty value keeps it. A test send
 * and a redelivery are asked for until their attempt is in.
 */

const iso = (ms: number) => new Date(ms).toISOString()

const asEndpoint = (e: WebhookEndpointView): WebhookEndpoint => ({
  id: e.id,
  url: e.url,
  description: e.description,
  events: [...e.events],
  apiVersion: e.apiVersion as ApiVersion,
  stores: e.stores === "all" ? "all" : [...e.stores],
  // What the page shows of the secret until it is revealed: its prefix.
  secret: e.secretPrefix,
  ...(e.secretRotatedAt === null ? {} : { secretRotatedAt: iso(e.secretRotatedAt) }),
  headers: e.headers.map((key) => ({ key, value: "" })),
  retry: e.retry,
  active: e.active,
  autoDisabled: e.autoDisabledAt !== null,
  failures: e.failures,
  created_at: iso(e.createdAt),
  created_by: e.createdBy
})

const asDelivery = (d: WebhookDeliveryView): Delivery => ({
  id: d.id,
  endpointId: d.endpointId,
  event: d.event,
  status: d.status,
  attempts: d.attempts,
  ms: d.ms ?? 0,
  at: iso(d.at),
  ...(d.nextAttemptAt === null ? {} : { nextRetry: iso(d.nextAttemptAt) }),
  ...(d.test ? { test: true } : {}),
  request: {},
  response: "",
  ...(d.error !== null
    ? { error: d.error }
    : d.outcome === "cancelled"
    ? { error: "cancelled" }
    : d.outcome === "pending"
    ? { error: "pending" }
    : {}),
  maxAttempts: d.maxAttempts
})

const asDetail = (detail: WebhookDeliveryDetail): Delivery => ({
  ...asDelivery(detail.delivery),
  request: (detail.body ?? {}) as Record<string, unknown>,
  response: detail.response ?? "",
  ...(detail.signature === null ? {} : { signature: detail.signature }),
  ...(detail.redacted ? { redacted: true } : {})
})

const COPY: RefusalCopy = {
  gone: "Dat endpoint bestaat niet meer",
  conflicts: {
    disabled: ["Dit endpoint staat uit", "Insyte zette het uit na herhaalde fouten. Zet het eerst weer aan."],
    paused: ["Dit endpoint staat uit", "Zet het eerst aan om iets te versturen."]
  },
  other: (tagged) => {
    if (tagged._tag !== "Invalid") return false
    const [field, reason] = Object.entries(tagged["fields"] as Record<string, string>)[0] ?? ["", ""]
    sayRefusal({ _tag: "Invalid", fields: { [`${field}.${reason}`]: reason } }, {
      gone: COPY.gone,
      invalid: INVALID
    })
    return true
  }
}

const INVALID: Readonly<Record<string, string>> = {
  "url.format": "Een volledige https-URL, zoals https://hooks.northwind.co/insyte.",
  "url.http": "Gewone http sturen we niet: gebruik https.",
  "url.private": "Deze URL wijst naar een intern netwerk. Daar stuurt Insyte niets heen.",
  "url.credentials": "Zet geen gebruikersnaam of wachtwoord in de URL. Gebruik een extra header.",
  "url.port": "Deze poort kan niet. Gebruik 443, 8443 of een poort vanaf 1024.",
  "description.too_long": "Houd de omschrijving onder de 200 tekens.",
  "events.required": "Kies minstens één event.",
  "events.unknown": "Een van de events bestaat niet meer.",
  "apiVersion.unknown": "Die API-versie bestaat niet.",
  "headers.too_many": "Hooguit 10 extra headers.",
  "headers.format": "Een headernaam bestaat uit letters, cijfers en streepjes, en een waarde past op één regel.",
  "headers.forbidden": "Die header zet Insyte zelf. Kies een andere naam.",
  "headers.duplicate": "Elke header mag één keer voorkomen.",
  "headers.too_long": "Een headerwaarde mag hooguit 1000 tekens zijn.",
  "stores.unknown": "Een van de winkels bestaat niet meer.",
  "stores.forbidden": "Je rol reikt niet tot die winkels. Kies alleen winkels waar je bij kunt.",
  "event.unknown": "Dat event bestaat niet."
}

const refused = (error: unknown) => sayRefusal(error, COPY)

const SETTLED = new Set(["delivered", "failed", "cancelled"])

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The change took: its value; otherwise its refusal said. */
const run = async <A>(exit: Exit.Exit<A, unknown>): Promise<A | undefined> => {
  if (Exit.isSuccess(exit)) return exit.value
  refused(failureOf(exit))
  return undefined
}

/** A draft as the server takes it. */
const payloadOf = (draft: EndpointDraft, before?: WebhookEndpointView) => ({
  url: draft.url,
  description: draft.description,
  events: [...draft.events],
  apiVersion: draft.apiVersion,
  stores: draft.stores === "all" ? "all" as const : [...draft.stores],
  // An empty value on a header the endpoint has keeps the value it has.
  headers: draft.headers.map((h) => ({
    key: h.key,
    value: h.value === "" && before?.headers.some((k) => k.toLowerCase() === h.key.trim().toLowerCase()) === true
      ? null
      : h.value
  })),
  retry: draft.retry,
  active: draft.active
})

/** An endpoint's deliveries, from their own read once it is in. */
function useDeliveries(endpointId: string): ReadonlyArray<Delivery> {
  const result = useAtomValue(deliveriesAtom(endpointId))
  const rows = Option.getOrUndefined(AsyncResult.value(result))
  return useMemo(() => (rows ?? []).map(asDelivery), [rows])
}

/** The delivery the drawer opens, in full once its read is in. */
function useDelivery(delivery: Delivery): Delivery {
  const result = useAtomValue(deliveryAtom(delivery.id))
  const detail = Option.getOrUndefined(AsyncResult.value(result))
  return useMemo(() => (detail === undefined ? delivery : asDetail(detail)), [detail, delivery])
}

export function useConsoleWebhooksSource(input: {
  readonly endpoints: ReadonlyArray<WebhookEndpointView>
  readonly stores: ReadonlyArray<StoreView>
  readonly roles: Roles | undefined
  readonly search: WebhooksSearch
  readonly go: WebhooksSource["go"]
}): WebhooksSource {
  const write = {
    create: useAtomSet(webhookWrites.create, { mode: "promiseExit" }),
    update: useAtomSet(webhookWrites.update, { mode: "promiseExit" }),
    setActive: useAtomSet(webhookWrites.setActive, { mode: "promiseExit" }),
    remove: useAtomSet(webhookWrites.remove, { mode: "promiseExit" }),
    revealSecret: useAtomSet(webhookWrites.revealSecret, { mode: "promiseExit" }),
    rotateSecret: useAtomSet(webhookWrites.rotateSecret, { mode: "promiseExit" }),
    sendTest: useAtomSet(webhookWrites.sendTest, { mode: "promiseExit" }),
    redeliver: useAtomSet(webhookWrites.redeliver, { mode: "promiseExit" }),
    delivery: useAtomSet(webhookWrites.delivery, { mode: "promiseExit" }),
    undo: useAtomSet(webhookWrites.undo, { mode: "promiseExit" })
  }
  const edit = useGate("integrations", 2)
  // Secrets made, revealed or rotated in this visit: never kept anywhere else.
  const [secrets, setSecrets] = useState<Readonly<Record<string, string>>>({})
  const know = (id: string, secret: string | undefined) =>
    setSecrets((s) => {
      const next = { ...s }
      if (secret === undefined) delete next[id]
      else next[id] = secret
      return next
    })
  const keys = { reactivityKeys: WEBHOOKS }
  const views = input.endpoints
  const endpoints = useMemo(() => views.map(asEndpoint), [views])
  const people = input.roles?.roles.flatMap((r) => r.holders.members) ?? []

  const undoOf = (token: string, after?: () => void): Undo => () =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      after?.()
    })
  /** A delivery's result: asked for until its attempt is in, for at most fifteen seconds. */
  const settled = async (deliveryId: string): Promise<Delivery | undefined> => {
    let last: WebhookDeliveryDetail | undefined
    for (let i = 0; i < 20; i++) {
      await pause(i === 0 ? 400 : 750)
      const exit = await write.delivery({ payload: { id: deliveryId } })
      if (Exit.isSuccess(exit)) {
        last = exit.value
        if (SETTLED.has(last.delivery.outcome) || last.delivery.attempts > 0) break
      }
    }
    return last === undefined ? undefined : asDetail(last)
  }
  return {
    endpoints,
    stores: input.stores.map((s) => ({ id: s.id, name: s.name })),
    can: { edit },
    search: input.search,
    go: input.go,
    personName: (id) => people.find((p) => p.id === id)?.name ?? "Iemand uit het team",
    stats: (w) => {
      const view = views.find((v) => v.id === w.id)
      const health = view?.health ?? { count: 0, failed: 0, avgMs: null }
      return {
        state: view?.state ?? "new",
        health: {
          rate: health.count === 0 ? null : ((health.count - health.failed) / health.count) * 100,
          count: health.count,
          failed: health.failed
        },
        avgMs: health.avgMs
      }
    },
    useDeliveries,
    useDelivery,
    secretOf: (id) => secrets[id],
    revealSecret: async (id) => {
      const revealed = await run(await write.revealSecret({ payload: { id } }))
      if (revealed !== undefined) know(id, revealed.secret)
      return revealed?.secret
    },
    create: async (draft) => {
      const made = await run(await write.create({ payload: payloadOf(draft), ...keys }))
      if (made === undefined) return undefined
      know(made.endpoint.id, made.secret)
      return made.endpoint.id
    },
    update: async (id, draft) => {
      const before = views.find((v) => v.id === id)
      const change = await run(await write.update({ payload: { id, ...payloadOf(draft, before) }, ...keys }))
      return change === undefined ? undefined : undoOf(change.undo.token)
    },
    setActive: async (id, active) => {
      const change = await run(await write.setActive({ payload: { id, active }, ...keys }))
      return change === undefined ? undefined : undoOf(change.undo.token)
    },
    remove: async (id) => {
      const change = await run(await write.remove({ payload: { id }, ...keys }))
      return change === undefined ? undefined : undoOf(change.undo.token)
    },
    rotateSecret: async (id) => {
      const rotated = await run(await write.rotateSecret({ payload: { id }, ...keys }))
      if (rotated === undefined) return undefined
      know(id, rotated.secret)
      // Taken back, the old secret is the endpoint's again; it is not known here.
      return undoOf(rotated.undo.token, () => know(id, undefined))
    },
    sendTest: async (endpointId, event) => {
      const started = await run(await write.sendTest({ payload: { id: endpointId, event }, ...keys }))
      return started === undefined ? undefined : settled(started.deliveryId)
    },
    redeliver: async (deliveryId) => {
      const started = await run(await write.redeliver({ payload: { id: deliveryId }, ...keys }))
      return started === undefined ? undefined : settled(started.deliveryId)
    }
  }
}
