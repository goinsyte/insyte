import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import {
  type DomainRecord,
  type ProviderDomain,
  recordsOf,
  type SaveSenders,
  SendingDomains,
  type SendingDomainState,
  type StoredDomain,
  type StoredSenders
} from "../domain/SendingDomain.ts"
import { readRow, saveIn } from "./sections.ts"
import { domainNameOf, storedOf } from "./senders.ts"

/*
 * E-mail en domein on the server (M17 step 20.1c; widgets/05 §7.4). Reading takes Instellingen · Bekijken, checking
 * again and saving the senders Bewerken.
 *
 * - `get` reads the domain at the provider, and makes it there on the first read: from the website at Huisstijl, as the
 *   page has no field for the domain itself. What the provider says is kept beside the senders, so the page and the
 *   sending rule (`shared/domain/Senders.ts`) read the newest state, and a provider that does not answer leaves the
 *   last one standing.
 * - `verify` asks the provider to check the DNS again and the DNS for DMARC, counts the check and writes the audit
 *   line "DNS-records gevonden" (`settings.domain_senders.records`, before and after as found counts).
 * - `saveSenders` is `WorkspaceSettings.save` for section `domain_senders`, answered as the page's state.
 *
 * A key that cannot manage domains, or none, is `unavailable` and never shows a record; nothing is made up. The provider
 * is called outside the database transaction, so a slow answer holds no row.
 */

type Stamp = { version: number; updatedAt: number | null }

const stampOf = (row: { version: number; updatedAt: Date | null } | undefined): Stamp => ({
  version: row?.version ?? 0,
  updatedAt: row?.updatedAt?.getTime() ?? null
})

const stateOf = (
  state: SendingDomainState["state"],
  stored: StoredSenders,
  name: string | null,
  stamp: Stamp,
  // Unavailable or without a domain, no record is shown: what is kept is from a key that may no longer apply.
  showRecords = state === "ready"
): SendingDomainState => ({
  state,
  domain: stored.domain?.name ?? name,
  records: showRecords ? [...(stored.domain?.records ?? [])] : [],
  verified: showRecords && (stored.domain?.verified ?? false),
  checkedAt: stored.domain?.checkedAt ?? null,
  checks: stored.domain?.checks ?? 0,
  senders: { from: stored.from, replyTo: stored.replyTo },
  ...stamp
})

/** What the page reads in one transaction: the stored section, its version, and the domain it is about. */
const read = Effect.gen(function*() {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const row = yield* readRow(sql, "domain_senders")
      const stored = storedOf(row?.value)
      return { stored, stamp: stampOf(row), name: yield* domainNameOf(sql, stored.domain) }
    })
  )
})

/** The domain's state written beside the senders, without a new version (the version guards what people type). */
const writeDomain = (sql: SqlClient.SqlClient, workspaceId: string, by: string, domain: StoredDomain) => {
  const json = JSON.stringify(domain)
  return sql`
    insert into workspace_settings (workspace_id, section, value, updated_by)
    values (${workspaceId}, 'domain_senders', jsonb_build_object('from', '', 'replyTo', '', 'domain', ${json}::jsonb),
            ${by})
    on conflict (workspace_id, section) do update set value = jsonb_set(workspace_settings.value, '{domain}', ${json}::jsonb)`
}

const found = (records: ReadonlyArray<DomainRecord>) => records.filter((r) => r.status === "found").length

/** The domain as the provider has it now, merged into what was kept: DMARC as last seen unless asked again. */
const storedFrom = (
  previous: StoredDomain | null | undefined,
  domain: ProviderDomain,
  dmarc: boolean | undefined,
  checked?: number
): StoredDomain => {
  const dmarcFound = dmarc ?? previous?.records.find((r) => r.id === "dmarc")?.status === "found"
  return {
    name: domain.name,
    providerId: domain.id,
    verified: domain.status === "verified",
    records: recordsOf(domain, dmarcFound),
    checkedAt: checked ?? previous?.checkedAt ?? null,
    checks: (previous?.checks ?? 0) + (checked === undefined ? 0 : 1)
  }
}

/**
 * The domain at the provider for this page: read when it was made, made when it was not. Answers the state to show
 * and, where the provider answered, what to keep.
 */
