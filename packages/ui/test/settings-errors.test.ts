import { createElement, type FunctionComponent } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type ReturnSettingsDraft, returnSettingsErrors, windowErrors } from "../src/app/lib/returns.ts"
import { brandErrors, linkErrors, shippingErrors, unknownVariables, vatErrors } from "../src/app/lib/settings-depth.ts"

// Loaded the way `field.test.ts` loads components: their own imports are written for the bundler.
const form = "../src/app/settings/form.tsx"
const notifications = "../src/app/lib/notifications.ts"
const workspace = "../src/app/settings/workspace-source.tsx"
const { notifyErrors } = (await import(/* @vite-ignore */ notifications)) as {
  notifyErrors: (
    prefs: { quiet: { on: boolean; from: string; to: string; weekend: boolean } }
  ) => Record<string, string>
}
const { accountErrors, RegionalSourceProvider } = (await import(/* @vite-ignore */ workspace)) as {
  accountErrors: (
    account: { workspace: string; legalEntity: string; billingEmail: string },
    alerts: { delayHours: string; disputeAmount: string }
  ) => Record<string, string>
  RegionalSourceProvider: FunctionComponent<{ value: unknown; children: unknown }>
}
const { useFieldErrors } = (await import(/* @vite-ignore */ form)) as {
  useFieldErrors: (
    local: Record<string, string>,
    o: { draftKey: string }
  ) => Fe
}

type Fe = {
  control: (name: string) => Record<string, unknown>
  message: (name: string) => unknown
  guard: (save: () => Promise<boolean | { fields: Record<string, string> }> | void) => () => Promise<void> | undefined
}

/*
 * The settings pages say what is wrong at the field, before a save goes out: a sentence with a variable the customer
 * would read as written, an OSS number that is wrong with OSS on or off, a window of no days or letters for days, a
 * gift card bonus over 100 %, and a special period twice. The field is marked and points at its message.
 */

describe("Verzending", () => {
  it("names the unknown variable and says the one there is", () => {
    expect(unknownVariables("Ligt klaar bij {winkel} met {vervoerder}")).toEqual(["{winkel}"])
    expect(shippingErrors([{ id: "pickup", label: "Ligt klaar bij {winkel}" }])).toEqual({
      "statuses.pickup.label": "Onbekend: {winkel}. Je kunt {vervoerder} gebruiken."
    })
    expect(shippingErrors([{ id: "local", label: "Onderweg met {Vervoerder}" }])).toEqual({})
  })

  it("says an empty or too long sentence at its row", () => {
    const out = shippingErrors([{ id: "info", label: "  " }, { id: "out", label: "x".repeat(121) }])
    expect(out["statuses.info.label"]).toBe("Geef een zin die de klant leest.")
    expect(out["statuses.out.label"]).toBe("Hoogstens 120 tekens; dit zijn er 121.")
  })
})

describe("Btw", () => {
  it("refuses a wrong OSS number with OSS off as well, and asks for one with OSS on", () => {
    expect(vatErrors({ oss: false, ossNumber: "ABC" })).toHaveProperty("ossNumber")
    expect(vatErrors({ oss: true, ossNumber: "" })).toEqual({ ossNumber: "Vul je OSS-nummer in, of zet OSS uit." })
    expect(vatErrors({ oss: false, ossNumber: "" })).toEqual({})
    expect(vatErrors({ oss: true, ossNumber: "NL 123456789 B01" })).toEqual({})
  })
})

describe("Huisstijl", () => {
  it("blocks a colour that is no colour, not one that is light", () => {
    const brand = { color: "#1F3A5F", sender: "Northwind", website: "", support: "" }
    expect(brandErrors(brand)).toEqual({})
    expect(brandErrors({ ...brand, color: "#FFEE00" })).toEqual({})
    expect(brandErrors({ ...brand, color: "zzz" })).toEqual({ color: "Een kleur als #1F3A5F." })
    expect(Object.keys(brandErrors({ ...brand, sender: "", website: "abc", support: "geen-mail" }))).toEqual([
      "sender",
      "website",
      "support"
    ])
  })
})

describe("Sjablonen", () => {
  it("marks a link that is no https link, and takes an empty one", () => {
    expect(linkErrors({ review: "", unsubscribe: "https://shop.nl/uit", restock: " https://shop.nl/terug " })).toEqual(
      {}
    )
    expect(linkErrors({ review: "shop.nl", unsubscribe: "http://shop.nl", restock: "" })).toEqual({
      review: "Een link begint met https:// en heeft een domein.",
      unsubscribe: "Een link begint met https:// en heeft een domein."
    })
    expect(linkErrors({ review: `https://shop.nl/${"x".repeat(500)}`, unsubscribe: "", restock: "" }))
      .toHaveProperty("review")
  })
})

