import { FIRST_POLICY_VERSION } from "@insyte/modules/agent/domain/Autonomy"
import { beforeAll, describe, expect, it } from "vitest"
import { join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The Logboek on every settings page that saves (M17 step 20.1a): Team, Rollen, Meldingen, Retouren, Insyte AI's
 * Zelfstandigheid, Klantagent, Kennisbank and Limieten, the API keys and the webhooks. Each save is a line on its own
 * page, in Dutch words: what it was and what it became, or what happened and to what, never a key or an id.
 */

type Line = { page: string; path: string; field: string; before: string | null; after: string }

describe("the Logboek on every settings page", () => {
  let owner = ""
  let workspace = ""
  let viewEmail = ""
  let viewId = ""

  /** The page's lines, newest first, as [Wat, Was, Werd]. */
  const on = async (page: string) => {
    const lines = ok(await rpc("Audit.list", { category: "settings", page }, owner)).lines as ReadonlyArray<Line>
    for (const l of lines) expect(l.page, l.field).not.toBe("")
    return lines.map((l) => [l.field, l.before, l.after])
  }
  /** No line names a raw key: a code in camelCase or with an underscore, or an internal id. */
  const readable = (lines: ReadonlyArray<ReadonlyArray<string | null>>) => {
    for (const l of lines) {
      expect(l.join(" "), l[0] ?? "").not.toMatch(/\b[a-z]+[A-Z]\w*\b|\b\w+_\w+\b|\b(mem|rol|key|whk|art)_[0-9a-z]{6,}/)
    }
  }

  beforeAll(async () => {
    const me = await person("log-pages", "Logboek Pagina's B.V.")
    owner = me.cookie
    workspace = ok(await sessionMe(owner)).principals[0]!.workspaceId
    viewEmail = `log-pages-${run}-view@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email: viewEmail, roleId: "view", stores: "all" as const }] }, owner))
    await pastUndo(workspace)
    await relay(workspace)
    await join(viewEmail)
    viewId = ok(await rpc("Team.get", undefined, owner)).members.find((m) => m.email === viewEmail)!.id
  }, 120_000)

  it("logs Team: an invitation sent, resent, its role changed and revoked, and a member's role", async () => {
    const email = `log-pages-${run}-later@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" as const }] }, owner))
    await pastUndo(workspace)
    const id = ok(await rpc("Team.get", undefined, owner)).invitations.find((i) => i.email === email)!.id
    ok(await rpc("Invitations.resend", { id }, owner))
    ok(await rpc("Invitations.setRole", { id, roleId: "view" }, owner))
    ok(await rpc("Invitations.revoke", { ids: [id] }, owner))
    ok(await rpc("Members.setRole", { id: viewId, roleId: "service" }, owner))

    const lines = await on("team")
    expect(lines.slice(0, 5)).toEqual([
      [`log-pages-${run}-view: Rol`, "Alleen lezen", "Klantenservice"],
      ["Uitnodiging ingetrokken", null, email],
      [`${email}: Rol in de uitnodiging`, "Klantenservice", "Alleen lezen"],
      ["Uitnodiging opnieuw verstuurd", null, email],
      ["Uitnodiging verstuurd", null, `${email} (Klantenservice)`]
    ])
    readable(lines)
    // The role they have already: no line.
    ok(await rpc("Members.setRole", { id: viewId, roleId: "service" }, owner))
    expect(await on("team")).toHaveLength(lines.length)
  })

  it("logs Rollen: a role made, its rights changed, and removed", async () => {
    const made = ok(await rpc("Roles.create", { label: `Inpak ${run}`, from: "view" }, owner))
    const role = made.roles.roles.find((r) => r.id === made.id)!
    ok(
      await rpc("Roles.update", {
        id: made.id,
        levels: { ...role.levels, orders: 2 },
        specials: role.specials,
        refundLimit: role.refundLimit,
        stores: role.stores
      }, owner)
    )
    ok(await rpc("Roles.remove", { id: made.id, to: "view" }, owner))

    const lines = await on("roles")
    expect(lines.slice(0, 3)).toEqual([
      ["Rol verwijderd", null, `Inpak ${run}`],
      [`Inpak ${run}: Bestellingen`, "Bekijken", "Bewerken"],
      ["Rol gemaakt", null, `Inpak ${run}`]
    ])
    readable(lines)
  })

  it("logs Meldingen: each changed switch by its kind, and the quiet hours", async () => {
    const p = ok(await rpc("Notifications.prefs", undefined, owner))
    ok(
      await rpc("Notifications.setPrefs", {
        events: { ...p.events, "team.invite": { ...p.events["team.invite"]!, email: false } },
        quiet: { ...p.quiet, weekend: true },
        digest: p.digest,
        follow: p.follow,
        slackChannel: p.slackChannel
      }, owner)
    )
    const lines = await on("notifications")
    expect(lines).toEqual(expect.arrayContaining([
      ["Weekend stil", "Uit", "Aan"],
      [expect.stringMatching(/: e-mail$/), "Aan", "Uit"]
    ]))
    readable(lines)
  })

  it("logs Retouren: the window, by its words", async () => {
    const settings = ok(await rpc("Returns.settings", undefined, owner))
    ok(await rpc("Returns.setSettings", { ...settings, returnDays: settings.returnDays + 15 }, owner))
    const lines = await on("returns")
    expect(lines).toEqual([[
      "Retourtermijn",
      `${settings.returnDays} dagen`,
      `${settings.returnDays + 15} dagen`
    ]])
    expect(ok(await rpc("Audit.facets", undefined, owner)).pages).toContainEqual({ id: "returns", label: "Retouren" })
  })

  it("logs Insyte AI: Zelfstandigheid, Klantagent, Kennisbank and Limieten, each on its own page", async () => {
    ok(await rpc("Autonomy.set", { levels: { AddNote: "auto" }, baseVersion: FIRST_POLICY_VERSION }, owner))
    expect(await on("autonomy")).toEqual([["Interne notitie toevoegen", "Eerst vragen", "Zelf doen"]])

    const agent = ok(await rpc("ChannelAgent.get", undefined, owner)).settings
    ok(await rpc("ChannelAgent.set", { ...agent, tone: "formal" } as never, owner))
    const agentLines = await on("customer-agent")
    expect(agentLines).toContainEqual(["Toon", expect.any(String), "Formeel"])
    readable(agentLines)

    const created = ok(
      await rpc("Knowledge.create", { title: "Verzendtijden", audience: "customer_agent", body: "Concept" }, owner)
    ).article
    ok(await rpc("Knowledge.archive", { id: created.id }, owner))
    expect((await on("knowledge")).slice(0, 2)).toEqual([
      ["Hoofdstuk gearchiveerd", null, "Verzendtijden"],
      ["Hoofdstuk gemaakt", null, "Verzendtijden"]
    ])

    ok(await rpc("AiBudget.setMany", { entries: [{ scope: "workspace", limit: 35 }] }, owner))
    expect(await on("limits")).toEqual([["Limiet per maand: werkruimte", "€ 20", "€ 35"]])

    const pages = ok(await rpc("Audit.facets", undefined, owner)).pages.map((p) => p.id)
    expect(pages).toEqual(expect.arrayContaining(["autonomy", "customer-agent", "knowledge", "limits"]))
  })

  it("logs the API keys and webhooks: made, changed, rotated and revoked or removed", async () => {
    const key = ok(
      await rpc("ApiKeys.create", {
        label: "Boekhouding",
        access: { kind: "role", roleId: "view" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, owner)
    )
    const keyId = key.key.id
    ok(await rpc("ApiKeys.revoke", { id: keyId }, owner))
    expect((await on("api-keys")).slice(0, 2)).toEqual([
      ["API-sleutel ingetrokken", null, "Boekhouding"],
      ["API-sleutel aangemaakt", null, "Boekhouding"]
    ])

    // A hook's path is often its password (a Slack or Zapier hook): the Logboek names the host, never the address.
    const host = `log-${run}.webhooks.example`
    const endpoint = {
      url: `https://${host}/services/T0001/B0001/geheim-${run}`,
      description: "",
      events: ["order.cancelled"],
      apiVersion: "2026-10-01",
      stores: "all" as const,
      headers: [],
      retry: 3 as const,
      active: true
    }
    const id = ok(await rpc("Webhooks.create", endpoint, owner)).endpoint.id
    const moved = `https://${host}/services/T0001/B0002/ander-${run}`
    ok(
      await rpc("Webhooks.update", {
        id,
        ...endpoint,
        url: moved,
        description: "Voorraad",
        events: ["order.cancelled", "order.created"],
        retry: 8 as const
      }, owner)
    )
    ok(await rpc("Webhooks.rotateSecret", { id }, owner))
    ok(await rpc("Webhooks.remove", { id }, owner))
    const lines = await on("webhooks")
    expect(lines.slice(0, 7)).toEqual([
      ["Webhook verwijderd", null, "Voorraad"],
      ["Nieuw geheim gemaakt", null, "Voorraad"],
      ["Voorraad: Adres", null, "gewijzigd"],
      ["Voorraad: Omschrijving", null, "ingevuld"],
      ["Voorraad: Gebeurtenissen", "Bestelling geannuleerd", "Bestelling geannuleerd, Bestelling geplaatst"],
      ["Voorraad: Opnieuw proberen", "3 pogingen", "8 pogingen"],
      ["Webhook toegevoegd", null, host]
    ])

    // Not in any audit row: neither address, nor its secret path.
    const rows = JSON.stringify(
      await (await call(`http://api.test/api/__dev/audit?workspace=${workspace}`)).json()
    )
    expect(rows).toContain(host)
    for (const secret of [endpoint.url, moved, "geheim-", "ander-", "/services/"]) expect(rows).not.toContain(secret)
  })
})
