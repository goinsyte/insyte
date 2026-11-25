import { AGENT_ACTION_IDS, DEFAULT_LEVELS } from "@insyte/domain/AgentActions"
import { AREA_IDS, SPECIAL_IDS } from "@insyte/domain/Permissions"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { policyChanges } from "../src/agent/use-cases/autonomy.ts"
import {
  changesOf,
  eventLabel,
  fieldSpec,
  pageOf,
  pagesOf,
  SECTIONS,
  sectionsOfPage,
  toCsv
} from "../src/audit/domain/Audit.ts"
import type { CustomerAgentSettingsInput } from "../src/channel-agent/domain/ChannelAgent.ts"
import { DEFAULT_HANDOVER_MESSAGE, DEFAULT_HOURS, DEFAULT_RULES } from "../src/channel-agent/domain/Rules.ts"
import { agentChanges } from "../src/channel-agent/use-cases/settings.ts"
import { endpointChanges } from "../src/developer/use-cases/webhooks.ts"
import type { NotifyPrefsInput } from "../src/notifications/domain/Notifications.ts"
import { eventsOf, prefChanges } from "../src/notifications/use-cases/prefs.ts"
import { ReturnSettingsDoc } from "../src/returns/domain/Returns.ts"
import { returnChanges } from "../src/returns/use-cases/settings.ts"
import { rightsChanges } from "../src/roles/use-cases/roles.ts"
import { RETENTION_CLASSES } from "../src/settings/domain/Settings.ts"
import { changes as settingsChanges } from "../src/settings/use-cases/sections.ts"
import { SHIP_STATUSES } from "../src/shared/domain/CustomerFacing.ts"
import type { LogChange } from "../src/shared/use-cases/Audit.ts"

/*
 * The Logboek's lines (M17 step 20.1a): an audit row's diff read as "what it was, what it became" (or, for an event,
 * what happened), on the page the change was made on, and the CSV the export writes. Every field a writer logs has a
 * Dutch label in the catalogue: a new one without fails here.
 */

describe("changesOf", () => {
  it("reads a per-field diff in the page's order, with words for codes", () => {
    const lines = changesOf({
      section: "regional",
      action: "workspace.regional_updated",
      diff: { timeFormat: { from: "24h", to: "12h" }, language: { from: "nl-NL", to: "en-GB" } }
    })
    expect(lines).toEqual([
      { field: "Taal", before: "Nederlands", after: "Engels (VK)" },
      { field: "Tijdnotatie", before: "24-uurs", after: "12-uurs" }
    ])
  })

  it("reads a whole value with its unit", () => {
    expect(changesOf({ section: "retention", action: "workspace.retention_updated", diff: { from: 90, to: 365 } }))
      .toEqual([{ field: "Gegevens leesbaar houden voor", before: "90 dagen", after: "365 dagen" }])
  })

  it("reads an object's from/to field by field and skips the unchanged ones", () => {
    const lines = changesOf({
      section: "alerts",
      action: "workspace.alerts_updated",
      diff: { from: { delayHours: 24, disputeAmountMinor: 50000 }, to: { delayHours: 48, disputeAmountMinor: 50000 } }
    })
    expect(lines).toEqual([{ field: "Late bestelling", before: "24 uur", after: "48 uur" }])
  })

  it("names a depth page's field and its item as the page does, never the key", () => {
    expect(changesOf({
      section: "retention",
      action: "settings.retention.months",
      diff: { key: "logs", before: 12, after: 3 }
    })).toEqual([{ field: "Bewaartermijn Logboeken", before: "1 jaar", after: "3 maanden" }])
    expect(changesOf({
      section: "brand",
      action: "settings.brand.widget",
      diff: { before: "right", after: "left" }
    })).toEqual([{ field: "Chatvenster op de website", before: "Rechtsonder", after: "Linksonder" }])
    expect(changesOf({
      section: "shipping",
      action: "settings.shipping.show",
      diff: { key: "local", before: "all", after: "line" }
    })).toEqual([{ field: "Bij de lokale vervoerder: waar", before: "Overal", after: "Alleen in de statusregel" }])
    expect(changesOf({
      section: "vat",
      action: "settings.vat.vatOnShipping",
      diff: { key: "sto_1", of: "Hoofdwinkel", before: false, after: true }
    })).toEqual([{ field: "Btw over verzending (Hoofdwinkel)", before: "Nee", after: "Ja" }])
    expect(changesOf({ section: "vat", action: "settings.vat.ossNumber", diff: { before: "", after: "NL123" } }))
      .toEqual([{ field: "OSS-nummer", before: "—", after: "NL123" }])
  })

  it("says what happened to a logo, never its file id", () => {
    expect(changesOf({ section: "brand", action: "settings.brand.logo", diff: { before: null, after: "fil_1" } }))
      .toEqual([{ field: "Logo", before: null, after: "toegevoegd" }])
    expect(changesOf({ section: "brand", action: "settings.brand.logo", diff: { before: "fil_1", after: null } }))
      .toEqual([{ field: "Logo", before: null, after: "weggehaald" }])
  })

  it("reads an event as what happened, with its subject", () => {
    expect(changesOf({
      section: "api_keys",
      action: "api_key.created",
      diff: { access: "role", log: { name: "E2E-test tijdelijk" } }
    })).toEqual([{ field: "API-sleutel aangemaakt", before: null, after: "E2E-test tijdelijk" }])
    // An older line without the Logboek's note still says what happened.
    expect(changesOf({ section: "webhooks", action: "webhook.updated", diff: { url: "changed" } }))
      .toEqual([{ field: "Webhook gewijzigd", before: null, after: "" }])
  })

  it("names the subject before each field of a change to one of many", () => {
    expect(changesOf({
      section: "roles",
      action: "role.updated",
      diff: {
        log: {
          name: "QA testrol",
          changes: [{ field: "level", key: "orders", before: 1, after: 2 }, {
            field: "special",
            key: "refunds.write",
            before: false,
            after: true
          }]
        }
      }
    })).toEqual([
      { field: "QA testrol: Bestellingen", before: "Bekijken", after: "Bewerken" },
      { field: "QA testrol: Terugbetalen", before: "Uit", after: "Aan" }
    ])
  })

  it("names the change when the diff says nothing readable", () => {
    expect(changesOf({ section: "account", action: "workspace.updated", diff: null }))
      .toEqual([{ field: "Account", before: null, after: "gewijzigd" }])
  })
})