describe("Account", () => {
  const account = { workspace: "Northwind", legalEntity: "Northwind B.V.", billingEmail: "" }
  const alerts = { delayHours: "48", disputeAmount: "100" }

  it("takes what the server takes: an empty billing address, a dispute from 0", () => {
    expect(accountErrors(account, alerts)).toEqual({})
    expect(accountErrors({ ...account, billingEmail: "facturen@northwind.nl" }, { ...alerts, disputeAmount: "0" }))
      .toEqual({})
  })

  it("says a wrong billing address and empty or out-of-range thresholds at their fields", () => {
    expect(accountErrors({ ...account, billingEmail: "geen-email" }, alerts)).toEqual({
      billingEmail: "Een e-mailadres als facturen@jouwbedrijf.nl."
    })
    expect(accountErrors(account, { delayHours: "", disputeAmount: "" })).toEqual({
      delayHours: "Vul een aantal uren in, 1 of meer.",
      disputeAmount: "Vul een bedrag in, 0 of meer."
    })
    expect(accountErrors(account, { ...alerts, delayHours: "0" })).toHaveProperty("delayHours")
    expect(accountErrors(account, { ...alerts, delayHours: "721" })).toEqual({
      delayHours: "Hoogstens 720 uur, dat is 30 dagen."
    })
    expect(Object.keys(accountErrors({ ...account, workspace: " ", legalEntity: "x".repeat(201) }, alerts))).toEqual([
      "workspace",
      "legalEntity"
    ])
  })
})

describe("Meldingen", () => {
  it("marks quiet hours that end when they begin, only while they are on", () => {
    const quiet = { on: true, from: "22:00", to: "22:00", weekend: false }
    expect(notifyErrors({ quiet })).toEqual({ quiet: "Kies een eind dat niet gelijk is aan het begin." })
    expect(notifyErrors({ quiet: { ...quiet, on: false } })).toEqual({})
    expect(notifyErrors({ quiet: { ...quiet, to: "07:00" } })).toEqual({})
  })
})

describe("Retouren", () => {
  const draft = (patch: Partial<ReturnSettingsDraft> = {}): ReturnSettingsDraft => ({
    returnDays: 30,
    claimDays: 60,
    specialWindows: [],
    reasons: [{ id: "too_small", label: "Te klein", claim: false, photoRequired: false, quality: false }],
    rules: [],
    offered: ["refund"],
    giftCardBonus: 10,
    exchangeFee: 0,
    addresses: [],
    claimSteps: ["Wat is er mis"],
    portal: { on: true, handle: "northwind", intro: "", done: "" },
    ...patch
  })

  it("takes the defaults", () => {
    expect(returnSettingsErrors(draft())).toEqual({})
  })

  it("refuses an empty or zero window, and a reason's own window of zero", () => {
    expect(returnSettingsErrors(draft({ returnDays: null }))).toEqual({ returnDays: "Vul een aantal dagen in." })
    expect(Object.keys(returnSettingsErrors(draft({ returnDays: 0, claimDays: 0 })))).toEqual([
      "returnDays",
      "claimDays"
    ])
    const reasons = [{
      id: "too_small",
      label: "Te klein",
      claim: false,
      photoRequired: false,
      quality: false,
      windowDays: 0
    }]
    // A claim step counts as the schema counts it, as sent; only blank is empty.
    expect(Object.keys(returnSettingsErrors(draft({ claimSteps: ["  ", `${"x".repeat(199)}  `] })))).toEqual([
      "claimSteps.0",
      "claimSteps.1"
    ])
    expect(returnSettingsErrors(draft({ reasons }))).toEqual({
      "reasons.too_small.windowDays": "Minimaal 1 dag, of leeg voor de standaard."
    })
  })

  it("says the gift card bonus's bounds and an empty amount", () => {
    expect(returnSettingsErrors(draft({ giftCardBonus: 150 }))).toEqual({ giftCardBonus: "Kies 0 tot 100%." })
    expect(returnSettingsErrors(draft({ exchangeFee: null }))).toHaveProperty("exchangeFee")
    expect(returnSettingsErrors(draft({ exchangeFee: 2.5 }))).toEqual({})
    expect(returnSettingsErrors(draft({ exchangeFee: 0.29 }))).toEqual({})
    expect(returnSettingsErrors(draft({ exchangeFee: 2.555 }))).toEqual({
      exchangeFee: "Hoogstens twee cijfers achter de komma."
    })
  })

  it("does not take the same special period twice, by name or by dates", () => {
    const summer = { id: "w_1", label: "Zomeractie", days: 45, from: "07-01", to: "08-31" }
    expect(windowErrors({ ...summer, id: "w_2" }, [summer])).toMatchObject({
      label: "Er is al een periode met de naam Zomeractie."
    })
    expect(windowErrors({ ...summer, id: "w_2", label: "Vakantie" }, [summer])).toEqual({
      to: "Er is al een periode met deze data."
    })
    expect(windowErrors({ id: "w_2", label: "", days: null, from: "02-30", to: "03-01" }, [])).toEqual({
      label: "Geef de periode een naam.",
      days: "Vul een aantal dagen in.",
      from: "Die dag bestaat niet."
    })
    expect(Object.keys(returnSettingsErrors(draft({ specialWindows: [summer, { ...summer, id: "w_2" }] })))).toEqual([
      "specialWindows.w_2"
    ])
  })
})

