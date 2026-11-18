import { useNavigate } from "@tanstack/react-router"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { affiliateResources, PAYOUT_MONTH, REJECT_REASONS, RETURN_DAYS, TIERS } from "../../data-source"
import type { PortalResource } from "../affiliate/source"
import { formatCurrency } from "../lib/format"
import { inviteUrl, token } from "../lib/team"
import { undoable } from "../lib/undo"
import { useProgram } from "../stores/affiliate-program-store"
import { type AffiliatesSource, AffiliatesSourceProvider, type PayoutsMonth } from "./source"

/*
 * The brand's affiliates page over the demo's programme store, as the design app shows it: every action hands back
 * what was there before, so "Ongedaan maken" puts it back. The console's source does the same through `Affiliates.*`.
 */

const DAY = 86_400_000

const restoring = (said: { message: string; description?: string | undefined }, act: () => void) => {
  const before = useProgram.getState().snapshot()
  act()
  undoable(said.message, () => useProgram.getState().restore(before), said.description)
}

function usePayouts(): PayoutsMonth {
  const payouts = useProgram((s) => s.payouts)
  const approved = useProgram((s) => s.approved)
  return {
    label: PAYOUT_MONTH.label,
    payDay: PAYOUT_MONTH.payDay,
    running: false,
    lines: payouts.map((p) => ({ ...p, approvedAt: approved[p.affiliateId] }))
  }
}

const KIND = (mime: string): PortalResource["kind"] =>
  mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "doc"

const sizeOf = (bytes: number) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`

export function DemoAffiliates({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  // The demo's material, with what this visit uploads on top; nothing leaves the browser.
  const [material, setMaterial] = useState<ReadonlyArray<PortalResource>>(() => affiliateResources.map((r) => ({ ...r })))
  const source: AffiliatesSource = {
    money: (amount) => formatCurrency(amount),
    tiers: TIERS.map((t) => ({ id: t.id, label: t.label, rate: t.rate, from: t.from })),
    rejectReasons: REJECT_REASONS,
    returnDays: RETURN_DAYS,
    useAffiliates: () => useProgram((s) => s.affiliates),
    useApplications: () => useProgram((s) => s.applications),
    usePayouts,
    useInvites: () => useProgram((s) => s.invites),
    useThisMonth: (id) => {
      const payout = useProgram((s) => s.payouts.find((p) => p.affiliateId === id))
      return payout ? payout.approvable + payout.inWindow : undefined
    },
    useProposedCode: (app) => (app?.name.split(" ")[0] ?? "").toUpperCase(),
    canManagePayouts: true,
    approve: (app, tier, _code, said) => restoring(said, () => useProgram.getState().approve(app.id, tier)),
    reject: (app, reason, said) => restoring(said, () => useProgram.getState().reject(app.id, reason)),
    setTier: (a, tier, said) => restoring(said, () => useProgram.getState().setTier(a.id, tier)),
    setPaused: (rows, said) =>
      restoring(said, () => {
        for (const r of rows) useProgram.getState().togglePause(r.id)
      }),
    retryDiscount: null,
    approvePayouts: (rows, said) =>
      restoring(said, () => useProgram.getState().approvePayouts(rows.map((r) => r.affiliateId))),
    markPaid: null,
    invite: (input, said) => {
      const invite = {
        id: `inv_aff_${token()}`,
        name: input.name,
        email: input.email,
        tier: input.tier,
        message: input.message,
        sentAt: Date.now(),
        expiresAt: Date.now() + 14 * DAY
      }
      useProgram.getState().addInvite(invite)
      undoable(said.message, () => useProgram.getState().removeInvite(invite.id), said.description)
    },
    resendInvite: (i, said) => restoring(said, () => useProgram.getState().resendInvite(i.id)),
    revokeInvite: (i, said) => restoring(said, () => useProgram.getState().removeInvite(i.id)),
    inviteUrl: (i) => inviteUrl(i.id),
    viewInvite: (i) => void navigate({ to: "/invitations/$invitationId", params: { invitationId: i.id } }),
    resources: {
      useList: () => material,
      canEdit: true,
      upload: (file, said) => {
        const r: PortalResource = {
          id: `res_new_${token()}`,
          name: file.name.replace(/\.[^.]+$/, ""),
          kind: KIND(file.type),
          size: sizeOf(file.size),
          updated_at: new Date().toISOString()
        }
        setMaterial((m) => [r, ...m])
        undoable(said.message, () => setMaterial((m) => m.filter((x) => x.id !== r.id)), said.description)
      },
      remove: (r, said) => {
        setMaterial((m) => m.filter((x) => x.id !== r.id))
        undoable(said.message, () => setMaterial((m) => [r, ...m]), said.description)
      },
      open: (r) => toast.success(`${r.name} wordt gedownload`)
    }
  }
  return <AffiliatesSourceProvider value={source}>{children}</AffiliatesSourceProvider>
}