describe("Je gegevens", () => {
  it("reads the automatic export's schedule as its words, on Je gegevens", () => {
    const row = { section: "data", action: "workspace.export_schedule_updated", diff: { from: "off", to: "weekly" } }
    expect(changesOf(row)).toEqual([{ field: "Automatisch exporteren", before: "Uit", after: "Elke week" }])
    expect(pageOf("data", row.action)).toEqual({ id: "data", label: "Je gegevens", path: "/settings/data" })
  })
})

describe("pages", () => {
  it("puts settings.retention and the nightly erase on Gegevens en privacy, the older retention on Account", () => {
    expect(pageOf("retention", "settings.retention.days").id).toBe("privacy")
    expect(pageOf("retention", "retention.erased").id).toBe("privacy")
    expect(pageOf("retention", "workspace.retention_updated").id).toBe("account")
    expect(sectionsOfPage("privacy")).toEqual(["retention", "support"])
    expect(changesOf({ section: "retention", action: "retention.erased", diff: { log: { name: "12 items" } } }))
      .toEqual([{ field: "Verwijderd na de bewaartermijn", before: null, after: "12 items" }])
  })

  it("puts Insyte-support's consent and its looking along on Gegevens en privacy, as one sentence each", () => {
    expect(pageOf("support", "support.access_changed").id).toBe("privacy")
    expect(changesOf({ section: "support", action: "support.access_changed", diff: { from: false, to: true } }))
      .toEqual([{ field: "Insyte-support mag meekijken", before: "Uit", after: "Aan" }])
    expect(changesOf({ section: "support", action: "support.read", diff: { said: "Bekeken: Team" } }))
      .toEqual([{ field: "Insyte-support", before: null, after: "Bekeken: Team" }])
  })

  it("lists each page once, by its Dutch name", () => {
    const pages = pagesOf([
      { section: "regional", action: "workspace.regional_updated" },
      { section: "account", action: "workspace.updated" },
      { section: "alerts", action: "workspace.alerts_updated" },
      { section: "returns", action: "returns.settings_updated" },
      { section: "webhooks", action: "webhook.created" },
      { section: "ai_limits", action: "ai_budget.changed" }
    ])
    expect(pages.map((p) => p.label)).toEqual(["Account", "Limieten", "Regio", "Retouren", "Webhooks"])
    expect(pages.find((p) => p.id === "returns")?.path).toBe("/settings/returns")
  })

  it("gives every section a page with a path, and every page its own sections to narrow by", () => {
    for (const [section, spec] of Object.entries(SECTIONS)) {
      expect(spec.page.path, section).toMatch(/^\/settings\//)
      expect(sectionsOfPage(spec.page.id), section).toContain(section)
    }
  })
})

/* ── every field a writer logs has a label ───────────────────────────────────────────────────────── */

/** Each change's field is in its section's catalogue, and reads as Dutch words, not as the code it came as. */
const expectLabelled = (section: string, changes: ReadonlyArray<LogChange>, fields: number) => {
  expect(new Set(changes.map((c) => c.field)).size, section).toBe(fields)
  for (const c of changes) {
    expect(fieldSpec(section, c.field), `${section}.${c.field}`).toBeDefined()
    const [line] = changesOf({ section, action: `${section}.changed`, diff: { log: { changes: [c] } } })
    expect(line!.field, `${section}.${c.field}`).not.toBe(c.field)
    expect(line!.field, `${section}.${c.field}`).not.toMatch(/^[a-z]+([A-Z][a-z]*)+$|_|\(\)|: $|^:|^$/)
    // One of many (a class, a kind, an area, a day) by the catalogue's name for it, where the change brings none.
    const named = typeof c.of === "string" && c.of !== ""
    if (c.key !== undefined && !named) {
      expect(fieldSpec(section, c.field)?.items?.[String(c.key)], `${section}.${c.field} ${c.key}`).toBeDefined()
    }
  }
}

/** The actions that change fields, read by them (`log.changes`, a per-field diff), not named as an event. */
const CHANGES = new Set([
  "member.role_changed",
  "member.stores_changed",
  "member.invitation_role_changed",
  "workspace.account_updated",
  "workspace.regional_updated",
  "workspace.alerts_updated",
  "workspace.retention_updated",
  "workspace.export_schedule_updated",
  "support.access_changed"
])

const SOURCES = fileURLToPath(new URL("../src/", import.meta.url))

/**
 * Every "<section> <action>" a writer puts in the Logboek, read from the source: an `Audit.write` with both, and each
 * action handed to a slice's `audit` helper where that helper sets the section.
 */
const loggedActions = (): Array<string> => {
  const found = new Set<string>()
  const files = (readdirSync(SOURCES, { recursive: true }) as Array<string>).filter((f) => f.endsWith(".ts"))
  for (const file of files) {
    const source = readFileSync(SOURCES + file, "utf8")
    for (const m of source.matchAll(/action: "([a-z_.]+)",(?:(?!action:|\}\))[\s\S]){0,400}?section: "([a-z_]+)"/g)) {
      found.add(`${m[2]} ${m[1]}`)
    }
    const helper = /const audit = [\s\S]{0,700}?section: "([a-z_]+)"/.exec(source)
    if (helper === null) continue
    for (const call of source.matchAll(/audit\(\s*sql,\s*([^,]+?),/g)) {
      for (const a of call[1]!.matchAll(/"([a-z_]+\.[a-z_.]+)"/g)) found.add(`${helper[1]} ${a[1]}`)
    }
  }
  return [...found].sort()
}

