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
      { name: "VERSION", isString: true }
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
