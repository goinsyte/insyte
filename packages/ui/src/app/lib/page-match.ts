/**
 * A host's routes as one test of an address (`hasPage` on the shell source): `/orders/ord_12` answers to
 * `/orders/$orderId`, `/suppliers/sup_3/statements/2026-10` to `/suppliers/$supplierId/statements/$month`, a splat
 * (`/files/$`) to whatever is under it. A search, a hash and a trailing slash aside.
 */
export function pageMatcher(paths: ReadonlyArray<string>): (to: string) => boolean {
  const exact = new Set<string>()
  const patterns: RegExp[] = []
  for (const raw of paths) {
    const path = trim(raw)
    if (!path.includes("$")) {
      exact.add(path)
      continue
    }
    const source = path
      .split("/")
      .map((segment) => (segment === "$" ? ".*" : segment.startsWith("$") ? "[^/]+" : escape(segment)))
      .join("/")
    patterns.push(new RegExp(`^${source}$`))
  }
  return (to) => {
    const path = trim(to.split(/[?#]/)[0] ?? "")
    return exact.has(path) || patterns.some((p) => p.test(path))
  }
}

const trim = (path: string) => path.replace(/\/+$/, "") || "/"

const escape = (segment: string) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
