import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import {
  CLOCK_SKEW_MS,
  domainOfInput,
  type DomainRecord,
  DomainsFailed,
  type DomainsUnavailable,
  DomainTaken,
  FRESH_MS,
  PENDING_MS,
  type ProviderDomain,
  recordsOf,
  RELEASE_MS,
  type SaveSenders,
  SendingDomains,
  type SendingDomainState,
  type SetUpDomain,
  type StoredDomain,
  type StoredSenders
} from "../domain/SendingDomain.ts"
import { readRow, saveIn } from "./sections.ts"
import { domainNameOf, storedOf } from "./senders.ts"

/*
 * E-mail en domein on the server (M17 step 20.1c; widgets/05 §7.4). Reading takes Instellingen · Bekijken; setting up,
 * checking again, taking the domain away and saving the senders take Bewerken.
 *
 * - `get` shows the domain as last read, and reads Resend again only when that read is older than `FRESH_MS`: every
 *   workspace shares one Resend account and its rate limit with the mail itself. It never makes a domain.
 * - `setUp` ("Domein instellen") claims the name in `sending_domains` first, unique across workspaces, and only then
 *   makes it at Resend. Resend saying the name is taken is this workspace's own domain only when Resend made it after
 *   the claim: a set-up whose answer (or whose write here) was lost is picked up again, a name someone else made is not.
 * - `verify` asks Resend to check the DNS again and the DNS for DMARC, counts the check and writes the audit line
 *   "DNS-records gevonden" (`settings.domain_senders.records`, before and after as found counts).
 * - `remove` ("Domein verwijderen", after the page's confirm) takes the domain away at Resend and lets the claim go.
 * - `recheck` is the daily re-check, as `system`: a verified domain is checked again so a lapsed one stops being used as
 *   the sender, and a claim never verified within `RELEASE_MS` is let go.
 * - `saveSenders` is `WorkspaceSettings.save` for section `domain_senders`, answered as the page's state.
 *
 * A key that cannot manage domains, or none, is `unavailable` and never shows a record; nothing is made up. Resend is
 * called outside the database transactions, so a slow answer holds no row.
 */

type Stamp = { version: number; updatedAt: number | null }

const stampOf = (row: { version: number; updatedAt: Date | null } | undefined): Stamp => ({
  version: row?.version ?? 0,
  updatedAt: row?.updatedAt?.getTime() ?? null
})

/** The workspace's claim on a name: Resend's id once made there, when it was claimed and first seen verified. */
interface Claim {
  readonly name: string
  readonly providerId: string | null
  readonly claimedAt: number
  readonly verifiedAt: number | null
}

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

const claimOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ name: string; providerId: string | null; claimedAt: Date; verifiedAt: Date | null }>`
      select name, provider_id, claimed_at, verified_at from sending_domains`,
    (rows): Claim | undefined => {
      const c = rows[0]
      return c === undefined ? undefined : {
        name: c.name,
        providerId: c.providerId,
        claimedAt: c.claimedAt.getTime(),
        verifiedAt: c.verifiedAt?.getTime() ?? null
      }
    }
  )

/** What the page reads in one transaction: the stored section, its version, the claim, and the domain it is about. */
const readIn = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const row = yield* readRow(sql, "domain_senders")
    const stored = storedOf(row?.value)
    const claim = yield* claimOf(sql)
    // Without a domain made, the one a set-up is pending for, else the website's.
    const name = stored.domain === null || stored.domain === undefined
      ? claim?.name ?? (yield* domainNameOf(sql, null))
      : stored.domain.name
    return { stored, stamp: stampOf(row), claim, name }
  })

const read = Effect.flatMap(Effect.service(Db), (db) => db.scoped(readIn))

/** The workspace whose rows these are: the request's, or the job's. */
type Who = { readonly workspaceId: string; readonly actor: Audit.Actor }

const SYSTEM: Audit.Actor = { kind: "system", id: "insyte" }

/**
 * The domain's state written beside the senders, without a new version (the version guards what people type), and
 * its claim marked verified the first time it is.
 */
