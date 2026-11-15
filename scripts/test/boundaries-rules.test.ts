import { describe, expect, it } from "vitest"
import { checkBoundaries, checkDoors, importsOf } from "../lib/boundaries-rules.ts"

const fails = (file: string, specifier: string) => expect(checkBoundaries([{ file, specifier }])).toHaveLength(1)
const passes = (file: string, specifier: string) => expect(checkBoundaries([{ file, specifier }])).toEqual([])

describe("boundaries", () => {
  it("keeps @insyte/domain to effect", () => {
    passes("packages/domain/src/Ids.ts", "effect")
    passes("packages/domain/src/Principal.ts", "./Ids.ts")
    fails("packages/domain/src/Ids.ts", "@insyte/database/Db")
  })

  it("keeps cloudflare: modules in the apps", () => {
    passes("apps/api/src/platform/Hyperdrive.ts", "cloudflare:sockets")
    passes("apps/api/test/support.ts", "cloudflare:test")
    fails("packages/database/src/Connect.ts", "cloudflare:sockets")
  })

  it("keeps a domain/ ring to effect and @insyte/domain", () => {
    passes("packages/modules/src/orders/domain/Order.ts", "@insyte/domain/Ids")
    fails("packages/modules/src/orders/domain/Order.ts", "@insyte/database/Db")
  })

  it("keeps a tables/ ring driver-free", () => {
    fails("packages/modules/src/orders/tables/Orders.ts", "@effect/sql-pg")
    passes("packages/modules/src/orders/tables/Orders.ts", "effect/sql")
  })

  it("lets a slice reach another only through its domain/ ring or its service", () => {
    fails("packages/modules/src/orders/use-cases/refund.ts", "@insyte/modules/customers/use-cases/customers")
    fails("packages/modules/src/orders/use-cases/refund.ts", "../../customers/use-cases/commands.ts")
    fails("packages/modules/src/orders/use-cases/refund.ts", "../../customers/tables/Customers.ts")
    fails("packages/modules/src/orders/Orders.ts", "../customers/use-cases/commands.ts")
    passes("packages/modules/src/orders/use-cases/refund.ts", "@insyte/modules/customers/Customers")
    passes("packages/modules/src/orders/use-cases/refund.ts", "../../customers/domain/Customer.ts")
    passes("packages/modules/src/orders/use-cases/refund.ts", "../../shared/tables/statements.ts")
    passes("packages/modules/src/orders/use-cases/refund.ts", "../domain/Order.ts")
  })

  it("keeps server rings and the database out of @insyte/ui", () => {
    fails("packages/ui/src/app/orders/list.tsx", "@insyte/modules/orders/server/Shopify")
    fails("packages/ui/src/app/orders/list.tsx", "@insyte/database/Db")
  })

  it("keeps alchemy in infra/", () => {
    fails("apps/api/src/Main.ts", "@alchemy.run/cloudflare")
    passes("infra/app.ts", "alchemy")
  })

  it("finds static, type, side-effect, re-export and dynamic imports", () => {
    expect(
      importsOf(
        `import { a } from "x"\nimport type { B } from "y"\nimport "z"\nexport * from "w"\nconst m = import("v")`
      )
    )
      .toEqual(["x", "y", "z", "w", "v"])
  })

  it("lets only founding and the invitations act as a newcomer", () => {
    const call = "yield* db.asNewcomerIn(workspaceId)((sql) => sql`select 1`)"
    expect(checkDoors([{ file: "packages/modules/src/orders/use-cases/refund.ts", text: call }])).toHaveLength(1)
    expect(checkDoors([{ file: "apps/api/src/transports/http/FileRoutes.ts", text: call }])).toHaveLength(1)
    expect(checkDoors([{ file: "packages/modules/src/members/use-cases/invitations/accept.ts", text: call }]))
      .toEqual([])
    expect(checkDoors([{ file: "packages/database/test/tenancy.test.ts", text: call }])).toEqual([])
    // Named, not called: a comment pointing at it is fine.
    expect(checkDoors([{ file: "packages/modules/src/orders/use-cases/refund.ts", text: "// see `Db.asNewcomerIn`" }]))
      .toEqual([])
  })
})
