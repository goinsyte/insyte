import {
  LIVE_WEBHOOK_EVENTS,
  WEBHOOK_AUTO_DISABLE_AFTER,
  WEBHOOK_EVENT_GROUPS,
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS
} from "@insyte/domain/Webhooks"

/**
 * Outbound webhooks (M19.4, api.md §7) are managed in the console, not through a key; the document describes what an
 * endpoint receives, so a receiver can be written against it: the envelope, the headers, the signature, and the
 * catalogue (`@insyte/domain/Webhooks`), each event marked when Insyte sends it today.
 */
const LIVE = new Set(LIVE_WEBHOOK_EVENTS)

export const WEBHOOKS_DESCRIPTION = [
  "## Webhooks",
  "",
  "Endpoints are added in Instellingen → Webhooks. Insyte POSTs one JSON envelope per event: " +
  "`{ id, type, api_version, created_at, workspace_id, store_id, data }`, `data` being the record in the endpoint's " +
  "API version. A test send has `\"test\": true` and an empty `data`.",
  "",
  "Headers: `Insyte-Event` (the type), `Insyte-Delivery` (this delivery), `Insyte-Api-Version`, and " +
  "`Insyte-Signature: t=<unix>,v1=<hex>`, where `v1` is `hex(hmac_sha256(secret, t + \".\" + raw_body))`. During a " +
  "secret rotation two `v1` values are sent for 24 hours; accept either. Refuse a `t` older than " +
  `${WEBHOOK_SIGNATURE_TOLERANCE_SECONDS} seconds (replays), and compare in constant time.`,
  "",
  "Answer with a 2xx within 10 seconds. Anything else, a redirect or a time-out is a failure and is tried again on the " +
  "endpoint's policy (1 m, 10 m, 1 h, 3 h, 6 h, 12 h, 24 h, 72 h). After " +
  `${WEBHOOK_AUTO_DISABLE_AFTER} failed attempts in a row Insyte switches the endpoint off. ` +
  "Order is not guaranteed and an event may arrive twice: order by `created_at`, dedupe on `id`.",
  "",
  "Before each attempt Insyte resolves the endpoint's name and refuses one that points at a private or internal " +
  "address. That check is defence in depth, not a guarantee against a name that answers differently a moment later " +
  "(DNS rebinding): authenticate every request by its signature, never by where it came from.",
  "",
  "| Group | Events (✓ sent today) |",
  "| --- | --- |",
  ...WEBHOOK_EVENT_GROUPS.map((g) =>
    `| ${g.group} | ${g.events.map((e) => `\`${e.id}\`${LIVE.has(e.id) ? " ✓" : ""}`).join(", ")} |`
  )
].join("\n")

/** The catalogue as OpenAPI 3.1 `webhooks`: one POST per event, its body the envelope. */
export const webhooksSection = (spec: Record<string, unknown>): Record<string, unknown> => ({
  ...spec,
  webhooks: Object.fromEntries(WEBHOOK_EVENT_GROUPS.flatMap((g) =>
    g.events.map((e) => [e.id, {
      post: {
        summary: e.id,
        description: LIVE.has(e.id) ? "Sent today." : "Listed; sent once its slice records the fact.",
        tags: ["Webhooks"],
        parameters: [
          { name: "Insyte-Signature", in: "header", required: true, schema: { type: "string" } },
          { name: "Insyte-Event", in: "header", required: true, schema: { type: "string" } },
          { name: "Insyte-Delivery", in: "header", required: true, schema: { type: "string" } },
          { name: "Insyte-Api-Version", in: "header", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["id", "type", "api_version", "created_at", "workspace_id", "store_id", "data"],
                properties: {
                  id: { type: "string" },
                  type: { type: "string", const: e.id },
                  api_version: { type: "string" },
                  created_at: { type: "string", format: "date-time" },
                  workspace_id: { type: "string" },
                  store_id: { type: ["string", "null"] },
                  test: { type: "boolean" },
                  data: { type: "object" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Any 2xx within 10 seconds." } }
      }
    }])
  ))
})
