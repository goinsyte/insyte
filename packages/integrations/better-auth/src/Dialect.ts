import {
  CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type QueryResult
} from "kysely"

/**
 * Runs one parameterised statement and returns its rows. The API Worker passes the request's own connection (Effect's
 * `sql-pg` over Hyperdrive), so better-auth and the rest of the request share one socket, and there is one Postgres
 * driver in the codebase, not two.
 */
export type Execute = (sql: string, parameters: ReadonlyArray<unknown>) => Promise<ReadonlyArray<object>>

const connection = (execute: Execute): DatabaseConnection => ({
  executeQuery: async <R>(query: CompiledQuery): Promise<QueryResult<R>> => ({
    rows: (await execute(query.sql, query.parameters)) as Array<R>
  }),
  streamQuery: () => {
    throw new Error("better-auth's dialect does not stream")
  }
})

/** Kysely's Postgres dialect with the transport swapped for `execute`. One logical connection; no pool. */
export const executeDialect = (execute: Execute): Dialect => ({
  createAdapter: () => new PostgresAdapter(),
  createQueryCompiler: () => new PostgresQueryCompiler(),
  createIntrospector: (db: Kysely<unknown>) => new PostgresIntrospector(db),
  createDriver: (): Driver => {
    const conn = connection(execute)
    return {
      init: async () => {},
      acquireConnection: async () => conn,
      beginTransaction: async (c) => void (await c.executeQuery(CompiledQuery.raw("begin"))),
      commitTransaction: async (c) => void (await c.executeQuery(CompiledQuery.raw("commit"))),
      rollbackTransaction: async (c) => void (await c.executeQuery(CompiledQuery.raw("rollback"))),
      releaseConnection: async () => {},
      destroy: async () => {}
    }
  }
})
