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
 * finds them all (and DMARC), as DNS records come in. A name with `restricted` in it answers as a sending-only key does,
 * one with `down` as Resend unreachable; a name made before is taken.
 */

const made = new Map<string, { name: string; checks: number }>()

const entry = (record: string, type: string, name: string, value: string, status: string) => ({
  record,
  type,
  name,
  value,
  status
})

const domainOf = (id: string, d: { name: string; checks: number }): ProviderDomain => {
  const dkim = d.checks >= 1 ? "verified" : "not_started"
  const path = d.checks >= 2 ? "verified" : d.checks === 1 ? "pending" : "not_started"
  return {
    id,
    name: d.name,
    status: d.checks >= 2 ? "verified" : d.checks === 1 ? "pending" : "not_started",
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

export const ResendDomainsRecorded = Layer.succeed(SendingDomains)(SendingDomains.of({
  configured: true,
  create: (name) => {
    if (name.includes("restricted")) return Effect.fail(new DomainsUnavailable())
    if (name.includes("down")) return Effect.fail(new DomainsFailed({ reason: "resend unreachable" }))
    if ([...made.values()].some((d) => d.name === name)) return Effect.fail(new DomainTaken())
    const id = crypto.randomUUID()
    made.set(id, { name, checks: 0 })
    return Effect.succeed(domainOf(id, made.get(id)!))
  },
  get: (id) => Effect.map(known(id), (d) => domainOf(id, d)),
  verify: (id) =>
    Effect.map(known(id), (d) => {
      d.checks += 1
    }),
  dmarc: (name) => Effect.succeed([...made.values()].some((d) => d.name === name && d.checks >= 2))
}))
