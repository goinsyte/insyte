/*
 * A Worker's declared bindings and its `Env` type agree (08 §2, "Bindings"): every binding and var in its wrangler
 * config is declared in `Env`, every non-string member of `Env` is a binding the config provides, and no secret sits
 * in plain-text `vars`. Pure, so each rule has a planted-violation test. Against `infra/catalog.ts` once infra exists
 * (M0.6); against the checked-in `wrangler.jsonc` until then.
 */

export interface EnvMember {
  readonly name: string
  /** A string or a union of string literals: a var or a secret, not a binding. */
  readonly isString: boolean
}

/** Names that hold a credential. `*_SITE_KEY` and `POSTHOG_KEY` are public by design and do not match. */
const SECRET = /(_SECRET|_TOKEN|_API_KEY|PASSWORD|_HEADERS|PEPPER|_DSN_PRIVATE)$/

export const checkBindings = (
  worker: string,
  config: { readonly bindings: ReadonlyArray<string>; readonly vars: ReadonlyArray<string> },
  env: ReadonlyArray<EnvMember>
): Array<string> => {
  const errors: Array<string> = []
  const declared = new Map(env.map((m) => [m.name, m]))
  for (const name of config.bindings) {
    const member = declared.get(name)
    if (member === undefined) errors.push(`${worker}: binding ${name} is not declared in Env`)
    else if (member.isString) errors.push(`${worker}: binding ${name} is typed as a string in Env`)
  }
  for (const name of config.vars) {
    if (!declared.has(name)) errors.push(`${worker}: var ${name} is not declared in Env`)
    if (SECRET.test(name)) errors.push(`${worker}: ${name} looks like a secret; secrets are never plain-text vars`)
  }
  for (const member of env) {
    if (!member.isString && !config.bindings.includes(member.name)) {
      errors.push(`${worker}: Env.${member.name} is a binding the config does not provide`)
    }
  }
  return errors
}

const BINDING_LISTS = [
  "hyperdrive",
  "kv_namespaces",
  "services",
  "r2_buckets",
  "d1_databases",
  "analytics_engine_datasets",
  "workflows",
  "vectorize",
  "secrets_store_secrets"
] as const

/** The binding names and var names a wrangler config declares. */
export const bindingsOf = (config: Record<string, any>) => ({
  bindings: [
    ...BINDING_LISTS.flatMap((key) => (config[key] ?? []).map((b: { binding: string }) => b.binding)),
    ...(config["queues"]?.producers ?? []).map((b: { binding: string }) => b.binding),
    ...(config["durable_objects"]?.bindings ?? []).map((b: { name: string }) => b.name),
    ...["ai", "browser", "images", "assets"].flatMap((key) => config[key]?.binding ? [config[key].binding] : [])
  ] as Array<string>,
  vars: Object.keys(config["vars"] ?? {})
})

/** The members of `interface Env { … }` in a declaration file, and whether each is a string. */
export const envMembersOf = (source: string): Array<EnvMember> => {
  const body = source.match(/interface Env \{([\s\S]*?)\n\s*\}/)?.[1] ?? ""
  return [...body.matchAll(/^\s*readonly (\w+)\??:\s*(.+)$/gm)].map(([, name, type]) => ({
    name: name!,
    isString: /^(string|"[^"]*"(\s*\|\s*"[^"]*")*)$/.test(type!.trim())
  }))
}
