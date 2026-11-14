import { CurrentUser } from "@insyte/domain/Session"
import { SupplierPortalService } from "@insyte/modules/supplier-portal/SupplierPortal"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { ROOM_MEMBER, ROOM_TAB, roomOf, supplierRoomOf } from "../../platform/Room.ts"
import { userFrom } from "../../platform/Sessions.ts"

/*
 * `GET /api/realtime` (M5.1, ADR-0013): the console tab's one socket, through the console's origin. The session cookie
 * names the person, their active membership names the room (`ws:<workspace>`); the client never names a room. The
 * upgrade is handed to that room, whose 101 goes back untouched. A tab names itself (`?tab=`), so the live room can send
 * its frames to the tabs that asked for them (M14 step 3). The supplier portal's tab asks `?as=supplier` (M16): its
 * room is then its supplier's in that brand (`sup:<workspace>:<supplier>`), by the person's newest supplier contact.
 */

const TAB = /^[A-Za-z0-9_-]{8,64}$/

const refuse = (status: number, code: string) => HttpServerResponse.jsonUnsafe({ error: { code } }, { status })

export const RealtimeRoutes = HttpRouter.add(
  "GET",
  "/api/realtime",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    if (request.headers["upgrade"]?.toLowerCase() !== "websocket") return refuse(426, "upgrade_required")
    const user = yield* userFrom(new Headers(request.headers as Record<string, string>))
    if (Option.isNone(user)) return refuse(401, "unauthenticated")
    const url = new URL(request.url, "http://x")
    const tab = url.searchParams.get("tab")
    const tabHeader = tab !== null && TAB.test(tab) ? { [ROOM_TAB]: tab } : {}
    if (url.searchParams.get("as") === "supplier") {
      const [held] = yield* Effect.flatMap(Effect.service(SupplierPortalService), (p) => p.held).pipe(
        Effect.provideService(CurrentUser, user.value),
        Effect.provide(SupplierPortalService.layer)
      )
      if (held === undefined) return refuse(403, "no_supplier_contact")
      const response = yield* Effect.promise(() =>
        supplierRoomOf(held.principal.workspaceId, held.contact.supplierId).fetch("https://room/connect", {
          headers: { upgrade: "websocket", [ROOM_MEMBER]: held.contact.contactId, ...tabHeader }
        })
      )
      return HttpServerResponse.raw(response, { status: response.status })
    }
    const [active] = yield* Effect.flatMap(Effect.service(Workspaces), (w) => w.memberships).pipe(
      Effect.provideService(CurrentUser, user.value),
      Effect.provide(Workspaces.layer)
    )
    if (active === undefined) return refuse(403, "no_workspace")
    const response = yield* Effect.promise(() =>
      roomOf(active.workspaceId).fetch("https://room/connect", {
        headers: {
          upgrade: "websocket",
          [ROOM_MEMBER]: active.memberId,
          ...tabHeader
        }
      })
    )
    return HttpServerResponse.raw(response, { status: response.status })
  }).pipe(withRequestDb, Effect.withSpan("Realtime.connect"))
)
