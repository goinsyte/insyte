import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import type { WorkspaceInvite as ServerInvite } from "@insyte/modules/members/domain/Choice"
import type { WorkspaceSummary } from "@insyte/modules/workspaces/domain/Choice"
import type { Workspace, WorkspaceInvite } from "@insyte/ui/app/lib/team"
import type { ShellSource } from "@insyte/ui/app/shell/source"
import { WorkspaceSwitchVeil } from "@insyte/ui/app/team/workspace-switch-veil"
import { Exit, Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"
import { workspaceInvitesAtom, WORKSPACES, workspacesAtom, workspaceWrites } from "../data/workspaces.ts"
import { onOtherTabSwitched, reloadInto, takeFlash } from "./switching.ts"

/*
 * The switcher's half of the frame in the console (M3.1, M3.4): the person's workspaces and the invitations to another
 * one, from the server, and what the design's store menu does with them. Switching shows the design's hand-over veil
 * while the server changes the session's workspace, then loads the page afresh in it (`switching.ts`); leaving one does
 * the same back to the newest membership. Accepting an invitation keeps the person where they are, with "Openen" to go.
 */

/** The workspace being switched to, while the veil is up. */
const switchingAtom = Atom.make<Workspace | null>(null).pipe(Atom.keepAlive)

/** Each veil lasts at least this long: it is a signal, not a loading screen (the design's ¾ second). */
const VEIL_MS = 760

/** The plans' names, as Facturatie and the landing write them. */
const PLAN_NAMES: Record<string, string> = { starter: "Starter", growth: "Growth", scale: "Scale" }

/** The plan as the switcher names it: the paid plan, else the trial. */
const planOf = (plan: string, paid: boolean) => (paid ? PLAN_NAMES[plan] ?? plan : "Proefperiode")

const asWorkspace = (w: WorkspaceSummary): Workspace => ({
  id: w.id,
  name: w.name,
  role: w.role,
  members: w.members,
  plan: planOf(w.plan, w.paid),
  own: w.own,
  // The one the session is in: its count and name come from the frame's live reads.
  home: w.active
})

const asInvite = (i: ServerInvite): WorkspaceInvite => ({
  id: i.id,
  workspace: i.workspace,
  invitedBy: i.invitedBy,
  role: i.role,
  members: i.members,
  plan: planOf(i.plan, i.paid),
  sentAt: i.sentAt
})

const tryAgain = { description: "Probeer het zo nog eens." }

export function useConsoleWorkspaces(frame: Frame): ShellSource["team"] {
  const listed = Option.getOrUndefined(AsyncResult.value(useAtomValue(workspacesAtom)))
  const invited = Option.getOrUndefined(AsyncResult.value(useAtomValue(workspaceInvitesAtom)))
  const setSwitching = useAtomSet(switchingAtom)
  const write = {
    switch: useAtomSet(workspaceWrites.switch, { mode: "promiseExit" }),
    leave: useAtomSet(workspaceWrites.leave, { mode: "promiseExit" }),
    accept: useAtomSet(workspaceWrites.acceptInvite, { mode: "promiseExit" }),
    decline: useAtomSet(workspaceWrites.declineInvite, { mode: "promiseExit" }),
    restore: useAtomSet(workspaceWrites.restoreInvite, { mode: "promiseExit" })
  }
  const keys = { reactivityKeys: WORKSPACES }

  // Until the list is in, the one the frame names.
  const workspaces: Array<Workspace> = useMemo(
    () =>
      listed?.map(asWorkspace) ?? [{
        id: frame.workspace.id,
        name: frame.workspace.name,
        role: frame.role.label,
        members: frame.teammates.length,
        plan: "",
        own: frame.role.id === "owner",
        home: true
      }],
    [listed, frame]
  )
  const invites = useMemo(() => invited?.map(asInvite) ?? [], [invited])
  const serverInvites = useRef(invited)
  serverInvites.current = invited
  const listRef = useRef(workspaces)
  listRef.current = workspaces

  const switchTo = (id: string) => {
    const target = listRef.current.find((w) => w.id === id)
    if (target === undefined || id === frame.workspace.id) return
    setSwitching(target)
    const started = Date.now()
    void write.switch({ payload: { workspaceId: target.id as never } }).then((exit) => {
      if (Exit.isFailure(exit)) {
        setSwitching(null)
        return void toast.error(`${target.name} openen lukte niet`, tryAgain)
      }
      const flash = { title: `Je werkt nu in ${target.name}`, description: `Als ${target.role}.` }
      window.setTimeout(() => reloadInto(exit.value.landing, flash), Math.max(0, VEIL_MS - (Date.now() - started)))
    })
  }

  return {
    workspaces,
    activeWorkspaceId: frame.workspace.id,
    workspaceInvites: invites,
    // The design greets a joined workspace at once; here it is said once the server took it, with the same words.
    acceptWorkspaceInvite: (id) => {
      const invite = serverInvites.current?.find((i) => i.id === id)
      if (invite === undefined) return undefined
      void write.accept({ payload: { id }, ...keys }).then((exit) => {
        if (Exit.isFailure(exit)) {
          const state = exit.cause.reasons.find((r) => r._tag === "Fail")?.error as { state?: string } | undefined
          return void toast.error(
            `Je kunt nu niet bij ${invite.workspace}`,
            state?.state === "full"
              ? { description: "Alle plekken zijn bezet. Vraag de eigenaar om een plek." }
              : { description: "De uitnodiging geldt niet meer. Vraag om een nieuwe." }
          )
        }
        toast.success(`Je zit nu in ${invite.workspace}`, {
          description: `Als ${invite.role}. Je vindt het hier tussen je werkruimtes.`,
          action: {
            label: "Openen",
            onClick: () => {
              setSwitching({
                id: invite.workspaceId,
                name: invite.workspace,
                role: invite.role,
                members: invite.members + 1,
                plan: planOf(invite.plan, invite.paid),
                own: false
              })
              void write.switch({ payload: { workspaceId: invite.workspaceId } }).then((opened) =>
                Exit.isSuccess(opened)
                  ? reloadInto(opened.value.landing, { title: `Je werkt nu in ${invite.workspace}` })
                  : (setSwitching(null), void toast.error(`${invite.workspace} openen lukte niet`, tryAgain))
              )
            }
          }
        })
      })
      return undefined
    },
    declineWorkspaceInvite: (id) => {
      const index = invites.findIndex((i) => i.id === id)
      const invite = invites[index]
      if (invite === undefined) return undefined
      void write.decline({ payload: { id }, ...keys }).then((exit) => {
        if (Exit.isFailure(exit)) toast.error("Weigeren lukte niet", tryAgain)
      })
      return { invite, index }
    },
    restoreWorkspaceInvite: (invite) => {
      void write.restore({ payload: { id: invite.id }, ...keys }).then((exit) => {
        if (Exit.isFailure(exit)) {
          toast.error("Die uitnodiging is er niet meer", { description: "Vraag om een nieuwe." })
        }
      })
    },
    leaveWorkspace: (id) => {
      const leaving = listRef.current.find((w) => w.id === id)
      void write.leave({ payload: { workspaceId: id as never } }).then((exit) => {
        if (Exit.isFailure(exit)) return void toast.error(`${leaving?.name ?? "Verlaten"} lukte niet`, tryAgain)
        reloadInto("/dashboard", { title: `Je hebt ${leaving?.name ?? "de werkruimte"} verlaten` })
      })
    },
    switchWorkspace: switchTo,
    // "Nieuwe werkruimte" carries itself to onboarding (`?workspace=new`); nothing to hold here.
    setCreatingWorkspace: () => {}
  }
}

/**
 * The store menu's switch slot: the design's veil while a switch runs, the sentence the last switch carried, and a
 * fresh load when another tab of this browser moved the session to another workspace.
 */
export function ConsoleWorkspaceSwitch() {
  const switching = useAtomValue(switchingAtom)
  useEffect(() => {
    const flash = takeFlash()
    if (flash !== undefined) {
      toast.success(flash.title, flash.description === undefined ? {} : { description: flash.description })
    }
    return onOtherTabSwitched(() => window.location.reload())
  }, [])
  return <WorkspaceSwitchVeil switching={switching} />
}
