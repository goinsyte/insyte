import { describe, expect, it } from "vitest"
import { ReturnSettingsDoc } from "../src/returns/domain/Returns.ts"
import { invalid } from "../src/returns/use-cases/settings.ts"
import { checkShipping, checkVat } from "../src/settings/domain/Check.ts"
import { SHIP_STATUSES } from "../src/shared/domain/CustomerFacing.ts"

/*
 * What a settings save is refused for before it is written, field by field: a carrier status's sentence with a
 * variable the shopper would read as written, an OSS number that is wrong whether OSS is on or not, and Retouren's
 * windows of no days or the same special period twice.
 */

const statuses = (label: string) => ({
  statuses: SHIP_STATUSES.map((s) => ({ id: s.id, label: s.id === "pickup" ? label : s.label, show: s.show }))
})

describe("Verzending's sentences", () => {
  it("refuses a variable other than {vervoerder}, at its row", () => {
    expect(checkShipping(statuses("Ligt klaar bij {winkel}"))).toEqual({
      fields: { "statuses.pickup.label": "unknown_variable" }
    })
    expect(checkShipping(statuses("Klaar bij {vervoerder} of {winkel}"))).toEqual({
      fields: { "statuses.pickup.label": "unknown_variable" }
    })
  })

  it("keeps {vervoerder}, in any case, and loose braces that are no variable", () => {
    expect(checkShipping(statuses("Ligt klaar bij {Vervoerder}"))).toHaveProperty("ok")
    expect(checkShipping(statuses("Ligt klaar :-}"))).toHaveProperty("ok")
  })
})

describe("Btw's OSS number", () => {
  const vat = (oss: boolean, ossNumber: string) => checkVat({ stores: [], oss, ossNumber }, [])

  it("is refused when it is wrong, with OSS off as well", () => {
    expect(vat(false, "abc")).toEqual({ fields: { ossNumber: "format" } })
    expect(vat(true, "abc")).toEqual({ fields: { ossNumber: "format" } })
    expect(vat(true, "")).toEqual({ fields: { ossNumber: "format" } })
  })

  it("may be empty with OSS off, and is kept normalised when it is right", () => {
    expect(vat(false, "")).toEqual({ ok: { stores: [], oss: false, ossNumber: "" } })
    expect(vat(false, "nl 123456789 b01")).toEqual({ ok: { stores: [], oss: false, ossNumber: "NL123456789B01" } })
  })
})

describe("Retouren's windows", () => {
  const doc = (patch: Partial<ConstructorParameters<typeof ReturnSettingsDoc>[0]> = {}) =>
    new ReturnSettingsDoc({
      returnDays: 30,
      claimDays: 60,
      specialWindows: [],
      reasons: [{
        id: "too_small",
        label: "Te klein",
        claim: false,
        photoRequired: false,
        quality: false,
        windowDays: null
      }],
      rules: [],
      offered: ["refund"],
      giftCardBonusPct: 10,
      exchangeFeeMinor: 0,
      addresses: [],
      claimSteps: [],
      rejectReasons: [],
      portal: { on: true, handle: "northwind", intro: "", done: "" },
      ...patch
    })
  const summer = { id: "w_1", label: "Zomeractie", days: 45, from: "07-01", to: "08-31" }

  it("takes the defaults and a special period", () => {
    expect(invalid(doc({ specialWindows: [summer] }))).toBeNull()
  })

  it("refuses a return or claim window of no days", () => {
    expect(invalid(doc({ returnDays: 0 }))).toEqual({ returnDays: "too_small" })
    expect(invalid(doc({ claimDays: 0 }))).toEqual({ claimDays: "too_small" })
  })

  it("refuses the same period twice, by name or by dates, at the second", () => {
    expect(invalid(doc({ specialWindows: [summer, { ...summer, id: "w_2" }] }))).toEqual({
      "specialWindows.w_2": "duplicate"
    })
    expect(invalid(doc({ specialWindows: [summer, { ...summer, id: "w_2", label: " zomeractie " }] }))).toEqual({
      "specialWindows.w_2": "duplicate"
    })
    expect(invalid(doc({ specialWindows: [summer, { ...summer, id: "w_2", label: "Vakantie" }] }))).toEqual({
      "specialWindows.w_2": "duplicate"
    })
  })

  it("refuses a day that does not exist", () => {
    expect(invalid(doc({ specialWindows: [{ ...summer, from: "02-30" }] }))).toEqual({ "specialWindows.w_1": "date" })
    expect(invalid(doc({ specialWindows: [{ ...summer, from: "02-29", to: "04-30" }] }))).toBeNull()
  })
})
