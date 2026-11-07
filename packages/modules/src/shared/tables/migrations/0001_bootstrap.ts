import { statements } from "../statements.ts"

/**
 * Trusted extensions, which the schema owner may create (06 §1). The roles and `pg_stat_statements` come from
 * `infra/db/roles.sql`, run once per database by its owner; `vector` arrives with the knowledge base (M15).
 */
export default statements(
  "create extension if not exists pg_trgm",
  "create extension if not exists btree_gin",
  "create extension if not exists pgcrypto"
)