describe("the catalogue", () => {
  it("names every field of the settings-depth pages", () => {
    const status = SHIP_STATUSES.map((s) => ({ ...s }))
    expectLabelled(
      "shipping",
      settingsChanges("shipping", { statuses: status }, {
        statuses: status.map((s) => ({ ...s, label: `${s.label}!`, show: "hidden" }))
      }),
      2
    )
    expectLabelled(
      "links",
      settingsChanges("links", { review: "", unsubscribe: "", restock: "" }, {
        review: "a",
        unsubscribe: "b",
        restock: "c"
      }),
      3
    )
    const brand = {
      logoFileId: null,
      color: "#000000",
      font: "Systeem",
      sender: "A",
      website: "a.nl",
      support: "a@a.nl",
      widget: "right"
    }
    expectLabelled(
      "brand",
      settingsChanges("brand", brand, {
        logoFileId: "fil_1",
        color: "#111111",
        font: "Inter",
        sender: "B",
        website: "b.nl",
        support: "b@b.nl",
        widget: "left"
      }),
      7
    )
    expectLabelled(
      "domain_senders",
      settingsChanges("domain_senders", { from: "a", replyTo: "b" }, { from: "c", replyTo: "d" }),
      2
    )
    expectLabelled(
      "vat",
      settingsChanges("vat", {
        stores: [{ storeId: "sto_1", currency: "EUR", vatOnShipping: false, refundInclVat: false }],
        oss: false,
        ossNumber: ""
      }, {
        stores: [{ storeId: "sto_1", currency: "USD", vatOnShipping: true, refundInclVat: true }],
        oss: true,
        ossNumber: "NL1"
      }).map((c) => (c.key === undefined ? c : { ...c, of: "Hoofdwinkel" })), // the store's name, as `writeSection` adds it
      5
    )
    expectLabelled(
      "retention",
      settingsChanges("retention", { classes: RETENTION_CLASSES.map((id) => ({ id, months: 12 })) }, {
        classes: RETENTION_CLASSES.map((id) => ({ id, months: 3 }))
      }),
      1
    )
    expect(fieldSpec("retention", "erasing")).toBeDefined()
    expect(fieldSpec("domain_senders", "domain")).toBeDefined()
    expect(fieldSpec("domain_senders", "records")).toBeDefined()
  })

  it("names every field of Retouren", () => {
    const reason = {
      id: "damaged",
      label: "Beschadigd",
      claim: true,
      photoRequired: false,
      quality: false,
      windowDays: null
    }
    const before = new ReturnSettingsDoc({
      returnDays: 30,
      claimDays: 14,
      specialWindows: [{ id: "xmas", label: "Kerst", days: 60, from: "12-01", to: "12-31" }],
      reasons: [reason, { ...reason, id: "gone", label: "Weg" }],
      rules: [{ id: "r1", kind: "not_returnable", target: { by: "tag", tag: "sale" }, note: "Sale" }],
      offered: ["refund"],
      giftCardBonusPct: 0,
      exchangeFeeMinor: 0,
      addresses: [{ country: "NL", label: "Magazijn", address: "Straat 1", carrier: "PostNL" }],
      claimSteps: ["Foto"],
      rejectReasons: ["Te laat"],
      portal: { on: false, handle: "shop", intro: "", done: "" }
    })
    const after = new ReturnSettingsDoc({
      ...before,
      returnDays: 45,
      claimDays: 0,
      specialWindows: [{ id: "xmas", label: "Kerst", days: 90, from: "12-01", to: "12-31" }],
      reasons: [
        { ...reason, label: "Kapot", claim: false, photoRequired: true, quality: true, windowDays: 7 },
        { ...reason, id: "new", label: "Nieuw" }
      ],
      rules: [{
        id: "r2",
        kind: "refund_only",
        target: { by: "product", productId: "p1", label: "Gift Card" },
        note: "x"
      }],
      offered: ["refund", "discount"],
      giftCardBonusPct: 10,
      exchangeFeeMinor: 500,
      addresses: [{ country: "NL", label: "Magazijn", address: "Straat 2", carrier: "PostNL" }],
      claimSteps: ["Foto", "Video"],
      rejectReasons: [],
      portal: { on: true, handle: "shop", intro: "Hoi", done: "Klaar" }
    })
    expectLabelled("returns", returnChanges(before, after), 19)
    const lines = changesOf({
      section: "returns",
      action: "returns.settings_updated",
      diff: { log: { changes: returnChanges(before, after) } }
    })
    expect(lines).toContainEqual({ field: "Retourtermijn", before: "30 dagen", after: "45 dagen" })
    expect(lines).toContainEqual({ field: "Foto verplicht (Kapot)", before: "Uit", after: "Aan" })
    expect(lines).toContainEqual({ field: "Productregel (Gift Card)", before: null, after: "toegevoegd" })
    expect(lines).toContainEqual({ field: "Productregel (Label “sale”)", before: null, after: "weggehaald" })
    expect(lines).toContainEqual({
      field: "Aangeboden oplossingen",
      before: "Terugbetalen",
      after: "Terugbetalen, Kortingscode"
    })
  })

  it("names every field of Meldingen", () => {
    const before: NotifyPrefsInput = {
      events: eventsOf([]),
      quiet: { on: true, from: "22:00", to: "07:00", weekend: false },
      digest: { on: true, at: "08:00" },
      follow: { assigned: true, mentioned: true, created: true },
      slackChannel: null
    }
    const after: NotifyPrefsInput = {
      events: Object.fromEntries(
        Object.entries(before.events).map(([k, p]) => [k, {
          app: !p.app,
          email: !p.email,
          push: !p.push,
          slack: !p.slack,
          onlyMine: !p.onlyMine
        }])
      ),
      quiet: { on: false, from: "21:00", to: "08:00", weekend: true },
      digest: { on: false, at: "09:00" },
      follow: { assigned: false, mentioned: false, created: false },
      slackChannel: "C123"
    }
    expectLabelled("notifications", prefChanges(before, after), 15)
    const lines = changesOf({
      section: "notifications",
      action: "notifications.prefs_changed",
      diff: { log: { changes: prefChanges(before, after) } }
    })
    expect(lines).toContainEqual({ field: "Pakket ontvangen: e-mail", before: "Uit", after: "Aan" })
    expect(lines).toContainEqual({ field: "Weekend stil", before: "Uit", after: "Aan" })
    expect(lines).toContainEqual({ field: "Overzicht om", before: "08:00", after: "09:00" })
    // Every kind has its name: none reads as its key.
    expect(lines.some((l) => /\w\.\w/.test(l.field))).toBe(false)
  })

  it("names every field of Zelfstandigheid, Klantagent and Limieten", () => {
    const never = Object.fromEntries(AGENT_ACTION_IDS.map((id) => [id, "never"])) as typeof DEFAULT_LEVELS
    const limits = Object.fromEntries(AGENT_ACTION_IDS.map((id) => [id, { perDay: 5, maxAmountMinor: 1000 }]))
    const policy = policyChanges(DEFAULT_LEVELS, never, {}, limits)
    expectLabelled("autonomy", policy, 3)
    expect(changesOf({ section: "autonomy", action: "autonomy_policy.changed", diff: { log: { changes: policy } } }))
      .toContainEqual({ field: "Interne notitie toevoegen", before: "Eerst vragen", after: "Nooit" })

    const agent: CustomerAgentSettingsInput = {
      on: false,
      channels: { webchat: "off", whatsapp: "off", instagram: "off", email: "off" },
      hours: DEFAULT_HOURS,
      outside: "take",
      handover: DEFAULT_RULES,
      tone: "brand",
      handoverMessage: DEFAULT_HANDOVER_MESSAGE
    }
    const changed: CustomerAgentSettingsInput = {
      on: true,
      channels: { webchat: "auto", whatsapp: "drafts", instagram: "drafts", email: "drafts" },
      hours: DEFAULT_HOURS.map((d) => ({ ...d, open: !d.open })),
      outside: "answer",
      handover: {
        unsure: !DEFAULT_RULES.unsure,
        asksPerson: !DEFAULT_RULES.asksPerson,
        topics: ["garantie"],
        afterMessages: 9
      },
      tone: "formal",
      handoverMessage: "Een collega neemt het over."
    }
    expectLabelled("customer_agent", agentChanges(agent, changed), 10)

    expect(fieldSpec("ai_limits", "limit")).toBeDefined()
    expect(changesOf({
      section: "ai_limits",
      action: "ai_budget.changed",
      diff: { log: { changes: [{ field: "limit", key: "workspace", before: 20, after: 25 }] } }
    })).toEqual([{ field: "Limiet per maand: werkruimte", before: "€ 20", after: "€ 25" }])
  })

  it("names every field of Team, Rollen, API-sleutels and Webhooks", () => {
    for (const field of ["role", "stores", "invitationRole", "linkOn", "linkRole", "linkDays"]) {
      expect(fieldSpec("team", field), field).toBeDefined()
    }
    const all3 = Object.fromEntries(AREA_IDS.map((a) => [a, 3]))
    expectLabelled(
      "roles",
      rightsChanges({ levels: {}, specials: {}, refundLimitMinor: null }, {
        levels: all3,
        specials: [...SPECIAL_IDS],
        refundLimitMinor: 5000
      }),
      3
    )
    expect(fieldSpec("roles", "stores")).toBeDefined()
    expect(fieldSpec("roles", "label")).toBeDefined()
    expect(fieldSpec("api_keys", "label")).toBeDefined()
    expect(fieldSpec("api_keys", "ips")).toBeDefined()
    const endpoint = {
      url: "https://a.nl/hook",
      description: "",
      events: ["order.created"],
      apiVersion: "2026-01-01",
      stores: "all" as const,
      headers: [],
      retry: 3,
      active: true
    }
    const moved = endpointChanges(endpoint, {
      url: "https://hooks.example/services/T000/B000/geheim",
      description: "Boekhouding",
      events: ["order.created", "order.paid"],
      apiVersion: "2026-06-01",
      stores: ["sto_1"],
      headers: [{ key: "X-Token", sealed: "…" }],
      retry: 8,
      active: false
    }, { before: "Alle winkels", after: "Hoofdwinkel" })
    expectLabelled("webhooks", moved, 8)
    // The address is often the hook's password: the Logboek says it changed, never what it was or became.
    expect(JSON.stringify(moved)).not.toMatch(/a\.nl|geheim|hooks\.example/)
    const lines = changesOf({ section: "webhooks", action: "webhook.updated", diff: { log: { changes: moved } } })
    expect(lines).toContainEqual({ field: "Adres", before: null, after: "gewijzigd" })
    expect(lines).toContainEqual({
      field: "Gebeurtenissen",
      before: "Bestelling geplaatst",
      after: "Bestelling geplaatst, Bestelling betaald"
    })
    expect(lines).toContainEqual({ field: "Winkels", before: "Alle winkels", after: "Hoofdwinkel" })
    // Another store of as many is a change too.
    expect(
      endpointChanges({ ...endpoint, stores: ["sto_1"] }, { ...endpoint, stores: ["sto_2"] }, {
        before: "Hoofdwinkel",
        after: "Tweede winkel"
      })
    ).toEqual([{ field: "stores", before: "Hoofdwinkel", after: "Tweede winkel" }])
  })

  it("says every event its writers log in Dutch", () => {
    const logged = loggedActions()
    // The scan finds the writers: a direct `Audit.write`, a slice's `audit` helper, one spread over lines.
    for (const known of ["team member.invited", "webhooks webhook.updated", "api_keys api_key.updated"]) {
      expect(logged, known).toContain(known)
    }
    expect(logged.length).toBeGreaterThan(60)
    for (const entry of logged) {
      const [section, action] = entry.split(" ") as [string, string]
      expect(Object.keys(SECTIONS), entry).toContain(section)
      // A change read by its fields (`settings.<section>.<field>`, a role, the account) has no event to name.
      if (action.startsWith("settings.") || CHANGES.has(action)) continue
      expect(eventLabel(section, action), entry).toBeDefined()
    }
  })
})

describe("toCsv", () => {
  it("writes the design's columns, in the workspace's time, quoting where it must, an event's Was empty", () => {
    const csv = toCsv([{
      id: "a:0",
      at: Date.UTC(2026, 10, 12, 12, 57),
      actor: { key: "member:m1", name: "Sam, de Vries" },
      page: "Regio",
      path: "/settings/regional",
      field: "Taal",
      before: "Nederlands",
      after: "Engels \"VK\""
    }, {
      id: "b:0",
      at: Date.UTC(2026, 10, 12, 12, 58),
      actor: { key: "member:m1", name: "Sam" },
      page: "API-sleutels",
      path: "/settings/api-keys",
      field: "API-sleutel aangemaakt",
      before: null,
      after: "Boekhouding"
    }], "Europe/Amsterdam")
    expect(csv).toBe(
      "Wanneer,Wie,Pagina,Wat,Was,Werd\r\n2026-11-12 13:57,\"Sam, de Vries\",Regio,Taal,Nederlands,\"Engels \"\"VK\"\"\"\r\n" +
        "2026-11-12 13:58,Sam,API-sleutels,API-sleutel aangemaakt,,Boekhouding\r\n"
    )
  })
})
