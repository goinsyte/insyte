import { SessionRpcs } from "@insyte/api/rpc/SessionRpcs"
import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import { CurrentUser, type PrincipalSummary, SessionMe, Switched } from "@insyte/domain/Session"
import { BetterAuth } from "@insyte/integrations-better-auth/BetterAuth"
import { countryOf } from "@insyte/integrations-better-auth/Country"
import { ActiveSessions } from "@insyte/modules/sessions/ActiveSessions"
import { activate } from "@insyte/modules/shared/use-cases/ActiveWorkspace"
import { SupplierPortalService } from "@insyte/modules/supplier-portal/SupplierPortal"
import { landingOf, Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect } from "effect"
import { currentSessionId } from "../../../platform/Sessions.ts"

/** An RPC's headers as the Fetch API's, for better-auth and Cloudflare's own. */
const webHeaders = (headers: unknown) => new Headers(headers as Record<string, string>)

export const SessionHandlers = SessionRpcs.toLayer(Effect.gen(function*() {
  const workspaces = yield* Workspaces
  const portal = yield* SupplierPortalService
  const sessions = yield* ActiveSessions
  const betterAuth = yield* BetterAuth
  const current = (headers: Headers) => currentSessionId(headers).pipe(Effect.provideService(BetterAuth, betterAuth))
  return SessionRpcs.of({
    "Session.me": Effect.fn("Session.me")(function*() {
      const user = yield* CurrentUser
      const memberships = yield* workspaces.memberships
      const contacts = yield* portal.held
      // Members first: a person who is both a member and a supplier's contact lands in the console; the portal is
      // theirs at /supplier (`Session.switchPrincipal` will choose between them).
      const principals = [
        ...memberships.map((m): PrincipalSummary => ({
          kind: "member",
          id: m.memberId,
          workspaceId: m.workspaceId,
          workspaceName: m.workspaceName,
          roleLabel: m.principal.role.label
        })),
        ...contacts.map((c): PrincipalSummary => ({
          kind: "supplier_contact",
          id: c.contact.contactId,
          workspaceId: c.principal.workspaceId,
          workspaceName: c.contact.workspaceName,
          roleLabel: c.principal.role.label,
          partnerName: c.contact.supplierName
        }))
      ]
      // Start once the active workspace finished onboarding, or at once for whoever joined it; until then the founder
      // goes on with onboarding (which resumes where they were). A session that chose a supplier's portal
      // (`Session.switchPrincipal`) acts as that contact.
      const active = memberships[0]
      const inPortal = user.activePrincipalKind === "supplier_contact"
        ? principals.find((p) => p.kind === "supplier_contact" && p.workspaceId === user.activeWorkspaceId)
        : undefined
      return new SessionMe({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
          image: user.image,
          twoFactorEnabled: user.twoFactorEnabled
        },
        principals,
        activePrincipal: inPortal ?? principals[0] ?? null,
        landing: inPortal !== undefined || (active === undefined && contacts.length > 0)
          ? "/supplier/dashboard"
          : active !== undefined
          ? landingOf(active)
          : "/onboarding"
      })
    }),
    "Session.switchPrincipal": Effect.fn("Session.switchPrincipal")(function*({ principalId }, { headers }) {
      const session = yield* current(webHeaders(headers))
      const memberships = yield* workspaces.memberships
      if (memberships.some((m) => m.memberId === principalId)) {
        return yield* workspaces.switchTo(session, { memberId: principalId })
      }
      // "Naar het portaal": one of the person's supplier contacts (M16).
      const contact = (yield* portal.held).find((c) => c.contact.contactId === principalId)
      if (contact === undefined) return yield* new NotFound({ entity: "principal", id: principalId })
      const user = yield* CurrentUser
      yield* (yield* Db).routing((sql) =>
        activate(sql, { id: session, userId: user.id }, contact.principal.workspaceId, "supplier_contact")
      ).pipe(Effect.orDie)
      return new Switched({ workspaceId: contact.principal.workspaceId, landing: "/supplier/dashboard" })
    }),
    "Session.listSessions": Effect.fn("Session.listSessions")(function*(_, { headers }) {
      return yield* sessions.list(yield* current(webHeaders(headers)))
    }),
    "Session.revoke": Effect.fn("Session.revoke")(function*(input, { headers }) {
      const web = webHeaders(headers)
      return yield* sessions.revoke(input, yield* current(web), {
        ip: web.get("cf-connecting-ip"),
        country: countryOf(web),
        userAgent: web.get("user-agent")?.slice(0, 512) ?? null
      })
    })
  })
}))
