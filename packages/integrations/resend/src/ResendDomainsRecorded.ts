import {
  DomainsFailed,
  DomainsUnavailable,
  DomainTaken,
  type ProviderDomain,
  SendingDomains
} from "@insyte/modules/settings/domain/SendingDomain"
import { Effect, Layer } from "effect"

/*
 * Resend's domains API as a recorded twin (integrations.md §1.1), for the worker tests only (`SENDING_DOMAINS_ADAPTER=
 * recorded`): never a stage, so no record it shows is ever taken for a real one. A domain is made with the three records
 * Resend lists, none found; the first check finds the DKIM key and puts the return path's two in progress, the second
 * finds them all (and DMARC), as DNS records come in. A name made before is taken. Names that say what to play:
 *
 * - `restricted`: a sending-only key; `down`: Resend unreachable.
 * - `elsewhere`: made on the account long ago, by hand or by someone else, so taken and never this claim's.
 * - `lost`: the first make goes through at Resend but its answer never arrives, as a dropped connection.
 * - `lapse`: verified by the second check, failed from the third on, as when the DKIM record is taken off the DNS.
 */

interface Made {
  readonly name: string
  readonly createdAt: number
  checks: number
}

const made = new Map<string, Made>()
const lostOnce = new Set<string>()

const entry = (record: string, type: string, name: string, value: string, status: string) => ({
  record,
  type,
  name,
  value,
  status
})

const domainOf = (id: string, d: Made): ProviderDomain => {
  const lapsed = d.name.includes("lapse") && d.checks >= 3
  const dkim = lapsed ? "failed" : d.checks >= 1 ? "verified" : "not_started"
  const path = d.checks >= 2 ? "verified" : d.checks === 1 ? "pending" : "not_started"
  return {
    id,
    name: d.name,
    status: lapsed ? "failed" : d.checks >= 2 ? "verified" : d.checks === 1 ? "pending" : "not_started",
    region: "eu-west-1",
    records: [
      entry("DKIM", "TXT", "resend._domainkey", "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDrecorded", dkim),
      { ...entry("SPF", "MX", "send", "feedback-smtp.eu-west-1.amazonses.com", path), priority: 10 },
      entry("SPF", "TXT", "send", "v=spf1 include:amazonses.com ~all", path)
    ]
  }
}

const known = (id: string) => {
  const d = made.get(id)
  return d === undefined ? Effect.fail(new DomainsFailed({ reason: "resend 404: not_found" })) : Effect.succeed(d)
}

const byName = (name: string) => [...made.entries()].find(([, d]) => d.name === name)

export const ResendDomainsRecorded = Layer.succeed(SendingDomains)(SendingDomains.of({
  configured: true,
  create: (name) => {
    if (name.includes("restricted")) return Effect.fail(new DomainsUnavailable())
    if (name.includes("down")) return Effect.fail(new DomainsFailed({ reason: "resend unreachable" }))
    if (name.includes("elsewhere") && byName(name) === undefined) {
      made.set(crypto.randomUUID(), { name, createdAt: Date.now() - 365 * 24 * 60 * 60_000, checks: 0 })
    }
    if (byName(name) !== undefined) return Effect.fail(new DomainTaken())
    const id = crypto.randomUUID()
    made.set(id, { name, createdAt: Date.now(), checks: 0 })
    if (name.includes("lost") && !lostOnce.has(name)) {
      lostOnce.add(name)
      return Effect.fail(new DomainsFailed({ reason: "resend unreachable: the answer was lost" }))
    }
    return Effect.succeed(domainOf(id, made.get(id)!))
  },
  get: (id) => Effect.map(known(id), (d) => domainOf(id, d)),
  verify: (id) =>
    Effect.map(known(id), (d) => {
      d.checks += 1
    }),
  find: (name) => {
    const hit = byName(name)
    return Effect.succeed(hit === undefined ? undefined : { id: hit[0], createdAt: hit[1].createdAt })
  },
  remove: (id) =>
    Effect.sync(() => {
      made.delete(id)
    }),
  dmarc: (name) => Effect.succeed([...made.values()].some((d) => d.name === name && d.checks >= 2))
}))
