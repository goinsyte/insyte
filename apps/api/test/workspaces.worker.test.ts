import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, person, relay, run } from "./journeys.ts"
import { rpc, sessionMe } from "./support.ts"

/*
 * Instellingen → Account and Regio on the server (M3.1), through the Worker: a new workspace reads its defaults; the
 * owner changes its facts (the VAT number written as on an invoice), its alert thresholds, its retention and its
 * notation, each a realtime change; a refusal names its field and reason; and a read-only colleague reads the pages but
 * changes nothing.
 */

describe("the workspace's settings", () => {
  let owner = { email: "", cookie: "" }
  let workspace = ""
  let viewer = ""

  beforeAll(async () => {
    owner = await person("settings-owner", "Instellingen Co.")
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const email = `settings-${run}-view@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "view", stores: "all" }] }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    viewer = await join(email)
  }, 120_000)

  it("reads a new workspace's account with the defaults", async () => {
    expect(ok(await rpc("Workspaces.getAccount", undefined, owner.cookie))).toMatchObject({
      name: "Instellingen Co.",
      legalEntity: "",
      vatNumber: "",
      billingEmail: "",
      country: "NL",
      currency: "EUR",
      alerts: { delayHours: 48, disputeAmountMinor: 10_000 },
      retentionDays: 90
    })
  })

  it("saves the account's facts, trimmed, with the VAT number as an invoice writes it", async () => {
    const saved = ok(
      await rpc("Workspaces.saveAccount", {
        name: "  Instellingen B.V. ",
        legalEntity: "Instellingen Holding B.V.",
        vatNumber: "nl 8629.22088 b01",
        billingEmail: "facturen@instellingen.test",
        country: "BE"
      }, owner.cookie)
    )
    expect(saved).toMatchObject({
      name: "Instellingen B.V.",
      legalEntity: "Instellingen Holding B.V.",
      vatNumber: "NL862922088B01",
      billingEmail: "facturen@instellingen.test",
      country: "BE"
    })
    expect(ok(await rpc("Workspaces.getAccount", undefined, owner.cookie)).name).toBe("Instellingen B.V.")
    // The new name is what the session lists the workspace as.
    expect(ok(await sessionMe(owner.cookie)).activePrincipal?.workspaceName).toBe("Instellingen B.V.")
    const changes = (await outboxOf(workspace)).filter((e) =>
      e.event === "records.changed" && e.payload["kind"] === "workspace"
    )
    expect(changes.length).toBeGreaterThan(0)
  })

  it("refuses facts that would not do on an invoice, naming each field", async () => {
    expect(
      failure(
        await rpc("Workspaces.saveAccount", {
          name: " ",
          legalEntity: "x".repeat(201),
          vatNumber: "123",
          billingEmail: "geen-adres",
          country: "Netherlands"
        }, owner.cookie)
      )
    ).toMatchObject({
      _tag: "Invalid",
      fields: {
        name: "required",
        legalEntity: "too_long",
        vatNumber: "format",
        billingEmail: "format",
        country: "invalid"
      }
    })
    // Nothing of it was written.
    expect(ok(await rpc("Workspaces.getAccount", undefined, owner.cookie)).country).toBe("BE")
  })

  it("keeps the alert thresholds between an hour and thirty days, and a dispute from nothing up", async () => {
    expect(ok(await rpc("Workspaces.setAlerts", { delayHours: 24, disputeAmountMinor: 25_000 }, owner.cookie)).alerts)
      .toEqual({ delayHours: 24, disputeAmountMinor: 25_000 })
    expect(failure(await rpc("Workspaces.setAlerts", { delayHours: 0, disputeAmountMinor: -1 }, owner.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { delayHours: "min", disputeAmountMinor: "min" } })
    expect(failure(await rpc("Workspaces.setAlerts", { delayHours: 721, disputeAmountMinor: 0 }, owner.cookie)))
      .toMatchObject({ fields: { delayHours: "max" } })
    expect(failure(await rpc("Workspaces.setAlerts", { delayHours: 1.5, disputeAmountMinor: 0 }, owner.cookie)))
      .toMatchObject({ fields: { delayHours: "min" } })
  })

  it("keeps a closed store's records 30, 90 or 180 days, and nothing else", async () => {
    expect(ok(await rpc("Workspaces.setRetention", { days: 180 }, owner.cookie)).retentionDays).toBe(180)
    expect(failure(await rpc("Workspaces.setRetention", { days: 60 }, owner.cookie))).toMatchObject({
      _tag: "Invalid",
      fields: { days: "invalid" }
    })
  })

  it("reads the notation's defaults and saves a new one, the zone on the workspace", async () => {
    expect(ok(await rpc("Workspaces.getRegional", undefined, owner.cookie))).toEqual(
      expect.objectContaining({
        language: "nl-NL",
        currencyDisplay: "EUR",
        dateFormat: "DD MMM YYYY",
        timeFormat: "24h",
        weekStart: "mon",
        timezone: "Europe/Amsterdam"
      })
    )
    const next = {
      language: "en-GB",
      currencyDisplay: "GBP",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "12h",
      weekStart: "sun",
      timezone: "Europe/London"
    }
    expect(ok(await rpc("Workspaces.saveRegional", next, owner.cookie))).toMatchObject(next)
    expect(ok(await rpc("Workspaces.getRegional", undefined, owner.cookie))).toMatchObject(next)
    expect(failure(await rpc("Workspaces.saveRegional", { ...next, timezone: "Mars/Olympus" }, owner.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { timezone: "invalid" } })
    expect(failure(await rpc("Workspaces.saveRegional", { ...next, weekStart: "wed" }, owner.cookie)))
      .toMatchObject({ fields: { weekStart: "invalid" } })
  })

  it("lets a read-only colleague read both pages and change neither", async () => {
    expect(ok(await rpc("Workspaces.getAccount", undefined, viewer)).name).toBe("Instellingen B.V.")
    expect(ok(await rpc("Workspaces.getRegional", undefined, viewer)).timezone).toBe("Europe/London")
    for (
      const refused of [
        await rpc("Workspaces.saveAccount", {
          name: "Overgenomen",
          legalEntity: "",
          vatNumber: "",
          billingEmail: "",
          country: "NL"
        }, viewer),
        await rpc("Workspaces.setAlerts", { delayHours: 1, disputeAmountMinor: 0 }, viewer),
        await rpc("Workspaces.setRetention", { days: 30 }, viewer),
        await rpc("Workspaces.saveRegional", {
          language: "nl-NL",
          currencyDisplay: "EUR",
          dateFormat: "DD MMM YYYY",
          timeFormat: "24h",
          weekStart: "mon",
          timezone: "Europe/Amsterdam"
        }, viewer)
      ]
    ) expect(failure(refused)).toMatchObject({ _tag: "Forbidden", permission: "settings" })
    expect(ok(await rpc("Workspaces.getAccount", undefined, owner.cookie)).name).toBe("Instellingen B.V.")
  })
})