const resolve = Effect.fn("SendingDomain.resolve")(function*(stored: StoredSenders, name: string | null) {
  const provider = yield* SendingDomains
  type Out = { state: SendingDomainState["state"]; keep?: StoredDomain }
  if (!provider.configured) return { state: "unavailable" } as Out
  const known = stored.domain
  if (known !== null && known !== undefined) {
    return yield* provider.get(known.providerId).pipe(
      Effect.map((d): Out => ({ state: "ready", keep: storedFrom(known, d, undefined) })),
      Effect.catchTags({
        DomainsUnavailable: () => Effect.succeed<Out>({ state: "unavailable" }),
        // Unreachable: what was read before stands, with when it was checked.
        DomainsFailed: () => Effect.succeed<Out>({ state: "ready" })
      })
    )
  }
  if (name === null) return { state: "no_domain" } as Out
  return yield* provider.create(name).pipe(
    Effect.flatMap((d) =>
      Effect.map(
        provider.dmarc(d.name).pipe(Effect.orElseSucceed(() => false)),
        (dmarc): Out => ({ state: "ready", keep: storedFrom(null, d, dmarc) })
      )
    ),
    Effect.catchTags({
      DomainsUnavailable: () => Effect.succeed<Out>({ state: "unavailable" }),
      DomainTaken: () => Effect.succeed<Out>({ state: "taken" }),
      DomainsFailed: () => Effect.succeed<Out>({ state: "failed" })
    })
  )
})

export const get = Effect.fn("SendingDomain.get")(function*() {
  yield* Policy.require("settings", 1)
  const db = yield* Db
  const principal = yield* CurrentPrincipal
  const first = yield* read
  const out = yield* resolve(first.stored, first.name)
  const keep = out.keep
  if (keep === undefined) return stateOf(out.state, first.stored, first.name, first.stamp)
  const made = first.stored.domain === null || first.stored.domain === undefined
  if (made || JSON.stringify(keep) !== JSON.stringify(first.stored.domain)) {
    yield* db.scoped((sql) =>
      Effect.gen(function*() {
        // Another read made it first: theirs is the domain.
        const now = storedOf((yield* readRow(sql, "domain_senders", true))?.value).domain
        if (made && now !== null && now !== undefined) return
        yield* writeDomain(sql, principal.workspaceId, principal.id, keep)
        if (made) {
          yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
            action: "settings.domain_senders.domain",
            subjectType: "sending_domain",
            subjectId: keep.name,
            section: "domain_senders",
            diff: { before: null, after: keep.name }
          })
        }
      })
    )
  }
  const last = yield* read
  return stateOf("ready", last.stored, last.name, last.stamp)
})

export const verify = Effect.fn("SendingDomain.verify")(function*() {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  const provider = yield* SendingDomains
  const principal = yield* CurrentPrincipal
  const first = yield* read
  const known = first.stored.domain
  // Not made yet: reading makes it; its records were found just now.
  if (known === null || known === undefined || !provider.configured) return yield* get()
  const checked = yield* provider.verify(known.providerId).pipe(
    Effect.andThen(provider.get(known.providerId)),
    Effect.flatMap((d) =>
      Effect.map(
        provider.dmarc(d.name).pipe(Effect.option),
        (dmarc) => storedFrom(known, d, dmarc._tag === "Some" ? dmarc.value : undefined, Date.now())
      )
    ),
    Effect.map((keep) => ({ state: "ready" as const, keep })),
    Effect.catchTags({
      DomainsUnavailable: () => Effect.succeed({ state: "unavailable" as const, keep: undefined }),
      DomainsFailed: () => Effect.succeed({ state: "failed" as const, keep: undefined })
    })
  )
  const keep = checked.keep
  if (keep === undefined) {
    // Unreachable: the page keeps what it showed and the console says the check did not go through.
    return stateOf(checked.state, first.stored, first.name, first.stamp, checked.state === "failed")
  }
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* writeDomain(sql, principal.workspaceId, principal.id, keep)
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "settings.domain_senders.records",
        subjectType: "sending_domain",
        subjectId: keep.name,
        section: "domain_senders",
        diff: { before: found(known.records), after: found(keep.records) }
      })
    })
  )
  const last = yield* read
  return stateOf("ready", last.stored, last.name, last.stamp)
})

export const saveSenders = Effect.fn("SendingDomain.saveSenders")(function*(input: SaveSenders) {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  const provider = yield* SendingDomains
  const { undo } = yield* db.scoped((sql) =>
    saveIn(sql, {
      section: "domain_senders",
      value: { from: input.from, replyTo: input.replyTo },
      baseVersion: input.baseVersion
    })
  )
  const last = yield* read
  const known = last.stored.domain !== null && last.stored.domain !== undefined
  const state = !provider.configured ? "unavailable" : known ? "ready" : last.name === null ? "no_domain" : "failed"
  return { domain: stateOf(state, last.stored, last.name, last.stamp), undo }
})
