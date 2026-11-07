/*
 * The migration rules (08 §2), as a pure function so each rule has a planted-violation test (`scripts/test/`).
 *
 * - keys are permanent: every key merged before is still there, in the same place, with the same file content;
 * - expand only: no destructive statement outside a `contract/` migration;
 * - `create index concurrently` stands alone in its migration (it cannot run inside a transaction with others);
 * - a migration that creates a tenant table puts it behind its policy (`tenantTable`) in the same file.
 */

export interface MigrationFile {
  readonly key: string
  readonly path: string
  readonly source: string
}

const DESTRUCTIVE = [
  /\bdrop\s+(table|column|schema|type|function|view|policy)\b/i,
  /\balter\s+table\b[^;`]*\balter\s+column\b[^;`]*\btype\b/i,
  /\brename\s+(?:(?:column\s+)?\w+\s+)?to\b/i,
  /\btruncate\b/i
]

export const checkMigrations = (
  base: ReadonlyArray<MigrationFile>,
  head: ReadonlyArray<MigrationFile>,
  tenantTables: ReadonlyArray<string>
): Array<string> => {
  const errors: Array<string> = []

  base.forEach((merged, i) => {
    const now = head[i]
    if (now?.key !== merged.key) {
      errors.push(`${merged.key} was merged as migration ${i + 1}; keys are permanent and keep their place`)
    } else if (now.source !== merged.source) {
      errors.push(`${merged.key} was edited after it was merged; write a new migration instead`)
    }
  })

  const added = head.filter((m) => !base.some((b) => b.key === m.key))
  for (const m of added) {
    const isContract = m.path.split("/").includes("contract")
    if (!isContract) {
      for (const pattern of DESTRUCTIVE) {
        const hit = m.source.match(pattern)
        if (hit) errors.push(`${m.key}: "${hit[0]}" is destructive; it belongs in a contract/ migration`)
      }
    }
    if (/\bcreate\s+(unique\s+)?index\s+concurrently\b/i.test(m.source) && /\bcreate\s+table\b/i.test(m.source)) {
      errors.push(`${m.key}: create index concurrently goes in a migration of its own`)
    }
    for (const [, table] of m.source.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)/gi)) {
      if (table !== undefined && tenantTables.includes(table) && !m.source.includes(`tenantTable("${table}"`)) {
        errors.push(`${m.key}: tenant table ${table} needs tenantTable("${table}") in the same migration`)
      }
    }
  }
  return errors
}
