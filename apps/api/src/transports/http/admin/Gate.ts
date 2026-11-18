import { Config, Context, Effect } from "effect"
import { HttpServerRequest } from "effect/http"
import { devOnly } from "../dev/shared.ts"
import { accessKeys, issuerOf, type Refusal, verifyAccessJwt } from "./AccessJwt.ts"

/*
 * Who may open the staff admin (M18, `/api/__admin`): two locks, both closed unless configured.
 *
 * 1. Cloudflare Access: the staff Access application in front of the path (`infra/app.ts`, its own staff-only
 *    policy) signs a JWT; the Worker verifies it (`AccessJwt.ts`) against the team's keys and the application's
 *    audience tag (`STAFF_ACCESS_TEAM`, `STAFF_ACCESS_AUD`). A header that is merely there is nothing.
 * 2. The staff allowlist (`STAFF_EMAILS`): the address the JWT names must be on it. Empty by default: nobody.
 *
 * Only where nothing real lives (`devOnly`: a developer's machine, the worker tests, a preview) may a request without
 * a JWT name its person in `x-insyte-dev-staff` instead; the allowlist still decides. On staging and production that
 * header is nothing: there is no bypass.
 */

/** The person of the team a request comes from, as both locks admitted them. */
export class StaffIdentity extends Context.Service<StaffIdentity, { readonly email: string }>()(
  "api-worker/StaffIdentity"
) {}

const JWT_HEADER = "cf-access-jwt-assertion"
const DEV_STAFF_HEADER = "x-insyte-dev-staff"

type GateRefusal = Refusal | "not_configured" | "not_on_allowlist"

export type Admission =
  | { readonly ok: true; readonly email: string; readonly via: "access" | "dev" }
  | { readonly ok: false; readonly reason: GateRefusal }

/** The allowlist as written: addresses, comma- or space-separated, compared in lower case. */
export const allowlistOf = (raw: string): ReadonlySet<string> =>
  new Set(raw.split(/[\s,]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))

export interface GateInput {
  readonly jwt: string | null
  readonly devStaff: string | null
  readonly dev: boolean
  readonly team: string
  readonly audience: string
  readonly allowlist: ReadonlySet<string>
  readonly keys?: (issuer: string) => (fresh: boolean) => ReturnType<ReturnType<typeof accessKeys>>
  readonly now?: number
}

/** Both locks over one request's headers: pure but for fetching the team's keys. */
export const admit = async (input: GateInput): Promise<Admission> => {
  if (input.allowlist.size === 0) return { ok: false, reason: "not_configured" }
  let email: string
  let via: "access" | "dev"
  if (input.jwt !== null && input.jwt !== "") {
    const issuer = issuerOf(input.team)
    if (issuer === "" || input.audience === "") return { ok: false, reason: "not_configured" }
    const verdict = await verifyAccessJwt(input.jwt, {
      issuer,
      audience: input.audience,
      keys: (input.keys ?? accessKeys)(issuer),
      ...(input.now === undefined ? {} : { now: input.now })
    })
    if (!verdict.ok) return { ok: false, reason: verdict.reason }
    email = verdict.email
    via = "access"
  } else if (input.dev && input.devStaff !== null && input.devStaff.includes("@")) {
    email = input.devStaff.trim().toLowerCase()
    via = "dev"
  } else {
    return { ok: false, reason: "missing" }
  }
  return input.allowlist.has(email) ? { ok: true, email, via } : { ok: false, reason: "not_on_allowlist" }
}

const setting = (name: string) => Config.String(name).pipe(Config.withDefault(""))

/** The request's admission, from its headers and the stage's settings. */
export const admitRequest = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  const dev = yield* devOnly
  const team = yield* setting("STAFF_ACCESS_TEAM")
  const audience = yield* setting("STAFF_ACCESS_AUD")
  const allowlist = allowlistOf(yield* setting("STAFF_EMAILS"))
  return yield* Effect.promise(() =>
    admit({
      jwt: request.headers[JWT_HEADER] ?? null,
      devStaff: request.headers[DEV_STAFF_HEADER] ?? null,
      dev,
      team,
      audience,
      allowlist
    }).catch((): Admission => ({ ok: false, reason: "unknown_key" }))
  )
})
