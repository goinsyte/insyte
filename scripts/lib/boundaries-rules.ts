/*
 * The ring rules (08 §2, "Boundaries"), as a pure function over (file, import specifier) pairs, so each rule has a
 * planted-violation test (`scripts/test/`). Package boundaries already say which package may depend on which; these
 * catch what `package.json` cannot: forbidden specifiers, and rules per directory inside a package.
 */

export interface Import {
  readonly file: string
  readonly specifier: string
}

interface Rule {
  readonly applies: (file: string) => boolean
  readonly forbids: (specifier: string, file: string) => boolean
  readonly because: string
}

const MODULES = "packages/modules/src/"

/** `packages/modules/src/<slice>/<ring>/…` → `[slice, ring]`. */
const sliceAndRing = (file: string): readonly [string | undefined, string | undefined] => {
  if (!file.startsWith(MODULES)) return [undefined, undefined]
  const [slice, ring] = file.slice(MODULES.length).split("/")
  return [slice, ring]
}

/** The path inside `packages/modules/src/` a specifier reaches, by package path or by relative path from `file`. */
const pathReached = (specifier: string, file: string): ReadonlyArray<string> | undefined => {
  const pkg = specifier.match(/^@insyte\/modules\/(.+)$/)
  if (pkg) return pkg[1]!.split("/")
  if (!specifier.startsWith(".") || !file.startsWith(MODULES)) return undefined
  const parts = file.slice(MODULES.length).split("/").slice(0, -1)
  for (const segment of specifier.split("/")) {
    if (segment === "..") parts.pop()
    else if (segment !== ".") parts.push(segment)
  }
  return parts
}

/**
 * Another slice's public surface (architecture.md, build/16 §8): its `domain/` ring (the contracts) or its service, a
 * file at the slice's root (`orders/Orders.ts`). Never its `use-cases/`, `tables/` or `server/`.
 */
const isPublicSurface = (path: ReadonlyArray<string>) => path[1] === "domain" || path.length === 2

const isRelative = (specifier: string) => specifier.startsWith(".")

const RULES: ReadonlyArray<Rule> = [
  {
    applies: (file) => file.startsWith("packages/domain/src/"),
    forbids: (s) => !isRelative(s) && s !== "effect" && !s.startsWith("effect/"),
    because: "@insyte/domain imports only effect"
  },
  {
    applies: (file) => !/^apps\/[^/]+\/(src|test)\//.test(file),
    forbids: (s) => s.startsWith("cloudflare:"),
    because: "a cloudflare: module is imported only by an app (apps/*/src): packages stay platform-free"
  },
  {
    applies: (file) => sliceAndRing(file)[1] === "domain",
    forbids: (s) => !isRelative(s) && s !== "effect" && !s.startsWith("effect/") && !s.startsWith("@insyte/domain"),
    because: "a domain/ ring imports only effect and @insyte/domain"
  },
  {
    applies: (file) => sliceAndRing(file)[1] === "tables",
    forbids: (s) => s === "pg" || s.startsWith("@effect/sql-pg") || s === "postgres",
    because: "a tables/ ring is driver-free"
  },
  {
    applies: (file) => file.startsWith(MODULES) && sliceAndRing(file)[0] !== "shared",
    forbids: (s, file) => {
      const path = pathReached(s, file)
      const reached = path?.[0]
      return path !== undefined && reached !== "shared" && reached !== sliceAndRing(file)[0] && !isPublicSurface(path)
    },
    because: "a slice reaches another only through its domain/ ring or its service, never its use-cases/"
  },
  {
    applies: (file) => file.startsWith("packages/ui/"),
    forbids: (s) => /^@insyte\/modules\/[^/]+\/(server|tables)/.test(s) || s.startsWith("@insyte/database"),
    because: "@insyte/ui never imports a server/ or tables/ ring, or the database"
  },
  {
    applies: (file) => !file.startsWith("infra/"),
    forbids: (s) => s === "alchemy" || s.startsWith("alchemy/") || s.startsWith("@alchemy.run/"),
    because: "only infra/ imports alchemy (14 §2), not even for types"
  }
]

export const checkBoundaries = (imports: ReadonlyArray<Import>): Array<string> =>
  imports.flatMap(({ file, specifier }) =>
    RULES.filter((rule) => rule.applies(file) && rule.forbids(specifier, file)).map((rule) =>
      `${file}: "${specifier}": ${rule.because}`
    )
  )

/** Every import specifier in a TypeScript source: static, dynamic, re-exports, side-effect imports. */
export const importsOf = (source: string): Array<string> =>
  [
    ...source.matchAll(/(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/gm),
    ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)
  ].map((m) => m[1]!)
