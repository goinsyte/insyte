import { describe, expect, it } from "vitest"
import {
  crc32,
  cut,
  toCsv,
  unzip,
  withoutSecrets,
  zip,
  zipEnd,
  zipEntry,
  type ZipRecord
} from "../src/privacy/domain/Archive.ts"

/*
 * Je gegevens' export (M17 step 5): the ZIP written by hand reads back as it went in, also when written an entry at a
 * time and sent in parts; a table's CSV quotes what needs quoting; a secret never leaves, however deep in a value.
 * Which tables an export holds is checked against the database itself (`apps/api/test/privacy.worker.test.ts`).
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

  it("drops them inside a jsonb value too, in objects and in arrays", () => {
    expect(withoutSecrets({
      id: "whe",
      headers: [{ key: "X-Sleutel", sealed: "v1.abc" }, { key: "X-Naam", value: "insyte" }],
      previous: { email: "a@b.nl", token_hash: "h", nested: [{ secret: "s", kept: 1 }] }
    })).toEqual({
      id: "whe",
      headers: [{ key: "X-Sleutel" }, { key: "X-Naam", value: "insyte" }],
      previous: { email: "a@b.nl", nested: [{ kept: 1 }] }
    })
  })
})

describe("an archive written in steps", () => {
  it("reads back the same, written an entry at a time and cut into parts of one size", async () => {
    const at = new Date("2026-11-13T10:00:00Z")
    const entries = Array.from({ length: 7 }, (_, i) => ({
      name: `csv/orders${i === 0 ? "" : `-000${i + 1}`}.csv`,
      bytes: text(`id,total\r\n${"x".repeat(50 + i * 37)},${i}\r\n`)
    }))
    // As the run does it: each step writes its entries at the offset so far and carries what is not a whole part.
    const size = 64
    const sent: Array<Uint8Array> = []
    const records: Array<ZipRecord> = []
    let carried: Uint8Array = new Uint8Array()
    let offset = 0
    for (const entry of entries) {
      const one = await zipEntry(entry, offset, at)
      records.push(one.record)
      offset += one.bytes.length
      const { parts, rest } = cut(carried, [one.bytes], size)
      for (const part of parts) expect(part.length).toBe(size)
      sent.push(...parts)
      carried = rest
    }
    const last = cut(carried, [zipEnd(records, offset, at)], size)
    sent.push(...last.parts, last.rest)
    const archive = new Uint8Array(sent.reduce((n, p) => n + p.length, 0))
    let at2 = 0
    for (const part of sent) {
      archive.set(part, at2)
      at2 += part.length
    }
    expect(archive).toEqual(await zip(entries, at))
    const read = await unzip(archive)
    expect(read.map((e) => e.name)).toEqual(entries.map((e) => e.name))
    expect(read.map((e) => new TextDecoder().decode(e.bytes))).toEqual(
      entries.map((e) => new TextDecoder().decode(e.bytes))
    )
  })
})
