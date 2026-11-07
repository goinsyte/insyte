import { PgClient } from "@effect/sql-pg"
import { Connect } from "@insyte/database/Connect"
import { connect } from "cloudflare:sockets"
import { env } from "cloudflare:workers"
import { Effect, Layer, Redacted } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import { Duplex } from "node:stream"

/*
 * `Connect` over Hyperdrive: one Postgres connection per request, through `cloudflare:sockets` (04 §6). Hyperdrive
 * pools the real connections to Neon and terminates TLS, so this side speaks plain TCP to it. `@effect/sql-pg` brings
 * its own wire protocol and takes a Node `Duplex`, which `nodejs_compat` builds from the socket's web streams (the
 * shape effect-cloudflare-full-stack runs in production).
 */

const socketStream = (host: string, port: number): Duplex => {
  const socket = connect({ hostname: host, port }, { secureTransport: "off", allowHalfOpen: false })
  return Duplex.fromWeb(
    { readable: socket.readable, writable: socket.writable } as unknown as Parameters<
      typeof Duplex.fromWeb
    >[0]
  )
}

/**
 * Building this layer touches nothing: it runs at module scope, where a Worker allows no I/O, and Hyperdrive makes
 * its credentials on first access. The binding is read, and the socket opened, inside each request's scope, by `open`.
 */
export const HyperdriveConnect = Layer.effect(
  Connect,
  Effect.gen(function*() {
    const reactivity = yield* Reactivity.Reactivity
    return Connect.of({
      open: Effect.suspend(() => {
        const hyperdrive = env.HYPERDRIVE
        return PgClient.makeClient({
          host: hyperdrive.host,
          port: hyperdrive.port,
          username: hyperdrive.user,
          password: Redacted.make(hyperdrive.password),
          database: hyperdrive.database,
          ssl: false,
          stream: () => socketStream(hyperdrive.host, hyperdrive.port),
          transformResultNames: (s) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
          transformQueryNames: (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
        })
      }).pipe(Effect.provideService(Reactivity.Reactivity, reactivity))
    })
  })
).pipe(Layer.provide(Reactivity.layer))