describe("useFieldErrors", () => {
  const Probe: FunctionComponent<{ errors: Record<string, string> }> = ({ errors }) => {
    const fe = useFieldErrors(errors, { draftKey: "" })
    return createElement(
      "label",
      null,
      createElement("input", { ...fe.control("returnDays"), "aria-label": "Retourtermijn" }),
      fe.message("returnDays") as never
    )
  }

  it("marks a wrong field and points it at the message under it", () => {
    const out = renderToStaticMarkup(createElement(Probe, { errors: { returnDays: "Vul een aantal dagen in." } }))
    const id = /id="([^"]+)" aria-invalid="true" aria-describedby="([^"]+)"/.exec(out)
    expect(id).not.toBeNull()
    expect(id![2]).toBe(`${id![1]}-error`)
    expect(out).toContain(`<span id="${id![2]}" class="text-signal-red text-xs">Vul een aantal dagen in.</span>`)
  })

  it("leaves a right field unmarked", () => {
    const out = renderToStaticMarkup(createElement(Probe, { errors: {} }))
    expect(out).not.toContain("aria-invalid")
    expect(out).not.toContain("text-signal-red")
  })
})

/*
 * The bar's save through the guard. A refused draft rejects (the bar stays, a held navigation too) with the first wrong
 * field focused. A save the screen runs itself answers nothing, so the bar waits until the changes are gone, as it did
 * without the guard. A save that did not land rejects, so leaving does not go on and the draft is not lost.
 */
describe("useFieldErrors' guard", () => {
  const focused: Array<string> = []
  const stubDocument = () => {
    vi.stubGlobal("document", {
      getElementById: (id: string) => ({ focus: () => focused.push(id), scrollIntoView: () => {} })
    })
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => f())
  }
  afterEach(() => {
    vi.unstubAllGlobals()
    focused.length = 0
  })

  const guardOf = (errors: Record<string, string>) => {
    let fe: Fe | undefined
    const Capture: FunctionComponent = () => {
      fe = useFieldErrors(errors, { draftKey: "d" })
      return null
    }
    renderToStaticMarkup(createElement(Capture))
    return fe!
  }

  it("refuses a wrong draft before it goes out, focusing the first wrong field", async () => {
    stubDocument()
    const fe = guardOf({ returnDays: "Vul een aantal dagen in.", claimDays: "Minimaal 1 dag." })
    const save = vi.fn(() => Promise.resolve(true))
    await expect(fe.guard(save)()).rejects.toThrow()
    expect(save).not.toHaveBeenCalled()
    expect(focused).toEqual([fe.control("returnDays")["id"]])
  })

  it("hands back nothing for a save the screen runs itself, so the bar waits until the changes are gone", () => {
    const save = vi.fn(() => undefined)
    expect(guardOf({}).guard(save)()).toBeUndefined()
    expect(save).toHaveBeenCalledOnce()
  })

  it("resolves a save that landed, and rejects one that did not or that the server refused", async () => {
    stubDocument()
    const fe = guardOf({})
    await expect(fe.guard(() => Promise.resolve(true))()).resolves.toBeUndefined()
    await expect(fe.guard(() => Promise.resolve(false))()).rejects.toThrow()
    await expect(fe.guard(() => Promise.resolve({ fields: { returnDays: "too_small" } }))()).rejects.toThrow()
    expect(focused).toEqual([fe.control("returnDays")["id"]])
  })
})

/*
 * Regio offers Dutch only, as the app is; a language saved before stays shown as itself. The date notations read as a
 * date written in them, not as their codes.
 */
describe("Regio", () => {
  const regional = "../src/app/settings/regional-screen.tsx"

  it("offers Nederlands, keeps a language saved before, and shows each date notation as a date", async () => {
    const { RegionalPage } = (await import(/* @vite-ignore */ regional)) as { RegionalPage: FunctionComponent }
    const saved = {
      language: "de-DE",
      currency: "EUR",
      dateFormat: "DD MMM YYYY",
      timeFormat: "24h",
      weekStart: "mon",
      timezone: "Europe/Amsterdam"
    }
    const out = renderToStaticMarkup(
      createElement(RegionalSourceProvider, {
        value: { saved, save: () => Promise.resolve(true) },
        children: createElement(RegionalPage)
      })
    )
    const options = [...out.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => ({
      value: m[1]!,
      label: m[2]!
    }))
    expect(options.filter((o) => /^[a-z]{2}-[A-Z]{2}$/.test(o.value))).toEqual([
      { value: "nl-NL", label: "Nederlands" },
      { value: "de-DE", label: "Duits" }
    ])
    const dates = options.filter((o) => o.value.includes("YYYY"))
    expect(dates.map((o) => o.value)).toEqual(["DD MMM YYYY", "MMM DD, YYYY", "YYYY-MM-DD"])
    expect(dates[0]!.label).toMatch(/^\d{1,2} [a-z]{3} \d{4}$/)
    expect(dates[1]!.label).toMatch(/^[a-z]{3} \d{1,2}, \d{4}$/)
    expect(dates[2]!.label).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