const writeDomain = (sql: SqlClient.SqlClient, who: Who, domain: StoredDomain | null) =>
  Effect.gen(function*() {
    const json = JSON.stringify(domain)
    yield* sql`
      insert into workspace_settings (workspace_id, section, value, updated_by)
      values (${who.workspaceId}, 'domain_senders',
              jsonb_build_object('from', '', 'replyTo', '', 'domain', ${json}::jsonb), ${who.actor.id})
      on conflict (workspace_id, section) do update
        set value = jsonb_set(workspace_settings.value, '{domain}', ${json}::jsonb)`
    if (domain?.verified === true) {
      yield* sql`update sending_domains set verified_at = coalesce(verified_at, now())`
    }
  })

const found = (records: ReadonlyArray<DomainRecord>) => records.filter((r) => r.status === "found").length

/** The domain as Resend has it now, merged into what was kept: DMARC as last seen unless asked again. */
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
    checks: (previous?.checks ?? 0) + (checked === undefined ? 0 : 1),
    readAt: Date.now()
  }
}

/** The domain Resend made for this claim, if any: by its id, or by name where Resend made it after the claim. */
const madeFor = (claim: Claim) =>
  Effect.gen(function*() {
    if (claim.providerId !== null) return claim.providerId
    const hit = yield* (yield* SendingDomains).find(claim.name)
    return hit !== undefined && hit.createdAt >= claim.claimedAt - CLOCK_SKEW_MS ? hit.id : undefined
  })

/** Takes away at Resend what a claim made there, if anything (a pending set-up's too). */
const takeAway = (claim: Claim) =>
  Effect.gen(function*() {
    const id = yield* madeFor(claim)
    if (id !== undefined) yield* (yield* SendingDomains).remove(id)
  })

/** The claim and the kept domain let go, said in the audit log as the domain going. */
const letGo = (sql: SqlClient.SqlClient, who: Who, name: string) =>
  Effect.gen(function*() {
    yield* sql`delete from sending_domains`
    yield* sql`update workspace_settings set value = jsonb_set(value, '{domain}', 'null'::jsonb)
               where section = 'domain_senders'`
    yield* Audit.write(sql, who.workspaceId, who.actor, {
      action: "settings.domain_senders.domain",
      subjectType: "sending_domain",
      subjectId: name,
      section: "domain_senders",
      diff: { before: name, after: null }
    })
  })

const principalWho = Effect.map(
  CurrentPrincipal,
  (p): Who => ({ workspaceId: p.workspaceId, actor: { kind: p.kind, id: p.id } })
)

export const get = Effect.fn("SendingDomain.get")(function*() {
  yield* Policy.require("settings", 1)
  const provider = yield* SendingDomains
  const first = yield* read
  if (!provider.configured) return stateOf("unavailable", first.stored, first.name, first.stamp)
  const known = first.stored.domain
  if (known === null || known === undefined) return stateOf("unclaimed", first.stored, first.name, first.stamp)
  // Read lately: what is kept stands, and Resend's rate limit is left to the mail.
  if (Date.now() - (known.readAt ?? 0) < FRESH_MS) return stateOf("ready", first.stored, first.name, first.stamp)
  const now = yield* provider.get(known.providerId).pipe(
    Effect.map((d) => storedFrom(known, d, undefined)),
    Effect.catchTags({
      DomainsUnavailable: () => Effect.succeed("unavailable" as const),
      // Unreachable: what was read before stands, with when it was checked.
      DomainsFailed: () => Effect.succeed("failed" as const)
    })
  )
  if (now === "unavailable") return stateOf("unavailable", first.stored, first.name, first.stamp)
  if (now === "failed") return stateOf("ready", first.stored, first.name, first.stamp)
  const who = yield* principalWho
  const db = yield* Db
  yield* db.scoped((sql) => writeDomain(sql, who, now))
  const last = yield* read
  return stateOf("ready", last.stored, last.name, last.stamp)
})

/**
 * Claims `name` for this workspace, unless another holds it. A pending claim on another name is handed back to be
 * taken away first.
 */
const claim = (sql: SqlClient.SqlClient, workspaceId: string, name: string) =>
  Effect.gen(function*() {
    const own = yield* claimOf(sql)
    if (own !== undefined) return own.name === name ? { ours: own } : { other: own }
    // The name is unique across workspaces; a row this workspace cannot see holding it is someone else's claim.
    const rows = yield* sql<{ claimedAt: Date }>`
      insert into sending_domains (workspace_id, name) values (${workspaceId}, ${name})
      on conflict do nothing returning claimed_at`
    const row = rows[0]
    return row === undefined
      ? { taken: true as const }
      : { ours: { name, providerId: null, claimedAt: row.claimedAt.getTime(), verifiedAt: null } as Claim }
  })

