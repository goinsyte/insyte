import { namesOtherWorkspace, WORKSPACE_HEADER } from "@insyte/api/rpc/Member"
import { CurrentUser, type SessionUser } from "@insyte/domain/Session"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect } from "effect"
import { HttpServerResponse } from "effect/http"

/*
 * The member a console route outside the RPC acts as (an upload, a file, a callback, the socket): as `MemberLive` finds
 * it for a call. The session's workspace (pinned on its first request), else the newest; none when the person belongs
 * to none. A tab that names another workspace (`WORKSPACE_HEADER`) than that one is refused before anything is done
 * (`MISMATCH`, answered as `workspaceMismatch`), so an upload from a tab left open never lands in the workspace the
 * session moved to. A request that names none (a link, an OAuth callback, a socket) goes on.
 */

export const MISMATCH = "WorkspaceMismatch" as const

export const activeMemberOf = (user: SessionUser, headers: Headers) =>
  Effect.flatMap(Effect.service(Workspaces), (w) => w.current).pipe(
    Effect.provideService(CurrentUser, user),
    Effect.provide(Workspaces.layer),
    Effect.map(([active]) =>
      active !== undefined && namesOtherWorkspace(headers.get(WORKSPACE_HEADER), active.workspaceId)
        ? MISMATCH
        : active
    )
  )

/** The refusal of a tab that names another workspace: the console loads it afresh (`fetchInTab`). */
export const workspaceMismatch = () => HttpServerResponse.jsonUnsafe({ error: { code: MISMATCH } }, { status: 409 })
