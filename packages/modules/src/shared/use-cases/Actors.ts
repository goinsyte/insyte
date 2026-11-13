import { Effect } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * Who did something, as a person reads it (M17 step 20.1a): a member by their name, an API key by its label, and the
 * principals that are no person by what they are. For the Logboek and the Prullenbak, which name the actor of an audit
 * line.
 */

const NAMED: Readonly<Record<string, string>> = {
  service_account: "Automatisering",
  agent: "Insyte-agent",
  system: "Insyte",
  insyte: "Insyte-support",
  supplier_contact: "Leverancier",
  affiliate: "Affiliate"
}

export interface ActorRef {
  readonly kind: string
  readonly id: string
}

/** `<kind>:<id>`: how an actor is named in a filter. */
export const actorKey = (actor: ActorRef) => `${actor.kind}:${actor.id}`

/** The names of these actors, by key; one no longer found is "Onbekend". */
export const actorNames = Effect.fn("Actors.names")(
  function*(sql: SqlClient.SqlClient, actors: ReadonlyArray<ActorRef>) {
    const names = new Map<string, string>()
    const members = [...new Set(actors.filter((a) => a.kind === "member").map((a) => a.id))]
    const keys = [...new Set(actors.filter((a) => a.kind === "api_key").map((a) => a.id))]
    if (members.length > 0) {
      const rows = yield* sql<{ id: string; name: string | null }>`
      select m.id, u.name from members m left join auth."user" u on u.id = m.user_id where m.id in ${sql.in(members)}`
      for (const r of rows) if (r.name !== null && r.name !== "") names.set(`member:${r.id}`, r.name)
    }
    if (keys.length > 0) {
      const rows = yield* sql<{ id: string; label: string }>`select id, label from api_keys where id in ${sql.in(keys)}`
      for (const r of rows) names.set(`api_key:${r.id}`, `API-sleutel “${r.label}”`)
    }
    for (const a of actors) {
      const key = actorKey(a)
      if (!names.has(key)) names.set(key, NAMED[a.kind] ?? "Onbekend")
    }
    return names
  }
)
