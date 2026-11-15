import { describe, expect, it } from "vitest"
import { bindingsOf, checkBindings, envMembersOf } from "../lib/bindings-rules.ts"
import { parseJsonc } from "../lib/jsonc.ts"

const env = envMembersOf(`
  interface Env {
    readonly HYPERDRIVE: Hyperdrive
    readonly ENVIRONMENT: "local" | "preview"
    readonly VERSION?: string
  }`)

describe("bindings:check", () => {
  it("reads Env members and tells bindings from strings", () => {
    expect(env).toEqual([
      { name: "HYPERDRIVE", isString: false },
      { name: "ENVIRONMENT", isString: true },
      { name: "VERSION", isString: true, optional: true }
    ])
  })

  it("passes a config that matches", () => {
    expect(checkBindings("w", { bindings: ["HYPERDRIVE"], vars: ["ENVIRONMENT"] }, env)).toEqual([])
  })

  it("fails a binding Env does not declare", () => {
    expect(checkBindings("w", { bindings: ["HYPERDRIVE", "FLAGS"], vars: [] }, env)).toEqual([
      "w: binding FLAGS is not declared in Env"
    ])
  })

  it("fails an Env binding the config does not provide", () => {
    expect(checkBindings("w", { bindings: [], vars: [] }, env)).toEqual([
      "w: Env.HYPERDRIVE is a binding the config does not provide"
    ])
  })

  it("fails a secret in plain-text vars", () => {
    const withSecret = [...env, { name: "RESEND_API_KEY", isString: true }]
    expect(checkBindings("w", { bindings: ["HYPERDRIVE"], vars: ["RESEND_API_KEY"] }, withSecret)).toEqual([
      "w: RESEND_API_KEY looks like a secret; secrets are never plain-text vars"
    ])
  })

  it("lets a deploy-only binding be absent from the config, optional in Env and given by infra", () => {
    const withAi = [...env, { name: "AI", isString: false, optional: true }]
    const given = { names: ["AI"], provided: (n: string) => n === "AI" }
    expect(checkBindings("w", { bindings: ["HYPERDRIVE"], vars: [] }, withAi, given)).toEqual([])
    expect(checkBindings("w", { bindings: ["HYPERDRIVE", "AI"], vars: [] }, withAi, given)).toEqual([
      "w: deploy-only binding AI is in the wrangler config; local runs and tests never have it"
    ])
    expect(checkBindings("w", { bindings: ["HYPERDRIVE"], vars: [] }, withAi, { ...given, provided: () => false }))
      .toEqual(["w: deploy-only binding AI is not given by infra"])
    const required = [...env, { name: "AI", isString: false }]
    expect(checkBindings("w", { bindings: ["HYPERDRIVE"], vars: [] }, required, given)).toEqual([
      "w: deploy-only binding AI must be optional in Env"
    ])
  })

  it("reads a wrangler.jsonc with comments, URLs and trailing commas", () => {
    const config = parseJsonc(`{
      // a comment
      "hyperdrive": [{ "binding": "HYPERDRIVE", "localConnectionString": "postgres://a@b/c", }],
      /* block */ "services": [{ "binding": "API", "service": "insyte-api" }],
      "vars": { "ENVIRONMENT": "local", },
    }`) as Record<string, unknown>
    expect(bindingsOf(config)).toEqual({ bindings: ["HYPERDRIVE", "API"], vars: ["ENVIRONMENT"] })
  })
})