export const setUp = Effect.fn("SendingDomain.setUp")(function*(input: SetUpDomain) {
  yield* Policy.require("settings", 2)
  const name = domainOfInput(input.name)
  if (name === null) return yield* new Invalid({ fields: { domain: "format" } })
  const provider = yield* SendingDomains
  const db = yield* Db
  const who = yield* principalWho
  const first = yield* read
  const said = (state: SendingDomainState["state"]) => stateOf(state, first.stored, name, first.stamp)
  if (!provider.configured) return said("unavailable")
  // Set up already: the page shows it; another name takes "Domein verwijderen" first.
  if (first.stored.domain !== null && first.stored.domain !== undefined) {
    return stateOf("ready", first.stored, first.name, first.stamp)
  }
  let claimed = yield* db.scoped((sql) => claim(sql, who.workspaceId, name))
  if ("other" in claimed) {
    // An earlier set-up for another name never finished: what it made at Resend goes, and so does its claim.
    const other = claimed.other
    const gone = yield* takeAway(other).pipe(Effect.as(true), Effect.orElseSucceed(() => false))
    if (!gone) return said("failed")
    claimed = yield* db.scoped((sql) =>
      Effect.andThen(sql`delete from sending_domains`, claim(sql, who.workspaceId, name))
    )
  }
  if ("taken" in claimed || "other" in claimed) return said("taken")
  const ours = claimed.ours
  const made = yield* Effect.gen(function*() {
    // Its id kept already: read it. Else make it; Resend says so if it was made before (a lost answer or write).
    if (ours.providerId !== null) return yield* provider.get(ours.providerId)
    return yield* provider.create(name).pipe(
      // Taken at Resend: ours only if Resend made it after the claim (a set-up whose answer was lost).
      Effect.catchTag("DomainTaken", () =>
        Effect.flatMap(
          madeFor(ours),
          (id): Effect.Effect<ProviderDomain, DomainTaken | DomainsFailed | DomainsUnavailable> =>
            id === undefined ? Effect.fail(new DomainTaken()) : provider.get(id)
        ))
    )
  }).pipe(
    Effect.map((d) => ({ made: d })),
    Effect.catchTags({
      DomainsUnavailable: () => Effect.succeed({ state: "unavailable" as const, keep: false }),
      DomainTaken: () => Effect.succeed({ state: "taken" as const, keep: false }),
      // Unreachable, or the answer lost: the claim stays, so the next try finds what Resend made.
      DomainsFailed: () => Effect.succeed({ state: "failed" as const, keep: true })
    })
  )
  if (!("made" in made)) {
    if (!made.keep) yield* db.scoped((sql) => sql`delete from sending_domains where provider_id is null`)
    return said(made.state)
  }
  const d = made.made
  const dmarc = yield* provider.dmarc(d.name).pipe(Effect.orElseSucceed(() => false))
  const keep = storedFrom(null, d, dmarc)
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* sql`update sending_domains set provider_id = ${d.id} where name = ${name}`
      yield* writeDomain(sql, who, keep)
      yield* Audit.write(sql, who.workspaceId, who.actor, {
        action: "settings.domain_senders.domain",
        subjectType: "sending_domain",
        subjectId: keep.name,
        section: "domain_senders",
        diff: { before: null, after: keep.name }
      })
    })
  )
  const last = yield* read
  return stateOf("ready", last.stored, last.name, last.stamp)
})

