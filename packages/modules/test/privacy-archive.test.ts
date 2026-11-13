import { TENANT_TABLES } from "@insyte/database/Tenancy"
import { describe, expect, it } from "vitest"
import { crc32, toCsv, unzip, withoutSecrets, zip } from "../src/privacy/domain/Archive.ts"
import { EXCLUDED, EXPORTED } from "../src/privacy/use-cases/exports.ts"

/*
 * Je gegevens' export (M17 step 5): the ZIP written by hand reads back as it went in, a table's CSV quotes what needs
 * quoting, a secret column never leaves, and every tenant table is either exported or left out with a reason.
 */

const text = (s: string) => new TextEncoder().encode(s)

describe("zip", () => {
  it("reads back every entry as it went in, names in UTF-8", async () => {
    const entries = [
      { name: "LEESMIJ.txt", bytes: text("Export van je werkruimte\r\n") },
      { name: "csv/klanten-ë.csv", bytes: text("id,name\r\n1,Zoë\r\n".repeat(500)) },
      { name: "json/leeg.json", bytes: text("[]") }
    ]
    const archive = await zip(entries, new Date("2026-11-13T10:00:00Z"))
    // The local header's signature, and the end record's at the very end.
    expect([...archive.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect([...archive.subarray(archive.length - 22, archive.length - 18)]).toEqual([0x50, 0x4b, 0x05, 0x06])
    const back = await unzip(archive)
    expect(back.map((e) => e.name)).toEqual(entries.map((e) => e.name))
    back.forEach((e, i) => expect(new TextDecoder().decode(e.bytes)).toBe(new TextDecoder().decode(entries[i]!.bytes)))
  })

  it("checks each entry with the CRC-32 the format names", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe("toCsv", () => {
  it("names every column any row has, and quotes commas, quotes, line breaks and edge spaces", () => {
    expect(toCsv([{ id: 1, note: "a, b" }, { id: 2, note: "zei \"ja\"", extra: { x: 1 } }, { id: 3, note: " rand" }]))
      .toBe("id,note,extra\r\n1,\"a, b\",\r\n2,\"zei \"\"ja\"\"\",\"{\"\"x\"\":1}\"\r\n3,\" rand\",\r\n")
    expect(toCsv([{ id: 1, body: "regel 1\nregel 2", empty: null }])).toBe(
      "id,body,empty\r\n1,\"regel 1\nregel 2\",\r\n"
    )
  })
})

describe("withoutSecrets", () => {
  it("drops a hash, a sealed value and a reply token, and keeps the rest", () => {
    expect(withoutSecrets({ id: "k", token_hash: "x", sealed_token: "y", reply_token: "z", name: "Sleutel" }))
      .toEqual({ id: "k", name: "Sleutel" })
  })
})

describe("what the export holds", () => {
  it("exports every tenant table but the ones left out, each with its reason", () => {
    for (const table of TENANT_TABLES) expect(EXPORTED.includes(table) !== table in EXCLUDED, table).toBe(true)
    expect(Object.keys(EXCLUDED)).toContain("connection_credentials")
    for (const reason of Object.values(EXCLUDED)) expect(reason?.length).toBeGreaterThan(10)
    expect(EXPORTED).toEqual(expect.arrayContaining(["customers", "orders", "products", "tickets", "audit_events"]))
  })
})
