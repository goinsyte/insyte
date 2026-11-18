import { beforeAll, describe, expect, it } from "vitest"
import { failure, ok, person, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The staff admin (M18) through the Worker: finding a workspace, its health, and looking along read-only with the
 * owner's consent. The worker tests are a `local` stage, so the team's person names themself in the dev header (on
 * staging that is refused: `staff-admin.staging.test.ts`); the allowlist is `staff@example.com` (`vitest.config.ts`).
 * Access's JWT itself is `staff-access.worker.test.ts`.
 */

const STAFF = "staff@example.com"

// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const admin = async (
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) => {
  const response = await call(`http://api.test/api/__admin${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      "x-insyte-dev-staff": STAFF,
      "x-insyte-staff": "1",
      "content-type": "application/json",
      ...init.headers
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
  })
  return { status: response.status, body: await response.json().catch(() => null) as Json, headers: response.headers }
}

const read = (sessionId: string, rpcName: string, payload?: unknown) =>
  admin(`/sessions/${sessionId}/read`, { body: { rpc: rpcName, payload } })

const unchecked = async (sessionId: string, rpcName: string, payload?: unknown) => {
  const response = await call("http://api.test/api/__dev/staff/unchecked-read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ staff: STAFF, sessionId, rpc: rpcName, payload })
  })
  return { status: response.status, body: await response.json() as Json }
}

const logbook = async (cookie: string) =>
  (ok(await rpc("Audit.list", { category: "settings", page: "privacy" }, cookie)).lines as Array<Json>)
    .filter((line) => line.field === "Insyte-support" || line.field === "Insyte-support mag meekijken")

const trail = async (workspace: string) => (await admin(`/audit?workspace=${workspace}`)).body.lines as Array<Json>

describe("the staff admin", () => {
  let owner: { email: string; cookie: string }
  let other: { email: string; cookie: string }
  let workspace: string
  let otherWorkspace: string
  const name = `Meekijk BV ${run}`

  beforeAll(async () => {
    owner = await person("staff-owner", name)
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    other = await person("staff-other", `Ander BV ${run}`)
    otherWorkspace = ok(await sessionMe(other.cookie)).principals[0]!.workspaceId
  }, 60_000)

  describe("its gate", () => {
    it("refuses a request without a person of the team", async () => {
      const response = await call("http://api.test/api/__admin/me")
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: { code: "forbidden" } })
    })

    it("refuses an address not on the allowlist", async () => {
      expect((await admin("/me", { headers: { "x-insyte-dev-staff": "intruder@example.com" } })).status).toBe(403)
    })

    it("refuses a change without the staff page's own header", async () => {
      const response = await call("http://api.test/api/__admin/sessions", {
        method: "POST",
        headers: { "x-insyte-dev-staff": STAFF, "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace, reason: "test" })
      })
      expect(response.status).toBe(403)
    })

    it("refuses a read without the staff page's own header, though not the page, its script or its style", async () => {
      for (const path of ["/me", "/workspaces?q=Meekijk", `/audit`, "/sessions/sts_none"]) {
        const response = await call(`http://api.test/api/__admin${path}`, { headers: { "x-insyte-dev-staff": STAFF } })
        expect(response.status, path).toBe(403)
      }
      for (const path of ["", "/staff.js", "/staff.css"]) {
        const response = await call(`http://api.test/api/__admin${path}`, { headers: { "x-insyte-dev-staff": STAFF } })
        expect(response.status, path).toBe(200)
      }
    })

    it("serves the page with a CSP that allows nothing but itself", async () => {
      const response = await call("http://api.test/api/__admin", { headers: { "x-insyte-dev-staff": STAFF } })
      expect(response.status).toBe(200)
      expect(await response.text()).toContain("Werkruimte zoeken")
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'")
      expect(response.headers.get("cache-control")).toBe("no-store")
    })

    it("says who is signed in and what may be read", async () => {
      const me = await admin("/me")
      expect(me.status).toBe(200)
      expect(me.body.email).toBe(STAFF)
      expect(me.body.reads.map((r: Json) => r.rpc)).toContain("Team.get")
      // Billing is for the people of the workspace alone (`peopleOnly`): not on the list, so never offered.
      expect(me.body.reads.map((r: Json) => r.rpc)).not.toContain("Billing.get")
    })
  })

  describe("finding a workspace", () => {
    it("by its name, its id and its owner's address, with no shopper's data", async () => {
      const byName = (await admin(`/workspaces?q=${encodeURIComponent(name)}`)).body.workspaces as Array<Json>
      expect(byName.map((w) => w.id)).toEqual([workspace])
      expect(Object.keys(byName[0]).toSorted()).toEqual(
        ["billing", "consentUntil", "createdAt", "health", "id", "members", "name", "openIncidents", "plan", "stores"]
      )
      expect(byName[0]).toMatchObject({ name, members: 1, stores: 0, consentUntil: null })
      expect((await admin(`/workspaces?q=${workspace}`)).body.workspaces.map((w: Json) => w.id)).toEqual([workspace])
      expect((await admin(`/workspaces?q=${encodeURIComponent(owner.email)}`)).body.workspaces.map((w: Json) => w.id))
        .toEqual([workspace])
      expect((await admin("/workspaces?q=x")).body.workspaces).toEqual([])
    })

    it("its health, from what the workspace already has", async () => {
      const health = await admin(`/workspaces/${workspace}/health`)
      expect(health.status).toBe(200)
      expect(health.body.workspace).toMatchObject({ id: workspace, name })
      expect(health.body).toMatchObject({ connections: [], webhookGaps: [], errors: [] })
      expect(health.body.outbox).toMatchObject({ stuck: 0 })
      expect(health.body.billing).toHaveProperty("plan")
      expect(health.body.ai).toHaveProperty("usedEuros")
      expect((await admin("/workspaces/ws_00000000000000000000000000/health")).status).toBe(404)
    })

    it("writes each health read in the workspace's Logboek too, consent or not", async () => {
      const before = (await logbook(owner.cookie)).length
      await admin(`/workspaces/${workspace}/health`)
      const lines = await logbook(owner.cookie)
      expect(lines).toHaveLength(before + 1)
      expect(lines[0]).toMatchObject({
        field: "Insyte-support",
        after: "Insyte-support bekeek de status",
        actor: { name: "Insyte-support" }
      })
    })

    it("writes each search and health read to the team's audit", async () => {
      const lines = await trail(workspace)
      expect(lines.some((l) => l.action === "workspace.health" && l.outcome === "ok" && l.staff === STAFF)).toBe(true)
      const all = (await admin("/audit")).body.lines as Array<Json>
      expect(all.some((l) => l.action === "workspaces.search")).toBe(true)
    })
  })

  describe("looking along", () => {
    let session: string

    it("is refused while the owner has not consented", async () => {
      const start = await admin("/sessions", { body: { workspaceId: workspace, reason: "Ticket 1" } })
      expect(start).toMatchObject({ status: 403, body: { error: { code: "no_consent" } } })
      expect((await trail(workspace)).some((l) => l.action === "session.start" && l.code === "no_consent")).toBe(true)
    })

    it("the consent is the owner's alone, for seven days", async () => {
      const before = ok(await rpc("Support.status", undefined, owner.cookie))
      expect(before).toMatchObject({ until: null, session: null, canChange: true, days: 7 })
      const on = ok(await rpc("Support.setAccess", { on: true }, owner.cookie))
      const days = (on.until! - Date.now()) / 86_400_000
      expect(days).toBeGreaterThan(6.9)
      expect(days).toBeLessThanOrEqual(7)
      const lines = await logbook(owner.cookie)
      expect(lines[0]).toMatchObject({ field: "Insyte-support mag meekijken", before: "Uit", after: "Aan" })
    })

    it("needs a reason", async () => {
      const start = await admin("/sessions", { body: { workspaceId: workspace, reason: " " } })
      expect(start).toMatchObject({ status: 403, body: { error: { code: "reason_required" } } })
    })

    it("starts, for at most an hour, and every member sees it", async () => {
      const start = await admin("/sessions", { body: { workspaceId: workspace, reason: "Ticket 42" } })
      expect(start.status).toBe(200)
      session = start.body.session.id
      const minutes = (Date.parse(start.body.session.expiresAt) - Date.parse(start.body.session.startedAt)) / 60_000
      expect(minutes).toBeCloseTo(60, 0)
      const status = ok(await rpc("Support.status", undefined, owner.cookie))
      expect(status.session).not.toBeNull()
      expect(status.session!.endsAt).toBe(Date.parse(start.body.session.expiresAt))
      expect((await logbook(owner.cookie))[0]).toMatchObject({
        field: "Insyte-support",
        after: "Meekijken gestart. Reden: Ticket 42",
        actor: { name: "Insyte-support" }
      })
    })

    it("reads what a member at Bekijken would, recorded on both sides before it runs", async () => {
      const team = await read(session, "Team.get")
      expect(team.status).toBe(200)
      expect(team.body.ok).toBe(true)
      const emails = JSON.stringify(team.body.value)
      expect(emails).toContain(owner.email)
      expect((await logbook(owner.cookie))[0]).toMatchObject({ field: "Insyte-support", after: "Bekeken: Team" })
      expect((await trail(workspace)).find((l) => l.action === "session.read")).toMatchObject({
        sessionId: session,
        rpc: "Team.get",
        outcome: "ok"
      })
    })

    it("names the record it read in both trails, and answers a failure with its code alone", async () => {
      const order = "ord_00000000000000000000000000"
      const missing = await read(session, "Orders.get", { id: order })
      expect(missing.status).toBe(200)
      expect(missing.body).toEqual({ ok: false, code: "NotFound" })
      expect((await logbook(owner.cookie))[0]).toMatchObject({ after: `Bekeken: Een bestelling (${order})` })
      const lines = (await trail(workspace)).filter((l) => l.action === "session.read" && l.rpc === "Orders.get")
      expect(lines.map((l) => [l.outcome, l.detail])).toEqual([["failed", order], ["ok", order]])
      // Only an id is named, never what was typed into a search.
      await read(session, "Orders.list", { q: "jan@example.com" })
      expect((await logbook(owner.cookie))[0]).toMatchObject({ after: "Bekeken: Bestellingen" })
    })

    it("does not read Billing: it is the workspace's people's alone", async () => {
      expect((await read(session, "Billing.get")).body.error.code).toBe("not_readable")
    })

    it("stays in the workspace it was started for: row level security holds it there", async () => {
      const team = await unchecked(session, "Team.get")
      expect(team.body.ok).toBe(true)
      expect(JSON.stringify(team.body.value)).not.toContain(other.email)
      const roles = await read(session, "Roles.list")
      expect(roles.body.ok).toBe(true)
      expect(JSON.stringify(roles.body.value)).not.toContain(otherWorkspace)
    })

    it("refuses anything not on the list of reads", async () => {
      const cancel = await read(session, "Orders.cancel", { id: "ord_none" })
      expect(cancel).toMatchObject({ status: 403, body: { error: { code: "not_readable" } } })
      expect((await read(session, "No.such")).body.error.code).toBe("not_readable")
      expect((await trail(workspace)).some((l) => l.rpc === "Orders.cancel" && l.outcome === "refused")).toBe(true)
    })

    it("never exports, erases, deletes or reveals, whatever the list says", async () => {
      for (
        const tag of [
          "Data.export",
          "Data.exports.get",
          "Audit.export",
          "Sheets.export",
          "Privacy.requestErasure",
          "Privacy.requestAccess",
          "Workspaces.requestExport",
          "Workspaces.requestDeletion",
          "Webhooks.revealSecret",
          "Billing.invoiceUrl",
          "Billing.portalSession"
        ]
      ) {
        expect((await read(session, tag, {})).body.error.code, tag).toBe("never_for_staff")
      }
    })

    it("past the list, Policy refuses every write as staff_viewer", async () => {
      const invite = await unchecked(session, "Invitations.send", {
        rows: [{ email: `staff-${run}@invited.test`, roleId: "view", stores: "all" }]
      })
      expect(invite.body).toMatchObject({ ok: false, code: "Forbidden" })
      expect(failure(await rpc("Team.get", undefined, owner.cookie))).toBeUndefined()
      const team = ok(await rpc("Team.get", undefined, owner.cookie))
      expect(JSON.stringify(team)).not.toContain(`staff-${run}@invited.test`)
    })

    it("and under Policy, the database's transaction is read-only", async () => {
      const todo = await unchecked(session, "Todos.add", { text: "Van support", due: null })
      expect(todo.body).toMatchObject({ ok: false, code: "read_only" })
      const after = ok(await rpc("Todos.list", undefined, owner.cookie))
      expect(JSON.stringify(after)).not.toContain("Van support")
    })

    it("is not a way into the public API or the MCP server", async () => {
      const headers = { "x-insyte-dev-staff": STAFF, authorization: `Bearer ${session}` }
      expect((await call("http://api.test/v1/orders", { headers })).status).toBe(401)
      const mcp = await call("http://api.public.test/mcp", {
        method: "POST",
        headers: { ...headers, accept: "application/json, text/event-stream", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
      })
      expect(mcp.status).toBe(401)
    })

    it("is only its own person's: another of the team cannot read through it", async () => {
      const response = await call(`http://api.test/api/__admin/sessions/${session}/read`, {
        method: "POST",
        headers: {
          "x-insyte-dev-staff": "second@example.com",
          "x-insyte-staff": "1",
          "content-type": "application/json"
        },
        body: JSON.stringify({ rpc: "Team.get" })
      })
      // Not on this run's allowlist: the gate refuses before the session is looked at.
      expect(response.status).toBe(403)
    })

    it("ends, after which nothing more is read", async () => {
      const end = await admin(`/sessions/${session}/end`, { body: {} })
      expect(end.status).toBe(200)
      expect(end.body.session.endedAt).not.toBeNull()
      expect((await read(session, "Team.get")).body.error.code).toBe("session_ended")
      expect(ok(await rpc("Support.status", undefined, owner.cookie)).session).toBeNull()
      expect((await logbook(owner.cookie))[0]).toMatchObject({ after: "Meekijken beëindigd" })
      const ends = (await trail(workspace)).filter((l) => l.sessionId === session && l.action === "session.end")
      expect(ends).toHaveLength(1)
    })

    it("expires after its hour", async () => {
      const expired = await call(`http://api.test/api/__dev/staff/expired?staff=${STAFF}&workspace=${workspace}`, {
        method: "POST"
      })
      const id = ((await expired.json()) as { id: string }).id
      expect((await read(id, "Team.get")).body.error.code).toBe("session_expired")
      expect(ok(await rpc("Support.status", undefined, owner.cookie)).session).toBeNull()
      expect((await trail(workspace)).some((l) => l.sessionId === id && l.code === "session_expired")).toBe(true)
    })

    it("stops when the consent runs out, and when the owner turns it off", async () => {
      const start = await admin("/sessions", { body: { workspaceId: workspace, reason: "Ticket 44" } })
      const id = start.body.session.id as string
      await call(`http://api.test/api/__dev/staff/age-consent?workspace=${workspace}`, { method: "POST" })
      expect((await read(id, "Team.get")).body.error.code).toBe("consent_expired")
      expect((await admin("/sessions", { body: { workspaceId: workspace, reason: "Ticket 45" } })).body.error.code)
        .toBe("consent_expired")
      ok(await rpc("Support.setAccess", { on: true }, owner.cookie))
      expect((await read(id, "Team.get")).body.ok).toBe(true)
      ok(await rpc("Support.setAccess", { on: false }, owner.cookie))
      expect((await read(id, "Team.get")).body.error.code).toBe("no_consent")
      expect(ok(await rpc("Support.status", undefined, owner.cookie))).toMatchObject({ until: null, session: null })
    })

    it("cannot be started in another workspace without its owner's consent", async () => {
      const start = await admin("/sessions", { body: { workspaceId: otherWorkspace, reason: "Ticket 46" } })
      expect(start.body.error.code).toBe("no_consent")
      expect(ok(await rpc("Support.status", undefined, other.cookie)).session).toBeNull()
    })
  })

  describe("a store's health", () => {
    it("says why a sweep failed as a code, never the text the sweep kept", async () => {
      const store = await importedStore("staff-health")
      const stage = async (reason: string) => {
        await call(`http://api.test/api/__dev/stores/health?workspace=${store.workspace}&store=${store.storeId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stage: { failures: 2, failure: reason }, check: false })
        })
        return (await admin(`/workspaces/${store.workspace}/health`)).body.connections[0]
      }
      expect(await stage("credentials")).toMatchObject({ failures: 2, failure: "credentials" })
      expect(await stage("Klant jan@example.com: 422 Unprocessable")).toMatchObject({ failure: "other" })
    })
  })
})