export const verify = Effect.fn("SendingDomain.verify")(function*() {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  const provider = yield* SendingDomains
  const who = yield* principalWho
  const first = yield* read
  const known = first.stored.domain
  // Nothing set up yet: there is nothing to check.
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
      yield* writeDomain(sql, who, keep)
      yield* Audit.write(sql, who.workspaceId, who.actor, {
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

/**
 * "Domein verwijderen": the domain taken away at Resend, then here. The records put at the domain host stop counting:
 * another domain has records of its own. Until one is verified, shoppers' mail goes from Insyte.
 */
export const remove = Effect.fn("SendingDomain.remove")(function*() {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  const provider = yield* SendingDomains
  const who = yield* principalWho
  const first = yield* read
  if (!provider.configured) return stateOf("unavailable", first.stored, first.name, first.stamp)
  const known = first.stored.domain
  const claimed = first.claim
  if ((known === null || known === undefined) && claimed === undefined) {
    return stateOf("unclaimed", first.stored, first.name, first.stamp)
  }
  const at: Claim = claimed ?? { name: known!.name, providerId: known!.providerId, claimedAt: 0, verifiedAt: null }
  const gone = yield* takeAway({ ...at, providerId: known?.providerId ?? at.providerId }).pipe(
    Effect.as("gone" as const),
    Effect.catchTags({
      DomainsUnavailable: () => Effect.succeed("unavailable" as const),
      DomainsFailed: () => Effect.succeed("failed" as const)
    })
  )
  // Not taken away at Resend: nothing changes here either, or the name would stay taken there with no claim to it.
  if (gone !== "gone") return stateOf(gone, first.stored, first.name, first.stamp, gone === "failed")
  yield* db.scoped((sql) => letGo(sql, who, at.name))
  const last = yield* read
  return stateOf("unclaimed", last.stored, last.name, last.stamp)
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
  const state = !provider.configured ? "unavailable" : known ? "ready" : "unclaimed"
  return { domain: stateOf(state, last.stored, last.name, last.stamp), undo }
})

/* ── the daily re-check (as `system`) ──────────────────────────────────────────────────────────── */

/** The workspaces with a claim, for the daily re-check; read before any workspace is in scope. */
export const dueDomainWorkspaces = Effect.flatMap(Effect.service(Db), (db) =>
  db.routing((sql) =>
    Effect.map(
      sql<{ workspaceId: string }>`select workspace_id from sending_domains_due()`,
      (rows) => rows.map((r) => r.workspaceId)
    )
  ))

export type RecheckOutcome = "none" | "unavailable" | "pending" | "released" | "checked" | "failed"

/**
 * One workspace's daily re-check, as `system`: a set-up whose answer never came is cleaned up after `PENDING_MS`; a
 * claim never verified is let go after `RELEASE_MS`; any other is checked at Resend again, so a domain that lapsed
 * (a DNS record taken off) stops being the sender until it is fixed. A failure leaves it for tomorrow.
 */
export const recheck = Effect.fn("SendingDomain.recheck")(function*() {
  const provider = yield* SendingDomains
  if (!provider.configured) return "unavailable" as RecheckOutcome
  const db = yield* Db
  const workspace = yield* CurrentWorkspace
  const who: Who = { workspaceId: workspace.id, actor: SYSTEM }
  const first = yield* db.scopedFor(readIn)
  const claimed = first.claim
  if (claimed === undefined) return "none" as RecheckOutcome
  const age = Date.now() - claimed.claimedAt
  const known = first.stored.domain
  const lapsed = claimed.providerId === null
    ? age > PENDING_MS
    : claimed.verifiedAt === null && age > RELEASE_MS
  if (lapsed) {
    const gone = yield* takeAway(claimed).pipe(Effect.as(true), Effect.orElseSucceed(() => false))
    if (!gone) return "failed" as RecheckOutcome
    yield* db.scopedFor((sql) => letGo(sql, who, claimed.name))
    return "released" as RecheckOutcome
  }
  if (claimed.providerId === null || known === null || known === undefined) return "pending" as RecheckOutcome
  const now = yield* provider.verify(known.providerId).pipe(
    Effect.andThen(provider.get(known.providerId)),
    Effect.flatMap((d) =>
      Effect.map(provider.dmarc(d.name).pipe(Effect.option), (dmarc) => ({
        ...storedFrom(known, d, dmarc._tag === "Some" ? dmarc.value : undefined),
        checkedAt: Date.now()
      }))
    ),
    Effect.catchTags({
      DomainsUnavailable: () => Effect.fail(new DomainsFailed({ reason: "unavailable" })),
      DomainsFailed: (e) => Effect.fail(e)
    }),
    Effect.option
  )
  if (now._tag === "None") return "failed" as RecheckOutcome
  const keep = now.value
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* writeDomain(sql, who, keep)
      if (keep.verified !== known.verified) {
        yield* Audit.write(sql, who.workspaceId, who.actor, {
          action: "settings.domain_senders.records",
          subjectType: "sending_domain",
          subjectId: keep.name,
          section: "domain_senders",
          diff: { before: found(known.records), after: found(keep.records) }
        })
      }
    })
  )
  return "checked" as RecheckOutcome
})
