import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { REDACTED, scrubLog, scrubValue } from "../src/platform/LogScrub.ts"
import { ObservabilityLive } from "../src/platform/Observability.ts"

/*
 * The log scrubber (17 §6, §9): a line the Workers write carries no address, name, phone number, token or message
 * text, by field name or by shape, and the Workers' logger runs every line through it.
 */

describe("the log scrubber", () => {
  it("replaces the fields that hold a person's data, a message's words or a secret, at any depth", () => {
    expect(scrubValue({
      workspaceId: "ws_1",
      orderId: "ord_1",
      count: 3,
      customer: { email: "a@b.nl", first_name: "Anna", phone: "0612345678", address1: "Dorpsstraat 1", id: "cus_1" },
      message: { body: "Waar blijft mijn pakket?", subject: "Pakket", status: "open" },
      headers: { authorization: "Bearer abc", cookie: "insyte.session=x" },
      key: { token: "t", api_key: "k", secret: "s" }
    })).toEqual({
      workspaceId: "ws_1",
      orderId: "ord_1",
      count: 3,
      customer: { email: REDACTED, first_name: REDACTED, phone: REDACTED, address1: REDACTED, id: "cus_1" },
      message: { body: REDACTED, subject: REDACTED, status: "open" },
      headers: { authorization: REDACTED, cookie: REDACTED },
      key: { token: REDACTED, api_key: REDACTED, secret: REDACTED }
    })
  })

  it("masks addresses, phone numbers, tokens and keys inside any string", () => {
    expect(scrubValue(
      "mail to anna.de.vries+shop@example.co.uk failed; call +31 6 1234 5678; Authorization: Bearer eyJhbGciOi.x.y"
    )).toBe("mail to <email> failed; call <phone>; Authorization: Bearer <redacted>")
    expect(scrubValue("key ins_live_0123456789abcdef and sk_test_51Habcdefghij and whsec_abcdefghijkl"))
      .toBe(`key ${REDACTED} and ${REDACTED} and ${REDACTED}`)
    expect(scrubValue("GET /portal?token=abc123&order=SO-1 then /oauth?code=xyz&state=q"))
      .toBe(`GET /portal?token=${REDACTED}&order=SO-1 then /oauth?code=${REDACTED}&state=${REDACTED}`)
  })

  it("keeps ids, enums, counts and error codes as they are", () => {
    const line = {
      kind: "order.paid",
      workspaceId: "ws_01jc",
      attempts: 2,
      code: "not_found",
      at: "2026-11-18T10:00:00Z"
    }
    expect(scrubValue(line)).toEqual(line)
  })

  it("scrubs a structured line's message, cause and annotations, and survives a cycle", () => {
    const loop: Record<string, unknown> = { id: "x" }
    loop["self"] = loop
    expect(scrubLog({
      level: "WARN",
      message: ["did not send", { to: "a@b.nl", loop }],
      cause: "Error: rejected for a@b.nl",
      annotations: { trace_id: "4bf9", email: "a@b.nl" }
    })).toEqual({
      level: "WARN",
      message: ["did not send", { to: "<email>", loop: { id: "x", self: "[Circular]" } }],
      cause: "Error: rejected for <email>",
      annotations: { trace_id: "4bf9", email: REDACTED }
    })
  })

  it("is the Workers' logger: what Effect.log writes reaches the console scrubbed", async () => {
    const lines: Array<string> = []
    const log = vi.spyOn(console, "log").mockImplementation((line: unknown) => void lines.push(String(line)))
    try {
      await Effect.runPromise(
        Effect.logInfo("mail bounced", { email: "anna@example.com", storeId: "sto_1" }).pipe(
          Effect.annotateLogs({ note: "bel Anna terug op +31 6 12345678" }),
          Effect.provide(ObservabilityLive)
        )
      )
    } finally {
      log.mockRestore()
    }
    const written = lines.join("\n")
    expect(written).toContain("sto_1")
    expect(written).not.toContain("anna@example.com")
    expect(written).not.toContain("12345678")
    expect(written).toContain(REDACTED)
  })
})
