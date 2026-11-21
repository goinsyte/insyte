import { useAtomSet } from "@effect/atom-react"
import type { AffiliateMe } from "@insyte/modules/affiliates/domain/Affiliates"
import { ApplicationPending } from "@insyte/ui/app/affiliate/application-pending"
import { ApplicationRejected } from "@insyte/ui/app/affiliate/application-rejected"
import { SettleOnArrival } from "@insyte/ui/app/loading/settle"
import { RouterProgress } from "@insyte/ui/app/loading/stream"
import { Frame } from "@insyte/ui/app/shell/frame"
import { Outlet } from "@tanstack/react-router"
import { Exit } from "effect"
import { useRef } from "react"
import { toast } from "sonner"
import { AFFILIATE_PORTAL, affiliatePortalWrites } from "../data/affiliate-portal.ts"
import { failureOf, sayRefusal } from "../frame/refusals.ts"
import { ConsoleAffiliatePortal } from "./portal-source.tsx"
import { AffiliateShellSource } from "./shell-source.tsx"

/**
 * The affiliate portal's frame (M16 steps 3–5): the design's `Frame` as persona "affiliate", over the portal's own
 * source and shell. Waiting for the brand, or turned down, the frame holds the design's gate instead of the screens:
 * "Opnieuw aanmelden" sends the application again. No palette, no Ask Insyte, no Manage: those are the brand's.
 */
export function AffiliateFrame({ me }: { me: AffiliateMe }) {
  return (
    <ConsoleAffiliatePortal me={me}>
      <AffiliateShellSource me={me}>
        <Inside me={me} />
      </AffiliateShellSource>
    </ConsoleAffiliatePortal>
  )
}

const nothing = () => {}

const REFUSED = {
  gone: "Die aanmelding is er niet meer",
  conflicts: {
    closed: ["Het programma is gesloten", "Er worden nu geen nieuwe aanmeldingen aangenomen."],
    open: ["Je aanmelding loopt al", "Je hoort het zodra er een besluit is."],
    not_rejected: ["Je aanmelding loopt al", "Je hoort het zodra er een besluit is."]
  }
} satisfies Parameters<typeof sayRefusal>[1]

function Inside({ me }: { me: AffiliateMe }) {
  const main = useRef<HTMLElement>(null)
  const reapply = useAtomSet(affiliatePortalWrites.reapply, { mode: "promiseExit" })
  const gate = me.state === "pending"
    ? <ApplicationPending brand={me.workspace.name} />
    : me.state === "rejected"
    ? (
      <ApplicationRejected
        reason={me.application?.reason ?? "Je aanmelding is deze keer niet goedgekeurd."}
        onReapply={() => {
          const id = me.application?.id
          if (id === undefined) return
          void reapply({ payload: { applicationId: id }, reactivityKeys: AFFILIATE_PORTAL }).then((exit) => {
            if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), REFUSED)
            toast.success("Aanmelding opnieuw verstuurd", {
              description: "De meeste besluiten volgen binnen 5 werkdagen."
            })
          })
        }}
      />
    )
    : null
  return (
    <Frame
      persona="affiliate"
      main={main}
      above={<RouterProgress />}
      onAskInsyte={nothing}
      onOpenPalette={nothing}
      onOpenManage={nothing}
    >
      <SettleOnArrival value>{gate ?? <Outlet />}</SettleOnArrival>
    </Frame>
  )
}
